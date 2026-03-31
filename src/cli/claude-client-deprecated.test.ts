import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Verify that createClaudeClient has been marked @deprecated
 * pointing users to createAdaptedClient.
 */
describe('createClaudeClient deprecation', () => {
  it('should have @deprecated JSDoc annotation', () => {
    const src = readFileSync(
      resolve(import.meta.dirname, '..', 'claude-client.ts'),
      'utf-8',
    );
    const fnIndex = src.indexOf('export function createClaudeClient');
    expect(fnIndex).toBeGreaterThan(0);

    // Check that the @deprecated tag appears before the function declaration
    const preceding = src.slice(Math.max(0, fnIndex - 300), fnIndex);
    expect(preceding).toContain('@deprecated');
    expect(preceding).toContain('createAdaptedClient');
  });
});
