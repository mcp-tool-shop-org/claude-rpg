import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWorldGenProposal, generateWorld, proposeWorld, instantiateWorld, KNOWN_WORLDGEN_GENRES } from './world-gen.js';
import type { WorldGenProposal, WorldGenAttemptInfo, WorldStackTuning } from './world-gen.js';
import type { ClaudeClient } from '../claude-client.js';
import { Engine } from '@ai-rpg-engine/core';
import type { RulesetDefinition } from '@ai-rpg-engine/core';
import {
  getFactionMembers,
  getAllDistrictIds,
  getDistrictDefinition,
  getDistrictMetric,
  modifyDistrictMetric,
  traversalCore,
  statusCore,
  combatCore,
  createCognitionCore,
  createPerceptionFilter,
  createSimulationInspector,
  buildWorldStack, getQuestDefinitions,
  runEncounterSpawnStep } from '@ai-rpg-engine/modules';
import { createTestLogger } from '../game/debug-logger.js';

// WO-A1-1 (§1): a minimal, valid RulesetDefinition for the double-registration
// proof below, which constructs an Engine directly (not through
// generateWorld) so it can deliberately duplicate a stack module.
const MINIMAL_RULESET: RulesetDefinition = {
  id: 'dup-test-rules',
  name: 'Dup Test Rules',
  version: '1.0.0',
  stats: [{ id: 'str', name: 'Strength', min: 0, max: 100, default: 10 }],
  resources: [{ id: 'hp', name: 'HP', min: 0, max: 100, default: 100 }],
  verbs: [],
  formulas: [],
  defaultModules: [],
  progressionModels: [],
};

function makeValidProposal(): WorldGenProposal {
  return {
    title: 'Test World',
    theme: 'fantasy',
    toneGuide: 'dark and brooding',
    ruleset: {
      id: 'test-rules',
      name: 'Test Rules',
      stats: [{ id: 'str', name: 'Strength', default: 10 }],
      resources: [{ id: 'hp', name: 'HP', default: 100, max: 100 }],
    },
    zones: [
      { id: 'town-square', roomId: 'town-square', name: 'Town Square', tags: [], neighbors: ['market'], light: 7 },
      { id: 'market', roomId: 'market', name: 'Market', tags: [], neighbors: ['town-square'], light: 5 },
    ],
    factions: [
      { id: 'guard', name: 'Town Guard', disposition: 'neutral', description: 'Protectors', memberIds: ['guard-1'] },
    ],
    npcs: [
      {
        id: 'guard-1',
        name: 'Guard Captain',
        type: 'npc',
        tags: ['guard'],
        zoneId: 'town-square',
        personality: 'stern',
        goals: ['protect the town'],
        stats: { str: 12 },
        resources: { hp: 80 },
        beliefs: [{ subject: 'town', key: 'safety', value: 'high', confidence: 0.8 }],
      },
    ],
    player: {
      name: 'Hero',
      stats: { str: 10 },
      resources: { hp: 100 },
      startZoneId: 'town-square',
    },
    quests: [
      { id: 'q1', name: 'First Quest', description: 'Do something', stages: [{ id: 's1', description: 'Step 1' }] },
    ],
  };
}

describe('validateWorldGenProposal (BR-009)', () => {
  it('should return no errors for a valid proposal', () => {
    const errors = validateWorldGenProposal(makeValidProposal());
    expect(errors).toEqual([]);
  });

  it('should detect NPC missing id', () => {
    const proposal = makeValidProposal();
    proposal.npcs[0].id = '';
    const errors = validateWorldGenProposal(proposal);
    expect(errors).toContain('NPC missing required field: id');
  });

  it('should detect NPC missing name', () => {
    const proposal = makeValidProposal();
    proposal.npcs[0].name = '';
    const errors = validateWorldGenProposal(proposal);
    expect(errors.some((e) => e.includes('missing required field: name'))).toBe(true);
  });

  it('should detect NPC missing zoneId', () => {
    const proposal = makeValidProposal();
    proposal.npcs[0].zoneId = '';
    const errors = validateWorldGenProposal(proposal);
    expect(errors.some((e) => e.includes('missing required field: zoneId'))).toBe(true);
  });

  it('should detect NPC with zoneId that does not match any zone', () => {
    const proposal = makeValidProposal();
    proposal.npcs[0].zoneId = 'nonexistent-zone';
    const errors = validateWorldGenProposal(proposal);
    expect(errors.some((e) => e.includes('does not match any zone'))).toBe(true);
  });

  it('should detect zone missing id', () => {
    const proposal = makeValidProposal();
    proposal.zones[0].id = '';
    const errors = validateWorldGenProposal(proposal);
    expect(errors).toContain('Zone missing required field: id');
  });

  it('should detect zone missing name', () => {
    const proposal = makeValidProposal();
    proposal.zones[0].name = '';
    const errors = validateWorldGenProposal(proposal);
    expect(errors.some((e) => e.includes('missing required field: name'))).toBe(true);
  });

  it('should detect player startZoneId not matching any zone', () => {
    const proposal = makeValidProposal();
    proposal.player.startZoneId = 'does-not-exist';
    const errors = validateWorldGenProposal(proposal);
    expect(errors.some((e) => e.includes('does not match any zone'))).toBe(true);
  });

  it('should detect player missing startZoneId', () => {
    const proposal = makeValidProposal();
    proposal.player.startZoneId = '';
    const errors = validateWorldGenProposal(proposal);
    expect(errors).toContain('Player missing required field: startZoneId');
  });

  it('should detect empty zones array', () => {
    const proposal = makeValidProposal();
    proposal.zones = [];
    const errors = validateWorldGenProposal(proposal);
    expect(errors).toContain('No zones generated');
  });

  it('should detect empty npcs array', () => {
    const proposal = makeValidProposal();
    proposal.npcs = [];
    const errors = validateWorldGenProposal(proposal);
    expect(errors).toContain('No NPCs generated');
  });

  // F-d68e103d: validateWorldGenProposal never checked proposal.ruleset at all, so a
  // proposal missing it (or missing ruleset.stats/resources) sailed through validation
  // with zero errors and then threw a raw TypeError at `proposal.ruleset.id` during
  // Engine construction instead of surfacing here as a specific message.
  it('should detect missing ruleset entirely (F-d68e103d)', () => {
    const proposal = makeValidProposal();
    (proposal as any).ruleset = undefined;
    const errors = validateWorldGenProposal(proposal);
    expect(errors).toContain('No ruleset generated');
  });

  it('should detect ruleset missing id (F-d68e103d)', () => {
    const proposal = makeValidProposal();
    (proposal.ruleset as any).id = '';
    const errors = validateWorldGenProposal(proposal);
    expect(errors).toContain('Ruleset missing required field: id');
  });

  it('should detect ruleset missing name (F-d68e103d)', () => {
    const proposal = makeValidProposal();
    (proposal.ruleset as any).name = '';
    const errors = validateWorldGenProposal(proposal);
    expect(errors).toContain('Ruleset missing required field: name');
  });

  it('should detect ruleset with non-array stats (F-d68e103d)', () => {
    const proposal = makeValidProposal();
    (proposal.ruleset as any).stats = undefined;
    const errors = validateWorldGenProposal(proposal);
    expect(errors).toContain('Ruleset missing required field: stats');
  });

  it('should detect ruleset with non-array resources (F-d68e103d)', () => {
    const proposal = makeValidProposal();
    (proposal.ruleset as any).resources = 'not-an-array';
    const errors = validateWorldGenProposal(proposal);
    expect(errors).toContain('Ruleset missing required field: resources');
  });

  // F-dd5436c0: proposal.factions[].memberIds was never validated. memberIds feeds
  // createFactionCognition eagerly during Engine construction (module config is built
  // synchronously before the Engine constructor runs), and the compiled module throws
  // `entityIds is not iterable` the instant a faction's entityIds is undefined.
  it('should detect faction missing id (F-dd5436c0)', () => {
    const proposal = makeValidProposal();
    (proposal.factions[0] as any).id = '';
    const errors = validateWorldGenProposal(proposal);
    expect(errors).toContain('Faction missing required field: id');
  });

  it('should detect faction with non-array memberIds (F-dd5436c0)', () => {
    const proposal = makeValidProposal();
    (proposal.factions[0] as any).memberIds = undefined;
    const errors = validateWorldGenProposal(proposal);
    expect(errors.some((e) => e.includes('memberIds'))).toBe(true);
  });

  it('should allow a faction with an empty memberIds array (F-dd5436c0)', () => {
    const proposal = makeValidProposal();
    proposal.factions[0].memberIds = [];
    const errors = validateWorldGenProposal(proposal);
    expect(errors).toEqual([]);
  });

  // F-840c1a1c: title/toneGuide and every zone/npc/faction name were typed as bare
  // `string` with only a truthy presence check (`if (!x)`), which a whitespace-only
  // LLM output like "   " silently passes since non-empty whitespace is truthy in JS.
  // Nothing capped length either. The immediate consumer is the player's very first
  // screen (play-renderer.ts's renderWelcome()), which frames title/toneGuide between
  // two terminal-width-clamped divider rules with no wrapping/truncation of its own —
  // an overlong or blank LLM name breaks that framed layout on first impression.
  describe('name-field guards (F-840c1a1c)', () => {
    it('should detect a whitespace-only title', () => {
      const proposal = makeValidProposal();
      proposal.title = '   ';
      const errors = validateWorldGenProposal(proposal);
      expect(errors.some((e) => e.includes('Title') && e.includes('blank'))).toBe(true);
    });

    it('should detect a missing title', () => {
      const proposal = makeValidProposal();
      (proposal as any).title = '';
      const errors = validateWorldGenProposal(proposal);
      expect(errors).toContain('No title generated');
    });

    it('should detect a title over the length cap', () => {
      const proposal = makeValidProposal();
      proposal.title = 'A'.repeat(81);
      const errors = validateWorldGenProposal(proposal);
      expect(errors.some((e) => e.includes('Title') && e.includes('exceeds'))).toBe(true);
    });

    it('should allow a title at exactly the length cap', () => {
      const proposal = makeValidProposal();
      proposal.title = 'A'.repeat(80);
      const errors = validateWorldGenProposal(proposal);
      expect(errors).toEqual([]);
    });

    it('should detect a whitespace-only toneGuide', () => {
      const proposal = makeValidProposal();
      proposal.toneGuide = '   ';
      const errors = validateWorldGenProposal(proposal);
      expect(errors.some((e) => e.includes('toneGuide') && e.includes('blank'))).toBe(true);
    });

    it('should detect a toneGuide over the length cap', () => {
      const proposal = makeValidProposal();
      proposal.toneGuide = 'dark and brooding '.repeat(10);
      const errors = validateWorldGenProposal(proposal);
      expect(errors.some((e) => e.includes('toneGuide') && e.includes('exceeds'))).toBe(true);
    });

    it('should NOT flag a missing/empty toneGuide — it stays optional (WorldGenResult falls back to "")', () => {
      const proposal = makeValidProposal();
      (proposal as any).toneGuide = undefined;
      const errors = validateWorldGenProposal(proposal);
      expect(errors).toEqual([]);
    });

    it('should detect a whitespace-only NPC name distinct from a missing one', () => {
      const proposal = makeValidProposal();
      proposal.npcs[0].name = '   ';
      const errors = validateWorldGenProposal(proposal);
      expect(errors.some((e) => e.includes('name') && e.includes('blank'))).toBe(true);
      // Must not ALSO report it as the pre-existing "missing required field" case —
      // the two are distinct failure modes with distinct messages.
      expect(errors.some((e) => e.includes('missing required field: name'))).toBe(false);
    });

    it('should detect an NPC name over the length cap', () => {
      const proposal = makeValidProposal();
      proposal.npcs[0].name = 'B'.repeat(81);
      const errors = validateWorldGenProposal(proposal);
      expect(errors.some((e) => e.includes('name') && e.includes('exceeds'))).toBe(true);
    });

    it('should detect a whitespace-only zone name', () => {
      const proposal = makeValidProposal();
      proposal.zones[0].name = '   ';
      const errors = validateWorldGenProposal(proposal);
      expect(errors.some((e) => e.includes('name') && e.includes('blank'))).toBe(true);
    });

    it('should detect a zone name over the length cap', () => {
      const proposal = makeValidProposal();
      proposal.zones[0].name = 'C'.repeat(81);
      const errors = validateWorldGenProposal(proposal);
      expect(errors.some((e) => e.includes('name') && e.includes('exceeds'))).toBe(true);
    });

    it('should detect a whitespace-only faction name (previously unchecked at all)', () => {
      const proposal = makeValidProposal();
      proposal.factions[0].name = '   ';
      const errors = validateWorldGenProposal(proposal);
      expect(errors.some((e) => e.includes('name') && e.includes('blank'))).toBe(true);
    });

    it('should detect a faction name over the length cap', () => {
      const proposal = makeValidProposal();
      proposal.factions[0].name = 'D'.repeat(81);
      const errors = validateWorldGenProposal(proposal);
      expect(errors.some((e) => e.includes('name') && e.includes('exceeds'))).toBe(true);
    });

    it('should still return no errors for a valid proposal with normal-length names', () => {
      const errors = validateWorldGenProposal(makeValidProposal());
      expect(errors).toEqual([]);
    });
  });
});

function makeMockClient(proposal: ReturnType<typeof makeValidProposal>): ClaudeClient {
  return {
    model: 'test-model',
    generate: vi.fn().mockResolvedValue({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
    generateStructured: vi.fn().mockResolvedValue({ ok: true, data: proposal, raw: '' }),
  };
}

describe('generateWorld (BR-018)', () => {
  it('should use provided seed for deterministic generation', async () => {
    const proposal = makeValidProposal();
    const client = makeMockClient(proposal);
    const result = await generateWorld(client, 'A test world', 42);

    expect(result.ok).toBe(true);
    expect(result.engine).not.toBeNull();
    expect(result.engine!.store.state.meta.seed).toBe(42);
  });

  it('should assign a random numeric seed when none provided', async () => {
    const proposal = makeValidProposal();
    const client = makeMockClient(proposal);
    const result = await generateWorld(client, 'A test world');

    expect(result.ok).toBe(true);
    expect(result.engine).not.toBeNull();
    expect(typeof result.engine!.store.state.meta.seed).toBe('number');
  });

  it('should warn when NPC beliefs fail due to missing cognition (BR-010)', async () => {
    const proposal = makeValidProposal();
    proposal.npcs[0].beliefs = [
      { subject: 'player', key: 'trust', value: 'low', confidence: 0.5 },
    ];

    const client = makeMockClient(proposal);
    const result = await generateWorld(client, 'A test world', 99);

    // World gen succeeds regardless of belief initialization
    expect(result.ok).toBe(true);

    // The cognition module is included so beliefs likely succeed,
    // but the code path handles both cases without crashing. F-e23cc3ac: the
    // diagnostic itself is now gated behind the optional DebugLogger (see the
    // "world-gen PBR-001"/"PBR-007" describe blocks below for direct
    // coverage), so no console spy is needed just to keep this test quiet.
  });

  it('should return errors when LLM client fails', async () => {
    const client: ClaudeClient = {
      model: 'test-model',
      generate: vi.fn(),
      generateStructured: vi.fn().mockResolvedValue({
        ok: false,
        data: null,
        raw: '',
        error: 'LLM unavailable',
      }),
    };

    const result = await generateWorld(client, 'A test world');
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('LLM unavailable');
  });
});

describe('generateWorld FT-BR-006: quest passthrough', () => {
  it('should include generated quests in the result', async () => {
    const proposal = makeValidProposal();
    const client = makeMockClient(proposal);
    const result = await generateWorld(client, 'A test world', 42);

    expect(result.ok).toBe(true);
    expect(result.quests).toEqual(proposal.quests);
    expect(result.quests).toHaveLength(1);
    expect(result.quests[0].id).toBe('q1');
  });

  it('should return empty quests array on LLM failure', async () => {
    const client: ClaudeClient = {
      model: 'test-model',
      generate: vi.fn(),
      generateStructured: vi.fn().mockResolvedValue({
        ok: false, data: null, raw: '', error: 'fail',
      }),
    };
    const result = await generateWorld(client, 'test');
    expect(result.ok).toBe(false);
    expect(result.quests).toEqual([]);
  });

  it('should default to empty quests when proposal has no quests field', async () => {
    const proposal = makeValidProposal();
    (proposal as any).quests = undefined;
    const client = makeMockClient(proposal);
    const result = await generateWorld(client, 'test', 1);
    // Validation may pass or fail depending on other checks, but quests should be []
    expect(result.quests).toEqual([]);
  });
});

describe('generateWorld PBR-007: NPC ID collision guard', () => {
  it('should resolve colliding NPC IDs with numeric suffix', async () => {
    const proposal = makeValidProposal();
    proposal.npcs.push({
      id: 'guard-1',
      name: 'Guard Clone',
      type: 'npc',
      tags: [],
      zoneId: 'town-square',
      personality: 'calm',
      goals: [],
      stats: { str: 8 },
      resources: { hp: 50 },
      beliefs: [],
    });
    const client = makeMockClient(proposal);
    // F-e23cc3ac: this routine-variance diagnostic no longer prints
    // unconditionally -- it now goes through the optional DebugLogger, so
    // assert against a test logger's queryable entries instead of spying on
    // console.warn (mirrors narrator.test.ts's F-fa65fe50 convention).
    const logger = createTestLogger();

    const result = await generateWorld(client, 'test', 1, { logger });
    expect(result.ok).toBe(true);
    const ids = Object.keys(result.engine!.world.entities);
    expect(ids).toContain('guard-1');
    expect(ids).toContain('guard-1-2');
    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'world-gen',
        message: expect.stringContaining('NPC ID collision'),
      }),
    );
  });

  it('should handle triple NPC ID collision', async () => {
    const proposal = makeValidProposal();
    for (let i = 0; i < 2; i++) {
      proposal.npcs.push({
        id: 'guard-1',
        name: `Guard Clone ${i + 2}`,
        type: 'npc',
        tags: [],
        zoneId: 'town-square',
        personality: 'calm',
        goals: [],
        stats: {},
        resources: {},
        beliefs: [],
      });
    }
    const client = makeMockClient(proposal);

    const result = await generateWorld(client, 'test', 1);
    expect(result.ok).toBe(true);
    const ids = Object.keys(result.engine!.world.entities);
    expect(ids).toContain('guard-1');
    expect(ids).toContain('guard-1-2');
    expect(ids).toContain('guard-1-3');
  });

  it('should not abort world creation if one NPC throws', async () => {
    const proposal = makeValidProposal();
    proposal.npcs.push({
      id: 'merchant',
      name: 'Merchant',
      type: 'npc',
      tags: [],
      zoneId: 'town-square',
      personality: 'friendly',
      goals: [],
      stats: {},
      resources: {},
      beliefs: [],
    });
    const client = makeMockClient(proposal);

    const result = await generateWorld(client, 'test', 1);
    expect(result.ok).toBe(true);
    expect(Object.keys(result.engine!.world.entities)).toContain('merchant');
  });
});

describe('generateWorld F-105a5718: faction memberIds reconciled after NPC id collision', () => {
  it('remaps a faction member id that gets renamed due to a PBR-007 collision', async () => {
    const proposal = makeValidProposal();
    // Base proposal already has faction 'guard' with memberIds: ['guard-1'], intending
    // to reference the ACTUAL Guard Captain — not whichever entity happens to end up
    // holding the literal id 'guard-1' after collision resolution. Insert an UNRELATED
    // npc that also claims 'guard-1' BEFORE the real Guard Captain in the array, so the
    // captain (the real faction member) is the one that gets suffixed to 'guard-1-2'.
    proposal.npcs.unshift({
      id: 'guard-1',
      name: 'Random Villager',
      type: 'npc',
      tags: [],
      zoneId: 'town-square',
      personality: 'timid',
      goals: [],
      stats: {},
      resources: {},
      beliefs: [],
    });

    const client = makeMockClient(proposal);

    const result = await generateWorld(client, 'test', 1);
    expect(result.ok).toBe(true);

    const entityIds = Object.keys(result.engine!.world.entities);
    expect(entityIds).toContain('guard-1'); // Random Villager keeps the unsuffixed id
    expect(entityIds).toContain('guard-1-2'); // Guard Captain renamed due to the collision

    const members = getFactionMembers(result.engine!.world, 'guard');
    // Must track the Guard Captain's REAL final id, not the stray original 'guard-1'
    // (which now belongs to the unrelated Random Villager).
    expect(members).toEqual(['guard-1-2']);
    expect(members.every((id) => id in result.engine!.world.entities)).toBe(true);
  });
});

describe('generateWorld: malformed proposal degrades gracefully (F-d68e103d/F-dd5436c0)', () => {
  it('returns ok:false with a descriptive error instead of throwing when ruleset is missing', async () => {
    const proposal = makeValidProposal();
    (proposal as any).ruleset = undefined;
    const client = makeMockClient(proposal);

    // Before the fix: proposal.ruleset.id at the RulesetDefinition build site throws a
    // raw TypeError here, which — being inside an async function — surfaces as this
    // await rejecting instead of a resolved WorldGenResult. That reaches a real
    // `claude-rpg new "<prompt>"` invocation as bin.ts's generic "Unexpected error"
    // fallback box instead of a specific message.
    const result = await generateWorld(client, 'test', 1);

    expect(result.ok).toBe(false);
    expect(result.engine).toBeNull();
    expect(result.errors).toContain('No ruleset generated');
  });

  it('returns ok:false with a descriptive error instead of throwing when a faction is missing memberIds', async () => {
    const proposal = makeValidProposal();
    (proposal.factions[0] as any).memberIds = undefined;
    const client = makeMockClient(proposal);

    // Before the fix: createFactionCognition's config is built (and its module factory
    // run) synchronously while constructing the Engine's `modules: [...]` array, so a
    // faction with entityIds: undefined throws "entityIds is not iterable" before any
    // zone, player, or NPC entity has been added — same uncaught, unmapped propagation
    // path as the ruleset case above.
    const result = await generateWorld(client, 'test', 1);

    expect(result.ok).toBe(false);
    expect(result.engine).toBeNull();
    expect(result.errors.some((e) => e.includes('memberIds'))).toBe(true);
  });
});

describe('generateWorld F-cbc186cb: retries + errorKind discriminant', () => {
  it('retries generateStructured after a transient failure and succeeds on a later attempt', async () => {
    const proposal = makeValidProposal();
    const generateStructured = vi.fn()
      .mockResolvedValueOnce({ ok: false, data: null, raw: '', error: 'No JSON found in response' })
      .mockResolvedValueOnce({ ok: true, data: proposal, raw: '' });
    const client: ClaudeClient = {
      model: 'test-model',
      generate: vi.fn(),
      generateStructured,
    };

    const result = await generateWorld(client, 'A test world', 1);

    expect(result.ok).toBe(true);
    expect(result.engine).not.toBeNull();
    expect(generateStructured).toHaveBeenCalledTimes(2);
  });

  it('retries a content-validation failure and succeeds once a later attempt passes validation', async () => {
    const badProposal = makeValidProposal();
    (badProposal.factions[0] as any).memberIds = undefined;
    const goodProposal = makeValidProposal();
    const generateStructured = vi.fn()
      .mockResolvedValueOnce({ ok: true, data: badProposal, raw: '' })
      .mockResolvedValueOnce({ ok: true, data: goodProposal, raw: '' });
    const client: ClaudeClient = {
      model: 'test-model',
      generate: vi.fn(),
      generateStructured,
    };

    const result = await generateWorld(client, 'A test world', 1);

    expect(result.ok).toBe(true);
    expect(generateStructured).toHaveBeenCalledTimes(2);
  });

  it('gives up after 3 attempts and reports errorKind "transient" when generateStructured never succeeds', async () => {
    const client: ClaudeClient = {
      model: 'test-model',
      generate: vi.fn(),
      generateStructured: vi.fn().mockResolvedValue({
        ok: false, data: null, raw: '', error: 'LLM unavailable',
      }),
    };

    const result = await generateWorld(client, 'A test world');

    expect(result.ok).toBe(false);
    expect(result.errorKind).toBe('transient');
    expect(result.errors).toContain('LLM unavailable');
    expect(client.generateStructured).toHaveBeenCalledTimes(3);
  });

  it('gives up after 3 attempts and reports errorKind "validation" when the proposal never passes shape validation', async () => {
    const proposal = makeValidProposal();
    (proposal.factions[0] as any).memberIds = undefined;
    const client = makeMockClient(proposal);

    const result = await generateWorld(client, 'A test world', 1);

    expect(result.ok).toBe(false);
    expect(result.errorKind).toBe('validation');
    expect(result.errors.some((e) => e.includes('memberIds'))).toBe(true);
    expect(client.generateStructured).toHaveBeenCalledTimes(3);
  });

  it('does not set errorKind on a successful result', async () => {
    const proposal = makeValidProposal();
    const client = makeMockClient(proposal);

    const result = await generateWorld(client, 'A test world', 1);

    expect(result.ok).toBe(true);
    expect(result.errorKind).toBeUndefined();
  });

  // F-9da15f24: generateWorld had no way to tell a caller (bin.ts's spinner) that
  // it was on a validation-triggered internal retry rather than one slow call.
  it('invokes onAttempt before each RETRIED attempt (never the initial one), with the PRECEDING attempt\'s errorKind', async () => {
    const badMemberIdsProposal = makeValidProposal();
    (badMemberIdsProposal.factions[0] as any).memberIds = undefined;
    const goodProposal = makeValidProposal();
    const generateStructured = vi.fn()
      .mockResolvedValueOnce({ ok: false, data: null, raw: '', error: 'No JSON found in response' })
      .mockResolvedValueOnce({ ok: true, data: badMemberIdsProposal, raw: '' })
      .mockResolvedValueOnce({ ok: true, data: goodProposal, raw: '' });
    const client: ClaudeClient = {
      model: 'test-model',
      generate: vi.fn(),
      generateStructured,
    };
    const attempts: WorldGenAttemptInfo[] = [];
    const onAttempt = vi.fn((info: WorldGenAttemptInfo) => attempts.push(info));

    const result = await generateWorld(client, 'A test world', 1, { onAttempt });

    expect(result.ok).toBe(true);
    expect(attempts).toEqual([
      { attempt: 2, maxAttempts: 3, kind: 'transient' }, // retrying because attempt 1's LLM call failed
      { attempt: 3, maxAttempts: 3, kind: 'validation' }, // retrying because attempt 2 failed shape validation
    ]);
  });

  it('does not invoke onAttempt when the first attempt succeeds', async () => {
    const proposal = makeValidProposal();
    const client = makeMockClient(proposal);
    const onAttempt = vi.fn();

    const result = await generateWorld(client, 'A test world', 1, { onAttempt });

    expect(result.ok).toBe(true);
    expect(onAttempt).not.toHaveBeenCalled();
  });

  it('accumulates distinct error reasons across attempts instead of keeping only the last attempt\'s', async () => {
    const missingRuleset = makeValidProposal();
    (missingRuleset as any).ruleset = undefined;
    const missingMemberIds = makeValidProposal();
    (missingMemberIds.factions[0] as any).memberIds = undefined;
    const missingZones = makeValidProposal();
    (missingZones as any).zones = [];
    const generateStructured = vi.fn()
      .mockResolvedValueOnce({ ok: true, data: missingRuleset, raw: '' })
      .mockResolvedValueOnce({ ok: true, data: missingMemberIds, raw: '' })
      .mockResolvedValueOnce({ ok: true, data: missingZones, raw: '' });
    const client: ClaudeClient = {
      model: 'test-model',
      generate: vi.fn(),
      generateStructured,
    };

    const result = await generateWorld(client, 'A test world', 1);

    expect(result.ok).toBe(false);
    // All three attempts' distinct failure reasons must survive to the final
    // report -- previously `errors` was reassigned (not accumulated) each
    // iteration, so only attempt 3's "No zones generated" would have appeared,
    // with nothing indicating 3 separate generations were even attempted.
    expect(result.errors).toContain('No ruleset generated');
    expect(result.errors.some((e) => e.includes('memberIds'))).toBe(true);
    expect(result.errors).toContain('No zones generated');
  });
});

describe('generateWorld PBR-001: defensive NPC coercion', () => {
  it('should default missing stats to empty object', async () => {
    const proposal = makeValidProposal();
    (proposal.npcs[0] as any).stats = undefined;
    const client = makeMockClient(proposal);
    // F-e23cc3ac: gated behind the optional DebugLogger now, not console.warn.
    const logger = createTestLogger();

    const result = await generateWorld(client, 'test', 1, { logger });
    expect(result.ok).toBe(true);
    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'world-gen',
        message: expect.stringContaining('missing/invalid stats'),
      }),
    );
  });

  it('should default missing resources to empty object', async () => {
    const proposal = makeValidProposal();
    (proposal.npcs[0] as any).resources = null;
    const client = makeMockClient(proposal);
    // F-e23cc3ac: gated behind the optional DebugLogger now, not console.warn.
    const logger = createTestLogger();

    const result = await generateWorld(client, 'test', 1, { logger });
    expect(result.ok).toBe(true);
    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'world-gen',
        message: expect.stringContaining('missing/invalid resources'),
      }),
    );
  });

  it('should skip NPCs missing critical identity fields (validation catches empty id)', async () => {
    const proposal = makeValidProposal();
    proposal.npcs.push({
      id: '',
      name: 'Ghost',
      type: 'npc',
      tags: [],
      zoneId: 'town-square',
      personality: 'shy',
      goals: [],
      stats: {},
      resources: {},
      beliefs: [],
    });
    const client = makeMockClient(proposal);

    // Validation catches empty id before we reach the NPC loop
    const result = await generateWorld(client, 'test', 1);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => e.includes('missing required field: id'))).toBe(true);
  });

  it('should default missing tags/beliefs/goals to empty arrays', async () => {
    const proposal = makeValidProposal();
    (proposal.npcs[0] as any).tags = undefined;
    (proposal.npcs[0] as any).beliefs = null;
    (proposal.npcs[0] as any).goals = 'not-an-array';
    const client = makeMockClient(proposal);

    const result = await generateWorld(client, 'test', 1);
    expect(result.ok).toBe(true);
  });
});

// WO-A1-1 (§1, §5): buildWorldStack replaces the strategic tail of the
// modules array. The cross-domain parity sentinel (generated-vs-pack module
// set) lives in test/integration ("tests" domain, per the slice's ownership
// table); this narrower proof stays in-domain: it demonstrates DIRECTLY that
// hand-listing a module the stack already registers throws at construction
// -- which is exactly why every stack-registered module (environment-core,
// faction-cognition, rumor-propagation, district-core, belief-provenance,
// observer-presentation) had to be REMOVED from world-gen.ts's hand list.
describe('generateWorld WO-A1-1: buildWorldStack adoption — double-registration proof (§1, §5)', () => {
  function makeEngineWithModules(modules: unknown[]): () => Engine {
    return () =>
      new Engine({
        manifest: {
          id: 'dup-test',
          title: 'Dup Test',
          version: '1.0.0',
          engineVersion: '>=3.9.0 <4.0.0',
          ruleset: MINIMAL_RULESET.id,
          modules: [],
          contentPacks: [],
        },
        seed: 1,
        ruleset: MINIMAL_RULESET,
        modules: modules as never,
      });
  }

  it('throws when a stack-registered module set is hand-listed a SECOND time alongside buildWorldStack -- proving removal from the hand list was required', () => {
    const stack = buildWorldStack({ playerId: 'player', factions: [] });

    const constructTwice = makeEngineWithModules([
      traversalCore,
      statusCore,
      combatCore,
      createCognitionCore({ decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 } }),
      createPerceptionFilter(),
      createSimulationInspector(),
      ...stack.modules,
      ...stack.modules, // deliberate duplicate -- the exact bug this slice fixes
    ]);

    expect(constructTwice).toThrow(/already registered/);
  });

  it('the real (single-registration) construction succeeds -- the contrast case proving the fix is correct, not merely non-throwing by omission', () => {
    const stack = buildWorldStack({ playerId: 'player', factions: [] });

    const constructOnce = makeEngineWithModules([
      traversalCore,
      statusCore,
      combatCore,
      createCognitionCore({ decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 } }),
      createPerceptionFilter(),
      createSimulationInspector(),
      ...stack.modules,
    ]);

    expect(constructOnce).not.toThrow();
  });

  it('world.meta.gameId equals the manifest id derived from the title -- encounterSpawn/quests key off the SAME id (§1)', async () => {
    const proposal = makeValidProposal();
    proposal.title = 'Gameid Parity World';
    const client = makeMockClient(proposal);

    const result = await generateWorld(client, 'test', 1);

    expect(result.ok).toBe(true);
    expect(result.engine!.world.meta.gameId).toBe('gameid-parity-world');
  });
});

describe('generateWorld WO-A1-2: district derivation and mapping (§2)', () => {
  it('derives one district per zone when the proposal authors none, with controllingFaction set to the faction holding the most members placed in that zone', async () => {
    const proposal = makeValidProposal();
    proposal.title = 'District Derivation World';
    const client = makeMockClient(proposal);

    const result = await generateWorld(client, 'test', 1);
    expect(result.ok).toBe(true);

    const world = result.engine!.world;
    expect(getAllDistrictIds(world).sort()).toEqual(['market', 'town-square']);

    const townSquare = getDistrictDefinition(world, 'town-square');
    expect(townSquare?.zoneIds).toEqual(['town-square']);
    // guard-1 (the faction's only member) is placed in town-square.
    expect(townSquare?.controllingFaction).toBe('guard');

    const market = getDistrictDefinition(world, 'market');
    // No faction member is placed in market -- no controllingFaction to derive.
    expect(market?.controllingFaction).toBeUndefined();
  });

  it('maps authored districts 1:1 when the proposal provides them (no derivation)', async () => {
    const proposal = makeValidProposal();
    proposal.title = 'Authored District World';
    proposal.districts = [
      { id: 'old-town', name: 'Old Town', zoneIds: ['town-square', 'market'], tags: ['historic'], controllingFaction: 'guard' },
    ];
    const client = makeMockClient(proposal);

    const result = await generateWorld(client, 'test', 1);
    expect(result.ok).toBe(true);

    const world = result.engine!.world;
    expect(getAllDistrictIds(world)).toEqual(['old-town']);
    expect(getDistrictDefinition(world, 'old-town')).toEqual({
      id: 'old-town',
      name: 'Old Town',
      zoneIds: ['town-square', 'market'],
      tags: ['historic'],
      controllingFaction: 'guard',
    });
  });

  it('drops an unknown zoneId from an authored district with a warning, keeping the district when a valid zone remains', async () => {
    const proposal = makeValidProposal();
    proposal.title = 'Partial Zone District World';
    proposal.districts = [{ id: 'old-town', name: 'Old Town', zoneIds: ['town-square', 'nonexistent-zone'], tags: [] }];
    const client = makeMockClient(proposal);
    const logger = createTestLogger();

    const result = await generateWorld(client, 'test', 1, { logger });
    expect(result.ok).toBe(true);

    expect(getDistrictDefinition(result.engine!.world, 'old-town')?.zoneIds).toEqual(['town-square']);
    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'world-gen',
        message: expect.stringContaining('unknown zone'),
      }),
    );
  });

  it('drops a district entirely when every authored zoneId is unknown', async () => {
    const proposal = makeValidProposal();
    proposal.title = 'All Unknown Zone District World';
    proposal.districts = [{ id: 'ghost-town', name: 'Ghost Town', zoneIds: ['nowhere'], tags: [] }];
    const client = makeMockClient(proposal);
    const logger = createTestLogger();

    const result = await generateWorld(client, 'test', 1, { logger });
    expect(result.ok).toBe(true);
    expect(getAllDistrictIds(result.engine!.world)).toEqual([]);
    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'world-gen',
        message: expect.stringContaining('no valid zones'),
      }),
    );
  });

  it('clears (not drops) an unknown controllingFaction with a warning, keeping the district itself', async () => {
    const proposal = makeValidProposal();
    proposal.title = 'Unknown Faction District World';
    proposal.districts = [
      { id: 'old-town', name: 'Old Town', zoneIds: ['town-square'], tags: [], controllingFaction: 'nonexistent-faction' },
    ];
    const client = makeMockClient(proposal);
    const logger = createTestLogger();

    const result = await generateWorld(client, 'test', 1, { logger });
    expect(result.ok).toBe(true);

    const district = getDistrictDefinition(result.engine!.world, 'old-town');
    expect(district).toBeTruthy();
    expect(district?.controllingFaction).toBeUndefined();
    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'world-gen',
        message: expect.stringContaining('unknown controllingFaction'),
      }),
    );
  });
});

describe('generateWorld WO-A1-2: genre validation (§2)', () => {
  it('passes a known genre through without any "Unknown genre" warning', async () => {
    const proposal = makeValidProposal();
    proposal.title = 'Known Genre World';
    proposal.genre = 'cyberpunk';
    const client = makeMockClient(proposal);
    const logger = createTestLogger();

    const result = await generateWorld(client, 'test', 1, { logger });
    expect(result.ok).toBe(true);
    expect(logger.getEntries().some((e) => e.message.includes('Unknown genre'))).toBe(false);
  });

  it('drops an unknown genre with a warning and still boots the world on engine defaults', async () => {
    const proposal = makeValidProposal();
    proposal.title = 'Unknown Genre World';
    proposal.genre = 'steampunk'; // not in KNOWN_WORLDGEN_GENRES
    const client = makeMockClient(proposal);
    const logger = createTestLogger();

    const result = await generateWorld(client, 'test', 1, { logger });
    expect(result.ok).toBe(true);
    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'world-gen',
        message: expect.stringContaining('Unknown genre "steampunk"'),
      }),
    );
  });
});

// WO-A1-2 (§2): "Resolve the exact list from the installed 3.11 dist at
// implementation time and pin it in a test that reads the engine, not a hand
// copy." Neither GENRE_SUPPLY_DEFAULTS (economy-core.ts) nor
// evaluateGenreRules' switch (pressure-system.ts) is exported at runtime --
// both are module-local -- so KNOWN_WORLDGEN_GENRES in world-gen.ts is
// necessarily a hand copy. This test keeps that hand copy honest by reading
// the SAME installed dist's source text directly and comparing key sets,
// instead of trusting the hand copy against memory of what those tables
// contain.
describe('KNOWN_WORLDGEN_GENRES pin (§2): matches the installed 3.11 dist, not a hand copy', () => {
  // @ai-rpg-engine/modules is ESM-only (its package.json "exports" carries
  // only an "import" condition), so a CJS require.resolve() cannot resolve
  // it -- walk up from this test file's own directory (Node module
  // resolution's own algorithm) to find the installed dist directly. The
  // worktree this test may run from has no node_modules of its own, so this
  // walk lands on the MAIN repo's install (E:/AI/claude-rpg/node_modules),
  // exactly the "installed 3.11 dist" lock 4 (ADDENDUM-COMMON.md) requires.
  function findModulesDistDir(): string {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 20; i++) {
      const candidate = join(dir, 'node_modules', '@ai-rpg-engine', 'modules', 'dist');
      if (existsSync(join(candidate, 'economy-core.js'))) return candidate;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    throw new Error('Could not locate @ai-rpg-engine/modules/dist by walking up from the test file');
  }

  it('equals the union of economy-core.ts GENRE_SUPPLY_DEFAULTS keys and pressure-system.ts evaluateGenreRules case keys', () => {
    const distDir = findModulesDistDir();

    const economySource = readFileSync(join(distDir, 'economy-core.js'), 'utf8');
    const economyBlockMatch = economySource.match(/const GENRE_SUPPLY_DEFAULTS = \{([\s\S]*?)\n\};/);
    expect(economyBlockMatch).not.toBeNull();
    const economyKeys = [...(economyBlockMatch?.[1] ?? '').matchAll(/^\s*(?:'([a-z-]+)'|([a-z-]+)):\s*\{/gm)].map(
      (m) => m[1] ?? m[2],
    );
    // Sanity floor: this dist-reading approach must actually find keys, or a
    // future dist reshuffle would silently pass an empty-set comparison.
    expect(economyKeys.length).toBeGreaterThan(0);

    const pressureSource = readFileSync(join(distDir, 'pressure-system.js'), 'utf8');
    const pressureKeys = [...pressureSource.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]);
    expect(pressureKeys.length).toBeGreaterThan(0);

    const expectedUnion = new Set([...economyKeys, ...pressureKeys]);
    expect(new Set(KNOWN_WORLDGEN_GENRES)).toEqual(expectedUnion);
  });
});

describe('generateWorld WO-A1-2: encounter mapping (§2)', () => {
  function makeEnemyNpc(overrides: Partial<WorldGenProposal['npcs'][number]> = {}): WorldGenProposal['npcs'][number] {
    return {
      id: 'bandit-1',
      name: 'Bandit',
      type: 'enemy',
      tags: ['bandit'],
      zoneId: 'market',
      personality: 'aggressive',
      goals: ['rob travelers'],
      stats: { str: 10 },
      resources: { hp: 30 },
      beliefs: [],
      ...overrides,
    };
  }

  it('registers a valid encounter and its entity template when every hostile names a valid enemy-type NPC in a valid zone', async () => {
    const proposal = makeValidProposal();
    proposal.title = 'Valid Encounter World';
    proposal.npcs.push(makeEnemyNpc());
    proposal.encounters = [
      { id: 'market-ambush', name: 'Market Ambush', zoneIds: ['market'], hostiles: [{ npcId: 'bandit-1', count: 2 }] },
    ];
    const client = makeMockClient(proposal);

    const result = await generateWorld(client, 'test', 1);
    expect(result.ok).toBe(true);
    expect(result.engine!.world.modules['encounter-spawn']).toBeTruthy();
  });

  it('drops a hostile referencing a non-enemy-type proposal NPC with a warning -- the whole encounter is dropped when nothing else survives', async () => {
    const proposal = makeValidProposal();
    proposal.title = 'Bad Hostile Type World';
    // guard-1 is type 'npc' in the base fixture, not 'enemy' -- invalid hostile.
    proposal.encounters = [{ id: 'bad-encounter', name: 'Bad Encounter', zoneIds: ['market'], hostiles: [{ npcId: 'guard-1' }] }];
    const client = makeMockClient(proposal);
    const logger = createTestLogger();

    const result = await generateWorld(client, 'test', 1, { logger });
    expect(result.ok).toBe(true);
    expect(result.engine!.world.modules['encounter-spawn']).toBeFalsy();
    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'world-gen',
        message: expect.stringContaining('does not name a proposal NPC of type "enemy"'),
      }),
    );
  });

  it('drops an encounter that names no valid zoneIds', async () => {
    const proposal = makeValidProposal();
    proposal.title = 'Bad Zone Encounter World';
    proposal.npcs.push(makeEnemyNpc());
    proposal.encounters = [
      { id: 'nowhere-encounter', name: 'Nowhere Encounter', zoneIds: ['nonexistent-zone'], hostiles: [{ npcId: 'bandit-1' }] },
    ];
    const client = makeMockClient(proposal);
    const logger = createTestLogger();

    const result = await generateWorld(client, 'test', 1, { logger });
    expect(result.ok).toBe(true);
    expect(result.engine!.world.modules['encounter-spawn']).toBeFalsy();
    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'world-gen',
        message: expect.stringContaining('no valid zoneIds'),
      }),
    );
  });
});

// WO-A1-3 (§3): the runtime-foundry agent's honesty floor found that
// createQuestCore's OWN runtime-vocabulary check (verified against the
// installed 3.11 dist) requires at least one quest-level offer trigger for
// ANY quest to ever be offered -- and the slice's first §3 authored none, so
// every generated quest was warn-dropped (the composed floor caught it: the
// WO-A1-9 sentinel went red after merge). Coordinator stitch: world-gen.ts
// now synthesizes one offer trigger per quest (world.zone.entered on the
// player's start zone, payload-equals, effect 'offer' -- starter-fantasy's
// own authored shape), so generated quests register. This block pins the
// corrected contract; the previous pin (drop + warn) was the old behavior.
describe('generateWorld WO-A1-3: quest mapping — the synthesized offer trigger (§3, stitched)', () => {
  it('registers the fixture quest with a synthesized offer trigger on the player start zone, warns nothing about triggers, and still boots the world', async () => {
    const proposal = makeValidProposal();
    proposal.title = 'Quest Trigger World';
    const client = makeMockClient(proposal);
    const logger = createTestLogger();

    const result = await generateWorld(client, 'test', 1, { logger });

    expect(result.ok).toBe(true);
    const defs = getQuestDefinitions(result.engine!.world);
    expect(defs.map((d) => d.id)).toEqual(proposal.quests.map((q) => q.id));
    for (const def of defs) {
      expect(def.triggers).toEqual([
        {
          event: 'world.zone.entered',
          condition: { type: 'payload-equals', params: { key: 'zoneId', value: proposal.player.startZoneId } },
          effect: { type: 'offer', params: {} },
        },
      ]);
    }
    expect(logger.getEntries()).not.toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('needs at least one quest-level trigger'),
      }),
    );
    // WorldGenResult.quests keeps returning the RAW proposal shape for
    // existing callers, unaffected by the engine-side registration above.
    expect(result.quests).toEqual(proposal.quests);
  });

  it('drops a quest whose only stage has a blank description -- the synthesized stage name fails shape validation before the runtime-trigger check even runs', async () => {
    const proposal = makeValidProposal();
    proposal.title = 'Blank Stage World';
    proposal.quests = [{ id: 'q-blank', name: 'Blank Quest', description: 'x', stages: [{ id: 's1', description: '   ' }] }];
    const client = makeMockClient(proposal);
    const logger = createTestLogger();

    const result = await generateWorld(client, 'test', 1, { logger });

    expect(result.ok).toBe(true);
    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'world-gen',
        message: expect.stringContaining('Quest "q-blank" failed shape validation'),
      }),
    );
  });
});

// WO-A4-6 (slice A4, §4): generateWorld's LLM half (prompt/retry/validate,
// now proposeWorld) and engine-construction half (now instantiateWorld) were
// one function before this slice. These proofs pin the split's contract:
// proposeWorld never touches an Engine, instantiateWorld never touches a
// ClaudeClient, and generateWorld's own composition of the two remains
// byte-identical to calling instantiateWorld directly with the same
// proposal + seed (the "generated-world resume" precondition A5/cli-display
// builds on: rebuilding via instantiateWorld(savedProposal, savedSeed) must
// reproduce the SAME engine a live generateWorld call would have built).
describe('proposeWorld / instantiateWorld split (WO-A4-6)', () => {
  it('proposeWorld resolves the validated proposal with no engine field on the result', async () => {
    const proposal = makeValidProposal();
    const client = makeMockClient(proposal);

    const result = await proposeWorld(client, 'A test world');

    expect(result.ok).toBe(true);
    expect(result.proposal).toEqual(proposal);
    expect(result.quests).toEqual(proposal.quests);
    expect(result.tone).toBe(proposal.toneGuide);
    expect('engine' in result).toBe(false);
  });

  it('proposeWorld surfaces the same accumulated errors/errorKind generateWorld used to return on a shape-validation failure', async () => {
    const proposal = makeValidProposal();
    proposal.npcs[0].id = '';
    const client = makeMockClient(proposal);

    const result = await proposeWorld(client, 'A test world');

    expect(result.ok).toBe(false);
    expect(result.errorKind).toBe('validation');
    expect(result.errors).toContain('NPC missing required field: id');
  });

  it('instantiateWorld builds a byte-identical engine from the same proposal shape + seed, with no LLM client involved', () => {
    const engineA = instantiateWorld(makeValidProposal(), 42);
    const engineB = instantiateWorld(makeValidProposal(), 42);

    expect(engineA.serialize()).toBe(engineB.serialize());
    expect(engineA.store.state.meta.seed).toBe(42);
  });

  it('generateWorld composing proposeWorld + instantiateWorld reproduces the same engine a direct instantiateWorld(proposal, seed) call would -- the resume precondition', async () => {
    const proposal = makeValidProposal();
    const client = makeMockClient(proposal);

    const result = await generateWorld(client, 'A test world', 7);

    expect(result.ok).toBe(true);
    expect(result.seed).toBe(7);

    const resumed = instantiateWorld(makeValidProposal(), result.seed);
    expect(result.engine!.serialize()).toBe(resumed.serialize());
  });

  it('generateWorld resolves and returns a seed even on a failed (transient) attempt', async () => {
    const client: ClaudeClient = {
      model: 'test-model',
      generate: vi.fn(),
      generateStructured: vi.fn().mockResolvedValue({ ok: false, data: null, raw: '', error: 'LLM unavailable' }),
    };

    const result = await generateWorld(client, 'A test world', 13);

    expect(result.ok).toBe(false);
    expect(result.engine).toBeNull();
    expect(result.seed).toBe(13);
  });
});

// WO-A6-6 (Phase 9 / Slice A6, ADDENDUM-COMMON.md lock 3): instantiateWorld/
// generateWorld gain an optional trailing WorldStackTuning lever
// (encounterSpawn.baseChance/safetyStep, districtDecay), spread into
// buildWorldStack's config. RED FIRST (observed before this WO's fix):
// instantiateWorld/generateWorld took no 4th/stackTuning parameter at all --
// `TS2554: Expected 2-3 arguments, but got 4` on the byte-identical-defaults
// call below, and `Object literal may only specify known properties` on
// `{ stackTuning }` in generateWorld's opts -- until the WO-A6-6 fix above
// added the parameter and the presence-gated spreads.
describe('generateWorld/instantiateWorld WO-A6-6: stackTuning -- generated-world stack levers (§3)', () => {
  function makeEncounterProposal(): WorldGenProposal {
    const proposal = makeValidProposal();
    proposal.title = 'Tuning Encounter World';
    proposal.npcs.push({
      id: 'bandit-1',
      name: 'Bandit',
      type: 'enemy',
      tags: ['bandit'],
      zoneId: 'market',
      personality: 'aggressive',
      goals: ['rob travelers'],
      stats: { str: 10 },
      resources: { hp: 30 },
      beliefs: [],
    });
    proposal.encounters = [
      { id: 'market-ambush', name: 'Market Ambush', zoneIds: ['market'], hostiles: [{ npcId: 'bandit-1' }] },
    ];
    return proposal;
  }

  it('omitted stackTuning and an explicit {} produce a byte-identical engine to a call with no stackTuning at all (undefined/{} parity)', () => {
    const withoutParam = instantiateWorld(makeValidProposal(), 42);
    const withUndefined = instantiateWorld(makeValidProposal(), 42, undefined, undefined);
    const withEmpty = instantiateWorld(makeValidProposal(), 42, undefined, {});

    expect(withUndefined.serialize()).toBe(withoutParam.serialize());
    expect(withEmpty.serialize()).toBe(withoutParam.serialize());
  });

  it('generateWorld threads opts.stackTuning through to instantiateWorld unchanged -- omitted opts.stackTuning is byte-identical to a direct instantiateWorld(proposal, seed) call', async () => {
    const proposal = makeValidProposal();
    const client = makeMockClient(proposal);

    const result = await generateWorld(client, 'test', 9, { stackTuning: {} });
    expect(result.ok).toBe(true);

    const direct = instantiateWorld(makeValidProposal(), 9);
    expect(result.engine!.serialize()).toBe(direct.serialize());
  });

  it('encounterSpawn.baseChance: 1 spawns on the first zone entry into a tabled zone; baseChance: 0 leaves the same zone entry unspawned (same seed, same deterministic gate roll)', async () => {
    const seed = 42;

    const highClient = makeMockClient(makeEncounterProposal());
    const highResult = await generateWorld(highClient, 'test', seed, {
      stackTuning: { encounterSpawn: { baseChance: 1 } } satisfies WorldStackTuning,
    });
    expect(highResult.ok).toBe(true);
    const highEngine = highResult.engine!;
    highEngine.submitAction('move', { targetIds: ['market'] });
    const highSpawns = runEncounterSpawnStep(highEngine);
    expect(highSpawns.length).toBe(1);
    expect(highSpawns[0]?.encounterId).toBe('market-ambush');

    const lowClient = makeMockClient(makeEncounterProposal());
    const lowResult = await generateWorld(lowClient, 'test', seed, {
      stackTuning: { encounterSpawn: { baseChance: 0 } } satisfies WorldStackTuning,
    });
    expect(lowResult.ok).toBe(true);
    const lowEngine = lowResult.engine!;
    lowEngine.submitAction('move', { targetIds: ['market'] });
    const lowSpawns = runEncounterSpawnStep(lowEngine);
    expect(lowSpawns.length).toBe(0);
  });

  it('an omitted encounter table is untouched by encounterSpawn levers -- the presence-optional contract for the module itself stays intact', async () => {
    const proposal = makeValidProposal();
    proposal.title = 'No Encounters World';
    const client = makeMockClient(proposal);

    const result = await generateWorld(client, 'test', 1, {
      stackTuning: { encounterSpawn: { baseChance: 1, safetyStep: 0.5 } },
    });

    expect(result.ok).toBe(true);
    expect(result.engine!.world.modules['encounter-spawn']).toBeFalsy();
  });

  it('districtDecay overrides the module default decay config: a raised decayRate drains an elevated alertPressure further per district-tick than the default config does', () => {
    // district-core.js's decay is verb-driven ('district-tick', submitted by
    // world-tick internally each round) rather than construction-time state,
    // so a bare Engine.serialize() right after instantiateWorld cannot
    // distinguish the two configs (confirmed: identical output before this
    // test's fix) -- the lever must be observed by actually running a
    // district-tick, not by diffing a fresh snapshot.
    const proposal = makeValidProposal();
    // No proposal.districts authored -> mapDistrictsFromProposal derives one
    // district per zone (world-gen.ts), id === zone id.
    const districtId = 'market';

    const defaultEngine = instantiateWorld(proposal, 42);
    const tunedEngine = instantiateWorld(proposal, 42, undefined, {
      districtDecay: { decayRate: 5 },
    });

    modifyDistrictMetric(defaultEngine.store.state, districtId, 'alertPressure', 20);
    modifyDistrictMetric(tunedEngine.store.state, districtId, 'alertPressure', 20);
    expect(getDistrictMetric(defaultEngine.world, districtId, 'alertPressure')).toBe(20);
    expect(getDistrictMetric(tunedEngine.world, districtId, 'alertPressure')).toBe(20);

    defaultEngine.submitAction('district-tick');
    tunedEngine.submitAction('district-tick');

    // Default decayRate (1): 20 -> 19. Tuned decayRate (5): 20 -> 15.
    expect(getDistrictMetric(defaultEngine.world, districtId, 'alertPressure')).toBe(19);
    expect(getDistrictMetric(tunedEngine.world, districtId, 'alertPressure')).toBe(15);
  });
});
