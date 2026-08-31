import { describe, it, expect, afterEach, vi } from 'vitest';
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

/**
 * F-624591cf: archive-browser.ts's divider() was one of two exceptions in
 * the domain (help-system.ts's was the other) that returned the bare
 * repeated rule character with no dim() wrap, even though play-renderer.ts,
 * director-renderer.ts, status-compact.ts, and usage.ts all agree dividers
 * get dim().
 */
describe('renderArchiveBrowser divider is dimmed (F-624591cf)', () => {
  let originalIsTTY: boolean | undefined;

  afterEach(() => {
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
    delete process.env.NO_COLOR;
  });

  it('wraps the divider rule in dim() when colors are enabled', async () => {
    originalIsTTY = process.stdout.isTTY;
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    const mod = await import('./archive-browser.js');
    const result = mod.renderArchiveBrowser([]);
    expect(result).toContain('\x1b[2m'); // dim
  });

  it('stays plain text with no escape codes when colors are disabled (default test env)', () => {
    const result = renderArchiveBrowser([]);
    expect(result).not.toContain('\x1b[');
  });
});

/**
 * F-0aee91cc: resColor was named as though it carried color but
 * getResolutionLabel only uppercases text -- every one of the 8
 * ResolutionClass outcomes rendered identically, with no way to tell a
 * VICTORY from a COLLAPSE except by reading the word. Now mapped to a
 * semantic color (positive/critical/danger/yellow, per resolution.ts's own
 * doc comment) so the archive screen's outcomes are distinguishable at a
 * glance, matching the semantic-color discipline colors.ts exists to carry.
 */
describe('renderArchiveBrowser resolution color-codes each class (F-0aee91cc)', () => {
  let originalIsTTY: boolean | undefined;

  afterEach(() => {
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
    delete process.env.NO_COLOR;
  });

  it('colors a clear win (victory) with green, distinct from a catastrophic loss (collapse) in bold red', async () => {
    originalIsTTY = process.stdout.isTTY;
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    const mod = await import('./archive-browser.js');

    const victory = mod.renderArchiveBrowser([makeCampaign({ resolutionClass: 'victory' })]);
    const collapse = mod.renderArchiveBrowser([makeCampaign({ resolutionClass: 'collapse' })]);

    const victoryLine = victory.split('\n').find((l) => l.includes('VICTORY'));
    const collapseLine = collapse.split('\n').find((l) => l.includes('COLLAPSE'));
    expect(victoryLine).toBeDefined();
    expect(collapseLine).toBeDefined();
    expect(victoryLine).toContain('\x1b[32m'); // green (positive)
    expect(collapseLine).toContain('\x1b[31m'); // red (critical)
    expect(collapseLine).toContain('\x1b[1m'); // bold (critical = bold red)
  });

  it('renders every resolution class without crashing and stays plain text when colors are disabled', () => {
    for (const cls of Object.keys(RESOLUTION_CLASS_LABELS)) {
      const result = renderArchiveBrowser([makeCampaign({ resolutionClass: cls })]);
      expect(result).not.toContain('\x1b[');
      expect(result).toContain(RESOLUTION_CLASS_LABELS[cls as keyof typeof RESOLUTION_CLASS_LABELS]);
    }
  });
});
