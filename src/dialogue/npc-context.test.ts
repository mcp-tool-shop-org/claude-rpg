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

import { getCognition, getEntityFaction, getRumorsFrom, formatOpportunityForDialogue, type CognitionState, type RumorRecord, type NpcActionResult, type OpportunityState } from '@ai-rpg-engine/modules';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
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

// F-5c8be67d: `modules: {}` matches every real WorldState (the field is
// required, non-optional -- @ai-rpg-engine/core's WorldState.modules:
// Record<string, unknown>). Needed now that buildNPCDialogueContext falls
// back to getPersistedNpcLastActions(world) whenever a test omits
// lastNpcActions -- that accessor reads world.modules['npc-agency'], which
// throws on a bare `undefined` modules field rather than degrading. Every
// existing test in this file that doesn't pass lastNpcActions now exercises
// that fallback path, so this fixture gap had to be closed for them to keep
// passing, not just for this file's own new F-5c8be67d tests below.
function makeWorld(): WorldState {
  return {
    entities: {
      'npc-1': { id: 'npc-1', name: 'Town Guard', type: 'npc', tags: [] },
    },
    modules: {},
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

// F-5c8be67d: npcRecentAction now sources lastNpcActions from
// getPersistedNpcLastActions(world) whenever the caller omits the
// lastNpcActions argument, instead of silently staying undefined. An
// explicitly-passed array (even empty) still takes precedence.
describe('buildNPCDialogueContext F-5c8be67d: lastNpcActions sourced from world when omitted', () => {
  it('populates npcRecentAction from world.modules[\'npc-agency\'] when no lastNpcActions argument is passed', () => {
    mockedGetCognition.mockReturnValue(makeCognition());
    mockedGetRumorsFrom.mockReturnValue([]);
    const world = makeWorld();
    (world.modules as Record<string, unknown>)['npc-agency'] = {
      lastActions: [
        {
          action: { npcId: 'npc-1', verb: 'warn', description: 'warns' },
          dialogueHint: 'The guard eyes you warily, still shaken from the warning.',
          narratorHint: 'x',
          effects: [],
        } as unknown as NpcActionResult,
      ],
    };

    const ctx = buildNPCDialogueContext(world, 'npc-1', 'hello', 'dark fantasy');

    expect(ctx!.npcRecentAction).toBe('The guard eyes you warily, still shaken from the warning.');
  });

  it('leaves npcRecentAction undefined when persisted lastActions has no entry for this NPC', () => {
    mockedGetCognition.mockReturnValue(makeCognition());
    mockedGetRumorsFrom.mockReturnValue([]);

    const ctx = buildNPCDialogueContext(makeWorld(), 'npc-1', 'hello', 'dark fantasy');

    expect(ctx!.npcRecentAction).toBeUndefined();
  });

  it('still prefers an explicitly-passed lastNpcActions argument over the persisted world state', () => {
    mockedGetCognition.mockReturnValue(makeCognition());
    mockedGetRumorsFrom.mockReturnValue([]);
    const world = makeWorld();
    (world.modules as Record<string, unknown>)['npc-agency'] = {
      lastActions: [
        {
          action: { npcId: 'npc-1' },
          dialogueHint: 'from persisted world state',
          narratorHint: 'x',
          effects: [],
        } as unknown as NpcActionResult,
      ],
    };
    const explicitActions: NpcActionResult[] = [
      {
        action: { npcId: 'npc-1' },
        dialogueHint: 'from the explicit argument',
        narratorHint: 'x',
        effects: [],
      } as unknown as NpcActionResult,
    ];

    const ctx = buildNPCDialogueContext(world, 'npc-1', 'hello', 'dark fantasy', undefined, undefined, undefined, undefined, explicitActions);

    expect(ctx!.npcRecentAction).toBe('from the explicit argument');
  });
});

// F-962e800b: locks in the deliberate, investigated decision NOT to switch
// dialogueBias's reputation source to the world.factions/world.globals merge
// dialogue-core.ts's private helper uses. See npc-context.ts's own doc
// comment on this line for the full investigation. This fixture sets up a
// case where the two stores would disagree sharply -- profile says +40
// (favorable), world.factions/world.globals together say -65 (hostile) -- to
// prove which one actually drives playerRelationship today.
describe('buildNPCDialogueContext F-962e800b: dialogueBias reads CharacterProfile reputation', () => {
  it('reflects playerProfile.reputation even when world.factions/world.globals disagree', () => {
    mockedGetCognition.mockReturnValue(makeCognition());
    mockedGetRumorsFrom.mockReturnValue([]);
    mockedGetEntityFaction.mockReturnValue('faction-1');

    const world = makeWorld();
    (world as unknown as { factions: Record<string, { id: string; name: string; reputation: number; disposition: string }> }).factions = {
      'faction-1': { id: 'faction-1', name: 'Test Faction', reputation: -35, disposition: 'hostile' },
    };
    (world as unknown as { globals: Record<string, number> }).globals = {
      'reputation_faction-1': -30,
    };
    // world.factions (-35) + world.globals (-30) = -65 -- would derive
    // 'hostile' / 'This one is not welcome here.' if this line read that
    // store instead.

    const playerProfile = { reputation: [{ factionId: 'faction-1', value: 40 }] } as unknown as CharacterProfile;

    const ctx = buildNPCDialogueContext(world, 'npc-1', 'hello', 'dark fantasy', undefined, playerProfile);

    // Profile value of +40 derives 'kinship' / 'A friend of the faction.' --
    // the OPPOSITE of what the world-store value would have produced.
    expect(ctx!.playerRelationship).toBe('kinship — A friend of the faction.');
  });
});

// F-d8184410: opportunityHint is speaker-scoped (getOpportunitiesForNpc),
// distinct from the pre-existing world-scoped opportunityContext plumbing.
function makeOpportunity(overrides: Partial<OpportunityState> = {}): OpportunityState {
  return {
    id: 'opp-0',
    kind: 'contract',
    status: 'available',
    title: 'Recover the stolen ledger',
    description: 'The scribe wants her ledger back.',
    objectiveDescription: 'Recover the ledger from the thieves.',
    linkedRumorIds: [],
    linkedNpcIds: [],
    tags: [],
    rewards: [],
    risks: [],
    visibility: 'known',
    urgency: 0.5,
    turnsRemaining: 10,
    createdAtTick: 0,
    genre: 'fantasy',
    ...overrides,
  } as OpportunityState;
}

describe('buildNPCDialogueContext F-d8184410: opportunityHint speaker-scoping', () => {
  it('surfaces the opportunity tied to THIS npc, not a different NPC\'s opportunity', () => {
    mockedGetCognition.mockReturnValue(makeCognition());
    mockedGetRumorsFrom.mockReturnValue([]);

    const npc1Opportunity = makeOpportunity({ id: 'opp-npc1', sourceNpcId: 'npc-1', status: 'available' });
    const npc2Opportunity = makeOpportunity({ id: 'opp-npc2', sourceNpcId: 'npc-2', status: 'accepted', urgency: 0.9, title: 'Deliver the sealed letter' });

    const ctx = buildNPCDialogueContext(
      makeWorld(), 'npc-1', 'hello', 'dark fantasy',
      undefined, undefined, undefined, undefined, undefined,
      [npc1Opportunity, npc2Opportunity],
    );

    // npc-2's opportunity has HIGHER urgency (0.9 vs 0.5) but belongs to a
    // different NPC -- proving this is speaker-scoped, not just
    // highest-urgency-overall (which the existing world-scoped
    // opportunityContext plumbing would get wrong).
    expect(ctx!.opportunityHint).toBe(formatOpportunityForDialogue(npc1Opportunity));
    expect(ctx!.opportunityHint).not.toContain(npc2Opportunity.title);
  });

  it('leaves opportunityHint undefined for a hidden-visibility opportunity', () => {
    mockedGetCognition.mockReturnValue(makeCognition());
    mockedGetRumorsFrom.mockReturnValue([]);

    const hiddenOpportunity = makeOpportunity({ sourceNpcId: 'npc-1', visibility: 'hidden' });

    const ctx = buildNPCDialogueContext(
      makeWorld(), 'npc-1', 'hello', 'dark fantasy',
      undefined, undefined, undefined, undefined, undefined,
      [hiddenOpportunity],
    );

    expect(ctx!.opportunityHint).toBeUndefined();
  });

  it('leaves opportunityHint undefined when activeOpportunities is omitted', () => {
    mockedGetCognition.mockReturnValue(makeCognition());
    mockedGetRumorsFrom.mockReturnValue([]);

    const ctx = buildNPCDialogueContext(makeWorld(), 'npc-1', 'hello', 'dark fantasy');

    expect(ctx!.opportunityHint).toBeUndefined();
  });
});

// F-ff0b4af6: textureHint (zone-scoped body language from generateNpcTextures)
// and partyPresence (pre-formatted party line, threaded like playerPresence).
describe('buildNPCDialogueContext F-ff0b4af6: textureHint', () => {
  it('leaves textureHint undefined for an NPC with no npc.ai profile', () => {
    mockedGetCognition.mockReturnValue(makeCognition());
    mockedGetRumorsFrom.mockReturnValue([]);

    const ctx = buildNPCDialogueContext(makeWorld(), 'npc-1', 'hello', 'dark fantasy');

    expect(ctx!.textureHint).toBeUndefined();
  });

  it('leaves textureHint undefined when the ai-bearing NPC is in a different zone than the player (generateNpcTextures is zone-scoped)', () => {
    const engine = createGame();
    const npcId = Object.keys(engine.world.entities).find(
      (id) => id !== engine.world.playerId && engine.world.entities[id].zoneId === engine.world.entities[engine.world.playerId].zoneId,
    );
    expect(npcId).toBeDefined();
    const npc = engine.world.entities[npcId!] as unknown as { ai?: unknown; zoneId?: string };
    npc.ai = { profileId: 'cautious', goals: [], fears: [], alertLevel: 0, knowledge: {} };
    npc.zoneId = 'a-different-zone-the-player-is-not-in';
    mockedGetCognition.mockReturnValue(makeCognition());
    mockedGetRumorsFrom.mockReturnValue([]);

    const ctx = buildNPCDialogueContext(engine.world, npcId!, 'hello', 'dark fantasy');

    expect(ctx!.textureHint).toBeUndefined();
  });

  it('populates textureHint for a same-zone npc.ai-bearing NPC with a strong relationship signal (real engine fixture)', () => {
    const engine = createGame();
    const playerZoneId = engine.world.entities[engine.world.playerId].zoneId;
    const npcId = Object.keys(engine.world.entities).find(
      (id) => id !== engine.world.playerId && engine.world.entities[id].zoneId === playerZoneId,
    );
    expect(npcId).toBeDefined();
    const npc = engine.world.entities[npcId!] as unknown as { ai?: unknown; custom?: Record<string, unknown> };
    // F-ff0b4af6: `ai` gates buildNPCDialogueContext's whole texture/agency
    // block. `custom.greed` (deriveNpcRelationship's documented direct
    // override) pushes the greed axis past 60; combined with this NPC
    // already sharing the player's zone, deriveNpcGoals' rule 5
    // ("High greed + player present -> bargain") is the ONLY goal-producing
    // rule any of trust=0/fear=0/loyalty=0 (this NPC's neutral defaults with
    // no faction) can satisfy, so it deterministically becomes goals[0] --
    // and deriveTextureHint's `rel.greed > 60 && topGoal.verb === 'bargain'`
    // branch returns a non-null hint for exactly that combination.
    npc.ai = { profileId: 'cautious', goals: [], fears: [], alertLevel: 0, knowledge: {} };
    npc.custom = { ...(npc.custom ?? {}), greed: 90 };
    mockedGetCognition.mockReturnValue(makeCognition());
    mockedGetRumorsFrom.mockReturnValue([]);

    const ctx = buildNPCDialogueContext(engine.world, npcId!, 'hello', 'dark fantasy');

    expect(typeof ctx!.textureHint).toBe('string');
    expect(ctx!.textureHint!.length).toBeGreaterThan(0);
    expect(ctx!.textureHint).toContain('appraising look');
  });
});

describe('buildNPCDialogueContext F-ff0b4af6: partyPresence', () => {
  it('passes the partyPresence argument straight through onto the returned context', () => {
    mockedGetCognition.mockReturnValue(makeCognition());
    mockedGetRumorsFrom.mockReturnValue([]);

    const ctx = buildNPCDialogueContext(
      makeWorld(), 'npc-1', 'hello', 'dark fantasy',
      undefined, undefined, undefined, undefined, undefined, undefined,
      'Accompanied by Rowan (fighter, confident)',
    );

    expect(ctx!.partyPresence).toBe('Accompanied by Rowan (fighter, confident)');
  });

  it('leaves partyPresence undefined when omitted', () => {
    mockedGetCognition.mockReturnValue(makeCognition());
    mockedGetRumorsFrom.mockReturnValue([]);

    const ctx = buildNPCDialogueContext(makeWorld(), 'npc-1', 'hello', 'dark fantasy');

    expect(ctx!.partyPresence).toBeUndefined();
  });
});
