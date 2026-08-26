import { describe, it, expect } from 'vitest';
import { slashCompleter, SLASH_COMMANDS } from './slash-completer.js';

describe('slashCompleter (FT-FE-003)', () => {
  it('returns matching commands for a partial slash input', () => {
    const [hits, line] = slashCompleter('/st');
    expect(line).toBe('/st');
    expect(hits).toContain('/status');
    // Only commands starting with /st should match
    for (const h of hits) {
      expect(h.startsWith('/st')).toBe(true);
    }
  });

  it('returns all commands when no match found', () => {
    const [hits] = slashCompleter('/zzz');
    expect(hits).toEqual(SLASH_COMMANDS);
  });

  it('returns empty completions for non-slash input', () => {
    const [hits, line] = slashCompleter('attack the goblin');
    expect(hits).toEqual([]);
    expect(line).toBe('attack the goblin');
  });

  it('matches case-insensitively', () => {
    const [hits] = slashCompleter('/SH');
    expect(hits).toContain('/sheet');
  });

  it('returns exact match when full command typed', () => {
    const [hits] = slashCompleter('/help');
    expect(hits).toEqual(['/help']);
  });
});

describe('SLASH_COMMANDS (FT-FE-003)', () => {
  it('contains the core documented commands', () => {
    const required = ['/status', '/sheet', '/help', '/director', '/export', '/map'];
    for (const cmd of required) {
      expect(SLASH_COMMANDS).toContain(cmd);
    }
  });
});

describe('SLASH_COMMANDS documentation reconciliation (F-f1eb58cb)', () => {
  // Mirrors the CLI's documented command surface: bin.ts's USAGE text
  // ("Commands in-game:") plus /character, which bin.ts's game loop
  // handles as a documented alias for /sheet. Update this list if either
  // surface changes, so SLASH_COMMANDS can never silently drift from what
  // the CLI actually documents and handles again.
  const DOCUMENTED_COMMANDS = [
    '/sheet', '/character', '/status', '/map', '/leverage', '/jobs',
    '/arcs', '/conclude', '/archive', '/export', '/director', '/help',
  ];

  it('every SLASH_COMMANDS entry is referenced in the documented command set', () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(DOCUMENTED_COMMANDS).toContain(cmd);
    }
  });

  it('does not offer /save or /cost — neither is documented or handled anywhere in the CLI', () => {
    // /save is stale: the real save command is the bare word "save", not a
    // slash command. /cost is stale: no command dispatcher (bin.ts's game
    // loop, GameSession.processInput, or executeDirectorCommand) recognizes
    // it, even though token-tracker.ts has a formatCostSummary() that is
    // never wired to any input handler.
    expect(SLASH_COMMANDS).not.toContain('/save');
    expect(SLASH_COMMANDS).not.toContain('/cost');
  });
});
