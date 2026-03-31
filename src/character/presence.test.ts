import { describe, it, expect } from 'vitest';
import { buildStatusData } from './presence.js';
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
