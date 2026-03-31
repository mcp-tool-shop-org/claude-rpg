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
  const anthropic = new Anthropic({ apiKey: config.apiKey });
  const model = config.model ?? 'claude-sonnet-4-20250514';
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
    }): Promise<StructuredResult<T>> {
      const response = await callApi(opts.system, opts.prompt, opts.maxTokens ?? defaultMaxTokens);
      const text = extractText(response);

      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
      if (!jsonMatch) {
        return { ok: false, data: null, raw: text, error: 'No JSON found in response' };
      }

      try {
        const data = JSON.parse(jsonMatch[1]) as T;
        return { ok: true, data, raw: text };
      } catch (e) {
        return { ok: false, data: null, raw: text, error: `JSON parse error: ${e}` };
      }
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
