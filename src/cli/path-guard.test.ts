import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { isPathInside } from './path-guard.js';

describe('isPathInside (F-682af46c)', () => {
  const dir = resolve('/base/saves');

  it('accepts a path genuinely inside the directory', () => {
    expect(isPathInside(resolve('/base/saves/hero-123.json'), dir)).toBe(true);
  });

  it('accepts a nested path inside the directory', () => {
    expect(isPathInside(resolve('/base/saves/sub/hero-123.json'), dir)).toBe(true);
  });

  it('rejects a path entirely outside the directory', () => {
    expect(isPathInside(resolve('/base/other/hero-123.json'), dir)).toBe(false);
  });

  it('rejects a sibling directory that merely shares dir as a string prefix (regression)', () => {
    // /base/saves-archive is NOT inside /base/saves, but a bare
    // startsWith('/base/saves') check would incorrectly say it is,
    // because '/base/saves-archive/evil.json'.startsWith('/base/saves') === true.
    expect(isPathInside(resolve('/base/saves-archive/evil.json'), dir)).toBe(false);
  });

  it('rejects parent-directory traversal that escapes back out', () => {
    expect(isPathInside(resolve('/base/saves/../../etc/evil.json'), dir)).toBe(false);
  });
});
