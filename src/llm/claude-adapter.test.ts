import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { createAdaptedClient, classifyError, withRetry } from './claude-adapter.js';
import { NarrationError } from './claude-errors.js';

// F-18fe36fc: Anthropic.TextBlock.citations is a required field in the
// installed SDK (`citations: Array<TextCitation> | null`, no `?` —
// node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts). A bare
// `{ type: 'text', text }` literal is missing it; this helper builds a
// conformant TextBlock so fixtures below don't have to repeat the field (or
// paper over its absence with an `as Anthropic.ContentBlock[]` cast) at every
// call site.
function fakeTextBlock(text: string): Anthropic.TextBlock {
  return { type: 'text', text, citations: null };
}

function fakeMessage(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20, ...(overrides.usage ?? {}) },
    content: overrides.content ?? [fakeTextBlock('Hello world')],
    ...overrides,
  } as Anthropic.Message;
}

describe('createAdaptedClient', () => {
  // Explicit MockInstance types: bare ReturnType<typeof vi.spyOn> resolves to
  // the generic (this: unknown, ...args: unknown[]) => unknown overload, which
  // the concrete vi.spyOn(prototype, 'create'/'stream') instances don't satisfy.
  let createSpy: MockInstance<typeof Anthropic.Messages.prototype.create>;
  let streamSpy: MockInstance<typeof Anthropic.Messages.prototype.stream>;

  beforeEach(() => {
    createSpy = vi
      .spyOn(Anthropic.Messages.prototype, 'create')
      .mockResolvedValue(fakeMessage());

    streamSpy = vi.spyOn(Anthropic.Messages.prototype, 'stream').mockReturnValue({
      on: vi.fn().mockReturnThis(),
      finalMessage: vi.fn().mockResolvedValue(fakeMessage()),
    } as unknown as ReturnType<typeof Anthropic.Messages.prototype.stream>);
  });

  it('uses default model', () => {
    const client = createAdaptedClient();
    expect(client.model).toBe('claude-sonnet-4-20250514');
  });

  it('accepts custom model', () => {
    const client = createAdaptedClient({ model: 'claude-haiku-4-5-20251001', maxTokens: 512 });
    expect(client.model).toBe('claude-haiku-4-5-20251001');
  });

  describe('generate', () => {
    it('returns GenerateResult from a successful response', async () => {
      const client = createAdaptedClient({ apiKey: 'test-key' });
      const result = await client.generate({ system: 'sys', prompt: 'hi' });
      expect(result).toEqual({ ok: true, text: 'Hello world', inputTokens: 10, outputTokens: 20 });
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ system: 'sys', messages: [{ role: 'user', content: 'hi' }] }),
      );
    });

    it('reports ok:false when stop_reason is not end_turn', async () => {
      createSpy.mockResolvedValue(fakeMessage({ stop_reason: 'max_tokens' }));
      const client = createAdaptedClient();
      const result = await client.generate({ system: 's', prompt: 'p' });
      expect(result.ok).toBe(false);
    });

    it('concatenates multiple text blocks', async () => {
      createSpy.mockResolvedValue(
        fakeMessage({ content: [fakeTextBlock('part1'), fakeTextBlock('part2')] }),
      );
      const client = createAdaptedClient();
      const result = await client.generate({ system: 's', prompt: 'p' });
      expect(result.text).toBe('part1part2');
    });

    it('filters non-text blocks', async () => {
      createSpy.mockResolvedValue(
        fakeMessage({
          content: [
            { type: 'tool_use', id: 'x', name: 'f', input: {} } as unknown as Anthropic.ContentBlock,
            fakeTextBlock('only-text'),
          ],
        }),
      );
      const client = createAdaptedClient();
      const result = await client.generate({ system: 's', prompt: 'p' });
      expect(result.text).toBe('only-text');
    });

    it('uses per-call maxTokens when provided', async () => {
      const client = createAdaptedClient({ maxTokens: 1024 });
      await client.generate({ system: 's', prompt: 'p', maxTokens: 256 });
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 256 }));
    });

    it('wraps SDK errors as NarrationError', async () => {
      createSpy.mockRejectedValue(
        new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'bad key' } }, 'bad key', {}),
      );
      const client = createAdaptedClient();
      await expect(client.generate({ system: 's', prompt: 'p' })).rejects.toThrow(NarrationError);
    });
  });

  describe('generateStream', () => {
    it('accumulates text chunks and returns GenerateResult', async () => {
      const onFn = vi.fn().mockImplementation(function (this: unknown, event: string, cb: (t: string) => void) {
        if (event === 'text') { cb('chunk1'); cb('chunk2'); }
        return this;
      });
      streamSpy.mockReturnValue({
        on: onFn,
        finalMessage: vi.fn().mockResolvedValue(fakeMessage()),
      } as unknown as ReturnType<typeof Anthropic.Messages.prototype.stream>);

      const client = createAdaptedClient();
      const chunks: string[] = [];
      const result = await client.generateStream!({ system: 's', prompt: 'p', onChunk: (c) => chunks.push(c) });
      expect(chunks).toEqual(['chunk1', 'chunk2']);
      expect(result.text).toBe('chunk1chunk2');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(20);
    });

    it('wraps stream errors as NarrationError', async () => {
      streamSpy.mockReturnValue({
        on: vi.fn().mockReturnThis(),
        finalMessage: vi.fn().mockRejectedValue(
          new Anthropic.RateLimitError(429, { type: 'error', error: { type: 'rate_limit_error', message: 'x' } }, 'x', {}),
        ),
      } as unknown as ReturnType<typeof Anthropic.Messages.prototype.stream>);

      const client = createAdaptedClient();
      await expect(client.generateStream!({ system: 's', prompt: 'p', onChunk: () => {} })).rejects.toThrow(NarrationError);
    });
  });

  describe('generateStructured', () => {
    it('parses JSON from fenced block', async () => {
      createSpy.mockResolvedValue(
        fakeMessage({ content: [fakeTextBlock('Here:\n```json\n{"a":1}\n```')] }),
      );
      const client = createAdaptedClient();
      const result = await client.generateStructured<{ a: number }>({ system: 's', prompt: 'p' });
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ a: 1 });
    });

    it('parses raw JSON object when no fence', async () => {
      createSpy.mockResolvedValue(
        fakeMessage({ content: [fakeTextBlock('result: {"b":2}')] }),
      );
      const client = createAdaptedClient();
      const result = await client.generateStructured<{ b: number }>({ system: 's', prompt: 'p' });
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ b: 2 });
    });

    it('returns ok:false when no JSON found', async () => {
      createSpy.mockResolvedValue(
        fakeMessage({ content: [fakeTextBlock('no json here')] }),
      );
      const client = createAdaptedClient();
      const result = await client.generateStructured({ system: 's', prompt: 'p' });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('No JSON found in response');
    });

    it('returns ok:false on malformed JSON', async () => {
      createSpy.mockResolvedValue(
        fakeMessage({ content: [fakeTextBlock('```json\n{broken}\n```')] }),
      );
      const client = createAdaptedClient();
      const result = await client.generateStructured({ system: 's', prompt: 'p' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('JSON parse error');
    });

    // F-853904a0: the ClaudeClient interface documents an optional `validator`
    // callback (PFE-003) to reject bad shapes early. The adapted client's
    // generateStructured must honor it exactly like the legacy createClaudeClient does.
    it('rejects bad shapes early when a validator throws (PFE-003)', async () => {
      createSpy.mockResolvedValue(
        fakeMessage({ content: [fakeTextBlock('{"a":1}')] }),
      );
      const client = createAdaptedClient();
      const validator = (_data: unknown) => {
        throw new Error('shape mismatch: expected {b}');
      };
      const result = await client.generateStructured<{ a: number }>({ system: 's', prompt: 'p', validator });
      expect(result.ok).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toBe('shape mismatch: expected {b}');
    });

    it('calls the validator and returns ok:true when it passes', async () => {
      createSpy.mockResolvedValue(
        fakeMessage({ content: [fakeTextBlock('{"a":1}')] }),
      );
      const client = createAdaptedClient();
      const validator = vi.fn();
      const result = await client.generateStructured<{ a: number }>({ system: 's', prompt: 'p', validator });
      expect(validator).toHaveBeenCalledWith({ a: 1 });
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ a: 1 });
    });
  });
});

describe('classifyError', () => {
  it('maps AuthenticationError to auth', () => {
    const err = new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'x' } }, 'x', {});
    const result = classifyError(err);
    expect(result).toBeInstanceOf(NarrationError);
    expect(result.kind).toBe('auth');
    expect(result.fatal).toBe(true);
  });

  it('maps RateLimitError to rate-limit', () => {
    const err = new Anthropic.RateLimitError(429, { type: 'error', error: { type: 'rate_limit_error', message: 'x' } }, 'x', {});
    const result = classifyError(err);
    expect(result.kind).toBe('rate-limit');
    expect(result.retryable).toBe(true);
  });

  it('maps APIConnectionTimeoutError to timeout', () => {
    const err = new Anthropic.APIConnectionTimeoutError({ message: 'timed out' });
    const result = classifyError(err);
    expect(result.kind).toBe('timeout');
    expect(result.retryable).toBe(true);
  });

  it('maps APIConnectionError to transport', () => {
    const err = new Anthropic.APIConnectionError({ message: 'ECONNREFUSED' });
    const result = classifyError(err);
    expect(result.kind).toBe('transport');
    expect(result.retryable).toBe(true);
  });

  it('maps BadRequestError to bad-request', () => {
    const err = new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'bad' } }, 'bad', {});
    const result = classifyError(err);
    expect(result.kind).toBe('bad-request');
    expect(result.fatal).toBe(true);
  });

  it('maps generic APIError to unexpected', () => {
    const err = new Anthropic.APIError(500, { type: 'error', error: { type: 'api_error', message: 'boom' } }, 'boom', {});
    const result = classifyError(err);
    expect(result.kind).toBe('unexpected');
  });

  it('maps non-SDK Error to unexpected', () => {
    const result = classifyError(new TypeError('whoops'));
    expect(result.kind).toBe('unexpected');
    expect(result.message).toContain('whoops');
  });

  it('maps non-Error value to unexpected', () => {
    const result = classifyError('string-error');
    expect(result.kind).toBe('unexpected');
    expect(result.message).toContain('string-error');
  });

  it('extracts requestId from SDK errors when present', () => {
    const err = new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'x' } }, 'x', {});
    (err as unknown as Record<string, unknown>).request_id = 'req_abc123';
    const result = classifyError(err);
    expect(result.requestId).toBe('req_abc123');
  });
});

describe('withRetry', () => {
  const noDelay = async () => {};

  it('returns immediately on first success', async () => {
    let callCount = 0;
    const result = await withRetry(async () => {
      callCount++;
      return 'ok';
    }, { maxRetries: 2, initialDelayMs: 1000 }, noDelay);
    expect(result).toBe('ok');
    expect(callCount).toBe(1);
  });

  it('retries retryable errors and succeeds on second attempt', async () => {
    let callCount = 0;
    const result = await withRetry(async () => {
      callCount++;
      if (callCount === 1) {
        throw new NarrationError({ kind: 'rate-limit', message: 'rate limited' });
      }
      return 'recovered';
    }, { maxRetries: 2, initialDelayMs: 100 }, noDelay);
    expect(result).toBe('recovered');
    expect(callCount).toBe(2);
  });

  it('does not retry non-retryable (fatal) errors', async () => {
    let callCount = 0;
    await expect(withRetry(async () => {
      callCount++;
      throw new NarrationError({ kind: 'auth', message: 'bad key' });
    }, { maxRetries: 2, initialDelayMs: 100 }, noDelay)).rejects.toThrow(NarrationError);
    expect(callCount).toBe(1);
  });

  it('throws after max retries exhausted', async () => {
    let callCount = 0;
    await expect(withRetry(async () => {
      callCount++;
      throw new NarrationError({ kind: 'timeout', message: 'timed out' });
    }, { maxRetries: 2, initialDelayMs: 100 }, noDelay)).rejects.toThrow(NarrationError);
    // 1 initial + 2 retries = 3 attempts
    expect(callCount).toBe(3);
  });

  it('applies exponential backoff delays', async () => {
    const delays: number[] = [];
    const trackDelay = async (ms: number) => { delays.push(ms); };

    let callCount = 0;
    await expect(withRetry(async () => {
      callCount++;
      throw new NarrationError({ kind: 'transport', message: 'ECONNREFUSED' });
    }, { maxRetries: 2, initialDelayMs: 1000 }, trackDelay)).rejects.toThrow();

    // First retry: 1000 * 2^0 = 1000, Second retry: 1000 * 2^1 = 2000
    expect(delays).toEqual([1000, 2000]);
  });

  it('classifies non-NarrationError throws and checks retryability', async () => {
    let callCount = 0;
    await expect(withRetry(async () => {
      callCount++;
      throw new Error('random error');
    }, { maxRetries: 2, initialDelayMs: 100 }, noDelay)).rejects.toThrow(NarrationError);
    // Non-NarrationError gets classified as 'unexpected' which is NOT retryable
    expect(callCount).toBe(1);
  });

  it('retries generate call on retryable error then succeeds', async () => {
    // Integration test: create an adapted client and verify retry behavior end-to-end
    let callCount = 0;
    // The SDK's create() returns an APIPromise; a plain async fn is
    // runtime-compatible (the adapter only awaits it) but not structurally
    // assignable, so the stand-in is asserted to the method's own type.
    vi.spyOn(Anthropic.Messages.prototype, 'create').mockImplementation((async () => {
      callCount++;
      if (callCount === 1) {
        throw new Anthropic.RateLimitError(429, { type: 'error', error: { type: 'rate_limit_error', message: 'retry' } }, 'retry', {});
      }
      return {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 5, output_tokens: 10 },
        content: [fakeTextBlock('retried ok')],
      } as Anthropic.Message;
    }) as unknown as typeof Anthropic.Messages.prototype.create);

    const client = createAdaptedClient({ apiKey: 'test' }, { maxRetries: 1, initialDelayMs: 1 });
    const result = await client.generate({ system: 's', prompt: 'p' });
    expect(result.text).toBe('retried ok');
    expect(callCount).toBe(2);
  });
});
