import { describe, it, expect } from 'vitest';
import { renderArchiveBrowser, RESOLUTION_CLASS_LABELS, type ArchivedCampaign } from './archive-browser.js';

function makeCampaign(overrides: Partial<ArchivedCampaign> = {}): ArchivedCampaign {
  return {
    filename: 'test-campaign.json',
    title: 'The Bold, "Aldric"',
    dominantArc: null,
    resolutionClass: null,
    turnCount: 42,
    chronicleHighlights: [],
    companionFates: [],
    relicNames: [],
    ...overrides,
  };
}

describe('RESOLUTION_CLASS_LABELS (F-545cb684)', () => {
  it('covers exactly the 8 real engine resolution classes', () => {
    expect(Object.keys(RESOLUTION_CLASS_LABELS).sort()).toEqual(
      [
        'victory', 'exile', 'martyrdom', 'collapse',
        'overthrow', 'puppet-master', 'quiet-retirement', 'tragic-stabilization',
      ].sort(),
    );
  });
});

describe('renderArchiveBrowser', () => {
  it('shows a friendly message when there are no archived campaigns', () => {
    const result = renderArchiveBrowser([]);
    expect(result).toContain('No archived campaigns yet');
  });

  it('renders the uppercased resolution label for a known class', () => {
    const result = renderArchiveBrowser([makeCampaign({ resolutionClass: 'puppet-master' })]);
    expect(result).toContain('PUPPET MASTER');
  });

  it('falls back to an uppercased raw value for an unknown/legacy resolution value', () => {
    const result = renderArchiveBrowser([makeCampaign({ resolutionClass: 'some-legacy-value' })]);
    expect(result).toContain('SOME-LEGACY-VALUE');
  });

  it('shows "unknown" when resolutionClass is null', () => {
    const result = renderArchiveBrowser([makeCampaign({ resolutionClass: null })]);
    expect(result).toContain('UNKNOWN');
  });
});
