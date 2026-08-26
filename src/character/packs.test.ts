import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { allPacks, getPackById, resolveWorldFlag, WORLD_FLAG_MAP } from './packs.js';
import { PACK_VOICES } from '../prompts/finale-prompt.js';

const require = createRequire(import.meta.url);

/**
 * F-00ddfc68: three @ai-rpg-engine/starter-* dependencies (gladiator, ronin,
 * vampire) are installed and type-correct (their dist/index.d.ts declares
 * the same { createGame, packMeta, buildCatalog, itemCatalog,
 * <name>MinimalRuleset } shape as the 7 already-wired packs) but are NOT
 * registered here: each one's compiled setup.js imports BUILTIN_PACK_BIASES
 * from '@ai-rpg-engine/modules', and the currently-locked
 * @ai-rpg-engine/modules@2.1.0 (package-lock.json) does not export that
 * name anywhere (confirmed: 0 matches in its dist/index.js or
 * dist/index.d.ts; no nested duplicate copy exists either). None of the 7
 * working packs reference BUILTIN_PACK_BIASES, so this is not a usage bug
 * in this repo -- it's an upstream version skew between these three starter
 * packages and @ai-rpg-engine/modules. Because packs.ts would import all
 * packs eagerly at module scope, registering any of these three would crash
 * *every* CLI invocation with a link-time SyntaxError (verified directly:
 * `npx vitest run src/character/packs.test.ts` throws
 * "The requested module '@ai-rpg-engine/modules' does not provide an
 * export named 'BUILTIN_PACK_BIASES'" the moment packs.ts imports any of
 * them), not just a code path that happens to touch the missing export.
 * Fixing the skew means bumping @ai-rpg-engine/modules and regenerating
 * package-lock.json, which is outside src/character/** and outside what
 * this task may do (no npm install/ci -- see PROTOCOL.md worktree notes).
 */
// Emptied by the engine 2.9.x migration — every installed starter pack is
// registerable. Add a name here ONLY with a companion tripwire test proving
// the block, the way the original gladiator/ronin/vampire entry did.
const KNOWN_BLOCKED_STARTER_PACKS: string[] = [];

describe('packs registry (F-00ddfc68 drift gate)', () => {
  const pkg = require('../../package.json') as {
    dependencies?: Record<string, string>;
  };
  const starterPrefix = '@ai-rpg-engine/starter-';
  const starterDepNames = Object.keys(pkg.dependencies ?? {}).filter((name) =>
    name.startsWith(starterPrefix),
  );
  // e.g. '@ai-rpg-engine/starter-weird-west' -> 'weird-west'
  const allShortNames = starterDepNames.map((name) => name.slice(starterPrefix.length));
  const registerableShortNames = allShortNames.filter(
    (name) => !KNOWN_BLOCKED_STARTER_PACKS.includes(name),
  );

  it('finds starter-* dependencies in package.json (sanity-checks the probe itself)', () => {
    expect(starterDepNames.length).toBeGreaterThan(0);
  });

  it('allPacks has exactly one entry per registerable @ai-rpg-engine/starter-* dependency', () => {
    expect(allPacks.length).toBe(registerableShortNames.length);
  });

  it.each(registerableShortNames)(
    'starter-%s resolves through resolveWorldFlag() to a pack registered in allPacks',
    (shortName) => {
      const packId = resolveWorldFlag(shortName);
      expect(packId).toBeDefined();
      expect(getPackById(packId as string)).toBeDefined();
    },
  );

  // F-f4f6ac90: PACK_VOICES is keyed by pack.meta.narratorTone, not by the
  // starter-* short name / genre string (see finale-prompt.ts's PACK_VOICES
  // doc comment for why the old genre-keyed scheme collided/mismatched).
  // Look each registered pack up by its real narratorTone via allPacks/
  // getPackById, not by shortName, so this test tracks the actual production
  // lookup key instead of a coincidentally-matching string.
  it.each(registerableShortNames)('starter-%s has a PACK_VOICES epilogue-voice entry keyed by its narratorTone', (shortName) => {
    const packId = resolveWorldFlag(shortName);
    const pack = getPackById(packId as string);
    expect(pack).toBeDefined();
    expect(PACK_VOICES[pack!.meta.narratorTone]).toBeTruthy();
  });

  it('every package.json starter-* dependency is either registered or a documented blocked pack', () => {
    // If this fails, someone added an 11th starter-* dependency. Either wire
    // it into allPacks/resolveWorldFlag/PACK_VOICES (preferred), or add it
    // to KNOWN_BLOCKED_STARTER_PACKS above with a reason, matching the
    // gladiator/ronin/vampire precedent -- never let a dependency go
    // unregistered *and* undocumented, which is exactly how F-00ddfc68
    // shipped in the first place.
    for (const name of allShortNames) {
      const isRegistered = registerableShortNames.includes(name);
      const isDocumentedBlocked = KNOWN_BLOCKED_STARTER_PACKS.includes(name);
      expect(isRegistered || isDocumentedBlocked).toBe(true);
    }
  });
});

// F-ef4a283d (SLATE-4) / Coordinator Brief contract #3: WORLD_FLAG_MAP is
// resolveWorldFlag's own inline map, hoisted to an exported const so
// cli-display (bin.ts) can build its own "valid worlds are: ..." error copy
// from the SAME source instead of hand-duplicating the list.
describe('WORLD_FLAG_MAP (F-ef4a283d / Coordinator Brief contract #3)', () => {
  it('is exported and resolveWorldFlag derives from it directly (same value for every key)', () => {
    for (const key of Object.keys(WORLD_FLAG_MAP)) {
      expect(resolveWorldFlag(key)).toBe(WORLD_FLAG_MAP[key]);
    }
  });

  it('every value resolves to a pack registered in allPacks', () => {
    for (const packId of Object.values(WORLD_FLAG_MAP)) {
      expect(getPackById(packId)).toBeDefined();
    }
  });
});

// F-ef4a283d / Coordinator Brief ruling R1: unknown --world handling
// (structured error + exit 1) is decided pre-interactively in bin.ts
// (cli-display's half). packs.ts must stay QUIET -- resolveWorldFlag's old
// console.warn is removed so this module never prints, matching R1's
// "packs.ts never prints" instruction.
describe('resolveWorldFlag quiet-on-unknown (F-ef4a283d / R1)', () => {
  it('returns undefined for an unrecognized world name without logging anything', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = resolveWorldFlag('not-a-real-world');

    expect(result).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });
});

/**
 * Live tripwire, not a static allowlist: these three imports are expected
 * to keep failing for the specific BUILTIN_PACK_BIASES reason above. The
 * moment @ai-rpg-engine/modules is upgraded to export it, these tests start
 * FAILING -- that failure is the signal to finish F-00ddfc68 for real (wire
 * the pack into packs.ts's imports/allPacks/resolveWorldFlag, then delete its
 * name from KNOWN_BLOCKED_STARTER_PACKS and its case here).
 *
 * F-f4f6ac90 update: finale-prompt.ts's PACK_VOICES no longer needs a
 * matching change at that point -- it already carries forward entries for
 * all three packs, keyed by their narratorTone (see the describe block
 * below and finale-prompt.ts's PACK_VOICES doc comment).
 */
describe('starter-gladiator/ronin/vampire (F-00ddfc68: registered after the engine 2.9.x migration)', () => {
  // The wave-10 tripwire asserted these imports THREW on the missing
  // BUILTIN_PACK_BIASES export; the migration cleared it and the packs are
  // registered. These are the positive halves the tripwire promised.
  for (const [family, id] of [
    ['gladiator', 'iron-colosseum'],
    ['ronin', 'jade-veil'],
    ['vampire', 'crimson-court'],
  ] as const) {
    it(`starter-${family} imports and is registered in allPacks as ${id}`, async () => {
      const mod = await import(`@ai-rpg-engine/starter-${family}`);
      expect(mod.packMeta.id).toBe(id);
      const entry = getPackById(id);
      expect(entry).toBeDefined();
      expect(entry?.meta.id).toBe(id);
      expect(typeof entry?.createGame).toBe('function');
    });
  }
});

/**
 * F-f4f6ac90 forward entries: gladiator/ronin/vampire aren't registered in
 * allPacks (see the live tripwire above), so their real PackMetadata can't be
 * read via getPackById the way the registered-pack test above does --
 * importing the packages themselves throws. These narratorTone strings are
 * therefore hardcoded, copied verbatim from each package's compiled
 * dist/content.js by this wave's static extraction (grep-based, not import
 * -based). If a package's authored narratorTone ever changes, this test
 * (or finale-prompt.ts's matching PACK_VOICES key) will drift and should be
 * reconciled -- same spirit as the live tripwire above, just static instead
 * of import-based since the import path itself is unavailable here.
 */
describe('PACK_VOICES forward entries (F-f4f6ac90): gladiator/ronin/vampire', () => {
  const BLOCKED_PACK_NARRATOR_TONES: Record<string, string> = {
    gladiator: 'roman arena, visceral, theatrical, defiant',
    ronin: 'feudal court, restrained, precise, weighted with consequence',
    vampire: 'gothic horror, intimate, decadent, predatory',
  };

  it.each(Object.entries(BLOCKED_PACK_NARRATOR_TONES))(
    'PACK_VOICES has a forward entry for starter-%s, keyed by its narratorTone',
    (_shortName, narratorTone) => {
      expect(PACK_VOICES[narratorTone]).toBeTruthy();
    },
  );

  it('every KNOWN_BLOCKED_STARTER_PACKS entry has a matching forward entry documented here', () => {
    // Keeps this describe block honest if KNOWN_BLOCKED_STARTER_PACKS ever
    // gains or loses a pack without a matching update here.
    for (const name of KNOWN_BLOCKED_STARTER_PACKS) {
      expect(BLOCKED_PACK_NARRATOR_TONES[name]).toBeDefined();
    }
  });
});
