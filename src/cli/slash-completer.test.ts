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

  // F-ffc12b36: /recruit and /dismiss are real, fully-working play-mode
  // commands (game.ts dispatches them to handleRecruit/handleDismiss) with
  // zero discoverability anywhere in the CLI -- absent from tab completion,
  // --help, and the in-game /help screen. The only place either was even
  // named was an empty-state hint buried in director mode.
  it('contains /recruit and /dismiss (F-ffc12b36)', () => {
    expect(SLASH_COMMANDS).toContain('/recruit');
    expect(SLASH_COMMANDS).toContain('/dismiss');
  });

  // Cross-domain COST COMMAND contract (wave-14): game-core wires a
  // SessionTokenTracker into GameSession and exposes
  // GameSession.getCostSummary(): string; cli-display's half is this
  // completer entry plus bin.ts's /cost dispatch branch and help text. This
  // supersedes the "does not offer /cost" test that lived in the
  // reconciliation describe block below -- /cost is real now, not stale.
  it('contains /cost (COST COMMAND contract)', () => {
    expect(SLASH_COMMANDS).toContain('/cost');
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
  // F-d36903d0: the USAGE text this reads moved from bin.ts's inline
  // template literal to its own module (usage.ts, renderUsage()) — bin.ts
  // is still a bare CLI entry point that calls main() as a module-level
  // side effect, so importing either file would run the CLI, but usage.ts
  // now houses the "Commands in-game:" block on its own. Parsing its actual
  // source text (not importing it) means an edit to the real documented
  // command surface still fails this test automatically. Mirrors the "read
  // a sibling source file as text" pattern already used in
  // claude-client-deprecated.test.ts.
  function readDocumentedCommands(): string[] {
    const usageSrc = readFileSync(resolve(import.meta.dirname, 'usage.ts'), 'utf-8');
    const start = usageSrc.indexOf('Commands in-game:');
    const end = usageSrc.indexOf('Environment:', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = usageSrc.slice(start, end);
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

  // F-5cc4d0d9: the test above only ever checked one direction -- every
  // SLASH_COMMANDS entry is documented -- never the reverse. A future edit
  // that added a new command to bin.ts's USAGE text without also adding it
  // to SLASH_COMMANDS (documented in --help but never tab-completable
  // in-game) would have passed this suite silently. The regex already
  // excludes mid-word slashes (e.g. "md/json/finale"), so plain-word entries
  // like "save"/"quit" can't false-positive here.
  it('every documented slash command is also offered by SLASH_COMMANDS (F-5cc4d0d9)', () => {
    const documented = readDocumentedCommands();
    for (const cmd of documented) {
      expect(SLASH_COMMANDS).toContain(cmd);
    }
  });

  it('does not offer /save — the real save command is the bare word "save", not a slash command', () => {
    // /cost used to be excluded here too (stale: no dispatcher recognized
    // it despite token-tracker.ts's formatCostSummary() existing). It's
    // real now -- see the COST COMMAND contract test above and bin.ts's
    // /cost dispatch branch.
    expect(SLASH_COMMANDS).not.toContain('/save');
  });
});
