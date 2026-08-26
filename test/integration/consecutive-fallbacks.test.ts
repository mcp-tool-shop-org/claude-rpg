// F-5fce8d7f (SLATE-5a, wave 18 tests domain): prove consecutiveFallbacks
// counter semantics (increment/reset) and the FALLBACK_NARRATION_REPEATED
// switch reach narrateScene through the REAL turn loop, plus the save/resume
// policy test keyed to the Coordinator Brief's ruling.
//
// narrator.ts's narrateScene() already implements the increment/switch logic
// correctly (NarrateSceneOpts.consecutiveFallbacks, narrator.ts:137) --
// that's unit-tested elsewhere (narrator.test.ts, cross-domain). What's
// missing is the WIRING: turn-loop.ts's executeTurn() never passes
// consecutiveFallbacks to narrateScene() at all (verified directly against
// this worktree's src/turn-loop.ts:285-304 -- no such field in the call),
// and ExecuteTurnOpts has no consecutiveFallbacks field to carry it
// (pinned this wave per the Coordinator Brief: "TurnResult.isFallback +
// ExecuteTurnOpts.consecutiveFallbacks"). These tests exercise the REAL
// createHarness()->play() loop end-to-end, which is the only way to prove
// the wiring (not just the isolated function) actually works.
//
// Coordinator Brief ruling R2 (binding): save/resume policy = RESET-ON-LOAD
// -- the streak counter is session-local (a plain GameSession field), never
// persisted. The third test below pins that policy directly.

import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { saveSession } from '../../src/session/session.js';
import { createHarness, resumeHarness } from '../helpers/game-harness.js';
import { FALLBACK_NARRATION, FALLBACK_NARRATION_REPEATED } from '../../src/narrator/narrator.js';

describe('consecutiveFallbacks wiring through the real turn loop (F-5fce8d7f)', () => {
  it('red in-worktree, green expected at merge: 3 consecutive failing turns show turn 1 = FALLBACK_NARRATION, turns 2-3 = FALLBACK_NARRATION_REPEATED', async () => {
    const h = createHarness({ clientOpts: { generateFailure: 'timeout' } });

    const out1 = await h.play('look');
    const out2 = await h.play('look');
    const out3 = await h.play('look');

    expect(out1).toContain(FALLBACK_NARRATION);
    expect(out1).not.toContain(FALLBACK_NARRATION_REPEATED);
    expect(out2).toContain(FALLBACK_NARRATION_REPEATED);
    expect(out3).toContain(FALLBACK_NARRATION_REPEATED);
  });

  it('red in-worktree, green expected at merge: streak resets on an intervening success (fail, fail, succeed, fail -> the 4th turn shows plain FALLBACK_NARRATION again, not REPEATED)', async () => {
    const h = createHarness({
      clientOpts: {
        // Call-count-aware: only the 3rd generate() call succeeds.
        generateFailure: (n) => (n === 3 ? undefined : 'timeout'),
      },
    });

    const out1 = await h.play('look'); // fail 1
    const out2 = await h.play('look'); // fail 2 -> repeated
    const out3 = await h.play('look'); // success -> streak breaks
    const out4 = await h.play('look'); // fail 3 (post-success) -> should read as fail 1 again

    expect(out1).toContain(FALLBACK_NARRATION);
    expect(out1).not.toContain(FALLBACK_NARRATION_REPEATED);
    expect(out2).toContain(FALLBACK_NARRATION_REPEATED);
    expect(out3).not.toContain(FALLBACK_NARRATION);
    expect(out4).toContain(FALLBACK_NARRATION);
    expect(out4).not.toContain(FALLBACK_NARRATION_REPEATED);
  });

  it('policy lock (Coordinator Brief R2, reset-on-load): a streak in progress does not survive save+resume -- the first failing turn after loading always reads as fail 1, never the pre-save streak continuing', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'claude-rpg-consecutive-fallbacks-'));
    try {
      const h1 = createHarness({ clientOpts: { generateFailure: 'timeout' } });
      await h1.play('look'); // fail 1
      await h1.play('look'); // fail 2 -- a streak of 2 is in progress at save time

      const savePath = join(tmpDir, 'save.json');
      await saveSession({
        engine: h1.session.engine,
        history: h1.session.history,
        tone: h1.session.tone,
        savePath,
        packId: 'chapel-threshold',
      });

      const h2 = await resumeHarness(savePath, { clientOpts: { generateFailure: 'timeout' } });
      const out = await h2.play('look'); // first failing turn post-resume

      // If the counter were wrongly persisted/continued instead of reset,
      // this turn would read as the streak's 3rd consecutive failure and
      // render FALLBACK_NARRATION_REPEATED. R2 requires session-local reset.
      expect(out).toContain(FALLBACK_NARRATION);
      expect(out).not.toContain(FALLBACK_NARRATION_REPEATED);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
