import { describe, it, expect } from 'vitest';
import type { SaveSlotSummary } from '../session/session.js';

/**
 * FT-FE-007: Enriched save listing tests.
 * Validates that pack name, companion count, and last zone name
 * are surfaced in the save listing display output.
 */

/** Mirrors the display logic in bin.ts runLoad() for testability. */
function formatSaveDetails(s: SaveSlotSummary): string[] {
  const details: string[] = [];
  if (s.packId) {
    details.push(`pack: ${s.packId}`);
  }
  if (s.companionCount != null && s.companionCount > 0) {
    details.push(`${s.companionCount} companion${s.companionCount > 1 ? 's' : ''}`);
  }
  if (s.lastZoneName) {
    details.push(`zone: ${s.lastZoneName}`);
  }
  if (s.chronicleEvents != null && s.chronicleEvents > 0) {
    details.push(`${s.chronicleEvents} chronicle events`);
  }
  if (s.campaignAge != null && s.campaignAge > 0) {
    details.push(`${s.campaignAge} ticks`);
  }
  return details;
}

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
