import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * FT-FE-008: Audit terminal-ui dependency.
 * @ai-rpg-engine/terminal-ui was listed in package.json but never imported
 * anywhere in src/. It has been removed. These tests verify the removal persists.
 */

describe('terminal-ui audit', () => {
  it('should not list @ai-rpg-engine/terminal-ui in dependencies', () => {
    const pkg = require('../../package.json') as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['@ai-rpg-engine/terminal-ui']).toBeUndefined();
  });

  it('should not be importable at runtime', async () => {
    await expect(
      import('@ai-rpg-engine/terminal-ui' as string),
    ).rejects.toThrow();
  });
});
