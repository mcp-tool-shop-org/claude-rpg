import { describe, it, expect } from 'vitest';
import type { SaveSlotSummary } from '../session/session.js';
import {
  formatSaveDetails, formatSaveSlotPrefix, formatSaveSlotIndent,
  SAVE_LISTING_CAP, formatOlderSavesFooter,
} from './save-listing.js';

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
    // 'starter-cyberpunk' isn't a real registered pack id (the real ids are
    // packs.ts's meta.id values, e.g. 'neon-lockbox') -- this fixture
    // exercises the graceful ?? s.packId fallback below, unchanged.
    expect(details).toEqual(['pack: starter-cyberpunk', 'zone: Neon Alley']);
  });

  /**
   * F-b7638c63: formatSaveDetails printed the raw kebab-case pack id
   * ('pack: chapel-threshold') instead of the resolved pack title on every
   * save-slot row of the /load screen -- the one raw-id-reaching-player site
   * left in cli-display after a systematic sweep, since display/** already
   * resolves names correctly everywhere else this pattern could recur. The
   * fixtures above ('starter-fantasy', 'starter-cyberpunk') don't match any
   * real registered pack, so they accidentally never exercised the
   * resolution path -- only the fallback. This uses a real, registered pack
   * id ('chapel-threshold', @ai-rpg-engine/starter-fantasy's packMeta.id) to
   * prove the title actually resolves.
   */
  it('resolves a real registered pack id to its display title, not the raw slug', () => {
    const summary: SaveSlotSummary = {
      filename: 'real-pack.json',
      savedAt: '2026-03-31T12:00:00.000Z',
      tone: 'dark',
      packId: 'chapel-threshold',
    };

    const details = formatSaveDetails(summary);
    expect(details).toContain('pack: The Chapel Threshold');
    expect(details.join(' ')).not.toContain('chapel-threshold');
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

/**
 * F-df387f5b: runLoad()'s /load listing printed every entry with no cap --
 * over a long campaign accumulating dozens-to-hundreds of never-overwritten
 * autosave files, a player had to scroll back through the entire unbroken
 * list to find the entry they wanted. SAVE_LISTING_CAP + the "N older saves
 * not shown" footer are the extracted, testable pieces of bin.ts's runLoad()
 * fix (bin.ts itself has no exports -- see this file's own top comment for
 * why the pattern extracts here instead).
 */
describe('SAVE_LISTING_CAP / formatOlderSavesFooter (F-df387f5b)', () => {
  it('SAVE_LISTING_CAP is a positive, sane cap', () => {
    expect(SAVE_LISTING_CAP).toBeGreaterThan(0);
  });

  it('returns null when nothing was truncated (hiddenCount 0)', () => {
    expect(formatOlderSavesFooter(0)).toBeNull();
  });

  it('returns null for a negative hiddenCount (defensive -- never truncated less than nothing)', () => {
    expect(formatOlderSavesFooter(-1)).toBeNull();
  });

  it('uses singular "save" for exactly one hidden entry', () => {
    const footer = formatOlderSavesFooter(1);
    expect(footer).toContain('1 older save');
    expect(footer).not.toContain('1 older saves');
  });

  it('uses plural "saves" for more than one hidden entry', () => {
    const footer = formatOlderSavesFooter(12);
    expect(footer).toBe('  + 12 older saves not shown.');
  });
});
