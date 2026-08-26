import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderUsage } from './usage.js';

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
    expect(lines[continuationIdx]).toContain('from 10 worlds interactively)');

    const firstCol = lines[firstLineIdx].indexOf('Play a starter world');
    const continuationCol = lines[continuationIdx].indexOf('from 10 worlds interactively)');
    expect(continuationCol).toBe(firstCol);
  });
});
