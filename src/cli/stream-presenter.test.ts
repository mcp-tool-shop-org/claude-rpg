import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { createStreamPresenter, renderStreamInterruption, computeClearedRowCount } from './stream-presenter.js';

// ─── PFE-004: Stream interruption wiring ───────────────────

describe('stream-presenter: markInterrupted', () => {
  let writeSpy: MockInstance<typeof process.stdout.write>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('markInterrupted sets interrupted flag to true', () => {
    const session = createStreamPresenter();
    expect(session.interrupted).toBe(false);
    session.markInterrupted();
    expect(session.interrupted).toBe(true);
  });

  it('markInterrupted calls renderStreamInterruption (visual break)', () => {
    const session = createStreamPresenter();
    session.markInterrupted();
    // renderStreamInterruption writes the visual break to stdout
    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('[The narrator pauses...]');
  });

  it('renderStreamInterruption writes visual break directly', () => {
    renderStreamInterruption();
    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('[The narrator pauses...]');
  });

  // F-f6485d6c: onChunk used to open with '\n  ' (a 2-space indent), per
  // this line's own comment "match play-renderer narration style" -- but
  // play-renderer.ts's renderPlayScreen pushes opts.narration completely
  // unindented (`parts.push(opts.narration)`, flush against the left
  // margin). bin.ts's turn loop clears the streamed text the instant
  // streaming finishes and reprints the same narration via the static
  // renderPlayScreen path, so the player saw the just-streamed paragraph
  // visually jump 2 columns left the moment the full screen redrew. Fixed
  // by dropping the indent so both renderings share the same column --
  // matching the comment's actual (corrected) intent.
  it('onChunk opens with a bare newline and no indent, matching play-renderer.ts\'s flush-left narration (F-f6485d6c)', () => {
    const session = createStreamPresenter();
    session.onChunk('Hello');
    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toBe('\nHello');
    expect(session.chunkCount).toBe(1);
  });

  it('finish writes trailing newline after streaming', () => {
    const session = createStreamPresenter();
    session.onChunk('text');
    writeSpy.mockClear();
    session.finish();
    expect(writeSpy).toHaveBeenCalledWith('\n');
  });

  it('finish does nothing if no chunks were written', () => {
    const session = createStreamPresenter();
    session.finish();
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

// ─── F-c94fa782: streaming seam contract (wave-10/cli-display.md) ──────────
// bin.ts wires createStreamPresenter() into GameConfig.onNarrationChunk so
// production turns actually stream (see bin.ts's `withStreamingHook` doc
// comment for the cross-domain half of that seam, which can't be exercised
// by a scoped test run in this worktree alone -- same reasoning as
// presentation-renderer.test.ts's note on `withPresentationHook`). What CAN
// be tested here, self-contained: the wrapped-row math clear() uses to
// erase already-streamed narration before bin.ts reprints the turn's full
// formatted output (avoiding a double-print), and clear()'s own guards.

describe('computeClearedRowCount', () => {
  it('returns 0 for empty text', () => {
    expect(computeClearedRowCount('', 80)).toBe(0);
  });

  it('returns 0 for a single line that fits without wrapping', () => {
    expect(computeClearedRowCount('Hello', 80)).toBe(0);
  });

  it('counts one row per explicit newline', () => {
    expect(computeClearedRowCount('\n  Hello', 80)).toBe(1);
    expect(computeClearedRowCount('line one\nline two\nline three', 80)).toBe(2);
  });

  it('accounts for line wrap at the given terminal width', () => {
    // 85 chars on an 80-column terminal wraps to 2 screen rows for that one
    // logical line, stacked on the newline that put us on it.
    const text = '\n' + 'x'.repeat(85);
    expect(computeClearedRowCount(text, 80)).toBe(2);
  });

  it('treats a non-positive column count as 1 rather than dividing by zero', () => {
    expect(() => computeClearedRowCount('\n  hi', 0)).not.toThrow();
    expect(computeClearedRowCount('\n  hi', 0)).toBeGreaterThan(0);
  });
});

describe('stream-presenter: clear', () => {
  let writeSpy: MockInstance<typeof process.stdout.write>;
  // Typed to match process.stdout's own (non-optional) declarations --
  // Node's tty.d.ts types these as always-present even though a real
  // non-TTY stream leaves them undefined at runtime; matching the decl
  // keeps the save/restore round-trip below assignable without a cast.
  let originalIsTTY: boolean;
  let originalColumns: number;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    originalIsTTY = process.stdout.isTTY;
    originalColumns = process.stdout.columns;
  });
  afterEach(() => {
    writeSpy.mockRestore();
    process.stdout.isTTY = originalIsTTY;
    process.stdout.columns = originalColumns;
  });

  it('erases streamed chunks via cursor control when stdout is a TTY', () => {
    process.stdout.isTTY = true;
    process.stdout.columns = 80;
    const session = createStreamPresenter();
    session.onChunk('Hello streaming world');
    writeSpy.mockClear();

    session.clear();

    // node:readline's moveCursor/cursorTo/clearScreenDown all write ANSI CSI
    // sequences ('\x1b[') -- assert the escape channel fired at all rather
    // than pinning exact byte sequences to node:readline's internals.
    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('\x1b[');
  });

  it('does nothing when stdout is not a TTY (no cursor control to erase with)', () => {
    process.stdout.isTTY = false;
    const session = createStreamPresenter();
    session.onChunk('Hello');
    writeSpy.mockClear();

    session.clear();

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('does nothing if no chunks were ever written', () => {
    process.stdout.isTTY = true;
    const session = createStreamPresenter();

    session.clear();

    expect(writeSpy).not.toHaveBeenCalled();
  });
});
