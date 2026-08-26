// exit-autosave.ts — F-66ec19e3: shared guard-then-save flow for the two
// "game exits while still running" autosave paths in bin.ts (the first-
// Ctrl+C SIGINT handler and the stdin-closed/EOF handler). Both build an
// autosave name from the session's character name and guard the resolved
// path with isPathInside before writing. Previously, when the guard
// rejected the path, the code silently skipped the save and fell straight
// through to the unconditional "Farewell." message — printed exactly as if
// the exit were clean. The in-game "save" command already reports a
// rejected guard explicitly; this module gives the two exit-time paths the
// same reporting contract, and returns a value (rather than doing its own
// console output) so the "rejected" branch is independently testable.
//
// Extracted because bin.ts is a bare CLI entry point with no exports (the
// same reason cli/engine-state-validator.ts and cli/save-selection.ts were
// pulled out of it) — the decision-and-message logic below couldn't be
// unit-tested in place.

import { resolve } from 'node:path';
import { isPathInside } from './path-guard.js';

export type ExitAutosaveOutcome =
  | { status: 'saved'; message: string }
  | { status: 'rejected'; message: string }
  | { status: 'failed' };

/**
 * Guard `savePath` against `saveDir`, then invoke `save(savePath)` if it
 * passes.
 *
 * - Inside the directory and the save succeeds: `{ status: 'saved' }`.
 * - Outside the directory: `{ status: 'rejected' }` — `save` is never
 *   called. The message names the rejected path and states explicitly that
 *   progress was NOT auto-saved, mirroring the in-game "save" command's
 *   rejection message.
 * - Inside the directory but `save` throws: `{ status: 'failed' }`, with no
 *   message — callers already have call-site-specific wording for this
 *   case (bin.ts's SIGINT and stdin-closed handlers word it slightly
 *   differently), so this function doesn't prescribe it.
 */
export async function attemptExitAutosave(
  savePath: string,
  saveDir: string,
  save: (savePath: string) => Promise<void>,
): Promise<ExitAutosaveOutcome> {
  const expectedDir = resolve(saveDir);
  if (!isPathInside(savePath, expectedDir)) {
    return {
      status: 'rejected',
      message: `  Auto-save skipped: ${savePath} would escape the save directory — progress was NOT auto-saved.`,
    };
  }
  try {
    await save(savePath);
    return { status: 'saved', message: `  Auto-saved to ${savePath}` };
  } catch {
    return { status: 'failed' };
  }
}
