import { describe, it, expect, vi } from 'vitest';

/**
 * F-7862c05d: bin.ts imported resolveWorldFlag from character/packs.ts but
 * never called it -- runPlay(args) only ever checked args.includes('--fast');
 * a real `--world <name>` flag had never been implemented, only ever
 * promised and then removed as a false claim (F-575952b0, closed in an
 * earlier wave). parseWorldFlag is the real thing, extracted to its own
 * testable module matching this codebase's established bin.ts-extraction
 * convention (F-6506450c/F-bd2fef5a/F-d36903d0) -- bin.ts is a bare CLI
 * entry point with no exports and runs main() unconditionally at module
 * load, so it cannot itself be imported from a test.
 *
 * Director ruling R1 (wave-18/cli-display.md coordinator brief): an unknown
 * --world is a structured error + exit 1, resolved fully pre-interactive
 * (before buildCharacter/readline start) -- the degrade-to-interactive-menu
 * alternative is overruled. bin.ts owns the reject-and-exit decision; this
 * module only classifies the input.
 *
 * Isolation discipline: WORLD_FLAG_MAP is narrative-llm's hoist of packs.ts's
 * inline resolveWorldFlag map (packs.ts:119-130), landing the same wave --
 * it does not exist in this worktree yet. Partially mocked below with the
 * EXACT content of the inline map it replaces, so resolveWorldFlag/
 * getPackById/allPacks stay real and this test exercises actual resolution
 * logic instead of a fully-mocked stand-in. Proven end-to-end against the
 * real hoisted export at the coordinator's merge-time serial verify.
 */
vi.mock('../character/packs.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../character/packs.js')>();
  return {
    ...actual,
    WORLD_FLAG_MAP: {
      fantasy: 'chapel-threshold',
      gladiator: 'iron-colosseum',
      ronin: 'jade-veil',
      vampire: 'crimson-court',
      cyberpunk: 'neon-lockbox',
      detective: 'gaslight-detective',
      pirate: 'black-flag-requiem',
      'weird-west': 'dust-devils-bargain',
      zombie: 'ashfall-dead',
      colony: 'signal-loss',
    },
  };
});

import { parseWorldFlag, formatValidWorlds } from './world-flag.js';

describe('parseWorldFlag (F-7862c05d)', () => {
  it('returns an empty result when --world is not present', () => {
    expect(parseWorldFlag(['--fast'])).toEqual({});
    expect(parseWorldFlag([])).toEqual({});
  });

  it('resolves a valid world name to its real PackInfo via resolveWorldFlag + getPackById', () => {
    const { packInfo, errorMessage } = parseWorldFlag(['--world', 'fantasy']);
    expect(errorMessage).toBeUndefined();
    expect(packInfo).toBeDefined();
    expect(packInfo?.meta.id).toBe('chapel-threshold');
  });

  it('resolves every WORLD_FLAG_MAP short name to a real registered pack', () => {
    const shortNames = [
      'fantasy', 'gladiator', 'ronin', 'vampire', 'cyberpunk',
      'detective', 'pirate', 'weird-west', 'zombie', 'colony',
    ];
    for (const name of shortNames) {
      const { packInfo, errorMessage } = parseWorldFlag(['--world', name]);
      expect(errorMessage, `"${name}" should resolve cleanly`).toBeUndefined();
      expect(packInfo, `"${name}" should resolve to a PackInfo`).toBeDefined();
    }
  });

  it('is case-sensitive -- an exact match against the known short names only', () => {
    const { packInfo, errorMessage } = parseWorldFlag(['--world', 'Fantasy']);
    expect(packInfo).toBeUndefined();
    expect(errorMessage).toContain('Unknown world "Fantasy"');
  });

  it('rejects a missing value with a message distinct from an unknown name', () => {
    const { errorMessage, packInfo } = parseWorldFlag(['--world']);
    expect(packInfo).toBeUndefined();
    expect(errorMessage).toBe('--world requires a value, e.g. --world fantasy');
  });

  it('rejects a flag-shaped next token (e.g. the next real flag) as missing, not as an unknown name', () => {
    const { errorMessage, packInfo } = parseWorldFlag(['--world', '--fast']);
    expect(packInfo).toBeUndefined();
    expect(errorMessage).toBe('--world requires a value, e.g. --world fantasy');
  });

  it('rejects an unrecognized name with the valid-worlds list embedded in the message', () => {
    const { errorMessage, packInfo } = parseWorldFlag(['--world', 'atlantis']);
    expect(packInfo).toBeUndefined();
    expect(errorMessage).toContain('Unknown world "atlantis"');
    expect(errorMessage).toContain('Valid worlds:');
    expect(errorMessage).toContain('fantasy');
    expect(errorMessage).toContain('colony');
  });

  it('finds --world anywhere in argv, not only as the first token', () => {
    const { packInfo } = parseWorldFlag(['--debug', '--world', 'cyberpunk']);
    expect(packInfo?.meta.id).toBe('neon-lockbox');
  });
});

describe('formatValidWorlds (F-7862c05d)', () => {
  it('lists every WORLD_FLAG_MAP key, comma-separated -- the single source parseWorldFlag itself uses', () => {
    const list = formatValidWorlds();
    for (const name of [
      'fantasy', 'gladiator', 'ronin', 'vampire', 'cyberpunk',
      'detective', 'pirate', 'weird-west', 'zombie', 'colony',
    ]) {
      expect(list).toContain(name);
    }
  });
});
