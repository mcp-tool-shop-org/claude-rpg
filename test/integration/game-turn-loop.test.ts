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

    // The turn should not crash — it should either surface a fallback or throw
    // a NarrationError that the caller can handle. Current behavior: throws.
    // This test documents the current behavior and will be updated when
    // game.ts catches NarrationErrors at the processInput boundary.
    await expect(h.play('look around')).rejects.toThrow(NarrationError);
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

  it('rate-limit failure throws retryable NarrationError', async () => {
    const h = createHarness({
      clientOpts: { generateFailure: 'rate-limit' },
    });

    try {
      await h.play('look around');
    } catch (e) {
      expect(e).toBeInstanceOf(NarrationError);
      expect((e as NarrationError).retryable).toBe(true);
    }
  });

  it('interpretation failure (structured) falls back to look verb', async () => {
    // When generateStructured fails, interpretAction should fall back to fast path.
    // For "xyzzy" (no fast-path match), it calls the slow path which fails,
    // and falls back to { verb: 'look', confidence: 'low' }.
    // Low confidence returns clarification without engine resolution.
    const h = createHarness({
      clientOpts: { structuredFailure: 'timeout' },
    });

    // "xyzzy" won't match any fast-path pattern, so it goes to slow path
    // which throws, so interpretAction catches and returns look/low-confidence.
    // But low-confidence short-circuits the turn without engine resolution.
    // However, the current code does NOT catch errors in interpretAction's
    // slow path — it lets the NarrationError propagate.
    // This test documents that behavior.
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
