import { describe, it, expect } from 'vitest';
import { parseSaveSelection, formatSaveSelectionPrompt, formatInvalidSelectionMessage } from './save-selection.js';

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

// F-d01d16f6: runLoad()'s save-selection prompt used to hard-exit the whole
// process on any invalid answer instead of re-prompting -- the one
// interactive moment in the CLI that terminated the process on an ordinary
// typo. The retry loop itself lives in bin.ts (untestable directly, same as
// every other bin.ts control-flow loop -- see bin-defenses.test.ts), but the
// prompt/error text it needs is extracted here so it's independently
// testable, matching this file's own reason for existing.
describe('formatSaveSelectionPrompt (F-d01d16f6)', () => {
  it('includes a live 1-N range hint sized to the save count', () => {
    expect(formatSaveSelectionPrompt(1)).toBe('  Choose a save (1-1, or "cancel"): ');
    expect(formatSaveSelectionPrompt(5)).toBe('  Choose a save (1-5, or "cancel"): ');
  });
});

describe('formatInvalidSelectionMessage (F-d01d16f6)', () => {
  it('includes a live 1-N range hint sized to the save count', () => {
    expect(formatInvalidSelectionMessage(5)).toBe('  Invalid selection. Enter 1-5, or "cancel".');
  });
});
