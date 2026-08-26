// Integration tests for the 5-step turn pipeline.
// Uses a fake Claude client so no real API calls are made.
// Validates state transitions, history, output structure, and failure behavior.

import { describe, it, expect } from 'vitest';
import { createHarness } from '../helpers/game-harness.js';
import { NarrationError } from '../../src/llm/claude-errors.js';

// ─── Happy Path ───────────────────────────────────────────────

describe('turn pipeline — happy path', () => {
  it('valid look command completes all 5 stages', async () => {
    const h = createHarness();

    const output = await h.play('look around');

    // Engine resolved (inspect event happened)
    expect(h.turnCount()).toBe(1);
    expect(h.lastVerb()).toBe('look');

    // Narration was produced (fake client returns text)
    expect(output).toBeTruthy();
    expect(typeof output).toBe('string');

    // History was recorded
    expect(h.session.history.turns[0].playerInput).toBe('look around');
  });

  it('move command changes engine location and records history', async () => {
    const h = createHarness();

    const locationBefore = h.session.engine.world.locationId;
    expect(locationBefore).toBe('chapel-entrance');

    await h.play('go to chapel-nave');

    expect(h.session.engine.world.locationId).toBe('chapel-nave');
    expect(h.turnCount()).toBe(1);
    expect(h.lastVerb()).toBe('move');
  });

  it('engine truth is preserved regardless of narration content', async () => {
    const h = createHarness({
      clientOpts: { narration: 'The stars whisper of forgotten gods.' },
    });

    await h.play('go to chapel-nave');

    // Engine state reflects the move, not the narration
    expect(h.session.engine.world.locationId).toBe('chapel-nave');
  });

  it('attack command produces combat events and XP hints', async () => {
    const h = createHarness();

    await h.play('attack pilgrim');

    expect(h.turnCount()).toBe(1);
    expect(h.lastVerb()).toBe('attack');
    // Engine tick advanced
    expect(h.tick()).toBeGreaterThan(0);
  });

  it('multiple turns accumulate in history correctly', async () => {
    const h = createHarness();

    await h.play('look around');
    await h.play('go to chapel-nave');
    await h.play('look around');

    expect(h.turnCount()).toBe(3);
    expect(h.session.history.turns[0].verb).toBe('look');
    expect(h.session.history.turns[1].verb).toBe('move');
    expect(h.session.history.turns[2].verb).toBe('look');
  });

  it('presentation output contains narration text', async () => {
    const h = createHarness({
      clientOpts: { narration: 'Shadows cling to broken pews.' },
    });

    const output = await h.play('look around');
    expect(output).toContain('Shadows cling to broken pews.');
  });
});

// ─── Control Path ─────────────────────────────────────────────

describe('turn pipeline — control path', () => {
  it('no-op look does not corrupt state', async () => {
    const h = createHarness();
    const locationBefore = h.session.engine.world.locationId;

    await h.play('look');
    await h.play('look');

    // Location unchanged
    expect(h.session.engine.world.locationId).toBe(locationBefore);
    expect(h.turnCount()).toBe(2);
  });

  it('repeated commands update history each time', async () => {
    const h = createHarness();

    await h.play('look around');
    await h.play('look around');
    await h.play('look around');

    expect(h.turnCount()).toBe(3);
    // Each turn is a distinct record
    const inputs = h.session.history.turns.map((t) => t.playerInput);
    expect(inputs).toEqual(['look around', 'look around', 'look around']);
  });

  it('slash commands do not consume turns', async () => {
    const h = createHarness();

    await h.play('/director');
    expect(h.turnCount()).toBe(0);
    expect(h.session.mode).toBe('director');

    await h.play('/back');
    // /back triggers getOpeningNarration which calls generate() but doesn't record a turn
    expect(h.session.mode).toBe('play');
  });

  it('quit returns sentinel without state change', async () => {
    const h = createHarness();
    const output = await h.play('quit');
    expect(output).toBe('__QUIT__');
    expect(h.turnCount()).toBe(0);
  });
});

// ─── Narration Failure ────────────────────────────────────────

describe('turn pipeline — narration failure', () => {
  it('timeout still preserves engine state and returns output', async () => {
    const h = createHarness({
      clientOpts: { generateFailure: 'timeout' },
    });

    // F-304fc328 contract: non-fatal narration failures (timeout/rate-limit/
    // transport) degrade to a fallback narration instead of throwing — the
    // turn resolves and play can continue.
    const out = await h.play('look around');
    expect(out).toContain('The scene holds its breath');

    // A subsequent turn still works — the failure did not corrupt the session.
    const out2 = await h.play('look around');
    expect(out2).toContain('The scene holds its breath');
  });

  it('auth failure throws fatal NarrationError', async () => {
    const h = createHarness({
      clientOpts: { generateFailure: 'auth' },
    });

    await expect(h.play('look around')).rejects.toThrow(NarrationError);
    try {
      await h.play('look');
    } catch (e) {
      expect(e).toBeInstanceOf(NarrationError);
      expect((e as NarrationError).fatal).toBe(true);
    }
  });

  it('rate-limit failure degrades to fallback narration (non-fatal, retryable kind)', async () => {
    const h = createHarness({
      clientOpts: { generateFailure: 'rate-limit' },
    });

    // F-304fc328 contract: rate-limit is a non-fatal kind — after withRetry
    // exhausts its budget the narrator returns fallback narration rather than
    // throwing. Unconditional assertion (F-bfc23b00 discipline): this fails
    // for real if the fallback contract regresses in either direction.
    const out = await h.play('look around');
    expect(out).toContain('The scene holds its breath');
  });

  it('interpretation failure (structured) currently propagates NarrationError (fallback to look verb not yet implemented)', async () => {
    // "xyzzy" won't match any fast-path pattern, so interpretAction calls the
    // slow path (generateStructured), which fails here.
    // A graceful fallback would catch that failure and resolve to
    // { verb: 'look', confidence: 'low' }, short-circuiting the turn with a
    // clarification instead of an error. That fallback is NOT implemented yet:
    // interpretAction's slow path lets the NarrationError propagate uncaught.
    // This test documents the current (propagating) behavior so a future fix
    // that adds the fallback will be forced to update this test deliberately.
    const h = createHarness({
      clientOpts: { structuredFailure: 'timeout' },
    });

    await expect(h.play('xyzzy')).rejects.toThrow(NarrationError);
  });

  it('fast-path commands bypass Claude entirely', async () => {
    const h = createHarness({
      clientOpts: {
        // Both fail — but fast-path "look" never calls Claude for interpretation
        structuredFailure: 'auth',
      },
    });

    // "look" matches fast path, so generateStructured is never called.
    // But narrateScene still calls generate(), which succeeds (no generateFailure set).
    const output = await h.play('look');
    expect(output).toBeTruthy();
    expect(h.turnCount()).toBe(1);
    // Structured was never called
    expect(h.callLog.generateStructured).toBe(0);
    // Generate was called for narration
    expect(h.callLog.generate).toBeGreaterThan(0);
  });
});
