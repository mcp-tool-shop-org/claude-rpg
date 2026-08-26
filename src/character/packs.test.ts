import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { allPacks, getPackById, resolveWorldFlag } from './packs.js';
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
const KNOWN_BLOCKED_STARTER_PACKS = ['gladiator', 'ronin', 'vampire'];

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

  it.each(registerableShortNames)('starter-%s has a PACK_VOICES epilogue-voice entry', (shortName) => {
    expect(PACK_VOICES[shortName]).toBeTruthy();
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

/**
 * Live tripwire, not a static allowlist: these three imports are expected
 * to keep failing for the specific BUILTIN_PACK_BIASES reason above. The
 * moment @ai-rpg-engine/modules is upgraded to export it, these tests start
 * FAILING -- that failure is the signal to finish F-00ddfc68 for real (wire
 * the pack into packs.ts's imports/allPacks/resolveWorldFlag and into
 * finale-prompt.ts's PACK_VOICES, then delete its name from
 * KNOWN_BLOCKED_STARTER_PACKS and its case here).
 */
describe('starter-gladiator/ronin/vampire (F-00ddfc68: blocked on upstream @ai-rpg-engine/modules skew)', () => {
  it('starter-gladiator is still unimportable due to the missing BUILTIN_PACK_BIASES export', async () => {
    await expect(import('@ai-rpg-engine/starter-gladiator')).rejects.toThrow(
      /BUILTIN_PACK_BIASES/,
    );
  });

  it('starter-ronin is still unimportable due to the missing BUILTIN_PACK_BIASES export', async () => {
    await expect(import('@ai-rpg-engine/starter-ronin')).rejects.toThrow(
      /BUILTIN_PACK_BIASES/,
    );
  });

  it('starter-vampire is still unimportable due to the missing BUILTIN_PACK_BIASES export', async () => {
    await expect(import('@ai-rpg-engine/starter-vampire')).rejects.toThrow(
      /BUILTIN_PACK_BIASES/,
    );
  });
});
