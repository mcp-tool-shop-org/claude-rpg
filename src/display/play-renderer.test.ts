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
    // Coordinator stitch (wave 18): no dispatchable "save" command exists —
    // saving happens on quit/autosave, so the copy promises exactly that.
    expect(output).toContain('"quit" will save and exit.');
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
