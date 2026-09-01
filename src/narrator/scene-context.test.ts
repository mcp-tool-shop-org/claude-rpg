import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { setPersistedMoveRecommendation } from '@ai-rpg-engine/modules';
import { buildSceneContext } from './scene-context.js';

describe('scene-context', () => {
  it('should build scene context for the starting zone', () => {
    const engine = createGame();
    const context = buildSceneContext(
      engine.world,
      [],
      'dark fantasy',
      [],
      undefined,
    );

    // Starter-fantasy integration test: assert zone name is populated, not a specific value
    expect(typeof context.narrationInput.zoneName).toBe('string');
    expect(context.narrationInput.zoneName.length).toBeGreaterThan(0);
    expect(context.narrationInput.isNewZone).toBe(true);
    expect(context.narrationInput.tone).toBe('dark fantasy');
    expect(context.narrationInput.exits.length).toBeGreaterThan(0);
  });

  it('should mark same zone as not new', () => {
    const engine = createGame();
    const context = buildSceneContext(
      engine.world,
      [],
      'dark fantasy',
      [],
      'chapel-entrance', // Same as current
    );

    expect(context.narrationInput.isNewZone).toBe(false);
  });

  it('should include visible entities in the zone', () => {
    const engine = createGame();
    // Pilgrim is in chapel-entrance
    const context = buildSceneContext(
      engine.world,
      [],
      'dark fantasy',
      [],
    );

    expect(context.narrationInput.visibleEntities.length).toBeGreaterThan(0);
  });

  it('should include player state', () => {
    const engine = createGame();
    const context = buildSceneContext(
      engine.world,
      [],
      'dark fantasy',
      [],
    );

    expect(context.narrationInput.playerState.hp).toBeGreaterThan(0);
  });

  it('should build context efficiently with multiple entities in zone (BR-004)', () => {
    const engine = createGame();
    // Run twice — once to warm up, once to time. The fix hoists getPerceptionLog
    // outside the entity loop so it runs O(1) instead of O(n) times.
    // We verify correctness: multiple entities should still appear.
    const context = buildSceneContext(
      engine.world,
      [],
      'dark fantasy',
      [],
    );

    // The important thing: it still works correctly with entities present
    // (the fix moved getPerceptionLog outside the .map loop)
    expect(context.narrationInput.visibleEntities).toBeDefined();
    expect(Array.isArray(context.narrationInput.visibleEntities)).toBe(true);
  });

  it('should handle events through observer presentation', () => {
    const engine = createGame();
    const events = engine.submitAction('move', { targetIds: ['chapel-nave'] });

    const context = buildSceneContext(
      engine.world,
      events,
      'dark fantasy',
      [],
      'chapel-entrance',
    );

    expect(context.perceivedEvents.length).toBeGreaterThan(0);
    expect(context.narrationInput.isNewZone).toBe(true);
  });
});

// F-2218267d + coordinator ruling (b) (wave-13
// RULING-persisted-namespaces.md), suite CONVERTED from the original
// persisted-read contract: getPersistedMoveRecommendation was removed —
// this app never populates world.modules['move-advisor'], and the hint
// arrives as a threaded param, computed live and pre-gated to
// 'pressured'/'crisis' at the game.ts producer. scene-context's contract
// is forward-when-present, omit-when-absent.
describe('scene-context situationHint wiring (F-2218267d, ruling b)', () => {
  it('forwards a threaded situationHint onto narrationInput', () => {
    const engine = createGame();

    const context = buildSceneContext(
      engine.world, [], 'dark fantasy', [], undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined,
      undefined,
      'A faction patrol is closing in on this district.',
    );

    expect(context.narrationInput.situationHint).toBe('A faction patrol is closing in on this district.');
  });

  it('leaves situationHint undefined when the param is omitted — even if the (never-populated) namespace holds a value', () => {
    const engine = createGame();
    setPersistedMoveRecommendation(engine.world, {
      top3: [],
      situationTag: 'crisis',
      situationHint: 'A faction patrol is closing in on this district.',
    });

    const context = buildSceneContext(engine.world, [], 'dark fantasy', []);

    expect(context.narrationInput.situationHint).toBeUndefined();
  });
});

// F-88c8848b: 3.10's engagement-core emits 'combat.encounter.cleared' when
// the last hostile in the player's zone is defeated (engagement-core.ts
// :296-312), payload {zoneId, outcome:'victory', finalDefeatEventId,
// participants:{survivors, finalOpponent:{id,name}}}. describeEvent() had
// no case for it and fell through to the bare default arm, rendering the
// context-free fragment 'cleared' into the narration prompt's 'Recent
// events:' section at exactly the moment (winning a fight) narration
// should read strongest. Added a payload-driven case matching the
// combat.entity.defeated house style, with a fallback for when the final
// opponent's name is unavailable.
describe('describeEvent combat.encounter.cleared (F-88c8848b)', () => {
  it('names the final opponent when the payload provides one', () => {
    const engine = createGame();
    const events = [
      {
        type: 'combat.encounter.cleared',
        tick: 1,
        payload: {
          zoneId: engine.world.locationId,
          outcome: 'victory',
          finalDefeatEventId: 'evt-defeat-1',
          participants: {
            survivors: [],
            finalOpponent: { id: 'goblin-1', name: 'Goblin Raider' },
          },
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Encounter cleared: Goblin Raider defeated',
    ]);
  });

  it('falls back to a generic message when the final opponent has no name', () => {
    const engine = createGame();
    const events = [
      {
        type: 'combat.encounter.cleared',
        tick: 1,
        payload: {
          zoneId: engine.world.locationId,
          outcome: 'victory',
          finalDefeatEventId: 'evt-defeat-2',
          participants: {
            survivors: [],
            finalOpponent: { id: 'goblin-2' },
          },
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual(['Encounter cleared']);
  });

  it('still falls through to the default arm for a genuinely unknown event type', () => {
    const engine = createGame();
    const events = [{ type: 'some.made.up.event', tick: 1, payload: {} }] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual(['event']);
  });

  // F-2218267d legacy note doesn't apply here; this block covers the
  // pre-3.11 shape (no `outcome` key at all) to prove the '?? victory'
  // default (design lock 1) keeps existing 3.10 fixtures/events valid.
  it('treats a payload with no outcome key as victory (legacy 3.10 shape)', () => {
    const engine = createGame();
    const events = [
      {
        type: 'combat.encounter.cleared',
        tick: 1,
        payload: {
          zoneId: engine.world.locationId,
          finalDefeatEventId: 'evt-defeat-legacy',
          participants: {
            survivors: [],
            finalOpponent: { id: 'goblin-legacy', name: 'Old Fixture Goblin' },
          },
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Encounter cleared: Old Fixture Goblin defeated',
    ]);
  });
});

// F-3e09c128 / F-461771d2: engine 3.11 (engagement-core.ts:192-197 victory
// vs :225-272 retreat) added `outcome: 'victory' | 'retreat'` to
// combat.encounter.cleared. Before this fix, describeEvent ignored
// `outcome` entirely and always rendered the victory wording — including
// for the last-hostile-flee retreat branch (engagement-core.ts:258-272),
// which DOES populate finalOpponent.name (the fleeing entity's own name),
// so a player watching the last hostile flee would see "<Name> defeated"
// for an entity that was never defeated. OBSERVED RED (before this fix):
// both cases below returned 'Encounter cleared: <Name> defeated' /
// 'Encounter cleared' instead of the retreat wording asserted here.
describe('describeEvent combat.encounter.cleared retreat outcome (F-3e09c128, F-461771d2)', () => {
  it('names the entity that fled, and never says "defeated" (last-hostile-flee branch)', () => {
    const engine = createGame();
    const events = [
      {
        type: 'combat.encounter.cleared',
        tick: 1,
        payload: {
          zoneId: engine.world.locationId,
          outcome: 'retreat',
          disengageEventId: 'evt-flee-1',
          participants: {
            survivors: [],
            finalOpponent: { id: 'goblin-3', name: 'Goblin Raider' },
          },
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Encounter ended: Goblin Raider withdrew',
    ]);
    expect(context.narrationInput.recentEvents[0]).not.toContain('defeated');
  });

  it('falls back to a generic non-"defeated" message when the player flees (no finalOpponent)', () => {
    const engine = createGame();
    const events = [
      {
        type: 'combat.encounter.cleared',
        tick: 1,
        payload: {
          zoneId: engine.world.locationId,
          outcome: 'retreat',
          disengageEventId: 'evt-flee-2',
          participants: {
            survivors: [],
          },
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Encounter ended without a kill',
    ]);
    expect(context.narrationInput.recentEvents[0]).not.toContain('defeated');
  });
});

// F-45574e0a: engine 3.11 (traversal-core.ts:242-252 zoneMoodFields) adds an
// optional `moodHint` district-mood aside to world.zone.entered's payload.
// OBSERVED RED (before this fix): describeEvent read only
// `p.zoneName ?? p.zoneId`, so the first case below returned bare
// 'Entered Old Chapel' with the moodHint silently dropped.
describe('describeEvent world.zone.entered moodHint (F-45574e0a)', () => {
  it('appends moodHint when the payload provides one', () => {
    const engine = createGame();
    const events = [
      {
        type: 'world.zone.entered',
        tick: 1,
        payload: {
          zoneId: 'old-chapel',
          zoneName: 'Old Chapel',
          previousZoneId: 'chapel-entrance',
          tags: [],
          moodHint: 'a tense hush hangs over the district',
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Entered Old Chapel — a tense hush hangs over the district',
    ]);
  });

  it('renders byte-identical to the pre-fix output when moodHint is absent (unmapped zone)', () => {
    const engine = createGame();
    const events = [
      {
        type: 'world.zone.entered',
        tick: 1,
        payload: {
          zoneId: 'old-chapel',
          zoneName: 'Old Chapel',
          previousZoneId: 'chapel-entrance',
          tags: [],
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual(['Entered Old Chapel']);
  });
});
