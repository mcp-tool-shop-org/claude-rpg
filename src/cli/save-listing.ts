// save-listing.ts — build the detail-line fragments shown under each save slot.
//
// Extracted from bin.ts's runLoad() (F-bd2fef5a) so save-listing.test.ts can
// exercise the real logic instead of a hand-copied fork: bin.ts is a bare
// CLI entry point with no exports (mirrors save-selection.ts's extraction
// of parseSaveSelection for the same reason).

import type { SaveSlotSummary } from '../session/session.js';

/**
 * Build the "pack: X | 2 companions | zone: Y | ..." detail fragments for
 * one save slot in the /load listing. Omits any field that is missing or
 * zero-valued.
 */
export function formatSaveDetails(s: SaveSlotSummary): string[] {
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
