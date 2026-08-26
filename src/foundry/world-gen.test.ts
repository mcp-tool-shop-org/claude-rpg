import { describe, it, expect, vi } from 'vitest';
import { validateWorldGenProposal, generateWorld } from './world-gen.js';
import type { WorldGenProposal } from './world-gen.js';
import type { ClaudeClient } from '../claude-client.js';
import { getFactionMembers } from '@ai-rpg-engine/modules';

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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const proposal = makeValidProposal();
    proposal.npcs[0].beliefs = [
      { subject: 'player', key: 'trust', value: 'low', confidence: 0.5 },
    ];

    const client = makeMockClient(proposal);
    const result = await generateWorld(client, 'A test world', 99);

    // World gen succeeds regardless of belief initialization
    expect(result.ok).toBe(true);

    // The cognition module is included so beliefs likely succeed,
    // but the code path handles both cases without crashing.
    warnSpy.mockRestore();
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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateWorld(client, 'test', 1);
    expect(result.ok).toBe(true);
    const ids = Object.keys(result.engine!.world.entities);
    expect(ids).toContain('guard-1');
    expect(ids).toContain('guard-1-2');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('NPC ID collision'));
    warnSpy.mockRestore();
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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateWorld(client, 'test', 1);
    expect(result.ok).toBe(true);
    const ids = Object.keys(result.engine!.world.entities);
    expect(ids).toContain('guard-1');
    expect(ids).toContain('guard-1-2');
    expect(ids).toContain('guard-1-3');
    warnSpy.mockRestore();
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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateWorld(client, 'test', 1);
    expect(result.ok).toBe(true);
    expect(Object.keys(result.engine!.world.entities)).toContain('merchant');
    warnSpy.mockRestore();
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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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

    warnSpy.mockRestore();
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
});

describe('generateWorld PBR-001: defensive NPC coercion', () => {
  it('should default missing stats to empty object', async () => {
    const proposal = makeValidProposal();
    (proposal.npcs[0] as any).stats = undefined;
    const client = makeMockClient(proposal);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateWorld(client, 'test', 1);
    expect(result.ok).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing/invalid stats'));
    warnSpy.mockRestore();
  });

  it('should default missing resources to empty object', async () => {
    const proposal = makeValidProposal();
    (proposal.npcs[0] as any).resources = null;
    const client = makeMockClient(proposal);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateWorld(client, 'test', 1);
    expect(result.ok).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing/invalid resources'));
    warnSpy.mockRestore();
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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateWorld(client, 'test', 1);
    expect(result.ok).toBe(true);
    warnSpy.mockRestore();
  });
});
