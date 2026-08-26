import { describe, it, expect, afterEach } from 'vitest';
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
