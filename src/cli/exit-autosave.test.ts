import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'node:path';
import { attemptExitAutosave } from './exit-autosave.js';

// F-66ec19e3: the SIGINT and stdin-closed exit paths in bin.ts used to
// silently skip the autosave when the guard rejected the resolved path,
// then print "Farewell." as if the exit were clean. These tests pin the
// three outcomes attemptExitAutosave must distinguish so that bug can't
// come back unnoticed.

describe('attemptExitAutosave (F-66ec19e3)', () => {
  const saveDir = resolve('/base/saves');

  it('saves and reports the save path when the guard passes', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const savePath = resolve('/base/saves/hero-autosave-1.json');

    const outcome = await attemptExitAutosave(savePath, saveDir, save);

    expect(outcome).toEqual({ status: 'saved', message: `  Auto-saved to ${savePath}` });
    expect(save).toHaveBeenCalledWith(savePath);
  });

  it('rejects without calling save when the path escapes the save directory, and says so (regression: previously silent)', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    // Shares saveDir's name as a string prefix but is a sibling directory —
    // the same traversal shape isPathInside itself guards against.
    const savePath = resolve('/base/saves-archive/evil-autosave-1.json');

    const outcome = await attemptExitAutosave(savePath, saveDir, save);

    expect(outcome.status).toBe('rejected');
    expect(save).not.toHaveBeenCalled();
    if (outcome.status === 'rejected') {
      expect(outcome.message).toContain(savePath);
      expect(outcome.message).toContain('NOT auto-saved');
    }
  });

  it('rejects parent-directory traversal the same way', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const savePath = resolve('/base/saves/../../etc/evil-autosave.json');

    const outcome = await attemptExitAutosave(savePath, saveDir, save);

    expect(outcome.status).toBe('rejected');
    expect(save).not.toHaveBeenCalled();
  });

  it('reports failed with the underlying error (and does not throw) when save rejects (F-b832167c)', async () => {
    // F-b832167c: the catch block used to discard the thrown error entirely
    // (`catch { return { status: 'failed' }; }`, not even bound to a
    // variable) so neither bin.ts caller could report why an exit-time
    // autosave failed -- a disk-full/permission-denied failure produced
    // zero diagnosable detail, even under --debug. The error must now
    // survive on the outcome so callers can route it through the same
    // presentError()/classifyForPresentation() pipeline every other error
    // path in bin.ts already uses.
    const thrown = new Error('disk full');
    const save = vi.fn().mockRejectedValue(thrown);
    const savePath = resolve('/base/saves/hero-autosave-2.json');

    const outcome = await attemptExitAutosave(savePath, saveDir, save);

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.error).toBe(thrown);
    }
  });
});
