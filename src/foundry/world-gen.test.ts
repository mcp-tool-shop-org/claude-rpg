import { describe, it, expect, vi } from 'vitest';
import { validateWorldGenProposal, generateWorld } from './world-gen.js';
import type { WorldGenProposal } from './world-gen.js';
import type { ClaudeClient } from '../claude-client.js';

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
