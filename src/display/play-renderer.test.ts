import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { renderPlayScreen, renderWelcome, isCriticalHp } from './play-renderer.js';

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
