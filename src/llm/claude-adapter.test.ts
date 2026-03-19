import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { classifyError } from './claude-adapter.js';
import { NarrationError, userMessage } from './claude-errors.js';

// These tests validate that SDK exceptions are correctly classified
// into app-level NarrationError types with the right kind, retryable,
// and fatal flags — without needing real API calls.

function makeApiError(
  Cls: new (...args: ConstructorParameters<typeof Anthropic.APIError>) => Anthropic.APIError,
  status: number,
  message: string,
) {
  // SDK APIError subclasses: (status, error, message, headers)
  return new Cls(status, { type: 'error', error: { type: 'error', message } }, message, {});
}

describe('classifyError', () => {
  it('classifies AuthenticationError as fatal auth', () => {
    const sdk = makeApiError(Anthropic.AuthenticationError, 401, 'invalid api key');
    const err = classifyError(sdk);
    expect(err).toBeInstanceOf(NarrationError);
    expect(err.kind).toBe('auth');
    expect(err.fatal).toBe(true);
    expect(err.retryable).toBe(false);
  });

  it('classifies RateLimitError as retryable rate-limit', () => {
    const sdk = makeApiError(Anthropic.RateLimitError, 429, 'rate limit exceeded');
    const err = classifyError(sdk);
    expect(err.kind).toBe('rate-limit');
    expect(err.fatal).toBe(false);
    expect(err.retryable).toBe(true);
  });

  it('classifies APIConnectionTimeoutError as retryable timeout', () => {
    const sdk = new Anthropic.APIConnectionTimeoutError({ cause: new Error('timed out') });
    const err = classifyError(sdk);
    expect(err.kind).toBe('timeout');
    expect(err.retryable).toBe(true);
    expect(err.fatal).toBe(false);
  });

  it('classifies APIConnectionError as retryable transport', () => {
    const sdk = new Anthropic.APIConnectionError({ cause: new Error('ECONNREFUSED') });
    const err = classifyError(sdk);
    expect(err.kind).toBe('transport');
    expect(err.retryable).toBe(true);
    expect(err.fatal).toBe(false);
  });

  it('classifies BadRequestError as fatal bad-request', () => {
    const sdk = makeApiError(Anthropic.BadRequestError, 400, 'invalid prompt');
    const err = classifyError(sdk);
    expect(err.kind).toBe('bad-request');
    expect(err.fatal).toBe(true);
    expect(err.retryable).toBe(false);
  });

  it('classifies generic APIError as unexpected', () => {
    const sdk = makeApiError(Anthropic.InternalServerError, 500, 'server error');
    const err = classifyError(sdk);
    expect(err.kind).toBe('unexpected');
    expect(err.fatal).toBe(false);
    expect(err.retryable).toBe(false);
  });

  it('classifies non-SDK errors as unexpected', () => {
    const err = classifyError(new TypeError('Cannot read properties of undefined'));
    expect(err.kind).toBe('unexpected');
    expect(err.message).toContain('Cannot read properties of undefined');
  });

  it('preserves cause chain', () => {
    const original = new Error('network down');
    const sdk = new Anthropic.APIConnectionError({ cause: original });
    const err = classifyError(sdk);
    expect(err.cause).toBe(sdk);
  });
});

describe('userMessage', () => {
  it('returns player-safe message for each error kind', () => {
    const kinds: Array<{ kind: NarrationError['kind']; fragment: string }> = [
      { kind: 'auth', fragment: 'API key' },
      { kind: 'rate-limit', fragment: 'catch their breath' },
      { kind: 'timeout', fragment: 'lost their thread' },
      { kind: 'transport', fragment: 'interrupted' },
      { kind: 'bad-request', fragment: 'bug' },
      { kind: 'unexpected', fragment: 'unexpected' },
    ];

    for (const { kind, fragment } of kinds) {
      const err = new NarrationError({ kind, message: 'test' });
      const msg = userMessage(err);
      expect(msg).toContain(fragment);
    }
  });
});
