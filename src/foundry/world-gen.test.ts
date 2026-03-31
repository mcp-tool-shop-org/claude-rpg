import { describe, it, expect } from 'vitest';
import { validateWorldGenProposal } from './world-gen.js';
import type { WorldGenProposal } from './world-gen.js';

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
