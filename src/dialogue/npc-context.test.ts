import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorldState, EntityState } from '@ai-rpg-engine/core';
import type { Belief } from '@ai-rpg-engine/modules';

// Mock only the specific engine-package functions buildNPCDialogueContext
// calls, mirroring src/npc/agency.test.ts's established pattern: spread the
// real module via importOriginal so pure/simple helpers (deriveStance,
// getReputationConsequence, etc.) keep running for real, and override just
// the handful this test needs to control directly.
vi.mock('@ai-rpg-engine/modules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ai-rpg-engine/modules')>();
  return {
    ...actual,
    getCognition: vi.fn(),
    getEntityFaction: vi.fn(),
    getRumorsFrom: vi.fn(),
  };
});

import { getCognition, getEntityFaction, getRumorsFrom, type CognitionState, type RumorRecord } from '@ai-rpg-engine/modules';
import { buildNPCDialogueContext, deriveNpcPersonality } from './npc-context.js';

const mockedGetCognition = vi.mocked(getCognition);
const mockedGetEntityFaction = vi.mocked(getEntityFaction);
const mockedGetRumorsFrom = vi.mocked(getRumorsFrom);

beforeEach(() => {
  vi.clearAllMocks();
  // No faction for this NPC by default -- short-circuits the
  // knownPlayerRumors/factionPressures branches (both guarded on `factionId
  // && ...`) so these tests can focus purely on the beliefs/rumors caps
  // without needing to also fixture faction cognition state.
  mockedGetEntityFaction.mockReturnValue(undefined);
});

function makeWorld(): WorldState {
  return {
    entities: {
      'npc-1': { id: 'npc-1', name: 'Town Guard', type: 'npc', tags: [] },
    },
  } as unknown as WorldState;
}

function makeCognition(overrides: Partial<CognitionState> = {}): CognitionState {
  return {
    beliefs: [],
    memories: [],
    currentIntent: null,
    morale: 50,
    suspicion: 30,
    ...overrides,
  };
}

function makeBelief(overrides: Partial<Belief> = {}): Belief {
  return {
    subject: 'player',
    key: 'trust',
    value: true,
    confidence: 0.5,
    source: 'observation',
    tick: 1,
    ...overrides,
  };
}

function makeRumor(overrides: Partial<RumorRecord> = {}): RumorRecord {
  return {
    id: 'r0',
    sourceEntityId: 'npc-1',
    targetFactionId: 'faction-1',
    subject: 'player',
    key: 'deed',
    value: 'unknown',
    confidence: 0.5,
    distortion: 0,
    originTick: 0,
    hops: 0,
    ...overrides,
  };
}

// F-b52349e0: beliefs (cognition?.beliefs ?? []) and rumors (getRumorsFrom())
// were the only two array-shaped fields buildNPCDialogueContext folds into
// dialogue context with NO cap at all -- recentMemories/knownPlayerRumors/
// factionPressures all already had one. Both grow unboundedly over a long
// campaign (beliefs decay/prune by confidence rather than hard count; the
// rumor log has no limit), so a major faction leader or recurring companion
// could accumulate an ever-larger interpolated block for the rest of the
// campaign.
describe('buildNPCDialogueContext F-b52349e0: beliefs cap', () => {
  it('caps beliefs, keeping the highest-confidence ones', () => {
    const beliefs = Array.from({ length: 12 }, (_, i) =>
      makeBelief({ key: `fact-${i}`, confidence: i / 20 }), // 0, 0.05, ..., 0.55
    );
    mockedGetCognition.mockReturnValue(makeCognition({ beliefs }));
    mockedGetRumorsFrom.mockReturnValue([]);

    const ctx = buildNPCDialogueContext(makeWorld(), 'npc-1', 'hello', 'dark fantasy');

    expect(ctx).not.toBeNull();
    expect(ctx!.beliefs.length).toBeLessThan(12);
    expect(ctx!.beliefs.length).toBeLessThanOrEqual(8);
    // The highest-confidence beliefs (fact-11 at .55 down to fact-4 at .20)
    // survive; low-confidence ones (fact-0..fact-3) are dropped.
    const survivingKeys = ctx!.beliefs.map((b) => b.key);
    expect(survivingKeys).toContain('fact-11');
    expect(survivingKeys).not.toContain('fact-0');
    // Sorted highest-confidence-first.
    for (let i = 1; i < ctx!.beliefs.length; i++) {
      expect(ctx!.beliefs[i - 1].confidence).toBeGreaterThanOrEqual(ctx!.beliefs[i].confidence);
    }
  });

  it('leaves beliefs under the cap untouched', () => {
    const beliefs = [makeBelief({ key: 'a', confidence: 0.9 }), makeBelief({ key: 'b', confidence: 0.1 })];
    mockedGetCognition.mockReturnValue(makeCognition({ beliefs }));
    mockedGetRumorsFrom.mockReturnValue([]);

    const ctx = buildNPCDialogueContext(makeWorld(), 'npc-1', 'hello', 'dark fantasy');

    expect(ctx!.beliefs.length).toBe(2);
    expect(ctx!.beliefs.map((b) => b.key)).toEqual(['a', 'b']);
  });
});

// Null cognition guard, mirroring src/npc/agency.test.ts's BR-007 pattern:
// getCognition returns null for NPCs with no initialized cognition state, and
// every other use of it in buildNPCDialogueContext is optional-chained -- but
// the deriveStance call passed the raw value into a non-nullable parameter,
// crashing (TypeError reading 'suspicion') instead of degrading to defaults.
describe('buildNPCDialogueContext: null cognition guard', () => {
  it('does not throw when getCognition returns null, falling back to 50/30 defaults', () => {
    mockedGetCognition.mockReturnValue(null as any);
    mockedGetRumorsFrom.mockReturnValue([]);

    let ctx: ReturnType<typeof buildNPCDialogueContext>;
    expect(() => {
      ctx = buildNPCDialogueContext(makeWorld(), 'npc-1', 'hello', 'dark fantasy');
    }).not.toThrow();

    expect(ctx!).not.toBeNull();
    expect(ctx!.morale).toBe(50);
    expect(ctx!.suspicion).toBe(30);
    // Neutral rep + default cognition + no alert derives the neutral stance.
    expect(ctx!.playerRelationship).toContain('neutral');
  });

  it('does not throw when getCognition returns undefined', () => {
    mockedGetCognition.mockReturnValue(undefined as any);
    mockedGetRumorsFrom.mockReturnValue([]);

    expect(() =>
      buildNPCDialogueContext(makeWorld(), 'npc-1', 'hello', 'dark fantasy'),
    ).not.toThrow();
  });
});

describe('buildNPCDialogueContext F-b52349e0: rumors cap', () => {
  it('caps rumors, keeping the most recent by originTick', () => {
    mockedGetCognition.mockReturnValue(makeCognition());
    const rumors = Array.from({ length: 9 }, (_, i) =>
      makeRumor({ id: `r${i}`, value: `deed-${i}`, originTick: i }),
    );
    mockedGetRumorsFrom.mockReturnValue(rumors);

    const ctx = buildNPCDialogueContext(makeWorld(), 'npc-1', 'hello', 'dark fantasy');

    expect(ctx).not.toBeNull();
    expect(ctx!.rumors.length).toBeLessThan(9);
    expect(ctx!.rumors.length).toBeLessThanOrEqual(5);
    // Most recent originTicks (8, 7, ...) survive; oldest (originTick 0) is dropped.
    expect(ctx!.rumors.some((r) => r.includes('deed-8'))).toBe(true);
    expect(ctx!.rumors.some((r) => r.includes('deed-0'))).toBe(false);
  });

  it('leaves rumors under the cap untouched', () => {
    mockedGetCognition.mockReturnValue(makeCognition());
    mockedGetRumorsFrom.mockReturnValue([makeRumor({ value: 'only-one' })]);

    const ctx = buildNPCDialogueContext(makeWorld(), 'npc-1', 'hello', 'dark fantasy');

    expect(ctx!.rumors.length).toBe(1);
    expect(ctx!.rumors[0]).toContain('only-one');
  });
});

// F-c8c8c67c (SLATE-1) / Coordinator Brief contract #1: closed-set
// personality classifier for callers outside this file (game-core's
// turn-loop.ts, this domain's own ambient-dialogue.ts). Mirrors
// prompts/dialogue-npc.ts's resolveVoiceArchetype() tests (FT-BR-005)
// one-for-one, plus the 'default' fallback resolveVoiceArchetype itself
// doesn't provide.
describe('deriveNpcPersonality (F-c8c8c67c / Coordinator Brief contract #1)', () => {
  function makeEntity(overrides: Partial<EntityState> = {}): EntityState {
    return { id: 'npc-1', blueprintId: 'x', type: 'npc', name: 'Test NPC', tags: [], stats: {}, resources: {}, statuses: [], ...overrides } as EntityState;
  }

  it('classifies by tags the same way resolveVoiceArchetype does', () => {
    expect(deriveNpcPersonality(makeEntity({ tags: ['merchant'] }))).toBe('merchant');
    expect(deriveNpcPersonality(makeEntity({ tags: ['guard', 'patrol'] }))).toBe('guard');
    expect(deriveNpcPersonality(makeEntity({ tags: ['mage'] }))).toBe('scholar');
    expect(deriveNpcPersonality(makeEntity({ tags: ['thief'] }))).toBe('rogue');
    expect(deriveNpcPersonality(makeEntity({ tags: ['lord'] }))).toBe('noble');
  });

  it('classifies by entity type when tags do not match', () => {
    expect(deriveNpcPersonality(makeEntity({ type: 'guard', tags: [] }))).toBe('guard');
  });

  it('returns "default" (not undefined) for an entity resolveVoiceArchetype cannot classify', () => {
    expect(deriveNpcPersonality(makeEntity({ type: 'npc', tags: ['farmer'] }))).toBe('default');
  });
});
