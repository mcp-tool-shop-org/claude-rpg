import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  // F-623e763f: DOCUMENTED_COMMANDS used to be a hand-typed literal copy of
  // bin.ts's "Commands in-game:" USAGE text — a second hardcoded copy of the
  // same list SLASH_COMMANDS itself is, so this test could only ever check
  // one hardcoded list against another, both maintained by hand. A future
  // edit to USAGE (add/remove/rename a slash command) without updating both
  // SLASH_COMMANDS and this list would have passed silently, reintroducing
  // exactly the drift F-f1eb58cb fixed.
  //
  // Parsing bin.ts's actual source text instead (not importing it — bin.ts
  // is a bare CLI entry point that calls main() as a module-level side
  // effect, so importing it would run the CLI) means an edit to the real
  // documented command surface fails this test automatically. Mirrors the
  // "read a sibling source file as text" pattern already used in
  // claude-client-deprecated.test.ts.
  function readDocumentedCommands(): string[] {
    const binSrc = readFileSync(resolve(import.meta.dirname, '..', 'bin.ts'), 'utf-8');
    const start = binSrc.indexOf('Commands in-game:');
    const end = binSrc.indexOf('Environment:', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = binSrc.slice(start, end);
    // Slash-command tokens, including inline mentions like "(/character is
    // an alias)" — excludes mid-word slashes like the "md/json/finale" in
    // the /export line via the negative lookbehind.
    return [...block.matchAll(/(?<![a-zA-Z0-9])\/[a-z][a-z-]*/g)].map((m) => m[0]);
  }

  it('every SLASH_COMMANDS entry is referenced in the documented command set', () => {
    const documented = readDocumentedCommands();
    for (const cmd of SLASH_COMMANDS) {
      expect(documented).toContain(cmd);
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
