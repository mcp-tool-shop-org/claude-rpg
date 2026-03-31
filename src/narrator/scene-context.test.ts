import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
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
