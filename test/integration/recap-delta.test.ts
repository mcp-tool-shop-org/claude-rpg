// Recap delta law tests: prove that recap is derived from canonical state changes,
// not narration text. Delta computation must be minimal, correct, and stable.

import { describe, it, expect } from 'vitest';
import {
  captureSnapshot,
  computeSessionDelta,
  renderSessionDelta,
  type SessionSnapshot,
} from '../../src/character/recap-delta.js';
import {
  computeFactionDeltas,
  computeRumorDelta,
  deriveWhatPeopleAreSaying,
} from '../../src/character/session-recap.js';

// ─── Snapshot helpers ─────────────────────────────────────────

function makeSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    xp: 0,
    level: 1,
    reputation: [],
    milestoneCount: 0,
    injuryCount: 0,
    totalTurns: 0,
    ...overrides,
  };
}

// ─── Session Delta Computation ────────────────────────────────

describe('computeSessionDelta', () => {
  it('no change yields zero delta', () => {
    const snap = makeSnapshot({ xp: 50, level: 2, totalTurns: 5 });
    const delta = computeSessionDelta(snap, snap);
    expect(delta.xpGained).toBe(0);
    expect(delta.turnsPlayed).toBe(0);
    expect(delta.newMilestones).toBe(0);
    expect(delta.newInjuries).toBe(0);
    expect(delta.reputationChanges).toEqual([]);
  });

  it('XP and level changes are captured', () => {
    const before = makeSnapshot({ xp: 10, level: 1, totalTurns: 3 });
    const after = makeSnapshot({ xp: 45, level: 2, totalTurns: 8 });
    const delta = computeSessionDelta(before, after);
    expect(delta.xpGained).toBe(35);
    expect(delta.levelBefore).toBe(1);
    expect(delta.levelAfter).toBe(2);
    expect(delta.turnsPlayed).toBe(5);
  });

  it('reputation changes include only factions that changed', () => {
    const before = makeSnapshot({
      reputation: [
        { factionId: 'guardians', value: 10 },
        { factionId: 'thieves', value: -5 },
      ],
    });
    const after = makeSnapshot({
      reputation: [
        { factionId: 'guardians', value: 10 },  // unchanged
        { factionId: 'thieves', value: -20 },    // changed
        { factionId: 'merchants', value: 5 },    // new
      ],
    });
    const delta = computeSessionDelta(before, after);
    // Only thieves and merchants should appear (guardians unchanged)
    const changed = delta.reputationChanges.filter((r) => r.before !== r.after);
    expect(changed.length).toBe(2);
    expect(changed.find((r) => r.factionId === 'thieves')?.after).toBe(-20);
    expect(changed.find((r) => r.factionId === 'merchants')?.after).toBe(5);
  });

  it('title change is captured', () => {
    const before = makeSnapshot({ title: 'Wanderer' });
    const after = makeSnapshot({ title: 'the Bloodied' });
    const delta = computeSessionDelta(before, after);
    expect(delta.titleBefore).toBe('Wanderer');
    expect(delta.titleAfter).toBe('the Bloodied');
  });

  it('milestone and injury counts are non-negative', () => {
    const before = makeSnapshot({ milestoneCount: 3, injuryCount: 2 });
    // Edge: injuries healed (after < before)
    const after = makeSnapshot({ milestoneCount: 3, injuryCount: 1 });
    const delta = computeSessionDelta(before, after);
    expect(delta.newMilestones).toBe(0);
    expect(delta.newInjuries).toBe(0); // max(0, 1-2) = 0
  });
});

// ─── Render ───────────────────────────────────────────────────

describe('renderSessionDelta', () => {
  it('returns empty string when nothing changed', () => {
    const delta = computeSessionDelta(makeSnapshot(), makeSnapshot());
    expect(renderSessionDelta(delta)).toBe('');
  });

  it('renders non-empty string when XP gained', () => {
    const before = makeSnapshot({ totalTurns: 0 });
    const after = makeSnapshot({ xp: 20, totalTurns: 3 });
    const delta = computeSessionDelta(before, after);
    const text = renderSessionDelta(delta);
    expect(text).toContain('SESSION SUMMARY');
    expect(text).toContain('+20 XP');
  });
});

// ─── Faction Deltas ───────────────────────────────────────────

describe('computeFactionDeltas', () => {
  it('returns empty for no reputation change', () => {
    const rep = [{ factionId: 'guardians', value: 10 }];
    const deltas = computeFactionDeltas(rep, rep, [], [], 0);
    expect(deltas).toEqual([]);
  });

  it('detects reputation change', () => {
    const before = [{ factionId: 'guardians', value: 10 }];
    const after = [{ factionId: 'guardians', value: -5 }];
    const deltas = computeFactionDeltas(before, after, [], [], 0);
    expect(deltas.length).toBe(1);
    expect(deltas[0].reputationBefore).toBe(10);
    expect(deltas[0].reputationAfter).toBe(-5);
  });

  it('sorts by absolute rep change descending', () => {
    const before = [
      { factionId: 'a', value: 0 },
      { factionId: 'b', value: 0 },
    ];
    const after = [
      { factionId: 'a', value: 5 },    // change: 5
      { factionId: 'b', value: -20 },   // change: 20
    ];
    const deltas = computeFactionDeltas(before, after, [], [], 0);
    expect(deltas[0].factionId).toBe('b'); // larger change first
  });
});

// ─── Rumor Delta ──────────────────────────────────────────────

describe('computeRumorDelta', () => {
  it('detects new rumors', () => {
    const rumors = [
      { claim: 'The wanderer is dangerous', spreadTo: ['guardians'], mutationCount: 0, originTick: 1 } as any,
      { claim: 'The wanderer stole from the altar', spreadTo: ['guardians', 'thieves'], mutationCount: 1, originTick: 2 } as any,
    ];
    const delta = computeRumorDelta(0, rumors);
    expect(delta.spawned).toBe(2);
    expect(delta.mutated).toBe(1);
    expect(delta.totalSpread).toBe(3);
  });

  it('no new rumors yields zero delta', () => {
    const rumors = [
      { claim: 'a', spreadTo: [], mutationCount: 0, originTick: 1 },
      { claim: 'b', spreadTo: [], mutationCount: 0, originTick: 2 },
      { claim: 'c', spreadTo: [], mutationCount: 0, originTick: 3 },
    ] as any;
    const delta = computeRumorDelta(3, rumors);
    expect(delta.spawned).toBe(0);
  });
});

// ─── What People Are Saying ───────────────────────────────────

describe('deriveWhatPeopleAreSaying', () => {
  it('maps reputation to correct sentiment', () => {
    const reputation = [
      { factionId: 'a', value: -60 },  // hostile
      { factionId: 'b', value: -30 },  // wary
      { factionId: 'c', value: 0 },    // neutral
      { factionId: 'd', value: 30 },   // friendly
      { factionId: 'e', value: 60 },   // admiring
    ];
    const names: Record<string, string> = { a: 'A', b: 'B', c: 'C', d: 'D', e: 'E' };
    const result = deriveWhatPeopleAreSaying([], reputation, names);
    const sentiments = Object.fromEntries(result.map((r) => [r.factionId, r.sentiment]));
    expect(sentiments['a']).toBe('hostile');
    expect(sentiments['b']).toBe('wary');
    // neutral may be filtered out
    expect(sentiments['d']).toBe('friendly');
    expect(sentiments['e']).toBe('admiring');
  });

  it('neutral with no rumors is filtered out', () => {
    const reputation = [{ factionId: 'x', value: 0 }];
    const result = deriveWhatPeopleAreSaying([], reputation, { x: 'X' });
    expect(result.find((r) => r.factionId === 'x')).toBeUndefined();
  });
});
