import { describe, it, expect } from 'vitest';
import { parseWorldFlag, formatValidWorlds } from './world-flag.js';
import { WORLD_FLAG_MAP } from '../character/packs.js';

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
 * F-752c7e2f: this suite used to vi.mock('../character/packs.js', ...) with
 * a hand-copied, hardcoded snapshot of WORLD_FLAG_MAP -- authored when the
 * real export "does not exist in this worktree yet" (wave-18), true at the
 * time but stale from the moment WORLD_FLAG_MAP actually landed. Because the
 * mock fully replaced the module's export, this suite kept passing unchanged
 * forever, silently exercising only the original 10-world snapshot no matter
 * how many packs packs.ts later registered -- exactly the "two independently
 * maintained copies of one list" drift class this codebase's doc comments
 * say has been fixed 7+ times already (F-223de079, F-8da2e6f7, F-f1eb58cb,
 * F-5cc4d0d9, F-623e763f, F-c5ff2a5c, F-aaaa105f), just relocated into the
 * regression test meant to catch it. Importing the real WORLD_FLAG_MAP and
 * deriving every assertion from its actual keys means this suite now proves
 * whatever is really registered resolves end-to-end, and automatically
 * extends to cover the next pack addition instead of silently going stale.
 */
const shortNames = Object.keys(WORLD_FLAG_MAP);

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
    for (const name of shortNames) {
      expect(list).toContain(name);
    }
  });
});
