// save-selection.ts — validate a user's save-slot selection answer.
//
// Extracted from bin.ts's runLoad() so the NaN-bypass guard (F-d130796b) is
// independently testable: bin.ts is a bare CLI entry point with no exports.

/**
 * Parse a 1-based "Choose a save" answer into a validated 0-based index.
 * Returns null when the answer is out of range OR non-numeric (parseInt
 * yields NaN, which fails both `< 0` and `>= savesLength` comparisons —
 * without an explicit Number.isInteger guard, a NaN index silently slips
 * past the bounds check and reaches an out-of-bounds array access).
 */
export function parseSaveSelection(answer: string, savesLength: number): number | null {
  const idx = parseInt(answer, 10) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= savesLength) {
    return null;
  }
  return idx;
}

/**
 * F-d01d16f6: runLoad()'s "Choose a save" prompt used to be a fixed string
 * with no range hint. Extracted (same reason as parseSaveSelection above --
 * bin.ts has no exports to unit-test against) so the caller can re-print it
 * on every retry loop iteration instead of exiting the process on the first
 * bad answer.
 */
export function formatSaveSelectionPrompt(savesLength: number): string {
  return `  Choose a save (1-${savesLength}, or "cancel"): `;
}

/** Re-prompt message for an invalid (out-of-range/non-numeric/empty) save
 *  selection answer -- paired with formatSaveSelectionPrompt above so a
 *  mistyped digit re-asks with a concrete range instead of hard-exiting. */
export function formatInvalidSelectionMessage(savesLength: number): string {
  return `  Invalid selection. Enter 1-${savesLength}, or "cancel".`;
}
