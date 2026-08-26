import { describe, it, expect } from 'vitest';
import type { FinaleOutline } from '@ai-rpg-engine/campaign-memory';
import { buildFinalePrompt, PACK_VOICES } from './finale-prompt.js';

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
