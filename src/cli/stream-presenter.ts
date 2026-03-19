// stream-presenter.ts: Incremental CLI rendering for streamed narration.
// Writes chunks to stdout as they arrive, then signals completion.
// Never holds state truth. Never records history. Display only.

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
};

/**
 * Create a streaming presenter that writes narration chunks to stdout.
 *
 * Usage:
 *   const stream = createStreamPresenter();
 *   const result = await executeTurn(..., stream.onChunk);
 *   stream.finish();
 *
 * The presenter:
 * - Writes an opening indent before the first chunk
 * - Appends each chunk directly to stdout (no cursor manipulation)
 * - On finish(), emits a trailing newline and resets state
 */
export function createStreamPresenter(): StreamSession {
  let started = false;
  let chunkCount = 0;
  let interrupted = false;

  const onChunk: StreamCallback = (chunk: string) => {
    if (!started) {
      // Opening indent to match play-renderer narration style
      process.stdout.write('\n  ');
      started = true;
    }
    process.stdout.write(chunk);
    chunkCount++;
  };

  const finish = () => {
    if (started) {
      process.stdout.write('\n');
    }
  };

  const session: StreamSession = {
    onChunk,
    finish,
    get chunkCount() { return chunkCount; },
    get interrupted() { return interrupted; },
    set interrupted(v: boolean) { interrupted = v; },
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
