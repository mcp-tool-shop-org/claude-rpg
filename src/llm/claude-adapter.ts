// Adapter layer between @anthropic-ai/sdk and the game.
// Wraps SDK calls so that all exceptions become NarrationError.
// The ClaudeClient interface is unchanged — callers are unaffected.

import Anthropic from '@anthropic-ai/sdk';
import type { ClaudeClient, ClaudeClientConfig, GenerateResult, StructuredResult } from '../claude-client.js';
import { NarrationError } from './claude-errors.js';

export function createAdaptedClient(config: ClaudeClientConfig = {}): ClaudeClient {
  const anthropic = new Anthropic({ apiKey: config.apiKey });
  const model = config.model ?? 'claude-sonnet-4-20250514';
  const defaultMaxTokens = config.maxTokens ?? 1024;

  async function callApi(system: string, prompt: string, maxTokens: number) {
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
