import { describe, it, expect } from 'vitest';
import {
  simpleHashNum,
  sanitizeFilename,
  getTitleEvolutions,
  applyFalloutEffects,
  buildPressureInputs,
  propagateRumors,
  addRumor,
  getPlayerFactionAccess,
  getOpportunityContext,
  getArcContext,
  getEndgameContext,
  hasEverUsedLeverage,
  getCraftingContext,
} from './game-state.js';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { PartyState } from '@ai-rpg-engine/modules';

// --- Helpers ---

function makeMinimalProfile(overrides: Partial<CharacterProfile> = {}): CharacterProfile {
  return {
    id: 'test-profile',
    version: 2,
    build: { name: 'Tester', archetype: 'warrior', discipline: 'melee', traits: [], packId: 'test' } as any,
    stats: {},
    resources: {},
    tags: [],
    loadout: { equipped: {}, inventory: [] } as any,
    itemChronicle: {},
    progression: { xp: 0, level: 1, archetypeRank: 0, disciplineRank: 0, traitEvolutions: [] },
    injuries: [],
    milestones: [],
    reputation: [],
    packId: 'test',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    totalTurns: 10,
    custom: {},
    ...overrides,
  };
}

function makeEmptyPartyState(): PartyState {
  return { companions: [] } as any;
}

// --- Tests ---

describe('simpleHashNum', () => {
  it('returns a non-negative integer for any string', () => {
    expect(simpleHashNum('hello')).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(simpleHashNum('hello'))).toBe(true);
  });

  it('is deterministic', () => {
    expect(simpleHashNum('test-seed-42')).toBe(simpleHashNum('test-seed-42'));
  });

  it('produces different values for different strings', () => {
    expect(simpleHashNum('a')).not.toBe(simpleHashNum('b'));
  });

  it('handles empty string', () => {
    expect(simpleHashNum('')).toBe(0);
  });
});

describe('sanitizeFilename', () => {
  it('lowercases the result', () => {
    expect(sanitizeFilename('MyGame')).toBe('mygame');
  });

  it('replaces special chars with hyphens', () => {
    expect(sanitizeFilename('hello world!')).toBe('hello-world');
  });

  it('collapses multiple hyphens', () => {
    expect(sanitizeFilename('a---b')).toBe('a-b');
  });

  it('trims leading/trailing hyphens', () => {
    expect(sanitizeFilename('---test---')).toBe('test');
  });

  it('falls back to campaign for empty result', () => {
    expect(sanitizeFilename('!!!')).toBe('campaign');
  });

  it('preserves underscores and digits', () => {
    expect(sanitizeFilename('save_1')).toBe('save_1');
  });
});

describe('getTitleEvolutions', () => {
  it('returns at least one evolution', () => {
    const evos = getTitleEvolutions();
    expect(evos.length).toBeGreaterThan(0);
  });

  it('all evolutions have requiredTags and minCount', () => {
    for (const evo of getTitleEvolutions()) {
      expect(evo.requiredTags.length).toBeGreaterThan(0);
      expect(evo.minCount).toBeGreaterThan(0);
    }
  });

  it('each evolution has either prefix or suffix', () => {
    for (const evo of getTitleEvolutions()) {
      expect(evo.prefix || evo.suffix).toBeTruthy();
    }
  });
});

describe('applyFalloutEffects', () => {
  it('applies reputation effect to profile', () => {
    const profile = makeMinimalProfile({ reputation: [{ factionId: 'guild', value: 50 }] });
    const fallout = {
      resolution: { pressureId: 'p1', pressureKind: 'test', resolutionType: 'resolved-by-player' as const, resolvedBy: 'player', resolutionVisibility: 'known' as const },
      summary: 'Test fallout',
      effects: [{ type: 'reputation' as const, factionId: 'guild', delta: 10 }],
    };
    const result = applyFalloutEffects(
      fallout, profile, { entities: {}, factions: {}, locationId: 'z1', playerId: 'p1', zones: {} } as any,
      [], [], makeEmptyPartyState(), new Map(), 'fantasy', 1,
    );
    const guildRep = result.profile!.reputation.find((r) => r.factionId === 'guild');
    expect(guildRep!.value).toBe(60);
  });

  it('spawns a chained pressure when under max', () => {
    const profile = makeMinimalProfile();
    const fallout = {
      resolution: { pressureId: 'p1', pressureKind: 'test', resolutionType: 'resolved-by-player' as const, resolvedBy: 'player', resolutionVisibility: 'known' as const },
      summary: 'Chain test',
      effects: [{
        type: 'spawn-pressure' as const,
        kind: 'security' as any,
        sourceFactionId: 'guild',
        description: 'Chained pressure',
        urgency: 0.5,
        tags: ['chain'],
      }],
    };
    const result = applyFalloutEffects(
      fallout, profile, { entities: {}, factions: {}, locationId: 'z1', playerId: 'p1', zones: {} } as any,
      [], [], makeEmptyPartyState(), new Map(), 'fantasy', 1,
    );
    expect(result.activePressures.length).toBe(1);
  });

  it('does not spawn pressure when at max capacity', () => {
    const profile = makeMinimalProfile();
    const existing = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}` })) as any[];
    const fallout = {
      resolution: { pressureId: 'p-src', pressureKind: 'test', resolutionType: 'resolved-by-player' as const, resolvedBy: 'player', resolutionVisibility: 'known' as const },
      summary: 'Capped',
      effects: [{
        type: 'spawn-pressure' as const,
        kind: 'security' as any,
        sourceFactionId: 'guild',
        description: 'Should not spawn',
        urgency: 0.5,
        tags: [],
      }],
    };
    const result = applyFalloutEffects(
      fallout, profile, { entities: {}, factions: {}, locationId: 'z1', playerId: 'p1', zones: {} } as any,
      [], existing, makeEmptyPartyState(), new Map(), 'fantasy', 1,
    );
    expect(result.activePressures.length).toBe(3);
  });

  it('returns null profile when input profile is null', () => {
    const fallout = {
      resolution: { pressureId: 'p1', pressureKind: 'test', resolutionType: 'failed' as const, resolvedBy: 'world', resolutionVisibility: 'known' as const },
      summary: 'Null profile',
      effects: [{ type: 'reputation' as const, factionId: 'guild', delta: 5 }],
    };
    const result = applyFalloutEffects(
      fallout, null, { entities: {}, factions: {}, locationId: 'z1', playerId: 'p1', zones: {} } as any,
      [], [], makeEmptyPartyState(), new Map(), 'fantasy', 1,
    );
    expect(result.profile).toBeNull();
  });
});

describe('buildPressureInputs', () => {
  it('builds valid PressureInputs from minimal state', () => {
    const world = {
      entities: {},
      factions: { guild: { id: 'guild' } },
      locationId: 'zone-1',
      playerId: 'p1',
      zones: {},
      modules: {},
    } as any;
    const profile = makeMinimalProfile();
    const inputs = buildPressureInputs(world, profile, [], [], 'fantasy', 5, new Map());
    expect(inputs.genre).toBe('fantasy');
    expect(inputs.currentTick).toBe(5);
    expect(inputs.reputation).toHaveLength(1);
    expect(inputs.reputation[0].factionId).toBe('guild');
  });

  it('handles null profile gracefully', () => {
    const world = {
      entities: {}, factions: {}, locationId: 'z1', playerId: 'p1', zones: {},
      modules: {},
    } as any;
    const inputs = buildPressureInputs(world, null, [], [], 'cyberpunk', 10, new Map());
    expect(inputs.playerLevel).toBe(1);
    expect(inputs.totalTurns).toBe(0);
  });
});

describe('propagateRumors', () => {
  it('returns original array unchanged when only one faction', () => {
    const world = { entities: {}, factions: { only: {} }, locationId: 'z1', playerId: 'p1', zones: {} } as any;
    const rumors = [{ id: 'r1', confidence: 0.8, spreadTo: ['only'] } as any];
    const result = propagateRumors(rumors, world, makeEmptyPartyState());
    expect(result).toBe(rumors);
  });

  it('skips low-confidence rumors', () => {
    const world = { entities: {}, factions: { a: {}, b: {} }, locationId: 'z1', playerId: 'p1', zones: {}, modules: {} } as any;
    const rumors = [{ id: 'r1', confidence: 0.1, spreadTo: ['a'] } as any];
    const result = propagateRumors(rumors, world, makeEmptyPartyState());
    // Low confidence => no propagation => spreadTo unchanged
    expect(result[0].spreadTo).toEqual(['a']);
  });
});

describe('addRumor', () => {
  it('appends a rumor to the list', () => {
    const rumor = { id: 'r1', valence: 'neutral', claim: 'test' } as any;
    const result = addRumor(rumor, [], makeEmptyPartyState(), 1);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
  });

  it('does not mutate the original array', () => {
    const original: any[] = [];
    const rumor = { id: 'r1', valence: 'neutral' } as any;
    addRumor(rumor, original, makeEmptyPartyState(), 1);
    expect(original).toHaveLength(0);
  });
});

describe('getPlayerFactionAccess', () => {
  it('returns undefined with no profile', () => {
    const world = { factions: { guild: {} } } as any;
    expect(getPlayerFactionAccess(world, null)).toBeUndefined();
  });

  it('returns undefined when all reps below threshold', () => {
    const profile = makeMinimalProfile({ reputation: [{ factionId: 'guild', value: 10 }] });
    const world = { factions: { guild: {} } } as any;
    expect(getPlayerFactionAccess(world, profile)).toBeUndefined();
  });

  it('returns faction with highest rep when above threshold', () => {
    const profile = makeMinimalProfile({
      reputation: [
        { factionId: 'guild', value: 25 },
        { factionId: 'thieves', value: 15 },
      ],
    });
    const world = { factions: { guild: {}, thieves: {} } } as any;
    expect(getPlayerFactionAccess(world, profile)).toBe('guild');
  });
});

describe('getOpportunityContext', () => {
  it('returns undefined with no accepted opportunities', () => {
    expect(getOpportunityContext([])).toBeUndefined();
  });

  it('returns context string for accepted opportunity', () => {
    const opp = { id: 'o1', kind: 'contract', title: 'Deliver Package', status: 'accepted', turnsRemaining: 3 } as any;
    const ctx = getOpportunityContext([opp]);
    expect(ctx).toContain('contract');
    expect(ctx).toContain('Deliver Package');
    expect(ctx).toContain('3 turns left');
  });
});

describe('hasEverUsedLeverage', () => {
  it('returns false for null profile', () => {
    expect(hasEverUsedLeverage(null)).toBe(false);
  });

  it('returns false when no leverage actions used', () => {
    const profile = makeMinimalProfile();
    expect(hasEverUsedLeverage(profile)).toBe(false);
  });

  it('returns true when a leverage action exists', () => {
    const profile = makeMinimalProfile({ custom: { 'stats.action.bribe': 1 } });
    expect(hasEverUsedLeverage(profile)).toBe(true);
  });
});

describe('getCraftingContext', () => {
  it('returns undefined with null profile', () => {
    expect(getCraftingContext(null, null)).toBeUndefined();
  });

  it('returns undefined when no notable gear is equipped', () => {
    const profile = makeMinimalProfile();
    const catalog = { items: [] } as any;
    expect(getCraftingContext(profile, catalog)).toBeUndefined();
  });
});
