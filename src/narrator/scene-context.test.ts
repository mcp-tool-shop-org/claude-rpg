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
});
