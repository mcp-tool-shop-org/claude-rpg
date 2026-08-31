import { describe, it, expect } from 'vitest';
import type { FinaleOutline } from '@ai-rpg-engine/campaign-memory';
import {
  buildFinalePrompt, PACK_VOICES,
  NPC_FATES_MAX_COUNT, FACTION_FATES_MAX_COUNT, COMPANION_FATES_MAX_COUNT,
  DISTRICT_FATES_MAX_COUNT, LEGACY_MAX_COUNT, LEGACY_CHAR_BUDGET, SEEDS_MAX_COUNT,
} from './finale-prompt.js';

function makeOutline(overrides: Partial<FinaleOutline> = {}): FinaleOutline {
  return {
    resolutionClass: 'victory',
    dominantArc: null,
    campaignDuration: 10,
    totalChronicleEvents: 3,
    keyMoments: [],
    npcFates: [],
    factionFates: [],
    districtFates: [],
    companionFates: [],
    legacy: [],
    epilogueSeeds: [],
    ...overrides,
  };
}

// F-f4f6ac90 / cross-domain contract D: PACK_VOICES was previously keyed by
// pack.meta.genres[0] -- a shared, many-to-one marketing taxonomy. gladiator
// and ronin both have genres[0] === 'historical', so keying by genre can never
// disambiguate them, and detective/weird-west/zombie/colony's genres[0]
// ('mystery'/'western'/'horror'/'sci-fi') never matched their PACK_VOICES key
// at all. Re-keyed by pack.meta.narratorTone, confirmed unique per pack (see
// this session's static extraction from each starter pack's compiled
// dist/content.js, referenced throughout below).
describe('PACK_VOICES (F-f4f6ac90): keyed by narratorTone, not genre', () => {
  it('is no longer keyed by the old genre-taxonomy strings', () => {
    // 'fantasy'/'cyberpunk'/'pirate' happened to equal their own pack's
    // genres[0] before -- if any of these still resolve, the map was not
    // actually re-keyed, it just grew new keys alongside the old ones.
    expect(PACK_VOICES['fantasy']).toBeUndefined();
    expect(PACK_VOICES['cyberpunk']).toBeUndefined();
    expect(PACK_VOICES['pirate']).toBeUndefined();
    expect(PACK_VOICES['historical']).toBeUndefined();
  });

  it('has an entry for each of the 7 registered packs, keyed by their real narratorTone', () => {
    const registeredTones = [
      'dark fantasy, concise, atmospheric, foreboding', // fantasy
      'cyberpunk noir, terse, neon-lit, paranoid', // cyberpunk
      'victorian noir, measured, atmospheric, suspenseful', // detective
      'pirate adventure, salty, atmospheric, treacherous', // pirate
      'weird western, laconic, sun-bleached, haunted', // weird-west
      'survival horror, desperate, tense, bleak', // zombie
      'hard sci-fi, clinical, tense, vast', // colony
    ];
    for (const tone of registeredTones) {
      expect(PACK_VOICES[tone]).toBeTruthy();
    }
  });

  it('has forward entries for the 3 blocked packs (gladiator/ronin/vampire), same precedent as F-00ddfc68', () => {
    // These narratorTone strings are copied verbatim from each blocked
    // package's compiled dist/content.js (a static extraction -- importing
    // the packages themselves throws; see packs.test.ts's F-00ddfc68
    // tripwire describe block for why).
    expect(PACK_VOICES['roman arena, visceral, theatrical, defiant']).toBeTruthy(); // gladiator
    expect(PACK_VOICES['feudal court, restrained, precise, weighted with consequence']).toBeTruthy(); // ronin
    expect(PACK_VOICES['gothic horror, intimate, decadent, predatory']).toBeTruthy(); // vampire
  });

  it('disambiguates gladiator and ronin, which collide on genres[0] === "historical"', () => {
    const gladiatorVoice = PACK_VOICES['roman arena, visceral, theatrical, defiant'];
    const roninVoice = PACK_VOICES['feudal court, restrained, precise, weighted with consequence'];
    expect(gladiatorVoice).not.toBe(roninVoice);
  });
});

describe('buildFinalePrompt (F-f4f6ac90): looks up PACK_VOICES by narratorTone, not genre', () => {
  it('includes the pack voice instruction when narratorTone matches a PACK_VOICES entry', () => {
    const prompt = buildFinalePrompt(
      makeOutline(),
      'fantasy',
      'Kael',
      'dark fantasy, concise, atmospheric, foreboding',
    );
    expect(prompt).toContain('epic chronicle voice');
  });

  it('does not fall back to a genre-keyed lookup -- passing only genre finds no voice instruction', () => {
    // Regression guard: if buildFinalePrompt silently reverted to keying off
    // `genre` again, this would start matching (the old bug this finding fixes).
    const prompt = buildFinalePrompt(makeOutline(), 'fantasy', 'Kael');
    expect(prompt).not.toContain('epic chronicle voice');
  });

  it('renders cleanly (no crash, no voice instruction) when narratorTone is omitted', () => {
    const prompt = buildFinalePrompt(makeOutline(), 'mystery', 'Kael');
    expect(prompt).toContain('Write the epilogue.');
  });

  it('renders cleanly (no crash, no voice instruction) when narratorTone has no PACK_VOICES entry', () => {
    const prompt = buildFinalePrompt(makeOutline(), 'mystery', 'Kael', 'an unregistered tone');
    expect(prompt).toContain('Write the epilogue.');
  });

  it('still renders the raw genre string in the Genre: line regardless of the narratorTone lookup', () => {
    const prompt = buildFinalePrompt(
      makeOutline(),
      'mystery',
      'Kael',
      'victorian noir, measured, atmospheric, suspenseful',
    );
    expect(prompt).toContain('Genre: mystery');
    expect(prompt).toContain('case-file summary voice');
  });

  it('resolves detective correctly even though genres[0] is "mystery", not "detective" (the headline F-f4f6ac90 mismatch)', () => {
    const prompt = buildFinalePrompt(
      makeOutline(),
      'mystery',
      'Kael',
      'victorian noir, measured, atmospheric, suspenseful',
    );
    expect(prompt).toContain('case-file summary voice');
  });
});

// F-b641df8e: buildFinalePrompt used to join npcFates/factionFates/
// companionFates/districtFates/legacy/epilogueSeeds in full, with no
// character or count budget (unlike keyMoments' pre-existing .slice(0, 5)).
// Mirrors narrate-scene.test.ts's own "F-9ee9b5a7: defensive prompt-size
// caps" describe block: prove the most-recent entries survive and the
// oldest are dropped once each field's own MAX_COUNT is exceeded.
describe('buildFinalePrompt (F-b641df8e): defensive per-field budgets', () => {
  const pad = (i: number) => String(i).padStart(3, '0');

  it('caps npcFates at NPC_FATES_MAX_COUNT, keeping the most recent and dropping the oldest', () => {
    const npcFates = Array.from({ length: NPC_FATES_MAX_COUNT + 10 }, (_, i) => ({
      npcId: `npc-${pad(i)}`, name: `NPC-${pad(i)}`, outcome: 'survived',
    })) as unknown as FinaleOutline['npcFates'];
    const prompt = buildFinalePrompt(makeOutline({ npcFates }), 'fantasy', 'Kael');

    const renderedCount = npcFates.filter((f) => prompt.includes(`- ${f.name}:`)).length;
    expect(renderedCount).toBeLessThanOrEqual(NPC_FATES_MAX_COUNT);
    expect(renderedCount).toBeGreaterThan(0);
    expect(prompt).toContain(`- NPC-${pad(npcFates.length - 1)}:`); // most recent survives
    expect(prompt).not.toContain('- NPC-000:'); // oldest dropped
  });

  it('caps factionFates at FACTION_FATES_MAX_COUNT, keeping the most recent and dropping the oldest', () => {
    const factionFates = Array.from({ length: FACTION_FATES_MAX_COUNT + 10 }, (_, i) => ({
      factionId: `faction-${pad(i)}`, outcome: 'stable', playerReputation: 0, cohesion: 50,
    })) as unknown as FinaleOutline['factionFates'];
    const prompt = buildFinalePrompt(makeOutline({ factionFates }), 'fantasy', 'Kael');

    const renderedCount = factionFates.filter((f) => prompt.includes(`- ${f.factionId}:`)).length;
    expect(renderedCount).toBeLessThanOrEqual(FACTION_FATES_MAX_COUNT);
    expect(renderedCount).toBeGreaterThan(0);
    expect(prompt).toContain(`- faction-${pad(factionFates.length - 1)}:`);
    expect(prompt).not.toContain('- faction-000:');
  });

  it('caps companionFates at COMPANION_FATES_MAX_COUNT, keeping the most recent and dropping the oldest', () => {
    const companionFates = Array.from({ length: COMPANION_FATES_MAX_COUNT + 10 }, (_, i) => ({
      npcId: `comp-${pad(i)}`, name: `Companion-${pad(i)}`, outcome: 'loyal',
    })) as unknown as FinaleOutline['companionFates'];
    const prompt = buildFinalePrompt(makeOutline({ companionFates }), 'fantasy', 'Kael');

    const renderedCount = companionFates.filter((f) => prompt.includes(`- ${f.name}:`)).length;
    expect(renderedCount).toBeLessThanOrEqual(COMPANION_FATES_MAX_COUNT);
    expect(renderedCount).toBeGreaterThan(0);
    expect(prompt).toContain(`- Companion-${pad(companionFates.length - 1)}:`);
    expect(prompt).not.toContain('- Companion-000:');
  });

  it('caps districtFates at DISTRICT_FATES_MAX_COUNT, keeping the most recent and dropping the oldest', () => {
    const districtFates = Array.from({ length: DISTRICT_FATES_MAX_COUNT + 10 }, (_, i) => ({
      districtId: `d-${pad(i)}`, name: `District-${pad(i)}`, stability: 50, economyTone: 'stable',
    })) as unknown as FinaleOutline['districtFates'];
    const prompt = buildFinalePrompt(makeOutline({ districtFates }), 'fantasy', 'Kael');

    const renderedCount = districtFates.filter((f) => prompt.includes(`- ${f.name}:`)).length;
    expect(renderedCount).toBeLessThanOrEqual(DISTRICT_FATES_MAX_COUNT);
    expect(renderedCount).toBeGreaterThan(0);
    expect(prompt).toContain(`- District-${pad(districtFates.length - 1)}:`);
    expect(prompt).not.toContain('- District-000:');
  });

  it('caps legacy at LEGACY_MAX_COUNT, keeping the most recent and dropping the oldest', () => {
    const legacy = Array.from({ length: LEGACY_MAX_COUNT + 10 }, (_, i) => ({
      label: `Legacy-${pad(i)}`, category: 'deed', significance: 1,
    })) as unknown as FinaleOutline['legacy'];
    const prompt = buildFinalePrompt(makeOutline({ legacy }), 'fantasy', 'Kael');

    const renderedCount = legacy.filter((l) => prompt.includes(`- ${l.label} (`)).length;
    expect(renderedCount).toBeLessThanOrEqual(LEGACY_MAX_COUNT);
    expect(renderedCount).toBeGreaterThan(0);
    expect(prompt).toContain(`- Legacy-${pad(legacy.length - 1)} (`);
    expect(prompt).not.toContain('- Legacy-000 (');
  });

  it('caps epilogueSeeds at SEEDS_MAX_COUNT, keeping the most recent and dropping the oldest', () => {
    const epilogueSeeds = Array.from({ length: SEEDS_MAX_COUNT + 10 }, (_, i) => `seed-${pad(i)}`);
    const prompt = buildFinalePrompt(makeOutline({ epilogueSeeds }), 'fantasy', 'Kael');

    const renderedCount = epilogueSeeds.filter((s) => prompt.includes(`- ${s}`)).length;
    expect(renderedCount).toBeLessThanOrEqual(SEEDS_MAX_COUNT);
    expect(renderedCount).toBeGreaterThan(0);
    expect(prompt).toContain(`- seed-${pad(epilogueSeeds.length - 1)}`);
    expect(prompt).not.toContain('- seed-000');
  });

  it('enforces a char budget on legacy even under the count cap, dropping oldest first (LEGACY_CHAR_BUDGET independent of LEGACY_MAX_COUNT)', () => {
    // A handful of long legacy labels (well under LEGACY_MAX_COUNT in count)
    // should still be trimmed once their combined length exceeds
    // LEGACY_CHAR_BUDGET -- proving the char ceiling is a real, independent
    // limit, not just a second way of expressing the count cap.
    const longLabelLength = Math.floor(LEGACY_CHAR_BUDGET / 2) + 50;
    const legacy = Array.from({ length: 5 }, (_, i) => ({
      label: `Legacy-${pad(i)}-` + 'y'.repeat(longLabelLength),
      category: 'deed',
      significance: 1,
    })) as unknown as FinaleOutline['legacy'];
    const prompt = buildFinalePrompt(makeOutline({ legacy }), 'fantasy', 'Kael');

    expect(prompt).toContain(legacy[legacy.length - 1].label);
    expect(prompt).not.toContain(legacy[0].label);
  });

  it('does not cap keyMoments differently than before this fix (still .slice(0, 5), untouched by the new per-field budgets)', () => {
    const keyMoments = Array.from({ length: 10 }, (_, i) => ({
      description: `moment-${pad(i)}`,
    })) as unknown as FinaleOutline['keyMoments'];
    const prompt = buildFinalePrompt(makeOutline({ keyMoments }), 'fantasy', 'Kael');

    const renderedCount = keyMoments.filter((m) => prompt.includes(`- ${m.description}`)).length;
    expect(renderedCount).toBe(5);
  });

  it('renders cleanly under every cap at once with realistic-scale data (no crash, no budget bleeds into another section)', () => {
    const npcFates = Array.from({ length: NPC_FATES_MAX_COUNT + 5 }, (_, i) => ({ name: `NPC-${pad(i)}`, outcome: 'ok' })) as unknown as FinaleOutline['npcFates'];
    const legacy = Array.from({ length: LEGACY_MAX_COUNT + 5 }, (_, i) => ({ label: `Legacy-${pad(i)}`, category: 'deed', significance: 1 })) as unknown as FinaleOutline['legacy'];
    const prompt = buildFinalePrompt(makeOutline({ npcFates, legacy }), 'fantasy', 'Kael');

    expect(prompt).toContain('NPC fates:');
    expect(prompt).toContain('Legacy:');
    expect(prompt).toContain('Write the epilogue.');
  });
});
