import { describe, it, expect } from 'vitest';
import { buildNpcPresenceForDialogue, getNpcDialogueHint } from './presence.js';
import type { NpcProfile, NpcActionResult } from '@ai-rpg-engine/modules';

function makeProfile(overrides: Partial<NpcProfile> = {}): NpcProfile {
  return {
    npcId: 'npc-1',
    factionId: 'faction-a',
    goals: [],
    knownRumors: [],
    underPressure: false,
    relationship: {
      trust: 0,
      fear: 0,
      greed: 0,
      loyalty: 50,
    },
    ...overrides,
  } as NpcProfile;
}

describe('buildNpcPresenceForDialogue', () => {
  it('returns goal when NPC has one', () => {
    const profile = makeProfile({
      goals: [{ label: 'Find the artifact' }] as NpcProfile['goals'],
    });
    const result = buildNpcPresenceForDialogue(profile);
    expect(result).toContain('Goal: Find the artifact');
  });

  it('includes hostile stance for very low trust', () => {
    const profile = makeProfile({
      relationship: { trust: -50, fear: 0, greed: 0, loyalty: 50 },
    });
    const result = buildNpcPresenceForDialogue(profile);
    expect(result).toContain('hostile');
  });

  it('includes friendly stance for high trust', () => {
    const profile = makeProfile({
      relationship: { trust: 50, fear: 0, greed: 0, loyalty: 50 },
    });
    const result = buildNpcPresenceForDialogue(profile);
    expect(result).toContain('friendly');
  });

  it('includes frightened for high fear', () => {
    const profile = makeProfile({
      relationship: { trust: 0, fear: 70, greed: 0, loyalty: 50 },
    });
    const result = buildNpcPresenceForDialogue(profile);
    expect(result).toContain('frightened');
  });

  it('includes nervous for moderate fear', () => {
    const profile = makeProfile({
      relationship: { trust: 0, fear: 40, greed: 0, loyalty: 50 },
    });
    const result = buildNpcPresenceForDialogue(profile);
    expect(result).toContain('nervous');
  });

  it('includes mercenary for high greed', () => {
    const profile = makeProfile({
      relationship: { trust: 0, fear: 0, greed: 70, loyalty: 50 },
    });
    const result = buildNpcPresenceForDialogue(profile);
    expect(result).toContain('mercenary');
  });

  it('includes faction-loyal for high loyalty', () => {
    const profile = makeProfile({
      relationship: { trust: 0, fear: 0, greed: 0, loyalty: 80 },
    });
    const result = buildNpcPresenceForDialogue(profile);
    expect(result).toContain('faction-loyal');
  });

  it('includes disloyal for low loyalty with a faction', () => {
    const profile = makeProfile({
      factionId: 'faction-a',
      relationship: { trust: 0, fear: 0, greed: 0, loyalty: 10 },
    });
    const result = buildNpcPresenceForDialogue(profile);
    expect(result).toContain('disloyal');
  });

  it('includes pressure indicator', () => {
    const profile = makeProfile({ underPressure: true });
    const result = buildNpcPresenceForDialogue(profile);
    expect(result).toContain('Under faction pressure');
  });

  it('includes top known rumor', () => {
    const profile = makeProfile({
      knownRumors: ['The king is ill', 'Dragons are returning'],
    });
    const result = buildNpcPresenceForDialogue(profile);
    expect(result).toContain('Knows: "The king is ill"');
    expect(result).not.toContain('Dragons are returning');
  });

  it('returns minimal output for neutral NPC with no goals or rumors', () => {
    const profile = makeProfile();
    const result = buildNpcPresenceForDialogue(profile);
    // Should just be a period with no real content parts
    expect(result).toBe('.');
  });
});

describe('getNpcDialogueHint', () => {
  it('returns dialogue hint for matching NPC', () => {
    const actions: NpcActionResult[] = [
      {
        action: { npcId: 'npc-1', type: 'speak', target: 'player' },
        narratorHint: 'The merchant eyes you suspiciously',
        dialogueHint: 'Wants to barter',
        effects: [],
      } as unknown as NpcActionResult,
    ];
    expect(getNpcDialogueHint('npc-1', actions)).toBe('Wants to barter');
  });

  it('returns undefined when NPC has no action', () => {
    const actions: NpcActionResult[] = [
      {
        action: { npcId: 'npc-2', type: 'speak', target: 'player' },
        narratorHint: 'hint',
        dialogueHint: 'something',
        effects: [],
      } as unknown as NpcActionResult,
    ];
    expect(getNpcDialogueHint('npc-1', actions)).toBeUndefined();
  });

  it('returns undefined for empty actions list', () => {
    expect(getNpcDialogueHint('npc-1', [])).toBeUndefined();
  });
});
