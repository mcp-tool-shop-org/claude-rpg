// save-listing.ts — build the detail-line fragments shown under each save slot.
//
// Extracted from bin.ts's runLoad() (F-bd2fef5a) so save-listing.test.ts can
// exercise the real logic instead of a hand-copied fork: bin.ts is a bare
// CLI entry point with no exports (mirrors save-selection.ts's extraction
// of parseSaveSelection for the same reason).

import type { SaveSlotSummary } from '../session/session.js';
import { getPackById } from '../character/packs.js';

/**
 * Build the "pack: X | 2 companions | zone: Y | ..." detail fragments for
 * one save slot in the /load listing. Omits any field that is missing or
 * zero-valued.
 */
export function formatSaveDetails(s: SaveSlotSummary): string[] {
  const details: string[] = [];
  if (s.packId) {
    // F-b7638c63: resolve the raw kebab-case pack id ('chapel-threshold') to
    // its display title ('The Chapel Threshold') -- the one raw-id-reaching-
    // player site left in cli-display after a systematic sweep, since
    // display/** already resolves names correctly everywhere else this
    // pattern could recur. Falls back to the raw id (today's behavior,
    // unchanged) when the pack isn't registered in this build -- a real,
    // already-precedented scenario (see F-c8dd84fe's "unknown pack"
    // handling one level up in the same runLoad() flow).
    details.push(`pack: ${getPackById(s.packId)?.meta.name ?? s.packId}`);
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

/**
 * F-01e3acfc: the "n. identity — date" line's visible prefix -- bin.ts's
 * runLoad() used to hand-type this same "    ${i + 1}. " shape inline. The
 * detail line rendered directly beneath it needs blank padding of this
 * exact width to nest under the identity text (see formatSaveSlotIndent
 * below); deriving both from one source prevents them from silently
 * drifting apart the way a hardcoded 7-space literal did once a 10th save
 * widened the entry number.
 */
export function formatSaveSlotPrefix(index: number): string {
  return `    ${index + 1}. `;
}

/**
 * F-01e3acfc: blank-padding indent for the detail line shown under a save
 * slot, sized to match formatSaveSlotPrefix's own width for the same index
 * so the detail text always nests under the identity text above it --
 * column 7 for slots 1-9, column 8 once a 10th save exists. Previously a
 * hardcoded 7-space literal, which only matched the 1-digit case.
 */
export function formatSaveSlotIndent(index: number): string {
  return ' '.repeat(formatSaveSlotPrefix(index).length);
}
