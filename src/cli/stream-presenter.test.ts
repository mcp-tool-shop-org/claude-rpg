import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStreamPresenter, renderStreamInterruption } from './stream-presenter.js';

// ─── PFE-004: Stream interruption wiring ───────────────────

describe('stream-presenter: markInterrupted', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

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

  it('onChunk writes indent before first chunk', () => {
    const session = createStreamPresenter();
    session.onChunk('Hello');
    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('\n  ');
    expect(output).toContain('Hello');
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
