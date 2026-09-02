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

import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { isPathInside } from './path-guard.js';

export type ExitAutosaveOutcome =
  | { status: 'saved'; message: string }
  | { status: 'rejected'; message: string }
  | { status: 'failed'; error: unknown };

/**
 * Guard `savePath` against `saveDir`, then invoke `save(savePath)` if it
 * passes.
 *
 * - Inside the directory and the save succeeds: `{ status: 'saved' }`.
 * - Outside the directory: `{ status: 'rejected' }` — `save` is never
 *   called. The message names the rejected path and states explicitly that
 *   progress was NOT auto-saved, mirroring the in-game "save" command's
 *   rejection message.
 * - Inside the directory but `save` throws: `{ status: 'failed', error }`,
 *   with the thrown error attached (F-b832167c: previously discarded
 *   entirely, so callers had zero diagnosable detail even under --debug).
 *   No message string — callers route `error` through the same
 *   presentError()/classifyForPresentation() pipeline the rest of bin.ts
 *   uses for every other error path, rather than this module prescribing
 *   its own wording.
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
    return { status: 'saved', message: `  Auto-saved to ${displayPath(savePath)}` };
  } catch (error) {
    return { status: 'failed', error };
  }
}

/**
 * A path as the player should see it: the home directory shown as `~`
 * (identity scan, Phase 0 of the 2.0.0 treatment: the absolute path carried
 * the operator's account name into every playtest transcript).
 */
export function displayPath(p: string): string {
  const home = homedir();
  if (home && (p.startsWith(home + '\\') || p.startsWith(home + '/'))) return '~' + p.slice(home.length).replace(/\\/g, '/');
  return p;
}
