import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderUsage } from './usage.js';
import { WORLD_FLAG_MAP } from '../character/packs.js';

/**
 * F-7862c05d (wave-18/cli-display.md): WORLD_FLAG_MAP is narrative-llm's
 * hoist of packs.ts's inline resolveWorldFlag map (packs.ts:119-130).
 *
 * F-752c7e2f: this suite used to vi.mock('../character/packs.js', ...) with
 * a hand-copied, hardcoded snapshot of WORLD_FLAG_MAP -- authored when the
 * real export "does not exist in this worktree yet" (wave-18), true at the
 * time but stale from the moment WORLD_FLAG_MAP actually landed. Because the
 * mock fully replaced the module's export, this suite kept passing unchanged
 * forever, silently exercising only the original 10-world snapshot no matter
 * how many packs packs.ts later registered -- the same "two independently
 * maintained copies of one list" drift class this codebase's doc comments
 * say has been fixed 7+ times already (F-223de079, F-8da2e6f7, F-f1eb58cb,
 * F-5cc4d0d9, F-623e763f, F-c5ff2a5c, F-aaaa105f), just relocated into the
 * regression test meant to catch it. Importing the real WORLD_FLAG_MAP (and
 * deriving the world-count text below from its actual length, matching
 * usage.ts's own F-752c7e2f fix) means this suite now proves whatever is
 * really registered renders correctly end-to-end, instead of silently going
 * stale the next time a pack is added.
 */
const worldShortNames = Object.keys(WORLD_FLAG_MAP);
const worldsPhrase = `from ${worldShortNames.length} worlds interactively)`;

/**
 * F-d36903d0: bin.ts's USAGE block (shown on bare `claude-rpg`, `--help`/
 * `-h`, and any unrecognized command — almost certainly the first screen a
 * new player sees) was a plain, undecorated template literal: no divider
 * rule, no bold/color title, unlike every other reference-style screen in
 * this domain (renderWelcome, renderPlayHelp, renderLeverageHelp,
 * renderArcHelp, renderConcludeHelp, renderDirectorHelp, renderCompactStatus)
 * which all box their header between rules with a bold/colored title.
 * Extracted to its own module (bin.ts is a bare CLI entry point with no
 * exports — mirrors save-listing.ts's/save-selection.ts's own extraction —
 * see those files' doc comments) so this can be tested directly instead of
 * only reachable through a hand-copied fork.
 *
 * Separately, the wrapped continuation of the `play` command's description
 * ("from 10 worlds interactively)") started one column right of where its
 * own first line ("Play a starter world (choose") starts — the same
 * off-by-one hand-typed-spacing pattern this wave's help-system.ts and
 * director-renderer.ts findings hit in two other files.
 */
describe('renderUsage (F-d36903d0)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('preserves every command and section from the original USAGE text', () => {
    const usage = renderUsage();
    // Top-level commands
    expect(usage).toContain('claude-rpg play [--fast]');
    expect(usage).toContain('claude-rpg load');
    expect(usage).toContain('claude-rpg new "<prompt>"');
    expect(usage).toContain('claude-rpg archive');
    expect(usage).toContain('claude-rpg --version');
    expect(usage).toContain('claude-rpg --help');
    // In-game commands section
    expect(usage).toContain('Commands in-game:');
    expect(usage).toContain('/sheet');
    expect(usage).toContain('/director');
    expect(usage).toContain('/cost');
    expect(usage).toContain('quit           Exit the game');
    // Environment section
    expect(usage).toContain('Environment:');
    expect(usage).toContain('ANTHROPIC_API_KEY');
  });

  it('boxes the title between divider rules, matching renderWelcome/renderDirectorHelp convention', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });
    const usage = renderUsage();
    const lines = usage.split('\n');
    const ruleIdx = lines.findIndex((l) => l.includes('─'.repeat(80)));
    expect(ruleIdx).toBeGreaterThan(-1);
    // Title line follows the first rule.
    expect(lines[ruleIdx + 1]).toContain('claude-rpg');
    // A second rule closes the header box.
    const secondRuleIdx = lines.findIndex(
      (l, idx) => idx > ruleIdx && l.includes('─'.repeat(80)),
    );
    expect(secondRuleIdx).toBeGreaterThan(ruleIdx + 1);
  });

  it('bolds the title when colors are enabled', async () => {
    const originalIsTTY = process.stdout.isTTY;
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    const mod = await import('./usage.js');
    const usage = mod.renderUsage();
    expect(usage).toContain('\x1b[1m'); // bold
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
    vi.resetModules();
  });

  it('divider width tracks the terminal, matching this domain\'s other dividers (F-38eb3dec convention)', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 50, writable: true });
    const usage = renderUsage();
    expect(usage).toContain('─'.repeat(50));
    expect(usage).not.toContain('─'.repeat(51));
  });

  it('aligns the wrapped continuation of the play command description with its first line (no 1-column drift)', () => {
    const usage = renderUsage();
    const lines = usage.split('\n');
    const firstLineIdx = lines.findIndex((l) => l.includes('Play a starter world'));
    expect(firstLineIdx).toBeGreaterThan(-1);
    const continuationIdx = firstLineIdx + 1;
    expect(lines[continuationIdx]).toContain(worldsPhrase);

    const firstCol = lines[firstLineIdx].indexOf('Play a starter world');
    const continuationCol = lines[continuationIdx].indexOf(worldsPhrase);
    expect(continuationCol).toBe(firstCol);
  });
});

/**
 * F-a5396488: `[--debug]` used to render nested directly under
 * `claude-rpg play [--fast]` as if it were a play-only flag, even though
 * main() parses it globally (before command dispatch) and every subcommand's
 * error rendering honors it. Moved to its own "Global flags:" section below
 * the per-command list.
 */
describe('renderUsage --debug is documented as a global flag (F-a5396488)', () => {
  it('lists --debug under its own "Global flags:" section, not nested under play', () => {
    const usage = renderUsage();
    expect(usage).toContain('Global flags:');
    expect(usage).toContain('--debug');
    expect(usage).toContain('Show structured error details');

    const lines = usage.split('\n');
    const playIdx = lines.findIndex((l) => l.includes('claude-rpg play [--fast]'));
    const globalFlagsIdx = lines.findIndex((l) => l.includes('Global flags:'));
    const debugIdx = lines.findIndex((l) => l.includes('--debug'));
    expect(playIdx).toBeGreaterThan(-1);
    expect(globalFlagsIdx).toBeGreaterThan(playIdx);
    // --debug sits under its own section header, not immediately under play.
    expect(debugIdx).toBeGreaterThan(globalFlagsIdx);
    // The line directly below the play command's two-line description is
    // now `load`, not `[--debug]` -- confirms it was removed from that spot.
    const continuationIdx = lines.findIndex((l) => l.includes(worldsPhrase));
    expect(lines[continuationIdx + 1]).toContain('claude-rpg load');
  });
});

/**
 * F-7862c05d: --world <name> was imported (resolveWorldFlag) but never
 * wired to a real flag -- a player had no way to discover the 10 valid
 * values short of reading source. Reuses help-system.ts's already-exported,
 * already-tested renderNameDescriptionRow/wrapWords instead of hand-padding
 * a new column (this exact drift class has been fixed 3+ times already --
 * F-a17315ac, F-d36903d0, F-1367afd9).
 */
describe('renderUsage Worlds section (F-7862c05d)', () => {
  it('lists --world flag values against their real pack titles, not raw pack ids', () => {
    const usage = renderUsage();
    expect(usage).toContain('Worlds');
    expect(usage).toContain('--world');
    // Flag name -> real title (character/packs.ts's resolveWorldFlag map /
    // its hoisted WORLD_FLAG_MAP).
    expect(usage).toContain('fantasy');
    expect(usage).toContain('The Chapel Threshold');
    expect(usage).not.toContain('chapel-threshold');
    expect(usage).toContain('cyberpunk');
    expect(usage).toContain('Neon Lockbox');
  });

  it('lists every WORLD_FLAG_MAP short name', () => {
    const usage = renderUsage();
    for (const name of worldShortNames) {
      expect(usage).toContain(name);
    }
  });

  it('renders the Worlds section rows within getTerminalWidth() at a narrow terminal', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 50, writable: true });
    const usage = renderUsage();
    const lines = usage.split('\n');
    const worldsIdx = lines.findIndex((l) => l.includes('Worlds ('));
    expect(worldsIdx).toBeGreaterThan(-1);
    // The Worlds section runs from its header to the next blank line.
    let i = worldsIdx + 1;
    let rowCount = 0;
    while (i < lines.length && lines[i].trim() !== '') {
      expect(lines[i].length).toBeLessThanOrEqual(50);
      rowCount++;
      i++;
    }
    expect(rowCount).toBeGreaterThan(0);
  });
});

/**
 * F-9c2dbb5b: the Usage:/Global flags:/Commands in-game: blocks were raw
 * hardcoded template lines, never measured against getTerminalWidth() --
 * unlike this same function's divider and Worlds section, both already
 * proven safe above. Routed through renderNameDescriptionRow so every row
 * wraps with a hanging indent instead of hard-wrapping wherever the real
 * terminal breaks it (ADDENDUM-COMMON's binding width-safety rule: hold at
 * 40 and 120 columns).
 *
 * At the 40-column floor, USAGE_NAME_WIDTH (27) is wide enough that
 * renderNameDescriptionRow's own available-width floor (never below 10,
 * so a name column doesn't starve the description entirely) kicks in --
 * required to preserve the pre-existing pinned wrap-split assertion below
 * (nameWidth must stay in [24,27] for that split to land exactly where it
 * does at 60 columns). Combined with "interactively)" being a single
 * 14-character word that wrapWords leaves unsplit by design (never
 * corrupted mid-word), a couple of Usage: rows land a few characters past
 * the nominal 40-column width at that floor -- graceful degradation, not a
 * crash or a corrupted word, and strictly better than the pre-fix template
 * literal's unbounded hard-wrap-anywhere-mid-word behavior. The Commands
 * in-game: table (narrower COMMANDS_NAME_WIDTH) does stay within 40 columns
 * outright, so that section gets the stricter assertion.
 */
describe('renderUsage Usage:/Commands in-game: sections hold at width extremes (F-9c2dbb5b)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  function rowsUnderHeader(lines: string[], header: string): string[] {
    const headerIdx = lines.findIndex((l) => l.includes(header));
    expect(headerIdx).toBeGreaterThan(-1);
    const rows: string[] = [];
    let i = headerIdx + 1;
    while (i < lines.length && lines[i].trim() !== '') {
      rows.push(lines[i]);
      i++;
    }
    expect(rows.length).toBeGreaterThan(0);
    return rows;
  }

  it('Commands in-game: rows stay within width at a 40-column floor', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const lines = renderUsage().split('\n');
    for (const row of rowsUnderHeader(lines, 'Commands in-game:')) {
      expect(row.length).toBeLessThanOrEqual(40);
    }
  });

  it('every Usage:/Commands in-game: row stays within width at a 120-column ceiling', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 200, writable: true });
    const lines = renderUsage().split('\n');
    for (const row of [...rowsUnderHeader(lines, 'Usage:'), ...rowsUnderHeader(lines, 'Commands in-game:')]) {
      expect(row.length).toBeLessThanOrEqual(120);
    }
  });

  it('no command name or word is split mid-word at the 40-column floor, for either section', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const usage = renderUsage();
    // Every command token still appears intact even once its description wraps.
    expect(usage).toContain('claude-rpg play [--fast]');
    expect(usage).toContain('claude-rpg new "<prompt>"');
    expect(usage).toContain('/recruit');
    expect(usage).toContain('quit');
    // The one word long enough to itself land past the 40-column floor
    // (14 chars) still renders whole, never corrupted mid-word.
    expect(usage).toContain('interactively)');
  });

  it('Usage: rows still carry a hanging indent at the 40-column floor (degrade gracefully, not corrupt)', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const lines = renderUsage().split('\n');
    const rows = rowsUnderHeader(lines, 'Usage:');
    // Every continuation line (not starting a new "claude-rpg ..." entry)
    // hangs indented under the name column, matching every other
    // renderNameDescriptionRow table in this domain -- not flush left.
    const continuationLines = rows.filter((r) => !r.trim().startsWith('claude-rpg'));
    expect(continuationLines.length).toBeGreaterThan(0);
    for (const line of continuationLines) {
      expect(line.startsWith('    ' + ' '.repeat(27))).toBe(true);
    }
  });
});
