import { describe, it, expect } from 'vitest';
import { generateSuggestions } from './contextual-suggestions.js';

/** Minimal defaults for generateSuggestions options. */
function defaults(overrides: Record<string, unknown> = {}) {
  return {
    turnCount: 5,
    leverageState: { political: 0, economic: 0, military: 0, social: 0 } as any,
    activePressures: [] as any[],
    lastVerb: 'move',
    lastLeverageResolution: null,
    recommendation: { situationTag: 'stable', top3: [] } as any,
    hasUsedLeverage: false,
    recentMilestone: false,
    ...overrides,
  };
}

describe('generateSuggestions', () => {
  it('returns empty array when no triggers fire', () => {
    const result = generateSuggestions(defaults({
      turnCount: 15,
      hasUsedLeverage: true,
    }));
    expect(result).toEqual([]);
  });

  it('returns crisis-pressure suggestion when situationTag is crisis', () => {
    const result = generateSuggestions(defaults({
      turnCount: 1,
      recommendation: {
        situationTag: 'crisis',
        top3: [{ reason: 'Run away!', urgency: 0.9 }],
      },
    }));
    const crisis = result.find((s) => s.trigger === 'crisis-pressure');
    expect(crisis).toBeTruthy();
    expect(crisis!.text).toBe('Run away!');
  });

  it('returns early-intro hint for turns 1-3 when leverage unused', () => {
    const result = generateSuggestions(defaults({ turnCount: 2, hasUsedLeverage: false }));
    const intro = result.find((s) => s.trigger === 'early-intro');
    expect(intro).toBeTruthy();
  });

  it('does not return early-intro after turn 3', () => {
    const result = generateSuggestions(defaults({ turnCount: 4, hasUsedLeverage: false }));
    const intro = result.find((s) => s.trigger === 'early-intro');
    expect(intro).toBeUndefined();
  });

  it('caps suggestions at 2', () => {
    // Fire multiple triggers: early-intro + milestone-cash + crafting-hint
    const result = generateSuggestions(defaults({
      turnCount: 2,
      hasUsedLeverage: false,
      recentMilestone: true,
      hasCraftableMaterials: true,
    }));
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('returns action-failed when leverage resolution failed', () => {
    const result = generateSuggestions(defaults({
      turnCount: 5,
      lastLeverageResolution: { success: false, failReason: 'Not enough influence' },
    }));
    const failed = result.find((s) => s.trigger === 'action-failed');
    expect(failed).toBeTruthy();
    expect(failed!.text).toBe('Not enough influence');
  });

  it('filters suggestions after turn 10 to notable triggers only', () => {
    // crafting-hint should survive the post-turn-10 filter
    const result = generateSuggestions(defaults({
      turnCount: 15,
      hasUsedLeverage: true,
      hasCraftableMaterials: true,
      hasCraftingShortage: false,
    }));
    const craftHint = result.find((s) => s.trigger === 'crafting-hint');
    expect(craftHint).toBeTruthy();
  });

  it('filters out early-intro and leverage-discovery after turn 10', () => {
    // These triggers shouldn't fire after turn 10 anyway (guards prevent it),
    // but verify the filter would remove them if they did
    const result = generateSuggestions(defaults({
      turnCount: 15,
      hasUsedLeverage: false,
    }));
    const intro = result.find((s) => s.trigger === 'early-intro');
    const discovery = result.find((s) => s.trigger === 'leverage-discovery');
    expect(intro).toBeUndefined();
    expect(discovery).toBeUndefined();
  });

  it('returns endgame-detected suggestion when endgame is detected', () => {
    const result = generateSuggestions(defaults({
      turnCount: 20,
      hasUsedLeverage: true,
      hasEndgameDetected: true,
      endgameTriggerCount: 2,
    }));
    const endgame = result.find((s) => s.trigger === 'endgame-detected');
    expect(endgame).toBeTruthy();
    expect(endgame!.text).toContain('Multiple endgame');
  });

  it('returns supply-crisis suggestion when supplies are critical', () => {
    const result = generateSuggestions(defaults({
      turnCount: 8,
      hasUsedLeverage: true,
      hasSupplyCrisis: true,
    }));
    const crisis = result.find((s) => s.trigger === 'supply-crisis');
    expect(crisis).toBeTruthy();
  });
});
