import { describe, it, expect } from 'vitest';
import { buildStatusData, buildPresence } from './presence.js';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';

function makeMinimalProfile(overrides: Partial<CharacterProfile> = {}): CharacterProfile {
  return {
    build: { name: 'Tester', archetypeId: 'warrior', disciplineId: undefined as any },
    progression: { xp: 0 },
    resources: { hp: 50 },
    loadout: { equipped: {} },
    custom: {},
    reputation: [],
    injuries: [],
    milestones: [],
    itemChronicle: {},
    totalTurns: 0,
    ...overrides,
  } as CharacterProfile;
}

const emptyCatalog: ItemCatalog = { items: [] };

describe('buildStatusData (FT-B-005: maxHp)', () => {
  it('should resolve maxHp from profile.resources.maxHp', () => {
    const profile = makeMinimalProfile({
      resources: { hp: 50, maxHp: 100 } as any,
    });
    const status = buildStatusData(profile, emptyCatalog);
    expect(status.hp).toBe(50);
    expect(status.maxHp).toBe(100);
  });

  it('should resolve maxHp from profile.custom.maxHp as fallback', () => {
    const profile = makeMinimalProfile({
      resources: { hp: 30 },
      custom: { maxHp: 80 },
    });
    const status = buildStatusData(profile, emptyCatalog);
    expect(status.hp).toBe(30);
    expect(status.maxHp).toBe(80);
  });

  it('should return undefined maxHp when neither source has it', () => {
    const profile = makeMinimalProfile();
    const status = buildStatusData(profile, emptyCatalog);
    expect(status.maxHp).toBeUndefined();
  });
});

// F-0d9b451a: buildStatusData unconditionally returned `statuses: []` — it had no
// access to the live WorldState the player's active status effects live on.
// scene-context.ts's pattern is `(player?.statuses ?? []).map((s) => s.statusId)`;
// buildStatusData now accepts an equivalent pre-resolved string[] from the caller.
describe('buildStatusData F-0d9b451a: statuses field', () => {
  it('should default statuses to an empty array when none are supplied (backward compatible)', () => {
    const profile = makeMinimalProfile();
    const status = buildStatusData(profile, emptyCatalog);
    expect(status.statuses).toEqual([]);
  });

  it('should populate statuses from the supplied live status list', () => {
    const profile = makeMinimalProfile();
    const status = buildStatusData(profile, emptyCatalog, ['poisoned', 'blessed']);
    expect(status.statuses).toEqual(['poisoned', 'blessed']);
  });
});

// F-8d11d865: buildPresence (narratorSummary/npcPerception — relic epithets,
// injury/reputation summaries, stance derivation) was entirely untested;
// presence.test.ts previously covered only buildStatusData's maxHp chain.
describe('buildPresence smoke test (F-8d11d865)', () => {
  it('should build narratorSummary and npcPerception strings from a minimal profile', () => {
    const profile = makeMinimalProfile({
      build: { name: 'Kael', archetypeId: 'ranger', disciplineId: 'scout' } as any,
    });
    const presence = buildPresence(profile, emptyCatalog);

    expect(presence.narratorSummary).toContain('Kael');
    expect(presence.narratorSummary).toContain('ranger');
    expect(presence.narratorSummary).toContain('scout');
    expect(presence.npcPerception).toContain('Kael');
  });

  it('should include active injuries in the narrator summary', () => {
    const profile = makeMinimalProfile({
      injuries: [{ name: 'Broken Arm', grantedTags: ['limping'], healed: false }] as any,
    });
    const presence = buildPresence(profile, emptyCatalog);
    expect(presence.narratorSummary).toContain('broken arm');
  });

  it('should include the title in the narrator summary when present', () => {
    const profile = makeMinimalProfile({ custom: { title: 'the Bold' } });
    const presence = buildPresence(profile, emptyCatalog);
    expect(presence.narratorSummary).toContain('the Bold');
  });

  it('should include a non-neutral npcStance in npcPerception', () => {
    const profile = makeMinimalProfile();
    const presence = buildPresence(profile, emptyCatalog, 'hostile');
    expect(presence.npcPerception).toContain('hostile');
  });

  it('should omit the stance line when npcStance is neutral or absent', () => {
    const profile = makeMinimalProfile();
    const presence = buildPresence(profile, emptyCatalog, 'neutral');
    expect(presence.npcPerception).not.toContain('Stance toward player');
  });

  it('should include top reputation entries by magnitude in npcPerception', () => {
    const profile = makeMinimalProfile({
      reputation: [
        { factionId: 'guild', value: 20 },
        { factionId: 'thieves', value: -5 },
      ],
    });
    const presence = buildPresence(profile, emptyCatalog);
    expect(presence.npcPerception).toContain('guild +20');
    expect(presence.npcPerception).not.toContain('thieves');
  });
});
