import { describe, it, expect } from 'vitest';
import { extractProfileHints } from '../turn-loop.js';
import type { ResolvedEvent } from '@ai-rpg-engine/core';
import {
  simpleHashNum,
  sanitizeFilename,
  getTitleEvolutions,
  applyFalloutEffects,
  readFactionCognitionScalars,
  propagateRumors,
  addRumor,
  capPlayerRumors,
  MAX_PLAYER_RUMORS,
  getPlayerFactionAccess,
  getOpportunityContext,
  getArcContext,
  getEndgameContext,
  hasEverUsedLeverage,
  getCraftingContext,
  isValidSupplyCategory,
  applyEconomyShiftToMap,
  getPresenceData,
  getStatusDataFromProfile,
} from './game-state.js';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import { getActivePressures, getFactionCognition, type PartyState } from '@ai-rpg-engine/modules';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';

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

// WO-A2-3/4 (slice A2 §4, write-through): applyFalloutEffects no longer
// takes/returns activePressures or districtEconomies (see its own doc
// comment, game-state.ts) — a chained pressure and an economy shift now
// land straight on world truth (world.modules), so every mock world below
// carries `modules: {}` (the accessors' own non-attaching-read contract
// requires at least an empty modules object; see world-tick.js's
// getWorldTickState/peekState) and pressure-spawn assertions read
// getActivePressures(world) instead of a returned array.
describe('applyFalloutEffects', () => {
  // WO-A2T-2 (slice A2 §9, R1, run swarm-1788288802-f5a0 wave 5): RE-PINNED.
  // Pre-wave, this effect wrote straight onto `profile.reputation` via
  // adjustReputation, so `result.profile!.reputation` showed the composed
  // 60 (50 + 10) immediately. From this wave on, reputation deltas ADD to
  // `world.globals['reputation_<factionId>']` (addFactionReputationGlobal,
  // reputation-view.ts) — profile.reputation is now a VIEW the CALLER
  // (GameSession.applyFalloutEffects, game.ts) recomposes via
  // refreshWorldViews() right after this function returns, which this
  // isolated pure-function test does not invoke. The correct assertion at
  // this layer is the accrued global this function actually wrote; the
  // composed-into-one-number behavior is proven at the GameSession layer by
  // game.test.ts's own Slice A2-truth describe block.
  it('adds the reputation delta to world.globals[reputation_<factionId>] (the accrued ledger, not the profile directly)', () => {
    const profile = makeMinimalProfile({ reputation: [{ factionId: 'guild', value: 50 }] });
    const fallout = {
      resolution: { pressureId: 'p1', pressureKind: 'test' as any, resolutionType: 'resolved-by-player' as const, resolvedBy: 'player', resolutionVisibility: 'known' as const, resolvedAtTick: 1 },
      summary: 'Test fallout',
      effects: [{ type: 'reputation' as const, factionId: 'guild', delta: 10 }],
    };
    const world = { entities: {}, factions: {}, locationId: 'z1', playerId: 'p1', zones: {}, modules: {}, globals: {} } as any;
    const result = applyFalloutEffects(fallout, profile, world, [], makeEmptyPartyState(), 'fantasy', 1);
    // The profile object itself is passed through unchanged (identity, not
    // a stale copy) — this function no longer mutates .reputation at all.
    expect(result.profile).toBe(profile);
    expect(world.globals['reputation_guild']).toBe(10);
  });

  it('spawns a chained pressure when under max', () => {
    const profile = makeMinimalProfile();
    const fallout = {
      resolution: { pressureId: 'p1', pressureKind: 'test' as any, resolutionType: 'resolved-by-player' as const, resolvedBy: 'player', resolutionVisibility: 'known' as const, resolvedAtTick: 1 },
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
    const world = { entities: {}, factions: {}, locationId: 'z1', playerId: 'p1', zones: {}, modules: {}, eventLog: [], globals: {} } as any; // stitch: fresh world-tick state reads eventLog
    applyFalloutEffects(fallout, profile, world, [], makeEmptyPartyState(), 'fantasy', 1);
    expect(getActivePressures(world).length).toBe(1);
  });

  it('does not spawn pressure when at max capacity', () => {
    const profile = makeMinimalProfile();
    const existing = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, kind: `other-${i}` })) as any[];
    const world = {
      entities: {}, factions: {}, locationId: 'z1', playerId: 'p1', zones: {},
      modules: { 'world-tick': { pressures: existing, lastHeat: 0, quietRounds: 0, lastEventIndex: 0, milestones: [] } },
    } as any;
    const fallout = {
      resolution: { pressureId: 'p-src', pressureKind: 'test' as any, resolutionType: 'resolved-by-player' as const, resolvedBy: 'player', resolutionVisibility: 'known' as const, resolvedAtTick: 1 },
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
    applyFalloutEffects(fallout, profile, world, [], makeEmptyPartyState(), 'fantasy', 1);
    expect(getActivePressures(world).length).toBe(3);
  });

  it('returns null profile when input profile is null', () => {
    const fallout = {
      resolution: { pressureId: 'p1', pressureKind: 'test' as any, resolutionType: 'failed' as const, resolvedBy: 'world', resolutionVisibility: 'known' as const, resolvedAtTick: 1 },
      summary: 'Null profile',
      effects: [{ type: 'reputation' as const, factionId: 'guild', delta: 5 }],
    };
    const world = { entities: {}, factions: {}, locationId: 'z1', playerId: 'p1', zones: {}, modules: {} } as any;
    const result = applyFalloutEffects(fallout, null, world, [], makeEmptyPartyState(), 'fantasy', 1);
    expect(result.profile).toBeNull();
  });
});

// WO-A2-4 (slice A2 §5, deletion): buildPressureInputs (this file's own
// app-side PressureInputs assembly) is deleted with its sole caller — see
// game-state.ts's own deletion note. The faction-cognition type-safety
// regression it used to cover (B-010) is preserved directly against
// readFactionCognitionScalars, the function that actually does the
// non-numeric-value guarding.
describe('readFactionCognitionScalars — faction cognition type safety', () => {
  it('handles faction cognition with non-numeric alertLevel/cohesion', () => {
    const world = {
      entities: {},
      factions: { guild: { id: 'guild' } },
      locationId: 'zone-1',
      playerId: 'p1',
      zones: {},
      modules: {
        cognition: {
          factions: {
            guild: { alertLevel: 'high', cohesion: null },
          },
        },
      },
    } as any;
    // Should not throw even with bad cognition data
    const scalars = readFactionCognitionScalars(getFactionCognition(world, 'guild'));
    expect(scalars).toBeDefined();
    expect(typeof scalars.alertLevel).toBe('number');
    expect(typeof scalars.cohesion).toBe('number');
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

  it('caps at MAX_PLAYER_RUMORS once the list is full (F-fd5e8eec)', () => {
    let rumors: any[] = [];
    for (let i = 0; i < MAX_PLAYER_RUMORS; i++) {
      rumors = addRumor({ id: `r${i}`, valence: 'neutral', confidence: 0.9 } as any, rumors, makeEmptyPartyState(), i);
    }
    expect(rumors).toHaveLength(MAX_PLAYER_RUMORS);

    rumors = addRumor(
      { id: 'r-overflow', valence: 'neutral', confidence: 0.9 } as any,
      rumors,
      makeEmptyPartyState(),
      MAX_PLAYER_RUMORS,
    );
    expect(rumors).toHaveLength(MAX_PLAYER_RUMORS);
    expect(rumors.some((r: any) => r.id === 'r-overflow')).toBe(true);
  });
});

describe('capPlayerRumors (F-fd5e8eec)', () => {
  it('returns the array unchanged (same reference) when at or under the cap', () => {
    const rumors = [{ id: 'r1', confidence: 0.9 } as any];
    expect(capPlayerRumors(rumors)).toBe(rumors);
  });

  it('evicts the oldest inert (confidence <= 0.3) rumor first once over the cap', () => {
    // One inert rumor buried in the middle; every other rumor is still hot.
    const rumors = Array.from({ length: MAX_PLAYER_RUMORS + 1 }, (_, i) => ({
      id: `r${i}`,
      confidence: i === 5 ? 0.2 : 0.9,
    })) as any[];

    const result = capPlayerRumors(rumors);
    expect(result).toHaveLength(MAX_PLAYER_RUMORS);
    expect(result.some((r) => r.id === 'r5')).toBe(false);
    // Hot rumors survive on both sides of the evicted inert one.
    expect(result.some((r) => r.id === 'r0')).toBe(true);
    expect(result.some((r) => r.id === `r${MAX_PLAYER_RUMORS}`)).toBe(true);
  });

  it('falls back to oldest-first eviction once every rumor is hot (confidence > 0.3)', () => {
    const rumors = Array.from({ length: MAX_PLAYER_RUMORS + 1 }, (_, i) => ({
      id: `r${i}`,
      confidence: 0.9,
    })) as any[];

    const result = capPlayerRumors(rumors);
    expect(result).toHaveLength(MAX_PLAYER_RUMORS);
    expect(result.some((r) => r.id === 'r0')).toBe(false);
    expect(result[0].id).toBe('r1');
  });

  it('does not mutate the input array', () => {
    const rumors = Array.from({ length: MAX_PLAYER_RUMORS + 1 }, (_, i) => ({
      id: `r${i}`,
      confidence: 0.9,
    })) as any[];
    capPlayerRumors(rumors);
    expect(rumors).toHaveLength(MAX_PLAYER_RUMORS + 1);
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

// B-001: getPlayerFactionAccess with all-negative reputations
describe('getPlayerFactionAccess — negative reputation handling', () => {
  it('finds best faction even when all reputations are negative', () => {
    const profile = makeMinimalProfile({
      reputation: [
        { factionId: 'guild', value: -10 },
        { factionId: 'thieves', value: -5 },
      ],
    });
    const world = { factions: { guild: {}, thieves: {} } } as any;
    // Even the "best" faction at -5 is below the >=20 threshold, so still undefined
    // but the key fix is that bestRep=-Infinity ensures we always find the best
    expect(getPlayerFactionAccess(world, profile)).toBeUndefined();
  });

  it('finds faction with rep >= 20 even when other factions are negative', () => {
    const profile = makeMinimalProfile({
      reputation: [
        { factionId: 'guild', value: -50 },
        { factionId: 'thieves', value: 25 },
      ],
    });
    const world = { factions: { guild: {}, thieves: {} } } as any;
    expect(getPlayerFactionAccess(world, profile)).toBe('thieves');
  });

  it('returns highest-rep faction when multiple are above threshold', () => {
    const profile = makeMinimalProfile({
      reputation: [
        { factionId: 'guild', value: 30 },
        { factionId: 'thieves', value: 50 },
        { factionId: 'mages', value: -20 },
      ],
    });
    const world = { factions: { guild: {}, thieves: {}, mages: {} } } as any;
    expect(getPlayerFactionAccess(world, profile)).toBe('thieves');
  });
});

// B-010: faction cognition type safety — see the
// 'readFactionCognitionScalars — faction cognition type safety' describe
// block above (moved there when buildPressureInputs, the wrapper this test
// used to go through, was deleted — WO-A2-4, slice A2 §5).

// B-011: isValidSupplyCategory and applyEconomyShiftToMap validation
describe('isValidSupplyCategory', () => {
  it('accepts valid supply categories', () => {
    expect(isValidSupplyCategory('medicine')).toBe(true);
    expect(isValidSupplyCategory('weapons')).toBe(true);
    expect(isValidSupplyCategory('ammunition')).toBe(true);
    expect(isValidSupplyCategory('food')).toBe(true);
    expect(isValidSupplyCategory('fuel')).toBe(true);
    expect(isValidSupplyCategory('luxuries')).toBe(true);
    expect(isValidSupplyCategory('components')).toBe(true);
    expect(isValidSupplyCategory('contraband')).toBe(true);
  });

  it('rejects invalid supply categories', () => {
    expect(isValidSupplyCategory('invalid')).toBe(false);
    expect(isValidSupplyCategory('')).toBe(false);
    expect(isValidSupplyCategory('MEDICINE')).toBe(false);
  });
});

describe('applyEconomyShiftToMap — category validation', () => {
  it('skips shift when category is invalid', () => {
    const economy = {
      districtId: 'd1',
      supplies: { medicine: 50, weapons: 50, ammunition: 50, food: 50, fuel: 50, luxuries: 50, components: 50, contraband: 50 },
      events: [],
      trends: [],
    } as any;
    const map = new Map([['d1', economy]]);
    // Invalid category should not throw
    applyEconomyShiftToMap(map, 'd1', 'invalid-category', 10, 'test');
    // Economy should be unchanged
    expect(map.get('d1')).toBe(economy);
  });

  it('applies shift when category is valid', () => {
    const economy = {
      districtId: 'd1',
      supplies: { medicine: 50, weapons: 50, ammunition: 50, food: 50, fuel: 50, luxuries: 50, components: 50, contraband: 50 },
      events: [],
      trends: [],
    } as any;
    const map = new Map([['d1', { ...economy }]]);
    applyEconomyShiftToMap(map, 'd1', 'medicine', 10, 'test');
    // Economy should have been replaced (applyEconomyShift returns new object)
    const updated = map.get('d1');
    expect(updated).toBeDefined();
  });
});

// B-002: extractProfileHints multi-kill XP + reputation accumulation
describe('extractProfileHints — multi-kill accumulation', () => {
  // getEntityFaction reads world.modules['faction-cognition'].membership[entityId]
  const makeWorld = (membershipMap: Record<string, string>, entities: Record<string, any> = {}) =>
    ({
      entities,
      factions: { bandits: { id: 'bandits' } },
      locationId: 'z1',
      playerId: 'p1',
      zones: {},
      modules: { 'faction-cognition': { membership: membershipMap, factionCognition: {}, factionMembers: {} } },
    } as any);

  it('accumulates XP across multiple defeated entities', () => {
    const world = makeWorld(
      { e1: 'bandits', e2: 'bandits', e3: 'bandits' },
      {
        e1: { name: 'Bandit A', tags: [] },
        e2: { name: 'Bandit B', tags: [] },
        e3: { name: 'Bandit C', tags: [] },
      },
    );
    const events: ResolvedEvent[] = [
      { type: 'combat.entity.defeated', payload: { entityId: 'e1' } },
      { type: 'combat.entity.defeated', payload: { entityId: 'e2' } },
      { type: 'combat.entity.defeated', payload: { entityId: 'e3' } },
    ] as any;
    const hints = extractProfileHints(events, 'attack', world);
    // 15 XP per kill × 3 kills + 2 base XP = 47
    expect(hints.xpGained).toBe(47);
  });

  it('accumulates reputation delta for same-faction kills', () => {
    const world = makeWorld(
      { e1: 'bandits', e2: 'bandits' },
      {
        e1: { name: 'Bandit A', tags: [] },
        e2: { name: 'Bandit B', tags: [] },
      },
    );
    const events: ResolvedEvent[] = [
      { type: 'combat.entity.defeated', payload: { entityId: 'e1' } },
      { type: 'combat.entity.defeated', payload: { entityId: 'e2' } },
    ] as any;
    const hints = extractProfileHints(events, 'attack', world);
    // -15 per kill × 2 = -30
    expect(hints.reputationDelta).toEqual({ factionId: 'bandits', delta: -30 });
  });

  it('single kill gives 15 XP and -15 reputation', () => {
    const world = makeWorld(
      { e1: 'bandits' },
      { e1: { name: 'Bandit A', tags: [] } },
    );
    const events: ResolvedEvent[] = [
      { type: 'combat.entity.defeated', payload: { entityId: 'e1' } },
    ] as any;
    const hints = extractProfileHints(events, 'attack', world);
    // 15 + 2 base = 17
    expect(hints.xpGained).toBe(17);
    expect(hints.reputationDelta).toEqual({ factionId: 'bandits', delta: -15 });
  });
});

// F-97ffd8cd: getPresenceData/getStatusDataFromProfile previously called
// buildPresence/buildStatusData with only 2 positional args, never the
// optional trailing `catalog` param both callees already accept (see
// character/catalog-names.ts's resolveArchetypeName/resolveDisciplineName) —
// so every status bar / narrator presence string rendered the raw
// kebab-case catalog id (e.g. 'penitent-knight') instead of its resolved
// display name ('Penitent Knight'), even when a BuildCatalog was available
// somewhere upstream. This adds the missing trailing param and threads it
// through to both compiled-package callees.
describe('getPresenceData / getStatusDataFromProfile catalog resolution (F-97ffd8cd)', () => {
  const itemCatalog: ItemCatalog = { items: [] } as any;
  const buildCatalog: BuildCatalog = {
    archetypes: [{ id: 'penitent-knight', name: 'Penitent Knight' } as any],
    backgrounds: [{ id: 'test-bg', name: 'Test Background' } as any],
    disciplines: [{ id: 'occultist', name: 'Occultist' } as any],
  } as any;

  function makeCatalogProfile(): CharacterProfile {
    return makeMinimalProfile({
      build: {
        name: 'Tester',
        archetypeId: 'penitent-knight',
        backgroundId: 'test-bg',
        disciplineId: 'occultist',
        traitIds: [],
      } as any,
    });
  }

  it('getStatusDataFromProfile resolves archetypeName/disciplineName from the catalog when supplied', () => {
    const profile = makeCatalogProfile();
    const status = getStatusDataFromProfile(profile, itemCatalog, buildCatalog);
    expect(status?.archetypeName).toBe('Penitent Knight');
    expect(status?.disciplineName).toBe('Occultist');
  });

  it('getStatusDataFromProfile falls back to the raw id when no catalog is supplied (unchanged behavior)', () => {
    const profile = makeCatalogProfile();
    const status = getStatusDataFromProfile(profile, itemCatalog);
    expect(status?.archetypeName).toBe('penitent-knight');
    expect(status?.disciplineName).toBe('occultist');
  });

  it('getPresenceData resolves the display name into the narrator summary when a catalog is supplied', () => {
    const profile = makeCatalogProfile();
    const presence = getPresenceData(profile, itemCatalog, buildCatalog);
    expect(presence.narrator).toContain('Penitent Knight');
    expect(presence.narrator).not.toContain('penitent-knight');
  });

  it('getPresenceData falls back to the raw id in the narrator summary when no catalog is supplied (unchanged behavior)', () => {
    const profile = makeCatalogProfile();
    const presence = getPresenceData(profile, itemCatalog);
    expect(presence.narrator).toContain('penitent-knight');
  });
});
