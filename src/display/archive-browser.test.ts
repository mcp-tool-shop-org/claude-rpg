import { describe, it, expect, afterEach } from 'vitest';
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

// F-38eb3dec: archive-browser.ts's DIVIDER was a fixed 60-char string,
// unlike play-renderer.ts's own dividers (PFE-005), which adapt to the
// real terminal width. Mirrors play-renderer-divider.test.ts's assertions.
describe('renderArchiveBrowser divider width (F-38eb3dec)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('divider matches a narrow terminal width instead of a fixed 60', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const result = renderArchiveBrowser([]);
    expect(result).toContain('─'.repeat(40));
    expect(result).not.toContain('─'.repeat(60));
  });

  it('divider matches a wide terminal width, clamped to 120', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 200, writable: true });
    const result = renderArchiveBrowser([]);
    expect(result).toContain('─'.repeat(120));
    expect(result).not.toContain('─'.repeat(121));
  });
});
