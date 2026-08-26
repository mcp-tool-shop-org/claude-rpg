// stream-presenter.ts: Incremental CLI rendering for streamed narration.
// Writes chunks to stdout as they arrive, then signals completion.
// Never holds state truth. Never records history. Display only.

import { moveCursor, cursorTo, clearScreenDown } from 'node:readline';
import type { StreamCallback } from '../claude-client.js';

export type StreamSession = {
  /** Callback to pass to narrateScene/executeTurn as onChunk. */
  onChunk: StreamCallback;
  /** Call after stream completes to restore normal display. */
  finish: () => void;
  /** Number of chunks received. */
  chunkCount: number;
  /** Whether the stream was interrupted before finish(). */
  interrupted: boolean;
  /** Mark the stream as interrupted and render a visual break to the player. */
  markInterrupted: () => void;
  /**
   * F-c94fa782: erase everything streamed so far, restoring the cursor to
   * where streaming began. Use this instead of finish() when the caller is
   * about to print the same narration through another path (e.g. bin.ts
   * reprinting the turn's full formatted output) and needs to avoid showing
   * it twice. TTY-only -- without cursor control there is nothing safe to
   * erase, so this is a no-op on piped/redirected stdout. Also a no-op if
   * nothing was ever written.
   */
  clear: () => void;
};

/**
 * F-c94fa782: number of terminal rows `text` occupies when written at
 * column 0 of a terminal `columns` cells wide, accounting for line wrap.
 * Exported standalone (pure, no stdout access) so the row math clear() uses
 * to know how far to move the cursor back up can be tested precisely,
 * without asserting on node:readline's internal escape-sequence format.
 */
export function computeClearedRowCount(text: string, columns: number): number {
  const cols = Math.max(1, columns);
  const totalRows = text
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / cols)), 0);
  // The first row is where writing started (not a row moved *into*), so the
  // net downward displacement -- what clear() needs to move back up -- is
  // one less than the total rows the text spans.
  return totalRows - 1;
}

/**
 * Create a streaming presenter that writes narration chunks to stdout.
 *
 * Usage (bin.ts / cli-display's actual wiring -- see withStreamingHook):
 *   const stream = createStreamPresenter();
 *   // ... GameConfig.onNarrationChunk forwards to stream.onChunk for the
 *   // duration of one processInput() call ...
 *   if (stream.chunkCount > 0) stream.clear(); // avoid double-printing
 *   console.log(output); // narration prints once, via the normal path
 *
 * The presenter:
 * - Writes an opening indent before the first chunk
 * - Appends each chunk directly to stdout (no cursor manipulation)
 * - On finish(), emits a trailing newline and resets state
 * - On clear(), erases everything written instead (see StreamSession.clear)
 */
export function createStreamPresenter(): StreamSession {
  let started = false;
  let chunkCount = 0;
  let interrupted = false;
  // F-c94fa782: exact text written to stdout since (and including) the
  // opening indent, so clear() can compute how many rows to erase.
  let written = '';

  const onChunk: StreamCallback = (chunk: string) => {
    if (!started) {
      // F-f6485d6c: flush-left, matching play-renderer.ts's renderPlayScreen
      // (`parts.push(opts.narration)` -- no leading indent). This used to
      // open with a 2-space indent "to match play-renderer narration
      // style," but that style is actually flush left; the mismatch made
      // the just-streamed paragraph visibly jump 2 columns left the moment
      // bin.ts's turn loop cleared the stream and reprinted the same text
      // through the static renderPlayScreen path.
      process.stdout.write('\n');
      written = '\n';
      started = true;
    }
    process.stdout.write(chunk);
    written += chunk;
    chunkCount++;
  };

  const finish = () => {
    if (started) {
      process.stdout.write('\n');
    }
  };

  /**
   * PFE-004: Mark the stream as interrupted and render a visual break.
   * Call this when a partial stream failure occurs so the player sees
   * a clean separator before any fallback narration.
   */
  const markInterrupted = () => {
    interrupted = true;
    renderStreamInterruption();
  };

  const clear = () => {
    if (!started || !process.stdout.isTTY) return;
    const rows = computeClearedRowCount(written, process.stdout.columns || 80);
    if (rows > 0) moveCursor(process.stdout, 0, -rows);
    cursorTo(process.stdout, 0);
    clearScreenDown(process.stdout);
  };

  const session: StreamSession = {
    onChunk,
    finish,
    get chunkCount() { return chunkCount; },
    get interrupted() { return interrupted; },
    set interrupted(v: boolean) { interrupted = v; },
    markInterrupted,
    clear,
  };

  return session;
}

/**
 * Render a fallback message after a stream interruption.
 * Called when streaming fails mid-output to give the player
 * a clean visual break before the fallback narration.
 */
export function renderStreamInterruption(): void {
  process.stdout.write('\n\n  [The narrator pauses...]\n');
}
