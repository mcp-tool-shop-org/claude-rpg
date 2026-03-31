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
