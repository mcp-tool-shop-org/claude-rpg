import { describe, it, expect } from 'vitest';
import { PresentationStateMachine } from './presentation-state.js';

describe('PresentationStateMachine', () => {
  it('should start in exploration state', () => {
    const sm = new PresentationStateMachine();
    expect(sm.current).toBe('exploration');
  });

  it('should transition between states', () => {
    const sm = new PresentationStateMachine();
    const t = sm.transition('combat', 'attack');
    expect(t.from).toBe('exploration');
    expect(t.to).toBe('combat');
    expect(sm.current).toBe('combat');
  });

  it('should return only from/to/trigger from a transition (F-81abb66a)', () => {
    // Cue computation (ambientShift/musicShift) and the onTransition listener mechanism
    // were removed as dead code: nothing in this domain ever wired onTransition up, and
    // the hook system (hooks.ts) is the actual, sole source of audio cues. Locks that
    // decision so the two cue paths can't silently reappear and double-fire.
    const sm = new PresentationStateMachine();
    const t = sm.transition('combat', 'attack');
    expect(t).toEqual({ from: 'exploration', to: 'combat', trigger: 'attack' });
    expect('onTransition' in sm).toBe(false);
  });

  it('should infer combat from combat events', () => {
    const sm = new PresentationStateMachine();
    const events = [{ type: 'combat.contact.hit', tick: 1, payload: {} }] as any;
    const state = sm.inferFromEvents(events);
    expect(state).toBe('combat');
  });

  it('should infer dialogue from speak verb', () => {
    const sm = new PresentationStateMachine();
    const state = sm.inferFromEvents([], 'speak');
    expect(state).toBe('dialogue');
  });

  it('should infer exploration from zone change', () => {
    const sm = new PresentationStateMachine();
    const events = [{ type: 'world.zone.entered', tick: 1, payload: {} }] as any;
    const state = sm.inferFromEvents(events);
    expect(state).toBe('exploration');
  });

  it('should countdown aftermath turns then return to exploration (T-010)', () => {
    const sm = new PresentationStateMachine();

    // Trigger aftermath via combat defeat event
    const defeatEvents = [
      { type: 'combat.entity.defeated', tick: 1, payload: {} },
    ] as any;
    const state1 = sm.inferFromEvents(defeatEvents, undefined, 1);
    expect(state1).toBe('aftermath');

    // First call with no events: aftermathTurns was 2, decrements to 1 → still aftermath
    const state2 = sm.inferFromEvents([], undefined, 2);
    expect(state2).toBe('aftermath');

    // Second call with no events: aftermathTurns was 1, decrements to 0 → exploration
    const state3 = sm.inferFromEvents([], undefined, 3);
    expect(state3).toBe('exploration');

    // Third call: aftermath fully expired, stays exploration
    const state4 = sm.inferFromEvents([], undefined, 4);
    expect(state4).toBe('exploration');
  });

  it('should not double-decrement aftermathTurns when called twice with the same tick', () => {
    const sm = new PresentationStateMachine();

    // Trigger aftermath via combat defeat (sets aftermathTurns = 2)
    const defeatEvents = [
      { type: 'combat.entity.defeated', tick: 1, payload: {} },
    ] as any;
    sm.inferFromEvents(defeatEvents, undefined, 1);

    // Call twice with tick=2 — should only decrement once
    const state2a = sm.inferFromEvents([], undefined, 2);
    expect(state2a).toBe('aftermath'); // 2 → 1
    const state2b = sm.inferFromEvents([], undefined, 2);
    expect(state2b).toBe('aftermath'); // still 1, no double-decrement

    // tick=3 decrements to 0 → exploration
    const state3 = sm.inferFromEvents([], undefined, 3);
    expect(state3).toBe('exploration');
  });

  it('should infer exploration from zone change even when starting in combat (T-011)', () => {
    const sm = new PresentationStateMachine();

    // First transition to combat
    sm.transition('combat', 'attack');
    expect(sm.current).toBe('combat');

    // Now infer from zone change events — should return exploration
    const zoneEvents = [
      { type: 'world.zone.entered', tick: 2, payload: {} },
    ] as any;
    const state = sm.inferFromEvents(zoneEvents);
    expect(state).toBe('exploration');
  });

  it('should infer menu from a player-entity defeat but not a non-player defeat (F-277b5eca)', () => {
    // Non-player defeat (e.g. a goblin dying) must fall through to the general
    // combat/aftermath branch — it must NOT be mistaken for player death.
    const sm = new PresentationStateMachine();
    const nonPlayerDefeat = [
      { type: 'combat.entity.defeated', tick: 1, payload: { entityId: 'goblin-1' } },
    ] as any;
    expect(sm.inferFromEvents(nonPlayerDefeat, undefined, 1, 'player')).toBe('aftermath');

    // Player defeat — entityId matches the real playerId ('player', per
    // world-gen.ts's `engine.store.state.playerId = 'player'`), never the old
    // '__player__' sentinel that is never assigned anywhere in production — must
    // return 'menu'.
    const sm2 = new PresentationStateMachine();
    const playerDefeat = [
      { type: 'combat.entity.defeated', tick: 1, payload: { entityId: 'player' } },
    ] as any;
    expect(sm2.inferFromEvents(playerDefeat, undefined, 1, 'player')).toBe('menu');
  });

  it('should not infer menu from a defeat event when no playerId is supplied', () => {
    // Callers that don't pass playerId (e.g. this file's other unit tests, which only
    // exercise combat/aftermath) must not accidentally match a defeat event whose
    // payload also omits entityId — hasDeath must require an actual playerId.
    const sm = new PresentationStateMachine();
    const defeatEvents = [
      { type: 'combat.entity.defeated', tick: 1, payload: {} },
    ] as any;
    expect(sm.inferFromEvents(defeatEvents, undefined, 1)).toBe('aftermath');
  });

  it('infers menu from hp reaching zero even with no defeat event, when world is supplied (F-e57d6a60)', () => {
    // Mirrors world-gen.ts's environment-hazard effect: hp mutated directly to 0,
    // with only a world.zone.entered event (no combat.entity.defeated at all).
    const sm = new PresentationStateMachine();
    const world = {
      entities: { player: { resources: { hp: 0 } } },
    } as any;
    const events = [{ type: 'world.zone.entered', tick: 1, payload: {} }] as any;
    expect(sm.inferFromEvents(events, undefined, 1, 'player', world)).toBe('menu');
  });

  it('does not infer menu from hp when no world is supplied, even if hp would be zero elsewhere', () => {
    // world is optional — omitting it must fall back to the pure event-based check
    // rather than throwing or silently matching.
    const sm = new PresentationStateMachine();
    const events = [{ type: 'world.zone.entered', tick: 1, payload: {} }] as any;
    expect(sm.inferFromEvents(events, undefined, 1, 'player')).toBe('exploration');
  });

  it('resets aftermathTurns and lastDecrementTick when a player death returns menu (F-eb2f7496)', () => {
    const sm = new PresentationStateMachine();

    // An earlier kill starts an aftermath countdown (aftermathTurns = 2).
    const npcDefeat = [
      { type: 'combat.entity.defeated', tick: 1, payload: { entityId: 'goblin-1' } },
    ] as any;
    expect(sm.inferFromEvents(npcDefeat, undefined, 1, 'player')).toBe('aftermath');

    // Before the countdown finishes, the player dies -> 'menu'. Without a reset,
    // aftermathTurns stays at 2 and lastDecrementTick stays wedged at its prior value.
    const playerDefeat = [
      { type: 'combat.entity.defeated', tick: 2, payload: { entityId: 'player' } },
    ] as any;
    expect(sm.inferFromEvents(playerDefeat, undefined, 2, 'player')).toBe('menu');

    // If gameplay continues through this same instance afterward, a later turn with
    // no combat/dialogue events must fall through to plain 'exploration', not resume
    // a stale mid-countdown 'aftermath' left over from the kill that predated the
    // player's own death.
    expect(sm.inferFromEvents([], undefined, 3, 'player')).toBe('exploration');
  });

  it('infers aftermath (not stuck in combat) from a retreat-outcome combat.encounter.cleared with no combat.entity.defeated (F-99563c70)', () => {
    // 3.11's engagement-core.ts emits combat.encounter.cleared with
    // payload.outcome: 'retreat' on a player-flee or last-hostile-flee, with NO
    // accompanying combat.entity.defeated (unlike a 3.10-shaped victory clear, which
    // always co-occurs with one). Before this fix, hasCombat matched (the event type
    // starts with 'combat.') but hasDefeat did not, so inferFromEvents returned the
    // generic 'combat' branch forever — the presentation state never left combat on
    // a successful escape.
    const sm = new PresentationStateMachine();
    const retreatEvents = [
      { type: 'combat.encounter.cleared', tick: 1, payload: { outcome: 'retreat' } },
    ] as any;
    expect(sm.inferFromEvents(retreatEvents, undefined, 1)).toBe('aftermath');
  });

  it('infers aftermath from a victory-outcome combat.encounter.cleared even without a co-occurring combat.entity.defeated event', () => {
    // Mirrors the retreat case above for the 'victory' outcome value, so both of
    // 3.11's two outcome strings resolve the same way — 'aftermath' is the ONLY
    // reachable branch off a cleared encounter (design lock: do not invent a new
    // state for a retreat vs. a victory).
    const sm = new PresentationStateMachine();
    const victoryEvents = [
      { type: 'combat.encounter.cleared', tick: 1, payload: { outcome: 'victory' } },
    ] as any;
    expect(sm.inferFromEvents(victoryEvents, undefined, 1)).toBe('aftermath');
  });

  // F-62f5a5e5 (ambush timing): the engine's encounter-spawn zone-entry ambush
  // (world-tick.ts step 0, encounter-spawn.ts:668) emits only 'encounter.spawned',
  // never a 'combat.*'-prefixed event -- so before this fix, hasCombat's bare
  // `type.startsWith('combat.')` scan never matched an ambush round at all, and
  // the presentation state stayed 'exploration' the same turn hostiles spawned
  // into the player's zone. immersion-runtime.ts's justEnteredCombat gate (and
  // therefore combatStartHook's warning SFX + music-intensify cue) landed one
  // turn late -- on the player's first attack next turn -- instead of riding the
  // ambush's own narration.
  it('infers combat from an encounter.spawned event when the spawned hostiles are alive in the current zone (F-62f5a5e5)', () => {
    const sm = new PresentationStateMachine();
    const world = {
      locationId: 'zone-1',
      entities: {
        player: { resources: { hp: 20 }, zoneId: 'zone-1', tags: [] },
        'enc-1': { resources: { hp: 10 }, zoneId: 'zone-1', tags: ['hostile'] },
      },
    } as any;
    const events = [
      { type: 'encounter.spawned', tick: 1, payload: { spawnedEntityIds: ['enc-1'] } },
    ] as any;
    expect(sm.inferFromEvents(events, undefined, 1, 'player', world)).toBe('combat');
  });

  it('does not infer combat from an encounter.spawned event when no world is supplied (event-only fallback)', () => {
    // world is optional everywhere else in this method; an encounter.spawned event
    // with no world handle to confirm living hostiles must fall back to the plain
    // event-based combat check, same posture as every other world-gated branch here.
    const sm = new PresentationStateMachine();
    const events = [
      { type: 'encounter.spawned', tick: 1, payload: { spawnedEntityIds: ['enc-1'] } },
    ] as any;
    expect(sm.inferFromEvents(events, undefined, 1, 'player')).toBe('combat');
  });

  it('does not infer combat from an encounter.spawned event whose spawned hostiles are not actually alive in the current zone', () => {
    // Defensive symmetry with the 'combat' end side's own hasLivingHostiles guard:
    // a bare event-type match alone is not trusted when a world handle is available
    // to confirm it against live state.
    const sm = new PresentationStateMachine();
    const world = {
      locationId: 'zone-1',
      entities: {
        player: { resources: { hp: 20 }, zoneId: 'zone-1', tags: [] },
      },
    } as any;
    const events = [
      { type: 'encounter.spawned', tick: 1, payload: { spawnedEntityIds: [] } },
    ] as any;
    expect(sm.inferFromEvents(events, undefined, 1, 'player', world)).toBe('exploration');
  });
});
