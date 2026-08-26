import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyNpcEffects, type NpcEffectApplicationContext } from './agency.js';
import type { NpcActionResult } from '@ai-rpg-engine/modules';
import type { Engine } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';

// Mock getCognition (and the other engine-package constructor/mutator functions
// applyNpcEffects delegates to) so tests exercise agency.ts's OWN dispatch logic
// — which effect type calls which function with which args, and how the result
// is merged into ctx — without depending on those functions' own internals.
vi.mock('@ai-rpg-engine/modules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ai-rpg-engine/modules')>();
  return {
    ...actual,
    getCognition: vi.fn(),
    setBelief: vi.fn(),
    addMemory: vi.fn(),
    getFactionCognition: vi.fn(),
    spawnPlayerRumor: vi.fn(),
    spawnNpcOriginatedRumor: vi.fn(),
    makePressure: vi.fn(),
    makeOpportunity: vi.fn(),
    createObligation: vi.fn(),
    addObligation: vi.fn(),
  };
});

import {
  getCognition, setBelief, addMemory, getFactionCognition,
  spawnPlayerRumor, spawnNpcOriginatedRumor, makePressure, makeOpportunity,
  createObligation, addObligation,
} from '@ai-rpg-engine/modules';

const mockedGetCognition = vi.mocked(getCognition);
const mockedSetBelief = vi.mocked(setBelief);
const mockedAddMemory = vi.mocked(addMemory);
const mockedGetFactionCognition = vi.mocked(getFactionCognition);
const mockedSpawnPlayerRumor = vi.mocked(spawnPlayerRumor);
const mockedSpawnNpcOriginatedRumor = vi.mocked(spawnNpcOriginatedRumor);
const mockedMakePressure = vi.mocked(makePressure);
const mockedMakeOpportunity = vi.mocked(makeOpportunity);
const mockedCreateObligation = vi.mocked(createObligation);
const mockedAddObligation = vi.mocked(addObligation);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeEngine(tick = 1): Engine {
  return {
    world: { entities: {}, playerId: 'player-1' },
    tick,
  } as unknown as Engine;
}

function makeProfile(overrides: Partial<CharacterProfile> = {}): CharacterProfile {
  return { name: 'TestPlayer', reputation: [], ...overrides } as unknown as CharacterProfile;
}

function makeCtx(overrides?: Partial<NpcEffectApplicationContext>): NpcEffectApplicationContext {
  return {
    profile: makeProfile(),
    playerRumors: [],
    activePressures: [],
    engine: makeEngine(),
    getPlayerDistrictId: () => 'district-1',
    ...overrides,
  };
}

function makeResult(effects: unknown[]): NpcActionResult {
  return {
    action: { npcId: 'npc-1', verb: 'test' },
    effects,
  } as unknown as NpcActionResult;
}

describe('applyNpcEffects — BR-007 null cognition guards', () => {
  it('should not throw when getCognition returns null for belief effect', () => {
    mockedGetCognition.mockReturnValue(null as any);
    const ctx = makeCtx();
    const result = makeResult([
      { type: 'belief', entityId: 'missing-npc', subject: 'player', key: 'trust', value: 'low', confidence: 0.5 },
    ]);

    expect(() => applyNpcEffects(result, ctx)).not.toThrow();
    expect(mockedSetBelief).not.toHaveBeenCalled();
  });

  it('should not throw when getCognition returns undefined for memory effect', () => {
    mockedGetCognition.mockReturnValue(undefined as any);
    const ctx = makeCtx();
    const result = makeResult([
      { type: 'memory', entityId: 'missing-npc', memType: 'observation', data: { detail: 'saw player' } },
    ]);

    expect(() => applyNpcEffects(result, ctx)).not.toThrow();
    expect(mockedAddMemory).not.toHaveBeenCalled();
  });

  it('should not throw when getCognition returns null for morale effect', () => {
    mockedGetCognition.mockReturnValue(null as any);
    const ctx = makeCtx();
    const result = makeResult([
      { type: 'morale', entityId: 'missing-npc', delta: 10 },
    ]);

    expect(() => applyNpcEffects(result, ctx)).not.toThrow();
  });

  it('should not throw when getCognition returns null for suspicion effect', () => {
    mockedGetCognition.mockReturnValue(null as any);
    const ctx = makeCtx();
    const result = makeResult([
      { type: 'suspicion', entityId: 'missing-npc', delta: 15 },
    ]);

    expect(() => applyNpcEffects(result, ctx)).not.toThrow();
  });

  it('should call setBelief when cognition exists', () => {
    const fakeCog = { beliefs: {}, morale: 50, suspicion: 20 };
    mockedGetCognition.mockReturnValue(fakeCog as any);
    const ctx = makeCtx();
    const result = makeResult([
      { type: 'belief', entityId: 'npc-1', subject: 'player', key: 'trust', value: 'high', confidence: 0.8 },
    ]);

    applyNpcEffects(result, ctx);
    expect(mockedSetBelief).toHaveBeenCalledWith(fakeCog, 'player', 'trust', 'high', 0.8, 'npc-agency', 1);
  });

  it('should call addMemory when cognition exists', () => {
    const fakeCog = { beliefs: {}, morale: 50, suspicion: 20 };
    mockedGetCognition.mockReturnValue(fakeCog as any);
    const ctx = makeCtx();
    const result = makeResult([
      { type: 'memory', entityId: 'npc-1', memType: 'observation', data: { detail: 'test' } },
    ]);

    applyNpcEffects(result, ctx);
    // Engine 2.9.x: addMemory is world-first and zone-aware (entityId trailer).
    expect(mockedAddMemory).toHaveBeenCalledWith(
      ctx.engine.world, fakeCog, 'observation', 1, { detail: 'test' }, 'npc-1',
    );
  });

  it('should update morale when cognition exists', () => {
    const fakeCog = { beliefs: {}, morale: 50, suspicion: 20 };
    mockedGetCognition.mockReturnValue(fakeCog as any);
    const ctx = makeCtx();
    const result = makeResult([
      { type: 'morale', entityId: 'npc-1', delta: 25 },
    ]);

    applyNpcEffects(result, ctx);
    expect(fakeCog.morale).toBe(75);
  });

  it('should clamp morale to 0-100 range', () => {
    const fakeCog = { beliefs: {}, morale: 95, suspicion: 20 };
    mockedGetCognition.mockReturnValue(fakeCog as any);
    const ctx = makeCtx();
    const result = makeResult([
      { type: 'morale', entityId: 'npc-1', delta: 50 },
    ]);

    applyNpcEffects(result, ctx);
    expect(fakeCog.morale).toBe(100);
  });

  it('should update suspicion when cognition exists', () => {
    const fakeCog = { beliefs: {}, morale: 50, suspicion: 20 };
    mockedGetCognition.mockReturnValue(fakeCog as any);
    const ctx = makeCtx();
    const result = makeResult([
      { type: 'suspicion', entityId: 'npc-1', delta: 30 },
    ]);

    applyNpcEffects(result, ctx);
    expect(fakeCog.suspicion).toBe(50);
  });

  it('should skip null cognition effects but still process other effects in same result', () => {
    // First call returns null (belief), second returns valid (morale)
    const fakeCog = { beliefs: {}, morale: 50, suspicion: 20 };
    mockedGetCognition
      .mockReturnValueOnce(null as any)
      .mockReturnValueOnce(fakeCog as any);

    const ctx = makeCtx();
    const result = makeResult([
      { type: 'belief', entityId: 'ghost-npc', subject: 'x', key: 'y', value: 'z', confidence: 0.5 },
      { type: 'morale', entityId: 'npc-1', delta: 10 },
    ]);

    expect(() => applyNpcEffects(result, ctx)).not.toThrow();
    expect(mockedSetBelief).not.toHaveBeenCalled();
    expect(fakeCog.morale).toBe(60);
  });
});

describe('applyNpcEffects PBR-005: alert null guard', () => {
  it('should not throw when getFactionCognition returns null for alert effect', () => {
    mockedGetFactionCognition.mockReturnValue(null as any);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx();
    const result = makeResult([
      { type: 'alert', factionId: 'nonexistent-faction', delta: 10 },
    ]);

    expect(() => applyNpcEffects(result, ctx)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no faction cognition'));
    warnSpy.mockRestore();
  });

  it('should not throw when getFactionCognition returns undefined for alert effect', () => {
    mockedGetFactionCognition.mockReturnValue(undefined as any);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx();
    const result = makeResult([
      { type: 'alert', factionId: 'ghost-faction', delta: 20 },
    ]);

    expect(() => applyNpcEffects(result, ctx)).not.toThrow();
    warnSpy.mockRestore();
  });

  it('should update alertLevel when getFactionCognition returns valid object', () => {
    const fakeFcog = { alertLevel: 30 };
    mockedGetFactionCognition.mockReturnValue(fakeFcog as any);
    const ctx = makeCtx();
    const result = makeResult([
      { type: 'alert', factionId: 'guards', delta: 25 },
    ]);

    applyNpcEffects(result, ctx);
    expect(fakeFcog.alertLevel).toBe(55);
  });

  it('should clamp alertLevel to 0-100 range', () => {
    const fakeFcog = { alertLevel: 90 };
    mockedGetFactionCognition.mockReturnValue(fakeFcog as any);
    const ctx = makeCtx();
    const result = makeResult([
      { type: 'alert', factionId: 'guards', delta: 50 },
    ]);

    applyNpcEffects(result, ctx);
    expect(fakeFcog.alertLevel).toBe(100);
  });
});

// F-8d11d865: the 8 remaining NpcEffect branches (reputation, rumor, npc-rumor,
// zone-change, obligation, pressure, companion-departure, spawn-opportunity) had
// zero test coverage, including the two capacity-limiting branches most prone to
// off-by-one errors (pressure's MAX_ACTIVE=3, spawn-opportunity's MAX_OPPS=5).
describe('applyNpcEffects F-8d11d865: reputation, rumor, and structural effects', () => {
  it('should adjust profile reputation via adjustReputation for a reputation effect', () => {
    const ctx = makeCtx({ profile: makeProfile({ reputation: [{ factionId: 'guild', value: 10 }] } as any) });
    const result = makeResult([
      { type: 'reputation', factionId: 'guild', delta: 15 },
    ]);

    const updated = applyNpcEffects(result, ctx);
    expect((updated as any).reputation).toEqual([{ factionId: 'guild', value: 25 }]);
  });

  it('should create a new faction entry via adjustReputation when none exists yet', () => {
    const ctx = makeCtx({ profile: makeProfile() });
    const result = makeResult([
      { type: 'reputation', factionId: 'new-faction', delta: -20 },
    ]);

    const updated = applyNpcEffects(result, ctx);
    expect((updated as any).reputation).toEqual([{ factionId: 'new-faction', value: -20 }]);
  });

  it('should call spawnPlayerRumor and push the result onto ctx.playerRumors for a rumor effect', () => {
    const fakeRumor = { id: 'rumor-1' };
    mockedSpawnPlayerRumor.mockReturnValue(fakeRumor as any);
    const ctx = makeCtx();
    const result = makeResult([
      { type: 'rumor', claim: 'The player is a hero', valence: 'heroic', targetFactionIds: ['guild'] },
    ]);

    applyNpcEffects(result, ctx);

    expect(mockedSpawnPlayerRumor).toHaveBeenCalledWith(
      { label: 'The player is a hero', description: 'The player is a hero', tags: ['heroic'] },
      ctx.profile,
      'guild',
      'district-1',
      1,
    );
    expect(ctx.playerRumors).toEqual([fakeRumor]);
  });

  it('should call spawnNpcOriginatedRumor and push the result onto ctx.playerRumors for an npc-rumor effect', () => {
    const fakeRumor = { id: 'rumor-2' };
    mockedSpawnNpcOriginatedRumor.mockReturnValue(fakeRumor as any);
    const ctx = makeCtx();
    const result = makeResult([
      {
        type: 'npc-rumor', claim: 'The player betrayed us', valence: 'fearsome',
        sourceEvent: 'npc-betrayal', originNpcId: 'npc-1', targetFactionIds: ['guild'],
      },
    ]);

    applyNpcEffects(result, ctx);

    expect(mockedSpawnNpcOriginatedRumor).toHaveBeenCalledWith(
      'The player betrayed us', 'fearsome', 'npc-betrayal', 'npc-1', 'guild', 'district-1', 1,
    );
    expect(ctx.playerRumors).toEqual([fakeRumor]);
  });

  it('should move the entity to the target zone for a zone-change effect', () => {
    const engine = makeEngine();
    engine.world.entities['npc-1'] = { id: 'npc-1', zoneId: 'old-zone' } as any;
    const ctx = makeCtx({ engine });
    const result = makeResult([
      { type: 'zone-change', entityId: 'npc-1', toZoneId: 'new-zone' },
    ]);

    applyNpcEffects(result, ctx);
    expect((engine.world.entities['npc-1'] as any).zoneId).toBe('new-zone');
  });

  it('should not throw for a zone-change effect when the entity does not exist', () => {
    const ctx = makeCtx();
    const result = makeResult([
      { type: 'zone-change', entityId: 'ghost-entity', toZoneId: 'new-zone' },
    ]);
    expect(() => applyNpcEffects(result, ctx)).not.toThrow();
  });

  it('should create and add an obligation to the ledger when npcObligations is provided', () => {
    const fakeObligation = { id: 'obl-1' };
    mockedCreateObligation.mockReturnValue(fakeObligation as any);
    const updatedLedger = { obligations: [fakeObligation] };
    mockedAddObligation.mockReturnValue(updatedLedger as any);
    const npcObligations = new Map();
    const ctx = makeCtx({ npcObligations });
    const result = makeResult([
      {
        type: 'obligation', kind: 'favor', direction: 'owed-to-player', npcId: 'npc-1',
        counterpartyId: 'player-1', magnitude: 5, sourceTag: 'rescue', decayTurns: 20,
      },
    ]);

    applyNpcEffects(result, ctx);

    expect(mockedCreateObligation).toHaveBeenCalledWith(
      'favor', 'owed-to-player', 'npc-1', 'player-1', 5, 'rescue', 1, 20,
    );
    expect(npcObligations.get('npc-1')).toBe(updatedLedger);
  });

  it('should not throw for an obligation effect when ctx.npcObligations is not provided', () => {
    const ctx = makeCtx();
    const result = makeResult([
      {
        type: 'obligation', kind: 'favor', direction: 'owed-to-player', npcId: 'npc-1',
        counterpartyId: 'player-1', magnitude: 5, sourceTag: 'rescue', decayTurns: 20,
      },
    ]);
    expect(() => applyNpcEffects(result, ctx)).not.toThrow();
    expect(mockedCreateObligation).not.toHaveBeenCalled();
  });

  it('should not throw and should not mutate ctx for a companion-departure effect (handled by GameSession)', () => {
    const ctx = makeCtx();
    const result = makeResult([
      { type: 'companion-departure', npcId: 'npc-1', reason: 'betrayed' },
    ]);

    expect(() => applyNpcEffects(result, ctx)).not.toThrow();
    expect(ctx.activePressures).toEqual([]);
    expect(ctx.playerRumors).toEqual([]);
  });

  describe('pressure effect — MAX_ACTIVE capacity guard', () => {
    it('should push a new pressure when under the MAX_ACTIVE (3) cap', () => {
      const fakePressure = { id: 'pressure-1' };
      mockedMakePressure.mockReturnValue(fakePressure as any);
      const ctx = makeCtx({ activePressures: [] });
      const result = makeResult([
        { type: 'pressure', kind: 'bounty-issued', sourceFactionId: 'guild', description: 'A bounty', urgency: 0.5, sourceNpcId: 'npc-1' },
      ]);

      applyNpcEffects(result, ctx);
      expect(ctx.activePressures).toEqual([fakePressure]);
    });

    it('should drop the 4th pressure once MAX_ACTIVE is reached — not duplicate or overwrite existing entries', () => {
      const existing = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] as any[];
      mockedMakePressure.mockReturnValue({ id: 'p4-should-not-appear' } as any);
      const ctx = makeCtx({ activePressures: existing });
      const result = makeResult([
        { type: 'pressure', kind: 'bounty-issued', sourceFactionId: 'guild', description: 'A bounty', urgency: 0.5, sourceNpcId: 'npc-1' },
      ]);

      applyNpcEffects(result, ctx);
      expect(ctx.activePressures).toHaveLength(3);
      expect(ctx.activePressures).toEqual(existing);
      expect(mockedMakePressure).not.toHaveBeenCalled();
    });
  });

  describe('spawn-opportunity effect — MAX_OPPS capacity guard', () => {
    it('should push a new opportunity when under the MAX_OPPS (5) cap', () => {
      const fakeOpp = { id: 'opp-1' };
      mockedMakeOpportunity.mockReturnValue(fakeOpp as any);
      const engine = makeEngine();
      engine.world.entities['npc-1'] = { id: 'npc-1', name: 'Merchant', tags: ['faction:guild'] } as any;
      const ctx = makeCtx({ engine, activeOpportunities: [] });
      const result = makeResult([
        { type: 'spawn-opportunity', kind: 'bounty', description: 'Fetch quest' },
      ]);

      applyNpcEffects(result, ctx);
      expect(ctx.activeOpportunities).toEqual([fakeOpp]);
    });

    it('should drop the 6th opportunity once MAX_OPPS is reached — not duplicate or overwrite existing entries', () => {
      const existing = [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }, { id: 'o4' }, { id: 'o5' }] as any[];
      mockedMakeOpportunity.mockReturnValue({ id: 'o6-should-not-appear' } as any);
      const ctx = makeCtx({ activeOpportunities: existing });
      const result = makeResult([
        { type: 'spawn-opportunity', kind: 'bounty', description: 'Fetch quest' },
      ]);

      applyNpcEffects(result, ctx);
      expect(ctx.activeOpportunities).toHaveLength(5);
      expect(ctx.activeOpportunities).toEqual(existing);
      expect(mockedMakeOpportunity).not.toHaveBeenCalled();
    });

    it('should not throw for spawn-opportunity when ctx.activeOpportunities is not provided', () => {
      const ctx = makeCtx();
      const result = makeResult([
        { type: 'spawn-opportunity', kind: 'bounty', description: 'Fetch quest' },
      ]);
      expect(() => applyNpcEffects(result, ctx)).not.toThrow();
      expect(mockedMakeOpportunity).not.toHaveBeenCalled();
    });
  });
});
