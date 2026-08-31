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

  // F-ecf4e179: the post-turn-10 filter used to be a hardcoded allowlist of
  // trigger literals kept in sync by hand with the rules above -- a future
  // rule whose trigger a contributor forgot to add would silently stop
  // firing past turn 10 with no test failure. Removed the allowlist (see
  // this file's own doc comment on why it was always redundant) rather than
  // replacing it with a differently-shaped list that could drift the same
  // way. These cases exercise every remaining trigger this function can
  // produce against the real turnCount > 10 path -- each one calls
  // generateSuggestions() directly rather than comparing two hardcoded
  // lists against each other, so a real regression (the filter coming back
  // and silently dropping one of these) fails here, not just in a
  // reconciliation check.
  describe('every non-early trigger survives past turn 10 (F-ecf4e179)', () => {
    it('pressure-hint', () => {
      const result = generateSuggestions(defaults({
        turnCount: 15,
        hasUsedLeverage: true,
        recommendation: { situationTag: 'stable', top3: [{ reason: 'Address the threat', urgency: 0.5 }] },
        activePressures: [{ urgency: 0.7 }] as any[],
      }));
      expect(result.find((s) => s.trigger === 'pressure-hint')).toBeTruthy();
    });

    it('supply-crisis', () => {
      const result = generateSuggestions(defaults({
        turnCount: 15,
        hasUsedLeverage: true,
        hasSupplyCrisis: true,
      }));
      expect(result.find((s) => s.trigger === 'supply-crisis')).toBeTruthy();
    });

    it('black-market', () => {
      const result = generateSuggestions(defaults({
        turnCount: 15,
        hasUsedLeverage: true,
        hasBlackMarket: true,
      }));
      expect(result.find((s) => s.trigger === 'black-market')).toBeTruthy();
    });

    it('crafting-shortage', () => {
      const result = generateSuggestions(defaults({
        turnCount: 15,
        hasUsedLeverage: true,
        hasCraftingShortage: true,
        hasCraftableMaterials: true,
      }));
      expect(result.find((s) => s.trigger === 'crafting-shortage')).toBeTruthy();
    });

    it('new-opportunity', () => {
      const result = generateSuggestions(defaults({
        turnCount: 15,
        hasUsedLeverage: true,
        hasNewOpportunity: true,
      }));
      expect(result.find((s) => s.trigger === 'new-opportunity')).toBeTruthy();
    });

    it('expiring-opportunity', () => {
      const result = generateSuggestions(defaults({
        turnCount: 15,
        hasUsedLeverage: true,
        hasExpiringOpportunity: true,
      }));
      expect(result.find((s) => s.trigger === 'expiring-opportunity')).toBeTruthy();
    });

    it('stale-opportunity', () => {
      const result = generateSuggestions(defaults({
        turnCount: 15,
        hasUsedLeverage: true,
        hasStaleAcceptedOpportunity: true,
      }));
      expect(result.find((s) => s.trigger === 'stale-opportunity')).toBeTruthy();
    });
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

  // F-5a22c206: crisis-pressure, action-failed, and milestone-cash are all
  // pushed unconditionally — none is gated behind the `suggestions.length < 2`
  // check every rule from #5 onward uses, and none is gated on turnCount
  // either. All three are also on the post-turn-10 filter's whitelist. When
  // all three co-occur on the same turn past turn 10, the filter used to
  // return them unsliced — a 3rd hint line beyond the documented "max 2 per
  // turn" contract enforced everywhere else (including the <=10 path).
  it('still caps at 2 after turn 10 when 3 unconditional triggers co-occur (regression)', () => {
    const result = generateSuggestions(defaults({
      turnCount: 15,
      hasUsedLeverage: false,
      recentMilestone: true,
      recommendation: {
        situationTag: 'crisis',
        top3: [{ reason: 'Run away!', urgency: 0.9 }],
      },
      lastLeverageResolution: { success: false, failReason: 'Not enough influence' },
    }));
    expect(result.length).toBeLessThanOrEqual(2);
  });
});

/**
 * F-d6f7107e: this nudge used to tell players to 'type "craft" or "salvage"'
 * even though F-4fc952ae's coordinator-locked verb allowlist (turn-loop.ts)
 * suppresses 'salvage' from the interpreter's visible surface, and
 * renderPlayHelp's CRAFTING section (help-system.ts) only ever documented
 * 'craft' -- a real "game nudges a verb its own help screen never
 * documents, and the interpreter won't even accept" gap, with no regression
 * coverage guarding the exact string before this test.
 */
describe('crafting-hint text does not suggest a suppressed verb (F-d6f7107e)', () => {
  it('suggests "craft" only, not "salvage" (F-4fc952ae suppresses salvage from the interpreter surface)', () => {
    const result = generateSuggestions(defaults({
      turnCount: 5,
      hasUsedLeverage: true,
      hasCraftableMaterials: true,
      hasCraftingShortage: false,
    }));
    const craftHint = result.find((s) => s.trigger === 'crafting-hint');
    expect(craftHint).toBeTruthy();
    expect(craftHint!.text).toBe('You have materials — type "craft" to use them');
    expect(craftHint!.text).not.toContain('salvage');
  });
});
