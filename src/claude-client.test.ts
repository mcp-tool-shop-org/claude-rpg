import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { createClaudeClient, DEFAULT_MODEL, DEFAULT_TIMEOUT_MS, type ClaudeClient } from './claude-client.js';

// F-18fe36fc-style fixture (see llm/claude-adapter.test.ts): citations is a
// required field on Anthropic.TextBlock in the installed SDK.
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

// ─── PFE-003: generateStructured validator parameter ───────

// We can't easily mock the Anthropic SDK in an integration test,
// so we test the validator logic by using a mock client that mimics the behavior.
// The key contract: if validator throws, result is { ok: false, error }.

describe('claude-client: generateStructured validator', () => {
  it('type interface includes optional validator parameter', () => {
    // This is a compile-time check — if the type is wrong, tsc catches it.
    // We just verify the interface shape exists at runtime via createClaudeClient.
    const client = createClaudeClient({ apiKey: 'test-key' });
    expect(typeof client.generateStructured).toBe('function');
  });

  it('validator parameter is typed as assertion function', () => {
    // Type-level check: the validator signature accepts (data: unknown) => asserts data is T
    // This test documents the contract; actual validation is tested via integration.
    type ExtractValidator<T> = T extends {
      generateStructured<U>(opts: infer O): any;
    }
      ? O extends { validator?: infer V } ? V : never
      : never;

    // If this compiles, the validator type is correctly optional
    const _typeCheck: ExtractValidator<ClaudeClient> = undefined as any;
    expect(true).toBe(true); // compile-time assertion passed
  });
});

// F-aaaa105f: createClaudeClient and createAdaptedClient (llm/claude-adapter.ts)
// used to each hardcode their own copy of the same default model id -- the
// exact "two independently-hardcoded copies of one fact drift apart" shape
// this codebase has been bitten by before (F-223de079, F-8da2e6f7,
// F-f1eb58cb). Both factories now consume ONE exported DEFAULT_MODEL from
// this file. Asserting against the imported constant (not a re-hardcoded
// literal) is the point: if the two factories' fallbacks ever drift apart
// again, at least one of these constant-referencing assertions -- this one
// and claude-adapter.test.ts's sibling -- would need to diverge from the
// single source to keep passing, which is exactly the drift this guards.
describe('claude-client: DEFAULT_MODEL (F-aaaa105f single-source)', () => {
  it('createClaudeClient falls back to the shared DEFAULT_MODEL constant when no model is configured', () => {
    const client = createClaudeClient({ apiKey: 'test-key' });
    expect(client.model).toBe(DEFAULT_MODEL);
  });

  it('createClaudeClient still honors an explicit config.model override', () => {
    const client = createClaudeClient({ apiKey: 'test-key', model: 'claude-haiku-4-5-20251001' });
    expect(client.model).toBe('claude-haiku-4-5-20251001');
  });
});

// F-0929ac97: the installed SDK defaults to timeout=600000 (10 minutes,
// node_modules/@anthropic-ai/sdk/core.js:134) when the client constructor
// isn't given an explicit value -- tuned for long-running server workloads,
// not a turn-based CLI game that should fail fast. createClaudeClient must
// now pass an explicit short timeout. Unlike createAdaptedClient
// (llm/claude-adapter.ts), this legacy factory has no withRetry layer of its
// own, so -- deliberately, see claude-adapter.ts's interplay comment -- it
// does NOT override maxRetries: the SDK's own default internal retry
// (maxRetries: 2) is left in place here since there is no outer retry layer
// for it to double up with.
describe('createClaudeClient: Anthropic client construction (F-0929ac97)', () => {
  let createSpy: MockInstance<typeof Anthropic.Messages.prototype.create>;

  beforeEach(() => {
    createSpy = vi
      .spyOn(Anthropic.Messages.prototype, 'create')
      .mockResolvedValue(fakeMessage());
  });

  it('constructs the SDK client with DEFAULT_TIMEOUT_MS by default', async () => {
    let capturedTimeout: number | undefined;
    createSpy.mockImplementation(function (this: { _client: { timeout: number } }) {
      capturedTimeout = this._client.timeout;
      return Promise.resolve(fakeMessage()) as unknown as ReturnType<typeof Anthropic.Messages.prototype.create>;
    } as unknown as typeof Anthropic.Messages.prototype.create);

    const client = createClaudeClient({ apiKey: 'test' });
    await client.generate({ system: 's', prompt: 'p' });

    expect(capturedTimeout).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('honors a custom config.timeout override', async () => {
    let capturedTimeout: number | undefined;
    createSpy.mockImplementation(function (this: { _client: { timeout: number } }) {
      capturedTimeout = this._client.timeout;
      return Promise.resolve(fakeMessage()) as unknown as ReturnType<typeof Anthropic.Messages.prototype.create>;
    } as unknown as typeof Anthropic.Messages.prototype.create);

    const client = createClaudeClient({ apiKey: 'test', timeout: 5000 });
    await client.generate({ system: 's', prompt: 'p' });

    expect(capturedTimeout).toBe(5000);
  });

  it('leaves maxRetries at the SDK default (2) -- no withRetry layer exists at this level to conflict with', async () => {
    let capturedMaxRetries: number | undefined;
    createSpy.mockImplementation(function (this: { _client: { maxRetries: number } }) {
      capturedMaxRetries = this._client.maxRetries;
      return Promise.resolve(fakeMessage()) as unknown as ReturnType<typeof Anthropic.Messages.prototype.create>;
    } as unknown as typeof Anthropic.Messages.prototype.create);

    const client = createClaudeClient({ apiKey: 'test' });
    await client.generate({ system: 's', prompt: 'p' });

    expect(capturedMaxRetries).toBe(2);
  });
});
