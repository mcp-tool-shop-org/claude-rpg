import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyNpcEffects, type NpcEffectApplicationContext } from './agency.js';
import type { NpcActionResult } from '@ai-rpg-engine/modules';
import type { Engine } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';

// Mock getCognition to control null returns
vi.mock('@ai-rpg-engine/modules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ai-rpg-engine/modules')>();
  return {
    ...actual,
    getCognition: vi.fn(),
    setBelief: vi.fn(),
    addMemory: vi.fn(),
  };
});

import { getCognition, setBelief, addMemory } from '@ai-rpg-engine/modules';

const mockedGetCognition = vi.mocked(getCognition);
const mockedSetBelief = vi.mocked(setBelief);
const mockedAddMemory = vi.mocked(addMemory);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeEngine(tick = 1): Engine {
  return {
    world: { entities: {}, playerId: 'player-1' },
    tick,
  } as unknown as Engine;
}

function makeProfile(): CharacterProfile {
  return { name: 'TestPlayer' } as unknown as CharacterProfile;
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
    expect(mockedAddMemory).toHaveBeenCalledWith(fakeCog, 'observation', 1, { detail: 'test' });
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
