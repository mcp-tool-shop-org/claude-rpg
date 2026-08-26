// Regression tests for the fake Claude client test helper itself.
// generateStructured() must distinguish "not configured" (undefined) from
// "explicitly configured with a falsy-but-valid value" (0, false, '').
// structuredData is typed `unknown` specifically to allow arbitrary structured
// payloads, so a truthy-only guard silently drops legitimate falsy responses.

import { describe, it, expect } from 'vitest';
import { createFakeClient } from './fake-claude-client.js';

const genOpts = { system: 'sys', prompt: 'prompt' };

describe('createFakeClient — generateStructured falsy structuredData', () => {
  it('returns ok:true with data 0 when structuredData is configured as 0', async () => {
    const client = createFakeClient({ structuredData: 0 });
    const result = await client.generateStructured(genOpts);
    expect(result.ok).toBe(true);
    expect(result.data).toBe(0);
    expect(result.raw).toBe('0');
  });

  it('returns ok:true with data false when structuredData is configured as false', async () => {
    const client = createFakeClient({ structuredData: false });
    const result = await client.generateStructured(genOpts);
    expect(result.ok).toBe(true);
    expect(result.data).toBe(false);
    expect(result.raw).toBe('false');
  });

  it('returns ok:true with data "" when structuredData is configured as an empty string', async () => {
    const client = createFakeClient({ structuredData: '' });
    const result = await client.generateStructured(genOpts);
    expect(result.ok).toBe(true);
    expect(result.data).toBe('');
    expect(result.raw).toBe('""');
  });

  it('still falls back to ok:false when structuredData is not configured at all', async () => {
    const client = createFakeClient({});
    const result = await client.generateStructured(genOpts);
    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
  });
});
