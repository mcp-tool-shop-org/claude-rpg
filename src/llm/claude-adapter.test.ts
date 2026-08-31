import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { createAdaptedClient, classifyError, withRetry } from './claude-adapter.js';
import { NarrationError } from './claude-errors.js';
import { DEFAULT_MODEL, DEFAULT_TIMEOUT_MS } from '../claude-client.js';

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

  // F-aaaa105f: createAdaptedClient and createClaudeClient (../claude-client.ts)
  // used to each hardcode their own copy of this same default model id. Both
  // factories now consume ONE exported DEFAULT_MODEL from claude-client.ts --
  // asserting against the imported constant (not a re-hardcoded literal, like
  // the sibling test above) is what actually proves single-sourcing: it ties
  // this file's default to claude-client.ts's default.model test via the same
  // constant, so the two can no longer silently drift apart.
  it('falls back to the same shared DEFAULT_MODEL constant claude-client.ts exports (F-aaaa105f single-source)', () => {
    const client = createAdaptedClient();
    expect(client.model).toBe(DEFAULT_MODEL);
  });

  it('accepts custom model', () => {
    const client = createAdaptedClient({ model: 'claude-haiku-4-5-20251001', maxTokens: 512 });
    expect(client.model).toBe('claude-haiku-4-5-20251001');
  });

  // F-0929ac97: the installed SDK defaults to timeout=600000 (10 minutes,
  // core.js:134) and its own internal maxRetries=2 when the client
  // constructor isn't given explicit values -- both tuned for long-running
  // server workloads, not a turn-based CLI game. createAdaptedClient must now
  // pass an explicit short timeout AND maxRetries: 0 (ceding all retry
  // authority to this module's own withRetry, so the SDK's hidden internal
  // retries can no longer double up on withRetry's exponential backoff --
  // see the interplay comment on createAdaptedClient itself).
  //
  // The SDK has no public getter for these constructor options, but
  // Anthropic.Messages extends APIResource, which stores the owning client as
  // `this._client` (resource.js) -- reading it back from inside the
  // create()/stream() mock is how core.js's own buildRequest() resolves
  // per-call timeout/maxRetries too (`options.timeout ?? this.timeout`), so
  // this is the SDK's own internal wiring, not a private implementation
  // detail invented for this test.
  describe('Anthropic client construction (F-0929ac97)', () => {
    it('constructs the SDK client with DEFAULT_TIMEOUT_MS and maxRetries: 0 by default', async () => {
      let capturedTimeout: number | undefined;
      let capturedMaxRetries: number | undefined;
      createSpy.mockImplementation(function (this: { _client: { timeout: number; maxRetries: number } }) {
        capturedTimeout = this._client.timeout;
        capturedMaxRetries = this._client.maxRetries;
        return Promise.resolve(fakeMessage()) as unknown as ReturnType<typeof Anthropic.Messages.prototype.create>;
      } as unknown as typeof Anthropic.Messages.prototype.create);

      const client = createAdaptedClient({ apiKey: 'test' });
      await client.generate({ system: 's', prompt: 'p' });

      expect(capturedTimeout).toBe(DEFAULT_TIMEOUT_MS);
      expect(capturedMaxRetries).toBe(0);
    });

    it('honors a custom config.timeout override', async () => {
      let capturedTimeout: number | undefined;
      createSpy.mockImplementation(function (this: { _client: { timeout: number } }) {
        capturedTimeout = this._client.timeout;
        return Promise.resolve(fakeMessage()) as unknown as ReturnType<typeof Anthropic.Messages.prototype.create>;
      } as unknown as typeof Anthropic.Messages.prototype.create);

      const client = createAdaptedClient({ apiKey: 'test', timeout: 5000 });
      await client.generate({ system: 's', prompt: 'p' });

      expect(capturedTimeout).toBe(5000);
    });
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

  // F-f2e58ce0: generateStream's body is wrapped in withRetry. If a stream
  // fails mid-transmission with a retryable error after several chunks were
  // already emitted via onChunk, withRetry re-invokes the whole streaming
  // call from scratch -- `accumulated` is correctly reset per attempt (it
  // always was), but onChunk itself gave a caller (e.g. bin.ts's terminal
  // renderer, appending every chunk straight to the screen) no way to know a
  // reset was happening, so a recovered retry would visibly show a partial
  // sentence followed by the same narration restarting from the beginning.
  // onStreamReset is a new, optional, PER-CALL hook (opts.onStreamReset, not
  // a client-level RetryConfig field) invoked with the same payload shape as
  // RetryConfig.onRetry, at the same instant (immediately before a retried
  // attempt's backoff delay).
  describe('generateStream onStreamReset (F-f2e58ce0)', () => {
    /** First call to messages.stream() rejects with `err` (retryable); every call after that succeeds with `successText`. */
    function makeFailOnceThenSucceedStream(err: Error, successText: string) {
      let callCount = 0;
      streamSpy.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            on: vi.fn().mockReturnThis(),
            finalMessage: vi.fn().mockRejectedValue(err),
          } as unknown as ReturnType<typeof Anthropic.Messages.prototype.stream>;
        }
        const onFn = vi.fn().mockImplementation(function (this: unknown, event: string, cb: (t: string) => void) {
          if (event === 'text') cb(successText);
          return this;
        });
        return {
          on: onFn,
          finalMessage: vi.fn().mockResolvedValue(fakeMessage()),
        } as unknown as ReturnType<typeof Anthropic.Messages.prototype.stream>;
      });
    }

    it('invokes onStreamReset immediately before a retried attempt, with the same shape as onRetry', async () => {
      makeFailOnceThenSucceedStream(
        new Anthropic.RateLimitError(429, { type: 'error', error: { type: 'rate_limit_error', message: 'x' } }, 'x', {}),
        'recovered',
      );

      const onStreamReset = vi.fn();
      const chunks: string[] = [];
      const client = createAdaptedClient({ apiKey: 'test' }, { maxRetries: 1, initialDelayMs: 1 });
      const result = await client.generateStream!({
        system: 's', prompt: 'p', onChunk: (c) => chunks.push(c), onStreamReset,
      });

      expect(result.text).toBe('recovered');
      // The superseded first attempt emitted no chunks in this fixture (it
      // failed before any 'text' event); the surviving attempt's chunk is
      // what the final result reflects.
      expect(chunks).toEqual(['recovered']);
      expect(onStreamReset).toHaveBeenCalledTimes(1);
      expect(onStreamReset).toHaveBeenCalledWith({ attempt: 1, maxAttempts: 2, kind: 'rate-limit', delayMs: 1 });
    });

    it('still invokes the client-level retryConfig.onRetry (unchanged) alongside the new per-call onStreamReset', async () => {
      // A real SDK exception (not a hand-built NarrationError) -- classifyError
      // only recognizes actual Anthropic.APIError subclasses; feeding it a
      // NarrationError directly falls through to the generic 'unexpected'
      // (non-retryable) branch instead of preserving 'timeout'.
      makeFailOnceThenSucceedStream(
        new Anthropic.APIConnectionTimeoutError({ message: 'timed out' }),
        'recovered',
      );

      const onRetry = vi.fn();
      const onStreamReset = vi.fn();
      const client = createAdaptedClient({ apiKey: 'test' }, { maxRetries: 1, initialDelayMs: 1, onRetry });
      await client.generateStream!({ system: 's', prompt: 'p', onChunk: () => {}, onStreamReset });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onStreamReset).toHaveBeenCalledTimes(1);
      // Both fire from the same withRetry event, with the same payload --
      // onStreamReset is additive, not a replacement for the existing hook.
      expect(onRetry.mock.calls[0][0]).toEqual(onStreamReset.mock.calls[0][0]);
    });

    it('does not invoke onStreamReset when the first attempt succeeds (no retry occurred)', async () => {
      const onStreamReset = vi.fn();
      const client = createAdaptedClient({ apiKey: 'test' });
      await client.generateStream!({ system: 's', prompt: 'p', onChunk: () => {}, onStreamReset });
      expect(onStreamReset).not.toHaveBeenCalled();
    });

    it('does not throw and behaves exactly as before when onStreamReset is omitted', async () => {
      makeFailOnceThenSucceedStream(
        new Anthropic.RateLimitError(429, { type: 'error', error: { type: 'rate_limit_error', message: 'x' } }, 'x', {}),
        'recovered',
      );

      const client = createAdaptedClient({ apiKey: 'test' }, { maxRetries: 1, initialDelayMs: 1 });
      const result = await client.generateStream!({ system: 's', prompt: 'p', onChunk: () => {} });
      expect(result.text).toBe('recovered');
    });

    it('does not invoke onStreamReset for a fatal (non-retryable) stream error', async () => {
      streamSpy.mockReturnValue({
        on: vi.fn().mockReturnThis(),
        finalMessage: vi.fn().mockRejectedValue(
          new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'bad key' } }, 'bad key', {}),
        ),
      } as unknown as ReturnType<typeof Anthropic.Messages.prototype.stream>);

      const onStreamReset = vi.fn();
      const client = createAdaptedClient({ apiKey: 'test' }, { maxRetries: 1, initialDelayMs: 1 });
      await expect(
        client.generateStream!({ system: 's', prompt: 'p', onChunk: () => {}, onStreamReset }),
      ).rejects.toThrow(NarrationError);
      expect(onStreamReset).not.toHaveBeenCalled();
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

  // F-4a6a8d31: these three used to be one test -- 'maps generic APIError to
  // unexpected' -- that constructed `new Anthropic.APIError(500, ...)`
  // directly rather than the real-world `InternalServerError` a live 500
  // response actually produces (see APIError.generate() in the installed
  // SDK's error.js, which maps status 409 -> ConflictError and status >=500
  // -> InternalServerError). That let the test pass unchanged regardless of
  // whether classifyError actually recognized those subclasses, so it never
  // caught that both were falling into the non-retryable 'unexpected'
  // bucket alongside every genuine 5xx/409 the SDK's own default retry
  // logic (core.js shouldRetry) treats as transient.
  it('maps InternalServerError (5xx, incl. 529 Overloaded) to transport and retryable', () => {
    const err = new Anthropic.InternalServerError(529, { type: 'error', error: { type: 'overloaded_error', message: 'overloaded' } }, 'overloaded', {});
    const result = classifyError(err);
    expect(result.kind).toBe('transport');
    expect(result.retryable).toBe(true);
  });

  it('maps ConflictError (409) to transport and retryable', () => {
    const err = new Anthropic.ConflictError(409, { type: 'error', error: { type: 'conflict_error', message: 'conflict' } }, 'conflict', {});
    const result = classifyError(err);
    expect(result.kind).toBe('transport');
    expect(result.retryable).toBe(true);
  });

  it('maps a bare APIError with status 408 (request-timeout, no dedicated SDK subclass) to transport and retryable', () => {
    const err = new Anthropic.APIError(408, { type: 'error', error: { type: 'timeout_error', message: 'timed out' } }, 'timed out', {});
    const result = classifyError(err);
    expect(result.kind).toBe('transport');
    expect(result.retryable).toBe(true);
  });

  it('maps an APIError status outside the SDK default retry set (404) to unexpected and non-retryable', () => {
    const err = new Anthropic.NotFoundError(404, { type: 'error', error: { type: 'not_found_error', message: 'missing' } }, 'missing', {});
    const result = classifyError(err);
    expect(result.kind).toBe('unexpected');
    expect(result.retryable).toBe(false);
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

  // F-7fcdf2db: withRetry took no callback and emitted no event, so no caller
  // (e.g. bin.ts's per-turn spinner) could ever tell a retry was in flight
  // during DEFAULT_RETRY's worst-case ~93s of silent attempts. onRetry fires
  // once per retry, immediately before that retry's backoff delay -- never
  // for the initial attempt, and never for the final, non-retried failure
  // (fatal errors, or the last exhausted attempt), since neither of those is
  // followed by a delayFn(delay) call.
  describe('withRetry onRetry hook (F-7fcdf2db)', () => {
    it('invokes onRetry once per retry, immediately before its backoff delay, with 1-indexed attempt/maxAttempts', async () => {
      const onRetry = vi.fn();
      let callCount = 0;
      const result = await withRetry(async () => {
        callCount++;
        if (callCount <= 2) {
          throw new NarrationError({ kind: 'timeout', message: 'timed out' });
        }
        return 'recovered';
      }, { maxRetries: 2, initialDelayMs: 1000, onRetry }, noDelay);

      expect(result).toBe('recovered');
      expect(callCount).toBe(3);
      expect(onRetry).toHaveBeenCalledTimes(2);
      // attempt: the 1-indexed attempt that just failed. maxAttempts: total
      // attempts this call's budget allows (1 initial + maxRetries).
      expect(onRetry).toHaveBeenNthCalledWith(1, { attempt: 1, maxAttempts: 3, kind: 'timeout', delayMs: 1000 });
      expect(onRetry).toHaveBeenNthCalledWith(2, { attempt: 2, maxAttempts: 3, kind: 'timeout', delayMs: 2000 });
    });

    it('does not invoke onRetry for a fatal (non-retryable) error', async () => {
      const onRetry = vi.fn();
      await expect(withRetry(async () => {
        throw new NarrationError({ kind: 'auth', message: 'bad key' });
      }, { maxRetries: 2, initialDelayMs: 100, onRetry }, noDelay)).rejects.toThrow(NarrationError);
      expect(onRetry).not.toHaveBeenCalled();
    });

    it('does not invoke onRetry for the final, exhausted attempt', async () => {
      const onRetry = vi.fn();
      await expect(withRetry(async () => {
        throw new NarrationError({ kind: 'timeout', message: 'timed out' });
      }, { maxRetries: 1, initialDelayMs: 100, onRetry }, noDelay)).rejects.toThrow(NarrationError);
      // 1 initial + 1 retry = 2 attempts total; onRetry fires once (before
      // the one retry), not again when that retry also fails and exhausts
      // the budget.
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('threads retryConfig.onRetry through createAdaptedClient into a real retried generate() call', async () => {
      let callCount = 0;
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

      const onRetry = vi.fn();
      const client = createAdaptedClient({ apiKey: 'test' }, { maxRetries: 1, initialDelayMs: 1, onRetry });
      const result = await client.generate({ system: 's', prompt: 'p' });

      expect(result.text).toBe('retried ok');
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ kind: 'rate-limit', attempt: 1, maxAttempts: 2 }));
    });
  });
});
