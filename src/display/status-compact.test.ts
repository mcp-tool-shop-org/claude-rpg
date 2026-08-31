import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderCompactStatus } from './status-compact.js';
import type { StatusData } from '../character/presence.js';
import type { LeverageState, ScoredMove } from '@ai-rpg-engine/modules';

// F-478cbef8: status-compact.ts had no dedicated test file. Its only
// indirect coverage (director-renderer.test.ts's /status test, added for
// F-9141a74b) exercises just the materialsSummary/arcIndicator/
// endgameIndicator branches. These tests cover the branches that were left
// with no coverage anywhere: the topThreat urgency-tier labeling (the
// file's most-branching logic), economySummary, opportunitySummary, the
// injury/status tags line, and the suggestedMove feasibility gate.

type RenderOpts = Parameters<typeof renderCompactStatus>[0];

const DEFAULT_STATUS_DATA: StatusData = {
  name: 'Aldric',
  level: 3,
  archetypeName: 'Warrior',
  hp: 20,
  injuryTags: [],
  statuses: [],
};

const NO_LEVERAGE: LeverageState = {
  favor: 0, debt: 0, blackmail: 0, influence: 0, heat: 0, legitimacy: 0,
} as LeverageState;

function baseOpts(overrides: Partial<RenderOpts> = {}): RenderOpts {
  return {
    statusData: DEFAULT_STATUS_DATA,
    leverageState: NO_LEVERAGE,
    topThreat: null,
    suggestedMove: null,
    situationTag: 'stable',
    ...overrides,
  };
}

describe('renderCompactStatus (F-478cbef8)', () => {
  describe('topThreat urgency tiers', () => {
    it('labels urgency >= 0.7 as urgent', () => {
      const result = renderCompactStatus(baseOpts({
        topThreat: { description: 'Bandit raid', urgency: 0.7 },
      }));
      expect(result).toContain('Bandit raid (urgent)');
    });

    it('labels urgency just under 0.7 as growing, not urgent (boundary)', () => {
      const result = renderCompactStatus(baseOpts({
        topThreat: { description: 'Border dispute', urgency: 0.69 },
      }));
      expect(result).toContain('Border dispute (growing)');
    });

    it('labels urgency == 0.4 as growing (boundary)', () => {
      const result = renderCompactStatus(baseOpts({
        topThreat: { description: 'Rising unrest', urgency: 0.4 },
      }));
      expect(result).toContain('Rising unrest (growing)');
    });

    it('labels urgency just under 0.4 as distant, not growing (boundary)', () => {
      const result = renderCompactStatus(baseOpts({
        topThreat: { description: 'Distant storm', urgency: 0.39 },
      }));
      expect(result).toContain('Distant storm (distant)');
    });

    it('omits the Threat line entirely when topThreat is null', () => {
      const result = renderCompactStatus(baseOpts({ topThreat: null }));
      expect(result).not.toContain('Threat:');
    });
  });

  describe('economySummary and opportunitySummary', () => {
    it('includes a Market line when economySummary is present', () => {
      const result = renderCompactStatus(baseOpts({ economySummary: 'grain scarce' }));
      expect(result).toContain('Market: grain scarce');
    });

    it('omits the Market line when economySummary is absent', () => {
      const result = renderCompactStatus(baseOpts());
      expect(result).not.toContain('Market:');
    });

    it('includes a Jobs line when opportunitySummary is present', () => {
      const result = renderCompactStatus(baseOpts({ opportunitySummary: '2 active' }));
      expect(result).toContain('Jobs: 2 active');
    });

    it('omits the Jobs line when opportunitySummary is absent', () => {
      const result = renderCompactStatus(baseOpts());
      expect(result).not.toContain('Jobs:');
    });
  });

  describe('injury/status tags line', () => {
    it('combines injuryTags and statuses into one Conditions line', () => {
      const result = renderCompactStatus(baseOpts({
        statusData: { ...DEFAULT_STATUS_DATA, injuryTags: ['broken-arm'], statuses: ['poisoned'] },
      }));
      expect(result).toContain('Conditions: broken-arm, poisoned');
    });

    it('omits the Conditions line when there are no injuries or statuses', () => {
      const result = renderCompactStatus(baseOpts());
      expect(result).not.toContain('Conditions:');
    });
  });

  describe('suggestedMove feasibility gate', () => {
    const move: ScoredMove = {
      category: 'social',
      verb: 'bribe',
      subAction: 'guard',
      score: 1,
      urgency: 0.5,
      feasibility: 0.5,
      impact: 0.5,
      risk: 0.1,
      reason: 'Bribe the gate guard',
    };

    it('includes the Suggested line when feasibility > 0', () => {
      const result = renderCompactStatus(baseOpts({ suggestedMove: move }));
      expect(result).toContain('Suggested: Bribe the gate guard');
    });

    it('omits the Suggested line when feasibility is 0', () => {
      const result = renderCompactStatus(baseOpts({ suggestedMove: { ...move, feasibility: 0 } }));
      expect(result).not.toContain('Suggested:');
    });

    it('omits the Suggested line when suggestedMove is null', () => {
      const result = renderCompactStatus(baseOpts({ suggestedMove: null }));
      expect(result).not.toContain('Suggested:');
    });
  });
});

// F-38eb3dec: status-compact.ts's DIVIDER was a fixed 60-char string,
// unlike play-renderer.ts's own dividers (PFE-005), which adapt to the
// real terminal width. Mirrors play-renderer-divider.test.ts's assertions.
describe('renderCompactStatus divider width (F-38eb3dec)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('divider matches a narrow terminal width instead of a fixed 60', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const result = renderCompactStatus(baseOpts());
    expect(result).toContain('─'.repeat(40));
    expect(result).not.toContain('─'.repeat(60));
  });

  it('divider matches a wide terminal width, clamped to 120', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 200, writable: true });
    const result = renderCompactStatus(baseOpts());
    expect(result).toContain('─'.repeat(120));
    expect(result).not.toContain('─'.repeat(121));
  });
});

/**
 * F-ce17a470: status-compact.ts imported `green` (unused) but HP -- the
 * single most important number in the game -- rendered as plain uncolored
 * text at every severity here too, the same gap play-renderer.ts's full
 * play screen had. Both screens now share play-renderer.ts's isCriticalHp
 * threshold so they can't disagree about what counts as "critical."
 */
describe('renderCompactStatus HP coloring (F-ce17a470)', () => {
  afterEach(() => {
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = undefined;
    delete process.env.NO_COLOR;
  });

  it('colors HP critical (bold red) when at or below the threshold, with colors enabled', async () => {
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    const mod = await import('./status-compact.js');
    const result = mod.renderCompactStatus(baseOpts({
      statusData: { ...DEFAULT_STATUS_DATA, hp: 5, maxHp: 100 },
    }));
    expect(result).toContain('\x1b[31m'); // red
    expect(result).toContain('\x1b[1m'); // bold
    expect(result).toContain('HP: 5/100');
  });

  it('does not color HP when healthy, even with colors enabled', async () => {
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    const mod = await import('./status-compact.js');
    const result = mod.renderCompactStatus(baseOpts({
      statusData: { ...DEFAULT_STATUS_DATA, hp: 90, maxHp: 100 },
    }));
    expect(result).not.toContain('\x1b[31m');
  });

  it('HP text is always present in plain form regardless of color support (never color-only signaling)', () => {
    const result = renderCompactStatus(baseOpts({
      statusData: { ...DEFAULT_STATUS_DATA, hp: 2, maxHp: 100 },
    }));
    expect(result).toContain('HP: 2/100');
    expect(result).not.toContain('\x1b[');
  });
});

/**
 * F-7eff9b3a: the character line here was built as one long unwrapped
 * template string, the same overflow bug class play-renderer.ts's own
 * character-status line had -- both now route through the shared
 * wrapStatusLine helper (play-renderer.ts), so a long name/title/weapon/
 * armor combination wraps at segment boundaries with a hanging indent
 * instead of the terminal hard-wrapping wherever it falls. This file's own
 * existing 40-column test (above) only asserted the divider rule's width,
 * never the content line's wrapping behavior -- these tests close that gap.
 */
describe('renderCompactStatus character line wraps at narrow widths (F-7eff9b3a)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('stays a single line and unchanged at a normal terminal width', () => {
    const result = renderCompactStatus(baseOpts({
      statusData: { ...DEFAULT_STATUS_DATA, weaponName: 'Sword', armorName: 'Leather Armor' },
    }));
    expect(result).toContain('Aldric (Lv3 Warrior) | HP: 20 | Sword | Leather Armor');
  });

  it('wraps the character line without losing any field at a narrow (40-column) terminal', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    // Each individual segment fits within 40 columns on its own -- a single
    // oversized segment legitimately exceeding the width is covered by
    // wrapStatusLine's own "never splits a segment" test (play-renderer.
    // test.ts), not this one.
    const result = renderCompactStatus(baseOpts({
      statusData: {
        ...DEFAULT_STATUS_DATA,
        name: 'Alexandria',
        level: 12,
        archetypeName: 'Battlemage',
        maxHp: 450,
        hp: 450,
        weaponName: 'Ceremonial Warhammer',
        armorName: 'Dragonscale Armor',
      },
    }));
    expect(result).toContain('Alexandria');
    expect(result).toContain('HP: 450/450');
    expect(result).toContain('Ceremonial Warhammer');
    expect(result).toContain('Dragonscale Armor');

    // The character line itself (between the two header dividers and the
    // rest of the screen) never exceeds the 40-column budget per physical
    // line.
    const lines = result.split('\n').filter((l) => l.includes('Alexandria') || l.trim().startsWith('Ceremonial') || l.trim().startsWith('Dragonscale'));
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });
});
