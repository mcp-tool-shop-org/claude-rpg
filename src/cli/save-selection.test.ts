import { describe, it, expect } from 'vitest';
import { parseSaveSelection } from './save-selection.js';

describe('parseSaveSelection (F-d130796b)', () => {
  it('returns the 0-based index for a valid 1-based selection', () => {
    expect(parseSaveSelection('1', 3)).toBe(0);
    expect(parseSaveSelection('3', 3)).toBe(2);
  });

  it('returns null for an index below range', () => {
    expect(parseSaveSelection('0', 3)).toBeNull();
    expect(parseSaveSelection('-1', 3)).toBeNull();
  });

  it('returns null for an index above range', () => {
    expect(parseSaveSelection('4', 3)).toBeNull();
  });

  it('returns null for non-numeric input instead of NaN (regression)', () => {
    // parseInt('', 10) and parseInt('abc', 10) both yield NaN. NaN < 0 and
    // NaN >= length both evaluate to false, so a bare comparison bypass is
    // the exact bug this guards against — the caller must never receive NaN.
    expect(parseSaveSelection('', 3)).toBeNull();
    expect(parseSaveSelection('abc', 3)).toBeNull();
    expect(parseSaveSelection('   ', 3)).toBeNull();
  });
});
