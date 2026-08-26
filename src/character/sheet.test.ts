import { describe, it, expect, afterEach } from 'vitest';
import { renderCharacterSheet } from './sheet.js';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';

function makeMinimalProfile(overrides: Partial<CharacterProfile> = {}): CharacterProfile {
  return {
    build: { name: 'Kael', archetypeId: 'penitent-knight', backgroundId: 'orphan', disciplineId: undefined as any },
    progression: { xp: 0, archetypeRank: 1, disciplineRank: 0 },
    resources: { hp: 50 },
    stats: {},
    loadout: { equipped: {}, inventory: [] },
    custom: {},
    reputation: [],
    injuries: [],
    milestones: [],
    itemChronicle: {},
    totalTurns: 0,
    ...overrides,
  } as unknown as CharacterProfile;
}

const emptyCatalog: ItemCatalog = { items: [] };

// F-9c94c4b5: minimal BuildCatalog fixture, same shape as presence.test.ts's
// makeBuildCatalog — only .archetypes/.backgrounds/.disciplines are exercised.
function makeBuildCatalog(overrides: Partial<BuildCatalog> = {}): BuildCatalog {
  return {
    packId: 'test-pack',
    statBudget: 0,
    maxTraits: 0,
    requiredFlaws: 0,
    archetypes: [{ id: 'penitent-knight', name: 'Penitent Knight' }] as any,
    backgrounds: [{ id: 'orphan', name: 'Orphan' }] as any,
    traits: [],
    disciplines: [{ id: 'chapel-seer', name: 'Chapel Seer' }] as any,
    crossTitles: [],
    entanglements: [],
    ...overrides,
  } as unknown as BuildCatalog;
}

describe('renderCharacterSheet basic structure', () => {
  it('should render the CHARACTER SHEET header and name', () => {
    const result = renderCharacterSheet(makeMinimalProfile(), emptyCatalog);
    expect(result).toContain('CHARACTER SHEET');
    expect(result).toContain('Kael');
  });
});

// F-9c94c4b5: the Identity block printed profile.build.archetypeId/backgroundId
// /disciplineId raw (the unresolved kebab-case catalog slug), and REPUTATION
// printed r.factionId raw padded to a fixed 20-column width -- unlike
// builder.ts's creation-flow summary, which resolves the same fields to their
// .name moments earlier in the same session. renderCharacterSheet now accepts
// an optional trailing BuildCatalog + factionNames map (mirrors session-recap
// .ts's already-established factionNames: Record<string,string> convention)
// and resolves through catalog-names.ts, falling back to the raw id when
// either lookup is omitted (backward compatible with every pre-existing call
// site).
describe('renderCharacterSheet resolves display names (F-9c94c4b5)', () => {
  it('should resolve archetype/background/discipline to catalog display names when a catalog is supplied', () => {
    const profile = makeMinimalProfile({
      build: { name: 'Kael', archetypeId: 'penitent-knight', backgroundId: 'orphan', disciplineId: 'chapel-seer' } as any,
    });
    const result = renderCharacterSheet(profile, emptyCatalog, makeBuildCatalog());
    expect(result).toContain('Archetype:  Penitent Knight');
    expect(result).toContain('Background: Orphan');
    expect(result).toContain('Discipline: Chapel Seer');
    expect(result).not.toContain('penitent-knight');
    expect(result).not.toContain('orphan');
    expect(result).not.toContain('chapel-seer');
  });

  it('should fall back to the raw id when no catalog is supplied (backward compatible)', () => {
    const result = renderCharacterSheet(makeMinimalProfile(), emptyCatalog);
    expect(result).toContain('Archetype:  penitent-knight');
    expect(result).toContain('Background: orphan');
  });

  it('should resolve a faction display name in REPUTATION when a factionNames map is supplied', () => {
    const profile = makeMinimalProfile({
      reputation: [{ factionId: 'iron-covenant', value: 12 }] as any,
    });
    const result = renderCharacterSheet(profile, emptyCatalog, undefined, { 'iron-covenant': 'Iron Covenant' });
    expect(result).toContain('Iron Covenant');
    expect(result).not.toContain('iron-covenant');
  });

  it('should fall back to the raw factionId in REPUTATION when no factionNames map is supplied (backward compatible)', () => {
    const profile = makeMinimalProfile({
      reputation: [{ factionId: 'iron-covenant', value: 12 }] as any,
    });
    const result = renderCharacterSheet(profile, emptyCatalog);
    expect(result).toContain('iron-covenant');
  });
});

// F-e475c46d: DIVIDER/THIN were a hardcoded '═'.repeat(60)/'─'.repeat(60),
// unlike play-renderer.ts's own dividers (PFE-005), which adapt to the real
// terminal width. Mirrors play-renderer-divider.test.ts / help-system.test.ts's
// F-38eb3dec assertions -- structural (exact-width substring), not a
// full-screen snapshot.
describe('renderCharacterSheet divider width (F-e475c46d)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('divider matches a narrow terminal width instead of a fixed 60', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const result = renderCharacterSheet(makeMinimalProfile(), emptyCatalog);
    expect(result).toContain('═'.repeat(40));
    expect(result).not.toContain('═'.repeat(60));
  });

  it('divider matches a wide terminal width, clamped to 120', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 200, writable: true });
    const result = renderCharacterSheet(makeMinimalProfile(), emptyCatalog);
    expect(result).toContain('═'.repeat(120));
    expect(result).not.toContain('═'.repeat(121));
  });

  it('thin divider matches a narrow terminal width instead of a fixed 60', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    // STATS section is always rendered, always preceded by THIN.
    const result = renderCharacterSheet(makeMinimalProfile(), emptyCatalog);
    expect(result).toContain('─'.repeat(40));
    expect(result).not.toContain('─'.repeat(60));
  });
});
