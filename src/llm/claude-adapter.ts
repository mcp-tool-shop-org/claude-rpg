// Adapter layer between @anthropic-ai/sdk and the game.
// Wraps SDK calls so that all exceptions become NarrationError.
// The ClaudeClient interface is unchanged — callers are unaffected.

import Anthropic from '@anthropic-ai/sdk';
/**
 * Re-exported for convenience. The {@link ClaudeClient} interface is defined in
 * `../claude-client.ts`.
 *
 * @deprecated The legacy factory `createClaudeClient` in `../claude-client.ts` is
 * superseded by {@link createAdaptedClient} in this module, which adds retry logic,
 * error classification, and streaming support. New code should always use
 * `createAdaptedClient` from `src/llm/claude-adapter.ts`.
 *
 * FT-BR-008: Consolidate duplicate client implementations.
 */
import { DEFAULT_MODEL, DEFAULT_TIMEOUT_MS } from '../claude-client.js';
import type { ClaudeClient, ClaudeClientConfig, GenerateResult, StreamCallback, StructuredResult } from '../claude-client.js';
import { NarrationError, type NarrationErrorKind } from './claude-errors.js';

/** Default retry configuration for retryable errors. */
export type RetryConfig = {
  /** Maximum number of retry attempts (default: 2). */
  maxRetries: number;
  /** Initial backoff delay in milliseconds (default: 1000). */
  initialDelayMs: number;
  /**
   * F-7fcdf2db: optional progress hook. Invoked once per retry, in
   * withRetry's catch branch immediately before that retry's backoff delay —
   * never for the initial attempt, and never for the final non-retried
   * failure (a fatal error, or the last attempt once maxRetries is
   * exhausted), since neither of those is followed by a delay.
   *
   * `attempt` is 1-indexed: the attempt number that just failed (so the
   * first retry reports `attempt: 1`). `maxAttempts` is the total attempts
   * this call's budget allows (1 initial + maxRetries), constant across every
   * call. Together with `kind`/`delayMs` this is enough for a caller (e.g.
   * bin.ts's per-turn "thinking" spinner) to render "retrying (2/3)..."
   * instead of a static label for DEFAULT_RETRY's worst-case ~93s where the
   * player currently sees no indication whether the app is retrying, hung,
   * or about to fail outright.
   *
   * Cross-domain remainder (cli-display, not fixed in this pass): actually
   * wiring this into a visible spinner update also needs Spinner
   * (src/cli/spinner.ts) to grow an updateLabel()-style method — its
   * interface today only exposes start()/stop().
   */
  onRetry?: (info: { attempt: number; maxAttempts: number; kind: NarrationErrorKind; delayMs: number }) => void;
};

const DEFAULT_RETRY: RetryConfig = { maxRetries: 2, initialDelayMs: 1000 };

/**
 * Retry wrapper with exponential backoff.
 * Only retries when the thrown NarrationError has retryable === true.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY,
  /** Injectable delay for testing — defaults to real setTimeout. */
  delayFn: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  let lastError: NarrationError | undefined;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const narrationErr = err instanceof NarrationError ? err : classifyError(err);
      if (!narrationErr.retryable || attempt >= config.maxRetries) {
        throw narrationErr;
      }
      lastError = narrationErr;
      const delay = config.initialDelayMs * Math.pow(2, attempt);
      config.onRetry?.({
        attempt: attempt + 1,
        maxAttempts: config.maxRetries + 1,
        kind: narrationErr.kind,
        delayMs: delay,
      });
      await delayFn(delay);
    }
  }
  // Should never reach here, but satisfy TypeScript
  throw lastError!;
}

export function createAdaptedClient(config: ClaudeClientConfig = {}, retryConfig?: Partial<RetryConfig>): ClaudeClient {
  // CLAUDE_RPG_MODEL: an operator override for the narrator model id, read
  // here because every production client goes through this factory. Used by
  // the ai-playtest harness to run the shipped narrator through an
  // Anthropic-compatible gateway (OpenRouter's slugs are `anthropic/...`);
  // an explicit config.model still wins, and absent both the default holds.
  if (config.model === undefined && process.env.CLAUDE_RPG_MODEL) {
    config = { ...config, model: process.env.CLAUDE_RPG_MODEL };
  }
  // F-0929ac97: explicit short timeout (see claude-client.ts's DEFAULT_TIMEOUT_MS)
  // PLUS maxRetries: 0 to disable the SDK's own internal retry loop entirely.
  //
  // Interplay with `retry`/withRetry below: the installed SDK retries
  // retryable HTTP failures (408/409/429/5xx) internally, BEFORE this app's
  // classifyError/withRetry layer ever sees an error. Leaving the SDK's own
  // default (maxRetries: 2) in place here would let a single withRetry
  // "attempt" silently retry inside the SDK first -- stacking an unseen,
  // unlogged retry loop underneath the one withRetry already performs, so a
  // single logical attempt could take multiple HTTP round trips, the app's
  // own attempt/backoff accounting (DEFAULT_RETRY above, and the tests that
  // assert on it) would no longer correspond to real HTTP attempts, and
  // worst-case latency would multiply (SDK retries x app retries) instead of
  // adding. withRetry is the one and only retry authority for this factory --
  // maxRetries: 0 reduces the SDK layer to a single try per withRetry
  // attempt, so the two budgets never stack. (createClaudeClient in
  // ../claude-client.ts has no such conflict -- it has no retry wrapper of
  // its own -- so it deliberately leaves the SDK's default retry alone.)
  const anthropic = new Anthropic({
    apiKey: config.apiKey,
    timeout: config.timeout ?? DEFAULT_TIMEOUT_MS,
    maxRetries: 0,
  });
  const model = config.model ?? DEFAULT_MODEL;
  const defaultMaxTokens = config.maxTokens ?? 1024;
  const retry: RetryConfig = { ...DEFAULT_RETRY, ...retryConfig };

  async function callApi(system: string, prompt: string, maxTokens: number) {
    return withRetry(async () => {
      try {
        return await anthropic.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: prompt }],
        });
      } catch (err) {
        throw classifyError(err);
      }
    }, retry);
  }

  function extractText(response: Anthropic.Message): string {
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }

  return {
    model,

    async generate(opts): Promise<GenerateResult> {
      const response = await callApi(opts.system, opts.prompt, opts.maxTokens ?? defaultMaxTokens);
      const text = extractText(response);
      return {
        ok: response.stop_reason === 'end_turn',
        text,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    },

    async generateStream(opts: {
      system: string;
      prompt: string;
      maxTokens?: number;
      onChunk: StreamCallback;
      onStreamReset?: (info: { attempt: number; maxAttempts: number; kind: NarrationErrorKind; delayMs: number }) => void;
    }): Promise<GenerateResult> {
      // F-f2e58ce0: a per-call RetryConfig that wraps the client-level `retry`
      // (which callApi above also uses, unmodified) rather than mutating or
      // replacing it. `retry.onRetry` still fires exactly as before for every
      // call type -- this only ADDS opts.onStreamReset alongside it, scoped
      // to this one generateStream call (a fresh closure per call, closing
      // over this call's own opts), so a stream-aware caller isn't spuriously
      // invoked by an unrelated non-streaming call's retry sharing the same
      // client-level onRetry. Same invocation site and payload shape as
      // onRetry (withRetry calls it immediately before each retried attempt's
      // backoff delay -- see withRetry above) -- "mirroring" per this
      // finding's fix, not a new retry-accounting mechanism.
      const streamRetry: RetryConfig = {
        ...retry,
        onRetry: (info) => {
          retry.onRetry?.(info);
          opts.onStreamReset?.(info);
        },
      };
      return withRetry(async () => {
        try {
          const stream = anthropic.messages.stream({
            model,
            max_tokens: opts.maxTokens ?? defaultMaxTokens,
            system: opts.system,
            messages: [{ role: 'user', content: opts.prompt }],
          });

          let accumulated = '';

          stream.on('text', (text) => {
            accumulated += text;
            opts.onChunk(text);
          });

          const finalMessage = await stream.finalMessage();

          return {
            ok: finalMessage.stop_reason === 'end_turn',
            text: accumulated,
            inputTokens: finalMessage.usage.input_tokens,
            outputTokens: finalMessage.usage.output_tokens,
          };
        } catch (err) {
          throw classifyError(err);
        }
      }, streamRetry);
    },

    async generateStructured<T>(opts: {
      system: string;
      prompt: string;
      maxTokens?: number;
      validator?: (data: unknown) => void;
    }): Promise<StructuredResult<T>> {
      const response = await callApi(opts.system, opts.prompt, opts.maxTokens ?? defaultMaxTokens);
      const text = extractText(response);

      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
      if (!jsonMatch) {
        return { ok: false, data: null, raw: text, error: 'No JSON found in response' };
      }

      let data: T;
      try {
        data = JSON.parse(jsonMatch[1]) as T;
      } catch (e) {
        return { ok: false, data: null, raw: text, error: `JSON parse error: ${e}` };
      }

      // F-853904a0: honor the optional validator exactly like the legacy
      // createClaudeClient does (claude-client.ts) — reject bad shapes early.
      if (opts.validator) {
        try {
          opts.validator(data);
        } catch (validationErr) {
          const msg = validationErr instanceof Error ? validationErr.message : 'Validation failed';
          return { ok: false, data: null, raw: text, error: msg };
        }
      }

      return { ok: true, data, raw: text };
    },
  };
}

/** Map any SDK exception to a typed NarrationError. */
export function classifyError(err: unknown): NarrationError {
  // SDK typed errors
  if (err instanceof Anthropic.AuthenticationError) {
    return new NarrationError({
      kind: 'auth',
      message: 'Anthropic API authentication failed',
      requestId: extractRequestId(err),
      cause: err,
    });
  }

  if (err instanceof Anthropic.RateLimitError) {
    return new NarrationError({
      kind: 'rate-limit',
      message: 'Anthropic API rate limit exceeded',
      requestId: extractRequestId(err),
      cause: err,
    });
  }

  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new NarrationError({
      kind: 'timeout',
      message: 'Anthropic API request timed out',
      cause: err,
    });
  }

  if (err instanceof Anthropic.APIConnectionError) {
    return new NarrationError({
      kind: 'transport',
      message: 'Connection to Anthropic API failed',
      cause: err,
    });
  }

  if (err instanceof Anthropic.BadRequestError) {
    return new NarrationError({
      kind: 'bad-request',
      message: `Anthropic API rejected the request: ${err.message}`,
      requestId: extractRequestId(err),
      cause: err,
    });
  }

  // F-4a6a8d31: InternalServerError (5xx, including the common 529
  // "Overloaded") and ConflictError (409) are exactly the status classes
  // the installed SDK's own default shouldRetry() (core.js) treats as
  // transient. createAdaptedClient sets maxRetries: 0 specifically so
  // withRetry (see this file's own doc comment above createAdaptedClient)
  // is the one and only retry authority for this client -- the comment that
  // used to sit here ("SDK retries these automatically") predates that
  // maxRetries: 0 change and was stale: nothing retries these unless
  // classifyError marks them retryable. Folded into the existing
  // 'transport' kind rather than a new NarrationErrorKind variant:
  // claude-errors.ts's userMessage() and cli/error-presenter.ts's
  // presentNarrationError() (outside this domain's ownership) both switch
  // exhaustively over NarrationErrorKind with no default case, so adding a
  // variant would require changes there too.
  if (err instanceof Anthropic.InternalServerError || err instanceof Anthropic.ConflictError) {
    return new NarrationError({
      kind: 'transport',
      message: `Anthropic API error (${err.status}): ${err.message}`,
      requestId: extractRequestId(err),
      cause: err,
    });
  }

  // Status 408 (request-timeout) has no dedicated SDK subclass -- it
  // surfaces as a bare APIError -- but shouldRetry() treats it as transient
  // too, same as 409/5xx above, so it gets the same retryable 'transport'
  // kind rather than falling into 'unexpected' below.
  if (err instanceof Anthropic.APIError && err.status === 408) {
    return new NarrationError({
      kind: 'transport',
      message: `Anthropic API error (${err.status}): ${err.message}`,
      requestId: extractRequestId(err),
      cause: err,
    });
  }

  // Any remaining APIError (404, 422, etc.) is not in the SDK's own
  // default retry set either, so it stays non-retryable 'unexpected'.
  if (err instanceof Anthropic.APIError) {
    return new NarrationError({
      kind: 'unexpected',
      message: `Anthropic API error (${err.status}): ${err.message}`,
      requestId: extractRequestId(err),
      cause: err,
    });
  }

  // Non-SDK errors (network layer, runtime, etc.)
  const message = err instanceof Error ? err.message : String(err);
  return new NarrationError({
    kind: 'unexpected',
    message: `Unexpected error during API call: ${message}`,
    cause: err,
  });
}

function extractRequestId(err: InstanceType<typeof Anthropic.APIError>): string | undefined {
  // The SDK attaches request_id on APIError when available
  return (err as unknown as Record<string, unknown>).request_id as string | undefined;
}
