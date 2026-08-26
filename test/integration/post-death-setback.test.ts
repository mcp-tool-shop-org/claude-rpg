// F-4285c469 (SLATE-6, wave 18 tests domain): exactly-once death-transition
// detection, post-death input gating, distinct death framing, and a
// no-double-transition regression lock, using a deterministic forced-death
// fixture.
//
// Coordinator Brief ruling (R4, binding): death = SETBACK. Post-death
// contract: ordinary verbs blocked at the downed gate (no
// engine.submitAction, no tick advance); 'continue' returns to exploration;
// slash commands still work. Deterministic player-death via direct hp
// mutation (mirroring resumeHarness()'s own
// `Object.assign(engine.store.state, ...)` pattern, game-harness.ts:128, and
// this exact file's sibling game-turn-loop.test.ts's own precedent of
// pinning `world.entities[world.playerId].resources.stamina = 999`
// directly) is APPROVED as the test-only escape hatch, avoiding RNG-driven
// combat entirely.
//
// Pinned seam signatures this wave: inferAndTransition returning
// {from,to,trigger} + TurnResult.justDied; renderDeathScreen export. Neither
// is imported directly here -- GameHarness.play() only ever returns the
// rendered string, and TurnResult itself isn't exposed by the harness, so
// this file proves the contract through its OBSERVABLE effects (tick/
// turnCount gating, and the real deathHook audio/UI cues relayed through
// onPresentation) rather than guessing renderDeathScreen's exact copy or
// import path -- consistent with "distinguishable ... avoiding a brittle
// hardcoded string match against not-yet-authored copy" in the routed
// finding's own Fix text.
//
// Two DISTINCT bugs are pinned red here, for two DISTINCT reasons (both
// disclosed): (1) no input-gating exists at all today (game.ts's
// processInput has no downed-gate branch -- the residual this finding is
// about), so a post-death ordinary turn advances tick/turnCount exactly like
// any other turn; (2) immersion-runtime.ts's death hookPoint dispatch
// (fireEventHooks, ~line 442) unconditionally re-checks
// isPlayerDefeatEvent||isPlayerAtZeroHp every turn with NO
// to==='menu'&&from!=='menu' one-shot guard, unlike combat-start's own
// `justEnteredCombat` guard one function above it (F-0acb03fe) -- so with
// hp pinned at 0 and no gate blocking a second turn, deathHook's cues
// (alert_critical + fade-out) actually re-fire today. Both are exactly the
// residual SLATE-6 exists to close; whichever domain lands
// TurnResult.justDied is expected to fix both at once (justDied gates the
// hook dispatch AND lets game.ts's processInput gate turns).

import { describe, it, expect, vi } from 'vitest';
import { createHarness } from '../helpers/game-harness.js';
import type { McpToolCall } from '../../src/runtime/audio-bridge.js';

/** True if any queued call this turn is deathHook's signature critical alarm. */
function hasDeathAlarm(calls: McpToolCall[]): boolean {
  return calls.some(
    (c) => c.tool === 'sound_effect' && (c.params as Record<string, unknown>)?.intensity === 1.0,
  );
}

describe('post-death SETBACK gating (F-4285c469, Coordinator Brief R4)', () => {
  it('turn N only: an ordinary pre-death turn shows no death cues; the turn where hp reaches 0 does (exactly-once detection + distinct framing via real deathHook cues, not guessed copy)', async () => {
    const onPresentation = vi.fn();
    const h = createHarness({ gameOpts: { onPresentation } });

    // Turn 1: ordinary, alive.
    await h.play('look around');
    expect(onPresentation).toHaveBeenCalledTimes(1);
    expect(hasDeathAlarm(onPresentation.mock.calls[0][0] as McpToolCall[])).toBe(false);

    // Force death deterministically -- no combat RNG involved (brief-approved
    // escape hatch; mirrors this exact file's sibling's stamina-pinning
    // precedent in test/integration/game-turn-loop.test.ts:324).
    const world = h.session.engine.world;
    world.entities[world.playerId].resources.hp = 0;

    // Turn 2: the death turn. isPlayerAtZeroHp(world, playerId) is checked
    // directly in inferFromEvents regardless of which verb runs or what
    // events it produces (hooks.ts's F-e57d6a60 hazard-death path), so a
    // plain 'look' is enough to surface it -- no combat needed.
    await h.play('look around');
    expect(onPresentation).toHaveBeenCalledTimes(2);
    expect(hasDeathAlarm(onPresentation.mock.calls[1][0] as McpToolCall[])).toBe(true);
  });

  it('ordinary verbs are blocked at the downed gate: no tick advance, no turn recorded (brief R4) -- red in-worktree, green expected at merge (game.ts has no downed-gate branch yet)', async () => {
    const h = createHarness();
    const world = h.session.engine.world;
    world.entities[world.playerId].resources.hp = 0;

    await h.play('look around'); // the death turn itself always resolves
    const tickAtDeath = h.tick();
    const turnsAtDeath = h.turnCount();

    await h.play('look around'); // ordinary verb, post-death
    expect(h.tick()).toBe(tickAtDeath);
    expect(h.turnCount()).toBe(turnsAtDeath);

    await h.play('go to chapel-nave'); // a different ordinary verb, still gated
    expect(h.tick()).toBe(tickAtDeath);
    expect(h.turnCount()).toBe(turnsAtDeath);
  });

  it('no-double-transition regression lock: the death alarm does not re-fire on a second post-death turn with no intervening event, mirroring the to===X && from!==X guard shape already precedented for combat-entry (F-0acb03fe) -- red in-worktree, green expected at merge', async () => {
    const onPresentation = vi.fn();
    const h = createHarness({ gameOpts: { onPresentation } });
    const world = h.session.engine.world;
    world.entities[world.playerId].resources.hp = 0;

    await h.play('look around'); // death turn -- alarm fires once (proven above)
    onPresentation.mockClear();

    await h.play('look around'); // post-death turn #1
    await h.play('look around'); // post-death turn #2, no intervening non-death event

    const anyReFire = onPresentation.mock.calls.some(
      (call) => hasDeathAlarm(call[0] as McpToolCall[]),
    );
    expect(anyReFire).toBe(false);
  });

  it("'continue' lifts the gate back to exploration: an ordinary turn after 'continue' advances tick/turnCount again -- red in-worktree, green expected at merge", async () => {
    const h = createHarness();
    const world = h.session.engine.world;
    world.entities[world.playerId].resources.hp = 0;

    await h.play('look around'); // death turn
    await h.play('look around'); // gated, no-op today's-bug-notwithstanding
    const tickBeforeContinue = h.tick();
    const turnsBeforeContinue = h.turnCount();

    await h.play('continue');

    await h.play('look around'); // ordinary verb should work normally again
    expect(h.tick()).toBeGreaterThan(tickBeforeContinue);
    expect(h.turnCount()).toBeGreaterThan(turnsBeforeContinue);
  });

  it('slash commands still work while downed, and still consume no turn (mirrors the existing "slash commands do not consume turns" contract)', async () => {
    const h = createHarness();
    const world = h.session.engine.world;
    world.entities[world.playerId].resources.hp = 0;

    await h.play('look around'); // death turn
    const turnsAtDeath = h.turnCount();

    const output = await h.play('/status');
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
    expect(h.turnCount()).toBe(turnsAtDeath);
  });
});
