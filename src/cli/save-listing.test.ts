import { describe, it, expect } from 'vitest';
import type { SaveSlotSummary } from '../session/session.js';
import { formatSaveDetails, formatSaveSlotPrefix, formatSaveSlotIndent } from './save-listing.js';

/**
 * FT-FE-007: Enriched save listing tests.
 * Validates that pack name, companion count, and last zone name
 * are surfaced in the save listing display output.
 *
 * F-bd2fef5a: this used to test a hand-copied fork of bin.ts runLoad()'s
 * detail-line logic, so the test could pass against stale logic that had
 * silently diverged from what bin.ts actually renders. It now imports and
 * exercises the real formatSaveDetails (extracted to save-listing.ts),
 * which bin.ts's runLoad() also calls — see bin.ts.
 */

describe('enriched save listing', () => {
  it('should include pack, companions, and zone in details', () => {
    const summary: SaveSlotSummary = {
      filename: 'test-save.json',
      savedAt: '2026-03-31T12:00:00.000Z',
      characterName: 'Aldric',
      characterLevel: 5,
      characterTitle: 'The Bold',
      packId: 'starter-fantasy',
      tone: 'gritty',
      companionCount: 2,
      lastZoneName: 'Broken Chapel',
      chronicleEvents: 10,
      campaignAge: 42,
    };

    const details = formatSaveDetails(summary);

    expect(details).toContain('pack: starter-fantasy');
    expect(details).toContain('2 companions');
    expect(details).toContain('zone: Broken Chapel');
    expect(details).toContain('10 chronicle events');
    expect(details).toContain('42 ticks');
  });

  it('should use singular companion for count of 1', () => {
    const summary: SaveSlotSummary = {
      filename: 'test-save-2.json',
      savedAt: '2026-03-31T12:00:00.000Z',
      tone: 'neutral',
      companionCount: 1,
    };

    const details = formatSaveDetails(summary);
    expect(details).toContain('1 companion');
    expect(details.join(' ')).not.toContain('companions');
  });

  it('should omit missing or zero-value fields gracefully', () => {
    const summary: SaveSlotSummary = {
      filename: 'minimal.json',
      savedAt: '2026-03-31T12:00:00.000Z',
      tone: 'neutral',
    };

    const details = formatSaveDetails(summary);
    expect(details).toHaveLength(0);
  });

  it('should include only populated fields', () => {
    const summary: SaveSlotSummary = {
      filename: 'partial.json',
      savedAt: '2026-03-31T12:00:00.000Z',
      tone: 'neutral',
      packId: 'starter-cyberpunk',
      lastZoneName: 'Neon Alley',
    };

    const details = formatSaveDetails(summary);
    expect(details).toEqual(['pack: starter-cyberpunk', 'zone: Neon Alley']);
  });
});

/**
 * F-01e3acfc: bin.ts's runLoad() printed the identity line as
 * `    ${i + 1}. ${identity} — ${date}` (identity starts at column
 * 4 + len(String(i + 1)) + 2 -- column 7 for slots 1-9, column 8 once a
 * 10th save exists) but the detail line directly under it used a hardcoded
 * 7-space indent, which only matches the 1-digit case. formatSaveSlotIndent
 * is now derived from formatSaveSlotPrefix's own length (single source of
 * truth), so the two can never drift apart the way the hand-typed literal
 * did.
 */
describe('formatSaveSlotPrefix / formatSaveSlotIndent (F-01e3acfc)', () => {
  it('formatSaveSlotPrefix renders "n. " with the established 4-space left margin', () => {
    expect(formatSaveSlotPrefix(0)).toBe('    1. ');
    expect(formatSaveSlotPrefix(8)).toBe('    9. ');
  });

  it('formatSaveSlotPrefix widens for double-digit slot numbers', () => {
    expect(formatSaveSlotPrefix(9)).toBe('    10. ');
    expect(formatSaveSlotPrefix(98)).toBe('    99. ');
  });

  it('formatSaveSlotIndent is blank padding the same width as formatSaveSlotPrefix, for slots 1-9', () => {
    for (const i of [0, 3, 8]) {
      const indent = formatSaveSlotIndent(i);
      expect(indent).toBe(' '.repeat(formatSaveSlotPrefix(i).length));
      expect(indent.length).toBe(7);
    }
  });

  it('formatSaveSlotIndent tracks the wider prefix once a 10th+ save exists (the actual bug)', () => {
    const indent = formatSaveSlotIndent(9); // the 10th save, i = 9
    expect(indent.length).toBe(formatSaveSlotPrefix(9).length);
    expect(indent.length).toBe(8); // one column more than the 1-9 case
  });
});
