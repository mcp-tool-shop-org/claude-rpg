import { describe, it, expect, afterEach } from 'vitest';
import { renderConcludeOutput } from './game-presenter.js';
import { getTerminalWidth } from '../display/play-renderer.js';

// F-001ef2af / F-81067750: renderConcludeOutput's section dividers used to
// be built as '  ═'.repeat(30) / '  ─'.repeat(30) — repeating the entire
// 3-character UNIT "two spaces + the glyph", not just the glyph. Verified
// live: '  ═'.repeat(30) produces a 90-character, space-gapped
// "  ═  ═  ═ ..." string, not a solid rule. This is the CAMPAIGN
// CONCLUSION screen — the single most narratively climactic screen in the
// game — and had no test file anywhere in the repo prior to this fix.
describe('renderConcludeOutput (F-001ef2af / F-81067750)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  const baseResult = {
    deterministicSummary: 'The war ended.',
    worldAfter: 'The realm is at peace.',
  };

  it('renders the heavy divider as a solid, ungapped 80-column rule — not the old \'  ═\'.repeat(30) gapped pattern', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });
    expect(getTerminalWidth()).toBe(80);

    const output = renderConcludeOutput(baseResult);
    const lines = output.split('\n');
    const heavyDividers = lines.filter((l) => l.startsWith('═'));

    // Header divider (87) + closing divider before epilogue-less footer is
    // absent, but the opening pair (87, 89) both fire unconditionally.
    expect(heavyDividers.length).toBeGreaterThanOrEqual(2);
    for (const divider of heavyDividers) {
      expect(divider).toBe('═'.repeat(80));
      expect(divider).not.toContain(' ');
    }
  });

  it('renders the thin divider (epilogue separator + footer) as a solid, ungapped 80-column rule', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });

    const output = renderConcludeOutput({ ...baseResult, epilogue: 'And so it ends.' });
    const lines = output.split('\n');
    const thinDividers = lines.filter((l) => l.startsWith('─'));

    // One before the epilogue (94), one as the footer separator (101).
    expect(thinDividers.length).toBeGreaterThanOrEqual(2);
    for (const divider of thinDividers) {
      expect(divider).toBe('─'.repeat(80));
      expect(divider).not.toContain(' ');
    }
  });

  it('sandwiches the CAMPAIGN CONCLUSION header between two solid heavy dividers', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });

    const output = renderConcludeOutput(baseResult);
    const lines = output.split('\n');
    const headerIndex = lines.findIndex((l) => l.includes('CAMPAIGN CONCLUSION'));

    expect(headerIndex).toBeGreaterThan(0);
    expect(lines[headerIndex]).toBe('  CAMPAIGN CONCLUSION');
    expect(lines[headerIndex - 1]).toBe('═'.repeat(80));
    expect(lines[headerIndex + 1]).toBe('═'.repeat(80));
  });

  it('adapts divider width to a narrower terminal (60 columns) instead of staying hardcoded', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 60, writable: true });

    const output = renderConcludeOutput(baseResult);
    const lines = output.split('\n');
    const heavyDividers = lines.filter((l) => l.startsWith('═'));

    expect(heavyDividers.length).toBeGreaterThanOrEqual(2);
    for (const divider of heavyDividers) {
      expect(divider).toBe('═'.repeat(60));
    }
  });

  it('includes the deterministic summary and world-after text between the framing dividers', () => {
    const output = renderConcludeOutput(baseResult);
    expect(output).toContain('The war ended.');
    expect(output).toContain('The realm is at peace.');
  });

  it('still includes the epilogue text, indented, when present', () => {
    const output = renderConcludeOutput({ ...baseResult, epilogue: 'And so it ends.' });
    expect(output).toContain('  And so it ends.');
  });
});
