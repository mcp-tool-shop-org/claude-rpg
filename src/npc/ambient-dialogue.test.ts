import { describe, it, expect } from 'vitest';
import { generateAmbientLine, generateZoneAmbience, PERSONALITY_TEMPLATES, type AmbientNpcInfo } from './ambient-dialogue.js';
import { resolveVoiceArchetype, type VoiceArchetype } from '../prompts/dialogue-npc.js';

// F-c8c8c67c (SLATE-1): personality is now one of resolveVoiceArchetype's
// closed set (merchant/guard/scholar/rogue/noble) + 'default' -- see the
// drift-guard describe block below. 'guard' replaces the old 'stern' default
// fixture value; AmbientNpcInfo.tags was dropped (declared but never read by
// this module -- personality resolution now happens upstream, via
// dialogue/npc-context.ts's deriveNpcPersonality, before an AmbientNpcInfo is
// even constructed).
function makeNpc(overrides?: Partial<AmbientNpcInfo>): AmbientNpcInfo {
  return {
    name: 'Guard Captain',
    personality: 'guard',
    beliefs: {},
    ...overrides,
  };
}

describe('generateAmbientLine (FT-BR-007)', () => {
  it('should return a string containing the NPC name', () => {
    const line = generateAmbientLine(makeNpc(), 0);
    expect(line).toContain('Guard Captain');
  });

  it('should produce deterministic output for the same seed', () => {
    const npc = makeNpc();
    const a = generateAmbientLine(npc, 42);
    const b = generateAmbientLine(npc, 42);
    expect(a).toBe(b);
  });

  it('should use default pool for unknown personality', () => {
    const npc = makeNpc({ personality: 'enigmatic' });
    const line = generateAmbientLine(npc, 0);
    expect(typeof line).toBe('string');
    expect(line.length).toBeGreaterThan(0);
    expect(line).toContain('Guard Captain');
  });

  it('should append belief overlay for low trust', () => {
    const npc = makeNpc({
      beliefs: { 'player.trust': 'low' },
    });
    const line = generateAmbientLine(npc, 0);
    // Line should contain both a base template and a belief overlay
    expect(line).toContain('Guard Captain');
    // The overlay adds a second sentence about suspicion/distance
    expect(line.split('.').length).toBeGreaterThanOrEqual(2);
  });

  it('should not append overlay when beliefs do not match', () => {
    const npc = makeNpc({ beliefs: { 'weather': 'sunny' } });
    const lineWithBeliefs = generateAmbientLine(npc, 0);
    const lineWithout = generateAmbientLine(makeNpc(), 0);
    // Without matching belief patterns, should get the same base line
    expect(lineWithBeliefs).toBe(lineWithout);
  });
});

describe('generateZoneAmbience (FT-BR-007)', () => {
  it('should return empty array for fewer than 2 NPCs', () => {
    expect(generateZoneAmbience([])).toEqual([]);
    expect(generateZoneAmbience([makeNpc()])).toEqual([]);
  });

  it('should return lines for 2+ NPCs', () => {
    const npcs = [
      makeNpc({ name: 'Alice', personality: 'scholar' }),
      makeNpc({ name: 'Bob', personality: 'merchant' }),
    ];
    const lines = generateZoneAmbience(npcs, 10);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Alice');
    expect(lines[1]).toContain('Bob');
  });

  it('should cap output at 3 NPCs', () => {
    const npcs = Array.from({ length: 5 }, (_, i) =>
      makeNpc({ name: `NPC-${i}`, personality: 'default' }),
    );
    const lines = generateZoneAmbience(npcs, 0);
    expect(lines).toHaveLength(3);
  });
});

// F-20ec59de: JS `%` preserves the dividend's sign, so a negative seed used to
// index a template array with pool[negativeIndex] === undefined and throw on
// the following .replace() call.
describe('generateAmbientLine F-20ec59de: negative seed safety', () => {
  it('should not throw and should return a valid line for a negative seed', () => {
    const npc = makeNpc();
    expect(() => generateAmbientLine(npc, -1)).not.toThrow();
    const line = generateAmbientLine(npc, -1);
    expect(typeof line).toBe('string');
    expect(line).toContain('Guard Captain');
  });

  it('should produce deterministic output for the same negative seed', () => {
    const npc = makeNpc();
    const a = generateAmbientLine(npc, -42);
    const b = generateAmbientLine(npc, -42);
    expect(a).toBe(b);
  });

  it('should not throw for a negative seed that also triggers a belief overlay', () => {
    const npc = makeNpc({ beliefs: { 'player.trust': 'low' } });
    expect(() => generateAmbientLine(npc, -7)).not.toThrow();
    const line = generateAmbientLine(npc, -7);
    expect(line).toContain('Guard Captain');
  });
});

describe('generateZoneAmbience F-20ec59de: negative seed safety', () => {
  it('should not throw when effectiveSeed + i goes negative for some NPCs', () => {
    const npcs = [
      makeNpc({ name: 'Alice', personality: 'scholar' }),
      makeNpc({ name: 'Bob', personality: 'merchant' }),
    ];
    expect(() => generateZoneAmbience(npcs, -2)).not.toThrow();
    const lines = generateZoneAmbience(npcs, -2);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Alice');
    expect(lines[1]).toContain('Bob');
  });
});

// F-c8c8c67c (SLATE-1): PERSONALITY_TEMPLATES used to key on 6 closed but
// UNRELATED values (stern/friendly/merchant/aggressive/nervous/default) that
// none of this codebase's real "personality" signal sources reliably
// produced. It's now re-keyed to match dialogue/npc-context.ts's
// deriveNpcPersonality() / prompts/dialogue-npc.ts's resolveVoiceArchetype()
// exactly, so both modules share one tag vocabulary. Mirrors
// help-system.test.ts's PACK_ONBOARDING/GENRE_TO_PACK drift guard (F-6c9e02d4)
// and packs.test.ts's own reconciliation style: an exact-match assertion so
// the two lists are forced to keep up with each other instead of silently
// drifting apart.
describe('PERSONALITY_TEMPLATES / resolveVoiceArchetype drift guard (F-c8c8c67c)', () => {
  const archetypes: VoiceArchetype[] = ['merchant', 'guard', 'scholar', 'rogue', 'noble'];

  it('has a non-empty template pool for every resolveVoiceArchetype() output', () => {
    for (const archetype of archetypes) {
      expect(PERSONALITY_TEMPLATES[archetype], `expected a pool for "${archetype}"`).toBeDefined();
      expect(PERSONALITY_TEMPLATES[archetype].length).toBeGreaterThan(0);
    }
  });

  it('has exactly resolveVoiceArchetype\'s closed set plus "default" -- no leftover or extra keys', () => {
    expect(Object.keys(PERSONALITY_TEMPLATES).sort()).toEqual([...archetypes, 'default'].sort());
  });

  it('sanity-checks the archetype list itself against the real resolveVoiceArchetype()', () => {
    expect(resolveVoiceArchetype('merchant')).toBe('merchant');
    expect(resolveVoiceArchetype('npc', ['guard'])).toBe('guard');
    expect(resolveVoiceArchetype('npc', ['mage'])).toBe('scholar');
    expect(resolveVoiceArchetype('npc', ['thief'])).toBe('rogue');
    expect(resolveVoiceArchetype('npc', ['lord'])).toBe('noble');
  });
});

// F-c8c8c67c (SLATE-1) item 3: the 18 pre-existing template lines read as
// generic dark fantasy and misfit packs with a very different register.
// PACK_AMBIENT_OVERLAYS supplies a first pass for the 4 packs reading most
// obviously wrong (Coordinator Brief pinned list); every other pack falls
// through to the generic PERSONALITY_TEMPLATES pool unchanged (asserted by
// the last test below). Overlay line copy is DRAFT.
describe('generateAmbientLine pack overlays (F-c8c8c67c)', () => {
  const overlaidPacks: Array<{ packId: string; personality: string }> = [
    { packId: 'signal-loss', personality: 'guard' },
    { packId: 'neon-lockbox', personality: 'merchant' },
    { packId: 'crimson-court', personality: 'noble' },
    { packId: 'iron-colosseum', personality: 'guard' },
  ];

  it.each(overlaidPacks)('selects from the $packId pack overlay for a matching personality, not the generic pool', ({ packId, personality }) => {
    const npc = makeNpc({ name: 'Overlay Test', personality });
    const genericPool = PERSONALITY_TEMPLATES[personality].map((t) => t.replace('{name}', npc.name));

    // Try every seed in the overlay pool's range; every one must land on
    // overlay text, never on the generic pool's text, proving the overlay is
    // actually consulted first rather than coincidentally matching once.
    for (let seed = 0; seed < 6; seed++) {
      const line = generateAmbientLine(npc, seed, packId);
      expect(line).toContain('Overlay Test');
      expect(genericPool).not.toContain(line);
    }
  });

  it('falls through to the generic pool for a pack with no overlay entry', () => {
    const npc = makeNpc({ name: 'No Overlay', personality: 'guard' });
    const withoutPack = generateAmbientLine(npc, 0);
    const withUnknownPack = generateAmbientLine(npc, 0, 'chapel-threshold');
    expect(withUnknownPack).toBe(withoutPack);
  });

  it('falls through to the generic pool when packId is a known pack but has no overlay for this personality', () => {
    // signal-loss only overlays guard/default -- scholar has no entry there.
    const npc = makeNpc({ name: 'Scholar NPC', personality: 'scholar' });
    const withoutPack = generateAmbientLine(npc, 0);
    const withPack = generateAmbientLine(npc, 0, 'signal-loss');
    expect(withPack).toBe(withoutPack);
  });
});

// F-c8c8c67c (SLATE-1) item 4: every pool is exactly 3 lines, so a caller
// that reseeds each zone-render from a raw per-turn tick alone would see the
// same NPC in the same zone repeat the same line every 3rd turn,
// deterministically. This module still only ever receives whatever `seed` a
// caller supplies (salting is necessarily the caller's job, e.g. game-core
// hashing `${tick}:${npcId}` instead of passing tick raw) -- this test
// characterizes the module's own behavior under each strategy rather than
// asserting a salting policy this file doesn't implement: a raw shared tick
// cycles in lockstep across NPCs while a per-NPC salt does not.
describe('generateAmbientLine repetition characterization (F-c8c8c67c item 4)', () => {
  it('a raw shared tick makes two co-located NPCs echo the same line on the same turns', () => {
    const alice = makeNpc({ name: 'Alice', personality: 'guard' });
    const bob = makeNpc({ name: 'Bob', personality: 'guard' });
    // Same personality pool, same raw seed every turn -- both select the
    // same pool index each time (only {name} differs in the output).
    for (let tick = 0; tick < 5; tick++) {
      const aliceLine = generateAmbientLine(alice, tick).replace('Alice', '');
      const bobLine = generateAmbientLine(bob, tick).replace('Bob', '');
      expect(aliceLine).toBe(bobLine);
    }
  });

  it('salting the seed per-NPC (hash of tick:npcId) decouples co-located NPCs', () => {
    const alice = { info: makeNpc({ name: 'Alice', personality: 'guard' }), id: 'npc-alice' };
    const bob = { info: makeNpc({ name: 'Bob', personality: 'guard' }), id: 'npc-bob' };

    function saltedSeed(tick: number, npcId: string): number {
      let hash = 0;
      const key = `${tick}:${npcId}`;
      for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) | 0;
      }
      return hash;
    }

    let sawDivergence = false;
    for (let tick = 0; tick < 5; tick++) {
      const aliceLine = generateAmbientLine(alice.info, saltedSeed(tick, alice.id)).replace('Alice', '');
      const bobLine = generateAmbientLine(bob.info, saltedSeed(tick, bob.id)).replace('Bob', '');
      if (aliceLine !== bobLine) sawDivergence = true;
    }
    expect(sawDivergence).toBe(true);
  });

  it('documents the distinct-line count across 10 consecutive same-NPC calls under a per-tick salted seed', () => {
    const npc = makeNpc({ name: 'Watcher', personality: 'guard' });
    const lines = new Set<string>();
    for (let tick = 0; tick < 10; tick++) {
      let hash = 0;
      const key = `${tick}:npc-watcher`;
      for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
      lines.add(generateAmbientLine(npc, hash));
    }
    // 3-line pool: a salted seed should reach more than 1 distinct line
    // across 10 calls (a raw incrementing tick alone would cycle through
    // all 3 predictably; this just documents the salted seed isn't stuck on
    // a single line either).
    expect(lines.size).toBeGreaterThan(1);
  });
});
