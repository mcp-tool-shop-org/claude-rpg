import { describe, it, expect } from 'vitest';
import {
  computeFactionDeltas,
  computeRumorDelta,
  computeDistrictDeltas,
} from './session-recap.js';
import type { PlayerRumor, PressureFallout } from '@ai-rpg-engine/modules';

// --- computeFactionDeltas ---

describe('computeFactionDeltas', () => {
  it('returns empty array when nothing changed', () => {
    const before = [{ factionId: 'guild', value: 10 }];
    const after = [{ factionId: 'guild', value: 10 }];
    const result = computeFactionDeltas(before, after, [], [], 0);
    expect(result).toEqual([]);
  });

  it('detects reputation change', () => {
    const before = [{ factionId: 'guild', value: 10 }];
    const after = [{ factionId: 'guild', value: 30 }];
    const result = computeFactionDeltas(before, after, [], [], 0);
    expect(result).toHaveLength(1);
    expect(result[0].factionId).toBe('guild');
    expect(result[0].reputationBefore).toBe(10);
    expect(result[0].reputationAfter).toBe(30);
  });

  it('detects new rumors known by faction', () => {
    const before = [{ factionId: 'guild', value: 0 }];
    const after = [{ factionId: 'guild', value: 0 }];
    const rumors: PlayerRumor[] = [{
      id: 'r1',
      claim: 'Hero stole gold',
      originFactionId: 'thieves',
      originTick: 5,
      spreadTo: ['guild'],
      mutationCount: 0,
      valence: 'negative' as const,
      decayTick: 100,
      tags: [],
    }];
    // Session started at tick 0, rumor origin at tick 5 means it appeared during session
    const result = computeFactionDeltas(before, after, rumors, [], 0);
    expect(result).toHaveLength(1);
    expect(result[0].rumorsKnownAfter).toBe(1);
    expect(result[0].rumorsKnownBefore).toBe(0);
  });

  it('sorts by largest reputation change', () => {
    const before = [
      { factionId: 'a', value: 0 },
      { factionId: 'b', value: 0 },
    ];
    const after = [
      { factionId: 'a', value: 5 },
      { factionId: 'b', value: 50 },
    ];
    const result = computeFactionDeltas(before, after, [], [], 0);
    expect(result[0].factionId).toBe('b');
    expect(result[1].factionId).toBe('a');
  });

  it('handles faction appearing only in after', () => {
    const before: { factionId: string; value: number }[] = [];
    const after = [{ factionId: 'new-faction', value: 20 }];
    const result = computeFactionDeltas(before, after, [], [], 0);
    expect(result).toHaveLength(1);
    expect(result[0].reputationBefore).toBe(0);
    expect(result[0].reputationAfter).toBe(20);
  });
});

// --- computeRumorDelta ---

describe('computeRumorDelta', () => {
  it('returns zeroes for no rumors', () => {
    const result = computeRumorDelta(0, []);
    expect(result.spawned).toBe(0);
    expect(result.mutated).toBe(0);
    expect(result.totalSpread).toBe(0);
    expect(result.mostWidespread).toBeUndefined();
  });

  it('counts spawned rumors', () => {
    const rumors: PlayerRumor[] = [{
      id: 'r1',
      claim: 'Hero arrived',
      originFactionId: 'guild',
      originTick: 1,
      spreadTo: ['guild'],
      mutationCount: 0,
      valence: 'positive' as const,
      decayTick: 50,
      tags: [],
    }];
    const result = computeRumorDelta(0, rumors);
    expect(result.spawned).toBe(1);
    expect(result.totalSpread).toBe(1);
  });

  it('identifies most widespread rumor', () => {
    const rumors: PlayerRumor[] = [
      {
        id: 'r1', claim: 'Small rumor', originFactionId: 'a', originTick: 1,
        spreadTo: ['a'], mutationCount: 0, valence: 'neutral' as const, decayTick: 50, tags: [],
      },
      {
        id: 'r2', claim: 'Big rumor', originFactionId: 'a', originTick: 1,
        spreadTo: ['a', 'b', 'c'], mutationCount: 2, valence: 'negative' as const, decayTick: 50, tags: [],
      },
    ];
    const result = computeRumorDelta(0, rumors);
    expect(result.mostWidespread).toBe('Big rumor');
    expect(result.mutated).toBe(2);
    expect(result.totalSpread).toBe(4);
  });

  it('handles negative spawned count when rumors were removed', () => {
    const rumors: PlayerRumor[] = [{
      id: 'r1', claim: 'Only one left', originFactionId: 'a', originTick: 1,
      spreadTo: ['a'], mutationCount: 0, valence: 'neutral' as const, decayTick: 50, tags: [],
    }];
    const result = computeRumorDelta(3, rumors);
    expect(result.spawned).toBe(-2);
  });
});

// --- computeDistrictDeltas ---

describe('computeDistrictDeltas', () => {
  const makeMood = (id: string, name: string, descriptor: string, commerce: number, morale: number, alertPressure: number, stability: number) => ({
    districtId: id, districtName: name, descriptor, metrics: { commerce, morale, alertPressure, stability },
  });

  it('returns empty when no districts changed', () => {
    const before = [makeMood('d1', 'Market', 'calm', 50, 50, 10, 5)];
    const after = [makeMood('d1', 'Market', 'calm', 50, 50, 10, 5)];
    const result = computeDistrictDeltas(before, after);
    expect(result).toHaveLength(1);
    expect(result[0].changed).toBe(false);
    expect(result[0].keyShifts).toEqual([]);
  });

  it('detects mood descriptor change', () => {
    const before = [makeMood('d1', 'Market', 'calm', 50, 50, 10, 5)];
    const after = [makeMood('d1', 'Market', 'tense', 50, 50, 10, 5)];
    const result = computeDistrictDeltas(before, after);
    expect(result[0].changed).toBe(true);
    expect(result[0].moodBefore).toBe('calm');
    expect(result[0].moodAfter).toBe('tense');
  });

  it('detects commerce shift above threshold', () => {
    const before = [makeMood('d1', 'Market', 'calm', 50, 50, 10, 5)];
    const after = [makeMood('d1', 'Market', 'calm', 30, 50, 10, 5)];
    const result = computeDistrictDeltas(before, after);
    expect(result[0].changed).toBe(true);
    expect(result[0].keyShifts).toContain('commerce declined');
  });

  it('detects stability deterioration', () => {
    const before = [makeMood('d1', 'Docks', 'calm', 50, 50, 10, 8)];
    const after = [makeMood('d1', 'Docks', 'calm', 50, 50, 10, 5)];
    const result = computeDistrictDeltas(before, after);
    expect(result[0].changed).toBe(true);
    expect(result[0].keyShifts).toContain('stability deteriorated');
  });

  it('skips districts not present in before', () => {
    const before = [makeMood('d1', 'Market', 'calm', 50, 50, 10, 5)];
    const after = [
      makeMood('d1', 'Market', 'calm', 50, 50, 10, 5),
      makeMood('d2', 'Docks', 'busy', 60, 60, 5, 7),
    ];
    const result = computeDistrictDeltas(before, after);
    expect(result).toHaveLength(1);
    expect(result[0].districtId).toBe('d1');
  });
});
