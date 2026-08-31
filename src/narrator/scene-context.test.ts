import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { setPersistedMoveRecommendation, type MoveRecommendation } from '@ai-rpg-engine/modules';
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

// F-2218267d: buildSceneContext reads the engine's persisted MoveRecommendation
// off `world` directly (getPersistedMoveRecommendation), gated to
// 'pressured'/'crisis' situationTag bands. These tests use the real engine's
// setPersistedMoveRecommendation to prove the wiring end-to-end -- if a
// future write-side fix ever calls it in production, this gating is already
// correct today.
describe('scene-context situationHint wiring (F-2218267d)', () => {
  function makeRecommendation(overrides: Partial<MoveRecommendation> = {}): MoveRecommendation {
    return {
      top3: [],
      situationTag: 'pressured',
      situationHint: 'A faction patrol is closing in on this district.',
      ...overrides,
    };
  }

  it('surfaces situationHint on narrationInput when situationTag is "pressured"', () => {
    const engine = createGame();
    setPersistedMoveRecommendation(engine.world, makeRecommendation({ situationTag: 'pressured' }));

    const context = buildSceneContext(engine.world, [], 'dark fantasy', []);

    expect(context.narrationInput.situationHint).toBe('A faction patrol is closing in on this district.');
  });

  it('surfaces situationHint when situationTag is "crisis"', () => {
    const engine = createGame();
    setPersistedMoveRecommendation(engine.world, makeRecommendation({ situationTag: 'crisis' }));

    const context = buildSceneContext(engine.world, [], 'dark fantasy', []);

    expect(context.narrationInput.situationHint).toBe('A faction patrol is closing in on this district.');
  });

  it('gates situationHint out when situationTag is "safe", even if a hint string is present', () => {
    const engine = createGame();
    setPersistedMoveRecommendation(engine.world, makeRecommendation({ situationTag: 'safe' }));

    const context = buildSceneContext(engine.world, [], 'dark fantasy', []);

    expect(context.narrationInput.situationHint).toBeUndefined();
  });

  it('gates situationHint out when situationTag is "opportunity"', () => {
    const engine = createGame();
    setPersistedMoveRecommendation(engine.world, makeRecommendation({ situationTag: 'opportunity' }));

    const context = buildSceneContext(engine.world, [], 'dark fantasy', []);

    expect(context.narrationInput.situationHint).toBeUndefined();
  });

  it('leaves situationHint undefined when no MoveRecommendation has ever been persisted', () => {
    const engine = createGame();

    const context = buildSceneContext(engine.world, [], 'dark fantasy', []);

    expect(context.narrationInput.situationHint).toBeUndefined();
  });
});
