import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { renderPlayScreen, renderWelcome, isCriticalHp, renderDeathScreen } from './play-renderer.js';

describe('play-renderer', () => {
  it('should render a play screen with narration', () => {
    const engine = createGame();
    const output = renderPlayScreen({
      narration: 'You stand before a crumbling chapel.',
      world: engine.world,
      availableActions: engine.getAvailableActions(),
    });

    expect(output).toContain('You stand before a crumbling chapel.');
    expect(output).toContain('What do you do?');
  });

  // F-fa6524ec: availableActions was a REQUIRED opts field but this
  // function's body never read it -- every caller had to compute the full
  // available-actions list purely to satisfy the type, for a value thrown
  // away unconditionally. Now optional, so a caller with nothing to compute
  // can omit it entirely instead of passing a throwaway []. This is
  // primarily a type-level change (verified by tsc, since plain vitest
  // execution doesn't enforce a missing-required-property error either way)
  // -- this test pins the omitted-field call as a real, working usage.
  it('should render a play screen when availableActions is omitted entirely', () => {
    const engine = createGame();
    const output = renderPlayScreen({
      narration: 'Test narration.',
      world: engine.world,
    });

    expect(output).toContain('Test narration.');
  });

  it('should include player status', () => {
    const engine = createGame();
    const output = renderPlayScreen({
      narration: 'Test narration.',
      world: engine.world,
      availableActions: [],
    });

    expect(output).toContain('hp:');
  });

  it('should include dialogue when present', () => {
    const engine = createGame();
    const output = renderPlayScreen({
      narration: 'Test narration.',
      dialogue: {
        speakerId: 'pilgrim',
        speakerName: 'Suspicious Pilgrim',
        text: 'Turn back, traveler.',
        isFallback: false,
        grounding: {
          beliefCount: 2,
          memoryCount: 1,
          morale: 50,
          suspicion: 60,
        },
      },
      world: engine.world,
      availableActions: [],
    });

    expect(output).toContain('Suspicious Pilgrim');
    expect(output).toContain('Turn back, traveler.');
  });

  it('should render welcome screen', () => {
    const output = renderWelcome('The Chapel Threshold', 'dark fantasy');
    expect(output).toContain('The Chapel Threshold');
    expect(output).toContain('dark fantasy');
    expect(output).toContain('/director');
  });

  // F-55401320: the welcome screen (first thing printed after character
  // creation or a save load, before the opening narration) taught /director
  // and /sheet but never mentioned /help -- the one command that unlocks the
  // full reference. A new player's first-ever CLI hint set pointed at a
  // niche diagnostic mode and the character sheet, not at "how do I see
  // everything this game supports."
  it('should hint at /help alongside /director and /sheet', () => {
    const output = renderWelcome('The Chapel Threshold', 'dark fantasy');
    expect(output).toContain('/help');
  });
});

/**
 * F-ce17a470: colors.ts defines `critical` (bold red, doc'd "Critical
 * danger / death") but a full grep of every production call site in this
 * domain showed it called zero times -- HP, the single most important
 * number in the game, rendered as plain uncolored text in both the full
 * play screen (here) and the compact status screen (status-compact.ts) at
 * every severity. isCriticalHp is the shared threshold both screens now
 * color HP against, so they can't independently drift on what counts as
 * "critical."
 */
describe('isCriticalHp (F-ce17a470)', () => {
  it('is false when maxHp is unknown (no scale to measure "low" against)', () => {
    expect(isCriticalHp(1, undefined)).toBe(false);
    expect(isCriticalHp(0, undefined)).toBe(false);
  });

  it('is false above the critical threshold', () => {
    expect(isCriticalHp(50, 100)).toBe(false);
    expect(isCriticalHp(26, 100)).toBe(false);
  });

  it('is true at or below the critical threshold (25% of max)', () => {
    expect(isCriticalHp(25, 100)).toBe(true);
    expect(isCriticalHp(5, 100)).toBe(true);
    expect(isCriticalHp(0, 100)).toBe(true);
  });
});

describe('renderPlayScreen HP coloring (F-ce17a470)', () => {
  afterEach(() => {
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = undefined;
    delete process.env.NO_COLOR;
  });

  const world = {
    playerId: 'p1',
    locationId: 'z1',
    entities: { p1: { name: 'Hero', resources: { hp: 10 }, statuses: [] } },
    zones: { z1: { name: 'Town', neighbors: [] } },
    factions: {},
  } as any;

  it('colors HP critical (bold red) when at or below the threshold, with colors enabled', async () => {
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    const mod = await import('./play-renderer.js');
    const output = mod.renderPlayScreen({
      narration: 'Test.',
      world,
      availableActions: [],
      profileStatus: {
        name: 'Hero', level: 1, archetypeName: 'Warrior',
        hp: 5, maxHp: 100, injuryTags: [], statuses: [],
      },
    });
    expect(output).toContain('\x1b[31m'); // red
    expect(output).toContain('\x1b[1m'); // bold
    expect(output).toContain('HP: 5');
  });

  it('does not color HP when healthy, even with colors enabled', async () => {
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    const mod = await import('./play-renderer.js');
    const output = mod.renderPlayScreen({
      narration: 'Test.',
      world,
      availableActions: [],
      profileStatus: {
        name: 'Hero', level: 1, archetypeName: 'Warrior',
        hp: 90, maxHp: 100, injuryTags: [], statuses: [],
      },
    });
    expect(output).not.toContain('\x1b[31m');
  });

  it('HP text is always present in plain form regardless of color support (never color-only signaling)', () => {
    // Default test env: non-TTY, colors disabled -- proves the number
    // itself carries the information without relying on color.
    const output = renderPlayScreen({
      narration: 'Test.',
      world,
      availableActions: [],
      profileStatus: {
        name: 'Hero', level: 1, archetypeName: 'Warrior',
        hp: 2, maxHp: 100, injuryTags: [], statuses: [],
      },
    });
    expect(output).toContain('HP: 2');
    expect(output).not.toContain('\x1b[');
  });
});

/**
 * F-d386d9df: hpText used to render as a bare 'HP: x' regardless of maxHp,
 * so a critical and a full-health character produced textually identical
 * strings -- the ONLY signal a critical player got was the critical()
 * color wrap, a total loss of the warning under NO_COLOR, piped/non-TTY
 * output, or for a colorblind player. Now mirrors status-compact.ts's own
 * `s.maxHp ? 'HP: x/max' : 'HP: x'`.
 */
describe('renderPlayScreen HP text includes maxHp when known (F-d386d9df)', () => {
  const world = {
    playerId: 'p1',
    locationId: 'z1',
    entities: { p1: { name: 'Hero', resources: { hp: 10 }, statuses: [] } },
    zones: { z1: { name: 'Town', neighbors: [] } },
    factions: {},
  } as any;

  it('renders "HP: x/max" when maxHp is known', () => {
    const output = renderPlayScreen({
      narration: 'Test.',
      world,
      availableActions: [],
      profileStatus: {
        name: 'Hero', level: 1, archetypeName: 'Warrior',
        hp: 45, maxHp: 100, injuryTags: [], statuses: [],
      },
    });
    expect(output).toContain('HP: 45/100');
  });

  it('falls back to bare "HP: x" when maxHp is not known', () => {
    const output = renderPlayScreen({
      narration: 'Test.',
      world,
      availableActions: [],
      profileStatus: {
        name: 'Hero', level: 1, archetypeName: 'Warrior',
        hp: 45, injuryTags: [], statuses: [],
      },
    });
    expect(output).toContain('HP: 45');
    expect(output).not.toContain('HP: 45/');
  });

  it('a critical and a healthy character are no longer textually identical (the bug this finding flags)', () => {
    const critOutput = renderPlayScreen({
      narration: 'Test.', world, availableActions: [],
      profileStatus: { name: 'Hero', level: 1, archetypeName: 'Warrior', hp: 5, maxHp: 100, injuryTags: [], statuses: [] },
    });
    const healthyOutput = renderPlayScreen({
      narration: 'Test.', world, availableActions: [],
      profileStatus: { name: 'Hero', level: 1, archetypeName: 'Warrior', hp: 95, maxHp: 100, injuryTags: [], statuses: [] },
    });
    expect(critOutput).toContain('HP: 5/100');
    expect(healthyOutput).toContain('HP: 95/100');
  });
});

/**
 * F-7eff9b3a: the character-status line used to be built as one long
 * unwrapped string (`  ${bold(nameLine)} | ${statParts.join(' | ')}`),
 * unlike this domain's reference tables (help-system.ts's
 * renderNameDescriptionRow), which got dedicated word-wrap-with-hanging-
 * indent treatment for the identical overflow bug class (three prior fixes:
 * F-a17315ac/F-d36903d0/F-1367afd9). At the addendum's 40-column floor, a
 * character with a long name/title/archetype/weapon/armor combination now
 * wraps at segment boundaries with a hanging indent instead of the terminal
 * hard-wrapping wherever it falls mid-word.
 */
describe('wrapStatusLine (F-7eff9b3a)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('is behavior-preserving when every segment fits on one line', async () => {
    const mod = await import('./play-renderer.js');
    const result = mod.wrapStatusLine('  ', ['Name (Lv1 Warrior)', 'HP: 10', 'Sword']);
    expect(result).toBe('  Name (Lv1 Warrior) | HP: 10 | Sword');
  });

  it('wraps onto a new line with a hanging indent once segments exceed the terminal width', async () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const mod = await import('./play-renderer.js');
    // Each segment individually fits within 40 columns (segments are atomic
    // and never split, so a single oversized segment can legitimately
    // exceed the width on its own -- that behavior is covered by the
    // "never splits a segment" test below instead).
    const result = mod.wrapStatusLine('  ', [
      'Alexandria (Lv12 Battlemage)',
      'HP: 450/450',
      'Ceremonial Warhammer',
      'Dragonscale Armor',
    ]);
    const lines = result.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    // No line exceeds the terminal width.
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
    // Continuation lines carry the hanging indent, not the lead indent.
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i].startsWith('    ')).toBe(true);
    }
  });

  it('never splits a segment mid-string, even one longer than the terminal width (degrades legibly, matching wrapWords\' unsplit-overlong-word behavior)', async () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const mod = await import('./play-renderer.js');
    const longSegment = 'A'.repeat(60);
    const result = mod.wrapStatusLine('  ', ['Name', longSegment]);
    expect(result).toContain(longSegment);
  });

  it('renderPlayScreen wraps the full character-status line at a narrow width without losing any field', () => {
    const engine = createGame();
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const output = renderPlayScreen({
      narration: 'Test.',
      world: engine.world,
      availableActions: [],
      profileStatus: {
        name: 'Alexandria Longname', title: 'The Unrelenting', level: 12, archetypeName: 'Battlemage',
        hp: 450, maxHp: 450, weaponName: 'Ceremonial Warhammer of the Ancients',
        armorName: 'Plated Dragonscale Battle Armor', injuryTags: [], statuses: [],
      },
    });
    expect(output).toContain('Alexandria Longname');
    expect(output).toContain('HP: 450/450');
    expect(output).toContain('Ceremonial Warhammer of the Ancients');
    expect(output).toContain('Plated Dragonscale Battle Armor');
  });
});

/**
 * F-61e67d85: src/npc/ambient-dialogue.ts's generateAmbientLine/
 * generateZoneAmbience is a fully built, fully unit-tested, zero-API-cost
 * flavor-text generator with no rendering surface anywhere in cli-display --
 * renderPlayScreen had no field to carry it, so no player has ever seen a
 * line it produces. game-core threads generateZoneAmbience's output through
 * game-presenter.ts's renderPlayOutput/renderOpeningOutput (not owned here)
 * into this new opts field.
 */
describe('renderPlayScreen ambient lines (F-61e67d85)', () => {
  it('renders ambientLines as dim bulleted lines between dialogue and the status-opening divider', () => {
    const engine = createGame();
    const output = renderPlayScreen({
      narration: 'Test narration.',
      dialogue: {
        speakerId: 'pilgrim',
        speakerName: 'Suspicious Pilgrim',
        text: 'Turn back, stranger.',
        isFallback: false,
        grounding: { beliefCount: 1, memoryCount: 1, morale: 50, suspicion: 50 },
      },
      world: engine.world,
      availableActions: [],
      ambientLines: ['A merchant rearranges their wares.'],
    });
    expect(output).toContain('  · A merchant rearranges their wares.');

    const dialogueIdx = output.indexOf('Turn back, stranger.');
    const ambientIdx = output.indexOf('A merchant rearranges their wares.');
    // makeThinDivider() ('·' repeated getTerminalWidth() times, 60 by
    // default in this test env) opens BOTH the dialogue block and the
    // status section -- lastIndexOf targets the status-opening one.
    const statusDividerIdx = output.lastIndexOf('·'.repeat(60));
    expect(dialogueIdx).toBeGreaterThan(-1);
    expect(ambientIdx).toBeGreaterThan(dialogueIdx);
    expect(statusDividerIdx).toBeGreaterThan(ambientIdx);
  });

  it('renders ambientLines even with no dialogue present, still before the status-opening divider', () => {
    const engine = createGame();
    const output = renderPlayScreen({
      narration: 'Test narration.',
      world: engine.world,
      availableActions: [],
      ambientLines: ['A guard scans the crowd.'],
    });
    const narrationIdx = output.indexOf('Test narration.');
    const ambientIdx = output.indexOf('A guard scans the crowd.');
    const statusDividerIdx = output.lastIndexOf('·'.repeat(60));
    expect(ambientIdx).toBeGreaterThan(narrationIdx);
    expect(statusDividerIdx).toBeGreaterThan(ambientIdx);
  });

  it('caps display at MAX_AMBIENT_LINES_SHOWN (1) even when generateZoneAmbience supplies up to 3', () => {
    const engine = createGame();
    const output = renderPlayScreen({
      narration: 'Test narration.',
      world: engine.world,
      availableActions: [],
      ambientLines: ['Line one.', 'Line two.', 'Line three.'],
    });
    expect(output).toContain('  · Line one.');
    expect(output).not.toContain('Line two.');
    expect(output).not.toContain('Line three.');
  });

  it('renders identical output whether ambientLines is omitted or an empty array (no extra output either way)', () => {
    const engine = createGame();
    const base = { narration: 'Test.', world: engine.world, availableActions: [] };
    const withoutField = renderPlayScreen(base);
    const withEmpty = renderPlayScreen({ ...base, ambientLines: [] });
    expect(withEmpty).toBe(withoutField);
  });

  it('renders ambientLines as plain text with no ANSI when colors are disabled (default test env: non-TTY)', () => {
    const engine = createGame();
    const output = renderPlayScreen({
      narration: 'Test.',
      world: engine.world,
      availableActions: [],
      ambientLines: ['A merchant rearranges their wares.'],
    });
    expect(output).toContain('A merchant rearranges their wares.');
    expect(output).not.toContain('\x1b[');
  });

  it('wraps ambientLines specifically in dim() when colors are enabled (not just incidental dim elsewhere on screen)', async () => {
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    const mod = await import('./play-renderer.js');
    const engine = createGame();
    const output = mod.renderPlayScreen({
      narration: 'Test.',
      world: engine.world,
      availableActions: [],
      ambientLines: ['A merchant rearranges their wares.'],
    });
    // dim() wraps as ESC[2m<text>ESC[0m (colors.ts's wrap()) -- assert the
    // ambient line's own bullet text is inside that exact wrapper, not just
    // that SOME dim-colored text exists somewhere on this dim-divider-heavy
    // screen.
    expect(output).toContain('\x1b[2m  · A merchant rearranges their wares.\x1b[0m');
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = undefined;
    delete process.env.NO_COLOR;
  });
});

/**
 * F-7484bd2e (SLATE-6): nothing rendered a distinct on-screen consequence
 * when the presentation state machine reached 'menu' (player death) -- the
 * screen fell straight back to the ordinary "What do you do?" prompt as if
 * nothing happened, even though the fade-to-black cue itself already
 * rendered correctly (presentation-renderer.ts's renderScreenPause).
 *
 * Director ruling R3 (wave-18/cli-display.md coordinator brief): death is a
 * SETBACK, not an ending -- the affordance line is continue-first ("rise"),
 * not a farewell. All copy is DRAFT, pending coordinator/director review.
 */
describe('renderDeathScreen (F-7484bd2e, SLATE-6, director ruling R3: setback not ending)', () => {
  afterEach(() => {
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = undefined;
    delete process.env.NO_COLOR;
  });

  it('renders the turn narration and a characterName-based headline', () => {
    const output = renderDeathScreen({
      narration: 'The ash ghoul lands the final blow.',
      characterName: 'Aldric',
    });
    expect(output).toContain('The ash ghoul lands the final blow.');
    expect(output).toContain('Aldric HAS FALLEN');
  });

  it('falls back to a generic headline when no characterName is given', () => {
    const output = renderDeathScreen({ narration: 'Darkness takes you.' });
    // Coordinator stitch (wave 18): setback-consistent fallback — the story
    // does not end on a combat loss, so the headline must not claim it does.
    expect(output).toContain('YOU HAVE FALLEN');
    expect(output).not.toContain('STORY ENDS');
  });

  it('offers a continue-first affordance (a setback, not an ending) and only promises real commands', () => {
    const output = renderDeathScreen({ narration: 'Darkness takes you.' });
    expect(output).toContain('"continue"');
    // F-c6da7ad9 (wave-13 amend): inverts F-7d57bf98's pin in the other
    // direction. F-7d57bf98 pinned '"quit" exits without saving -- type
    // "save" first' because at the time nothing on the quit path saved --
    // neither game.ts's __QUIT__ sentinel nor bin.ts's __QUIT__ handler ever
    // called saveSession. This wave wires bin.ts's __QUIT__ handler through
    // the same guarded attemptExitAutosave contract the SIGINT and
    // stdin-closed/EOF paths already use, so quit really does save now --
    // re-pinned to the new copy, with F-7d57bf98's old wording guarded
    // against regressing back.
    //
    // The blunt, unconditional '"quit" will save and exit.' phrasing stays
    // guarded too: attemptExitAutosave can still return 'rejected' (path
    // guard) or 'failed' (write error), so that absolute a promise would
    // again be false -- the new copy's "like Ctrl+C" phrasing states the
    // common case without guaranteeing it. The '"save" and "quit"' guard
    // also stays: "save" remains its own separate dispatchable command
    // (bin.ts's `if (trimmed === 'save')`), not merged into quit.
    expect(output).toContain('"quit" now saves your progress automatically, like Ctrl+C.');
    expect(output).not.toContain('"quit" exits without saving');
    expect(output).not.toContain('"save" first');
    expect(output).not.toContain('"quit" will save and exit.');
    expect(output).not.toContain('"save" and "quit"');
  });

  it('does not point at a nonexistent in-game "load" command (bin.ts has no such dispatchable verb)', () => {
    const output = renderDeathScreen({ narration: 'Darkness takes you.' });
    expect(output).not.toMatch(/\bload\b/);
  });

  it('renders the "=" rule even with colors disabled (colorblind-safe signature, matching renderScreenPause)', () => {
    const output = renderDeathScreen({ narration: 'Darkness takes you.' });
    expect(output).toMatch(/═{5,}/);
    expect(output).not.toContain('\x1b[');
  });

  it('uses critical() (bold red) for the headline and rule when colors are enabled, not the plain conclusion-screen style', async () => {
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    const mod = await import('./play-renderer.js');
    const output = mod.renderDeathScreen({ narration: 'Darkness takes you.', characterName: 'Aldric' });
    expect(output).toContain('\x1b[31m'); // red
    expect(output).toContain('\x1b[1m'); // bold
  });
});
