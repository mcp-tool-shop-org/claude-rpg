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
import { NarrationError } from './claude-errors.js';

/** Default retry configuration for retryable errors. */
export type RetryConfig = {
  /** Maximum number of retry attempts (default: 2). */
  maxRetries: number;
  /** Initial backoff delay in milliseconds (default: 1000). */
  initialDelayMs: number;
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
      await delayFn(delay);
    }
  }
  // Should never reach here, but satisfy TypeScript
  throw lastError!;
}

export function createAdaptedClient(config: ClaudeClientConfig = {}, retryConfig?: Partial<RetryConfig>): ClaudeClient {
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
    }): Promise<GenerateResult> {
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
      }, retry);
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

  // Other API errors (5xx, etc.) — SDK retries these automatically,
  // so if we see them here, retries were exhausted.
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
