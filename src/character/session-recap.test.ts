import { describe, it, expect } from 'vitest';
import {
  computeFactionDeltas,
  computeRumorDelta,
  computeDistrictDeltas,
  renderFullRecap,
  type CompanionRecapEntry,
  type ItemRecapEntry,
} from './session-recap.js';
import type { SessionDelta } from './recap-delta.js';
import type { WorldDelta } from './world-delta.js';
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
      subjectDescriptor: 'the hero',
      sourceEvent: 'milestone',
      originFactionId: 'thieves',
      originTick: 5,
      spreadTo: ['guild'],
      mutationCount: 0,
      confidence: 1,
      distortion: 0,
      valence: 'fearsome' as const,
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

  // F-5ddf0503: pressuresFrom's filter had a dead second clause
  // (`resolvedPressures.indexOf(f) >= 0`) that is always true by construction
  // (f is drawn from resolvedPressures by the very .filter() it's inside). These
  // tests pin down the INTENDED behavior driven solely by the first clause
  // (resolvedBy !== 'expiry') and the second .filter()'s per-faction effect check.
  describe('pressuresFrom', () => {
    const guildRepFallout = {
      resolution: { resolvedBy: 'player-action', resolvedAtTick: 5, resolutionVisibility: 'known' },
      effects: [{ type: 'reputation', factionId: 'guild', delta: 10 }],
      summary: 'Resolved by the player',
    } as any;

    it('counts a resolved-by-non-expiry pressure whose fallout effects target the faction', () => {
      const before = [{ factionId: 'guild', value: 0 }];
      const after = [{ factionId: 'guild', value: 0 }];
      const result = computeFactionDeltas(before, after, [], [guildRepFallout], 0);
      expect(result).toHaveLength(1);
      expect(result[0].pressuresFrom).toBe(1);
    });

    it('does not count a pressure resolved by expiry', () => {
      const before = [{ factionId: 'guild', value: 0 }];
      const after = [{ factionId: 'guild', value: 0 }];
      const expiredFallout = { ...guildRepFallout, resolution: { ...guildRepFallout.resolution, resolvedBy: 'expiry' } };
      const result = computeFactionDeltas(before, after, [], [expiredFallout], 0);
      // No reputation change, no pressuresFrom, no rumor change — faction is dropped entirely
      expect(result.find((d) => d.factionId === 'guild')).toBeUndefined();
    });

    it('does not count a resolved pressure whose fallout effects target a different faction', () => {
      const before = [{ factionId: 'guild', value: 0 }];
      const after = [{ factionId: 'guild', value: 0 }];
      const otherFactionFallout = { ...guildRepFallout, effects: [{ type: 'reputation', factionId: 'thieves', delta: 10 }] };
      const result = computeFactionDeltas(before, after, [], [otherFactionFallout], 0);
      expect(result.find((d) => d.factionId === 'guild')).toBeUndefined();
    });

    it('counts multiple qualifying resolved pressures for the same faction', () => {
      const before = [{ factionId: 'guild', value: 0 }];
      const after = [{ factionId: 'guild', value: 0 }];
      const result = computeFactionDeltas(before, after, [], [guildRepFallout, guildRepFallout], 0);
      expect(result[0].pressuresFrom).toBe(2);
    });
  });

  // F-bbcef54a: FACTION SHIFTS printed the raw fd.factionId slug, unlike the
  // same renderFullRecap screen's District Changes / Economy Changes /
  // What People Are Saying sections, which all resolve to a display name.
  // deriveWhatPeopleAreSaying already takes a `factionNames: Record<string,
  // string>` map (see below) — computeFactionDeltas now accepts the same
  // map, optional and trailing so the pre-existing 5-arg call sites (bin.ts,
  // the tests above) keep compiling and keep getting factionId back when
  // it's omitted.
  describe('factionName (F-bbcef54a)', () => {
    it('resolves factionName from the supplied factionNames map', () => {
      const before = [{ factionId: 'iron-covenant', value: 0 }];
      const after = [{ factionId: 'iron-covenant', value: 12 }];
      const result = computeFactionDeltas(before, after, [], [], 0, { 'iron-covenant': 'Iron Covenant' });
      expect(result).toHaveLength(1);
      expect(result[0].factionName).toBe('Iron Covenant');
    });

    it('falls back to factionId when no factionNames map is supplied (backward compatible)', () => {
      const before = [{ factionId: 'iron-covenant', value: 0 }];
      const after = [{ factionId: 'iron-covenant', value: 12 }];
      const result = computeFactionDeltas(before, after, [], [], 0);
      expect(result[0].factionName).toBe('iron-covenant');
    });
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
      subjectDescriptor: 'the hero',
      sourceEvent: 'milestone',
      originFactionId: 'guild',
      originTick: 1,
      spreadTo: ['guild'],
      mutationCount: 0,
      confidence: 1,
      distortion: 0,
      valence: 'heroic' as const,
    }];
    const result = computeRumorDelta(0, rumors);
    expect(result.spawned).toBe(1);
    expect(result.totalSpread).toBe(1);
  });

  it('identifies most widespread rumor', () => {
    const rumors: PlayerRumor[] = [
      {
        id: 'r1', claim: 'Small rumor', subjectDescriptor: 'the hero', sourceEvent: 'milestone', originFactionId: 'a', originTick: 1,
        spreadTo: ['a'], mutationCount: 0, confidence: 1, distortion: 0, valence: 'mysterious' as const,
      },
      {
        id: 'r2', claim: 'Big rumor', subjectDescriptor: 'the hero', sourceEvent: 'milestone', originFactionId: 'a', originTick: 1,
        spreadTo: ['a', 'b', 'c'], mutationCount: 2, confidence: 1, distortion: 0, valence: 'fearsome' as const,
      },
    ];
    const result = computeRumorDelta(0, rumors);
    expect(result.mostWidespread).toBe('Big rumor');
    expect(result.mutated).toBe(2);
    expect(result.totalSpread).toBe(4);
  });

  it('handles negative spawned count when rumors were removed', () => {
    const rumors: PlayerRumor[] = [{
      id: 'r1', claim: 'Only one left', subjectDescriptor: 'the hero', sourceEvent: 'milestone', originFactionId: 'a', originTick: 1,
      spreadTo: ['a'], mutationCount: 0, confidence: 1, distortion: 0, valence: 'mysterious' as const,
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

// --- renderFullRecap (F-579e70a8) ---

describe('renderFullRecap', () => {
  const zeroCharacterDelta: SessionDelta = {
    xpGained: 0,
    levelBefore: 1,
    levelAfter: 1,
    reputationChanges: [],
    newMilestones: 0,
    newInjuries: 0,
    turnsPlayed: 0,
  };

  const zeroWorldDelta: WorldDelta = {
    pressuresSpawned: 0,
    pressuresResolved: 0,
    resolutionSummaries: [],
    chainReactions: 0,
    rumorsDelta: 0,
  };

  const zeroRumorDelta = { spawned: 0, mutated: 0, totalSpread: 0 };

  it('returns empty string when truly nothing happened', () => {
    const result = renderFullRecap(
      zeroCharacterDelta,
      zeroWorldDelta,
      [],
      zeroRumorDelta,
      [],
    );
    expect(result).toBe('');
  });

  it('renders a non-empty recap when only companionRecapEntries is populated (all four legacy gate counters stay zero)', () => {
    const companionRecapEntries: CompanionRecapEntry[] = [
      { npcId: 'c1', name: 'Mira', role: 'scout', event: 'departed', detail: 'left at the docks' },
    ];

    const result = renderFullRecap(
      zeroCharacterDelta,
      zeroWorldDelta,
      [],
      zeroRumorDelta,
      [],
      undefined, // npcRecapEntries
      undefined, // districtDeltas
      companionRecapEntries,
    );

    expect(result).not.toBe('');
    expect(result).toContain('COMPANION CHANGES');
    expect(result).toContain('Mira');
  });

  it('renders a non-empty recap when only itemRecapEntries is populated (all four legacy gate counters stay zero)', () => {
    const itemRecapEntries: ItemRecapEntry[] = [
      { itemId: 'i1', name: 'Old Locket', event: 'lost', detail: 'dropped in the river' },
    ];

    const result = renderFullRecap(
      zeroCharacterDelta,
      zeroWorldDelta,
      [],
      zeroRumorDelta,
      [],
      undefined, // npcRecapEntries
      undefined, // districtDeltas
      undefined, // companionRecapEntries
      itemRecapEntries,
    );

    expect(result).not.toBe('');
    expect(result).toContain('EQUIPMENT CHANGES');
    expect(result).toContain('Old Locket');
  });

  it('renders a non-empty recap when only factionDeltas is populated (passive/NPC-agency reputation shift)', () => {
    const factionDeltas = [
      { factionId: 'guild', reputationBefore: 10, reputationAfter: 15, pressuresFrom: 0, rumorsKnownBefore: 0, rumorsKnownAfter: 0 },
    ];

    const result = renderFullRecap(
      zeroCharacterDelta,
      zeroWorldDelta,
      factionDeltas,
      zeroRumorDelta,
      [],
    );

    expect(result).not.toBe('');
    expect(result).toContain('FACTION SHIFTS');
    expect(result).toContain('guild');
  });

  // F-bbcef54a: FACTION SHIFTS rendered fd.factionId raw even though
  // 'Section 3: District Changes' / 'Section: Economy Changes' /
  // 'Section 5: What People Are Saying' in this same screen all resolve to a
  // display name -- proving the screen's own house style is resolved names.
  // FactionDelta.factionName is optional (a hand-built literal without it,
  // like the test right above, still renders fd.factionId unchanged); when
  // present, renderFullRecap must prefer it over the raw id.
  it('prefers factionName over the raw factionId in FACTION SHIFTS when present (F-bbcef54a)', () => {
    const factionDeltas = [
      {
        factionId: 'iron-covenant',
        factionName: 'Iron Covenant',
        reputationBefore: 9,
        reputationAfter: 12,
        pressuresFrom: 0,
        rumorsKnownBefore: 0,
        rumorsKnownAfter: 0,
      },
    ];

    const result = renderFullRecap(
      zeroCharacterDelta,
      zeroWorldDelta,
      factionDeltas,
      zeroRumorDelta,
      [],
    );

    expect(result).toContain('Iron Covenant');
    expect(result).not.toContain('iron-covenant');
  });
});
