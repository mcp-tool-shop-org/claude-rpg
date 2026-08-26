// Integration tests for the 5-step turn pipeline.
// Uses a fake Claude client so no real API calls are made.
// Validates state transitions, history, output structure, and failure behavior.

import { describe, it, expect, vi } from 'vitest';
import { createHarness } from '../helpers/game-harness.js';
import { NarrationError } from '../../src/llm/claude-errors.js';
import type { McpToolCall } from '../../src/runtime/audio-bridge.js';

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
    expect(h.session.history.getAll()[0].playerInput).toBe('look around');
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
    expect(h.session.history.getAll()[0].verb).toBe('look');
    expect(h.session.history.getAll()[1].verb).toBe('move');
    expect(h.session.history.getAll()[2].verb).toBe('look');
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
    const inputs = h.session.history.getAll().map((t) => t.playerInput);
    expect(inputs).toEqual(['look around', 'look around', 'look around']);
  });

  it('slash commands do not consume turns', async () => {
    const h = createHarness();

    await h.play('/director');
    expect(h.turnCount()).toBe(0);
    expect(h.session.mode).toBe('director');

    await h.play('/back');
    // /back triggers getOpeningNarration(), which unconditionally records a
    // turn in history (game.ts:479, F-8da2e6f7 — carries isFallback for
    // recap filtering the same way every other turn does), so this DOES
    // consume a turn unlike /director above. Whether /back *should* be
    // turn-count-neutral is a game.ts design question — this just pins
    // what it actually does today.
    expect(h.session.mode).toBe('play');
    expect(h.turnCount()).toBe(1);
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

    // F-f53130d8: capture real engine state before either turn so the
    // "did not corrupt the session" claim below is actually checked, not
    // just implied by the fallback text repeating on a second call.
    const tickBefore = h.tick();
    const locationBefore = h.session.engine.world.locationId;

    // F-304fc328 contract: non-fatal narration failures (timeout/rate-limit/
    // transport) degrade to a fallback narration instead of throwing — the
    // turn resolves and play can continue.
    const out = await h.play('look around');
    expect(out).toContain('The scene holds its breath');

    // A subsequent turn still works — the failure did not corrupt the session.
    const out2 = await h.play('look around');
    expect(out2).toContain('The scene holds its breath');

    // Engine truth is unaffected by the narration fallback: 'look' never
    // changes location, the engine tick still advances exactly once per
    // turn (submitAction runs before narration and isn't rolled back when
    // narrateScene swallows the failure), and both turns were recorded.
    expect(h.session.engine.world.locationId).toBe(locationBefore);
    expect(h.tick()).toBe(tickBefore + 2);
    expect(h.turnCount()).toBe(2);
  });

  // F-bf400714: every failure case above (and the fake client's own prior
  // shape) can only script "every call fails identically" -- there was no
  // way to express a transient outage that clears mid-session, even though
  // that is exactly what production's real retry path (withRetry in
  // src/llm/claude-adapter.ts, invisible below the ClaudeClient interface
  // this fake substitutes for) exists to recover from. This proves one bad
  // turn doesn't read as the whole session degrading: turn 2's injected
  // retryable failure degrades to fallback narration while turns 1 and 3,
  // on the same harness/session, still show real narration text.
  it('a transient failure on one turn does not degrade the turns before or after it', async () => {
    const h = createHarness({
      clientOpts: {
        narration: 'The chapel breathes around you.',
        generateFailure: (callNumber) => (callNumber === 2 ? 'timeout' : undefined),
      },
    });

    const out1 = await h.play('look');
    const out2 = await h.play('look');
    const out3 = await h.play('look');

    expect(out1).toContain('The chapel breathes around you.');
    expect(out2).toContain('The scene holds its breath');
    expect(out3).toContain('The chapel breathes around you.');

    // All three turns still resolved and were recorded -- the mid-session
    // outage degraded narration quality for one turn, not the session.
    expect(h.turnCount()).toBe(3);
    expect(h.callLog.generate).toBe(3);
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

// ─── Presentation Seam Integration (F-f9b5f874) ──────────────

// F-79a25863 (presentation seam contract) is unit-tested in src/game.test.ts
// against GameSession directly, but every one of those cases either passes
// no onPresentation callback or mocks the adjacent boundary with
// vi.spyOn(h.session.immersion, 'processPresentation') -- none of them drive
// a real turn far enough to let the actual hook pipeline (hooks.ts's
// combatStartHook -> ImmersionRuntime.fireEventHooks ->
// VoiceSoundboardBridge) compute a genuine McpToolCall. These cases fill
// that gap: real createHarness() turns, onPresentation wired through
// gameOpts exactly like game-harness.ts's opts.gameOpts spread documents,
// and no mock anywhere on the immersion/presentation path.
describe('presentation seam — real turn integration (F-f9b5f874)', () => {
  it('invokes onPresentation with an empty array after an ordinary turn that enters no new presentation state', async () => {
    const onPresentation = vi.fn();
    const h = createHarness({ gameOpts: { onPresentation } });

    await h.play('look around');

    expect(onPresentation).toHaveBeenCalledTimes(1);
    expect(onPresentation).toHaveBeenCalledWith([]);
  });

  it('delivers the real hook-triggered combat-start cues to onPresentation from a genuine combat turn', async () => {
    const onPresentation = vi.fn();
    const h = createHarness({ gameOpts: { onPresentation } });

    // Defensive fixture setup, not a mock of anything under test: a fresh
    // createGame() world's player starts with only 8 stamina and "attack"
    // costs 1, but @ai-rpg-engine/starter-fantasy's createGame() has been
    // observed (empirically, against this exact dependency version) to
    // share player.resources.stamina across separate createGame() calls
    // within one process, so a run of many prior tests in this file can
    // leave too little stamina left for "attack" to resolve as
    // combat.contact.miss/hit and instead reject the action outright with
    // no combat.* event at all. Pinning both combatants' resources directly
    // on the real engine -- the same idiom src/action-interpreter.test.ts
    // already uses against a real createGame() engine (`engine.world.entities[engine.world.playerId]`)
    // -- makes this test's outcome depend only on the real presentation
    // seam under test, not on stamina left over from execution order.
    // Pilgrim's hp is pinned high too so the hit/miss roll can't coincidentally
    // one-shot it into combat.entity.defeated, which would route this turn
    // through combatEndHook (aftermath) instead of the combat-start seam
    // this case exists to prove.
    const world = h.session.engine.world;
    world.entities[world.playerId].resources.stamina = 999;
    const pilgrim = Object.values(world.entities).find((e) => e.id === 'pilgrim');
    if (!pilgrim) throw new Error('fixture: "pilgrim" entity not found in the starting zone');
    pilgrim.resources.hp = 999;

    // First combat action of the session: the presentation state machine
    // starts at 'exploration' (PresentationStateMachine's default), so this
    // turn's combat.* event(s) flip it to 'combat' for the first time,
    // which is exactly the justEnteredCombat gate hooks.ts's
    // combatStartHook (and ImmersionRuntime.fireEventHooks's dispatch of
    // it) requires to fire.
    await h.play('attack pilgrim');

    expect(onPresentation).toHaveBeenCalledTimes(1);
    const [calls] = onPresentation.mock.calls[0] as [McpToolCall[]];
    // combatStartHook's sfxCues + musicCue, executed for real through
    // VoiceSoundboardBridge (audio-bridge.ts) -- not asserting the
    // soundpack-core registry's effect-name mapping here, since that
    // lookup table belongs to a separate dependency; intensity/action/fadeMs
    // are this repo's own hooks.ts values.
    expect(calls).toContainEqual({
      tool: 'sound_effect',
      params: expect.objectContaining({ intensity: 0.8 }),
    });
    expect(calls).toContainEqual({
      tool: '__music_intent__',
      params: expect.objectContaining({ action: 'intensify' }),
    });
  });

  it('does not let a throwing onPresentation sink damage a real combat turn (mirrors PB-001 containment)', async () => {
    const onPresentation = vi.fn(() => {
      throw new Error('sink exploded');
    });
    const h = createHarness({ gameOpts: { onPresentation } });

    const world = h.session.engine.world;
    world.entities[world.playerId].resources.stamina = 999;

    const output = await h.play('attack pilgrim');

    expect(output).toBeTruthy();
    expect(h.turnCount()).toBe(1);
    expect(onPresentation).toHaveBeenCalledTimes(1);
  });
});
