// archive-browser — render completed campaign archive for terminal display

import type { ResolutionClass } from '@ai-rpg-engine/modules';
import { getTerminalWidth } from './play-renderer.js';

export type ArchivedCampaign = {
  filename: string;
  packId?: string;
  title: string;
  dominantArc: string | null;
  resolutionClass: string | null;
  turnCount: number;
  chronicleHighlights: string[];
  companionFates: string[];
  relicNames: string[];
};

// F-38eb3dec: was a fixed 60-char divider regardless of terminal size,
// unlike play-renderer.ts's own dividers (PFE-005). Computed per call (not
// a module-level constant) so it tracks the real terminal width, matching
// play-renderer.ts's makeDivider() pattern.
function divider(): string {
  return '─'.repeat(getTerminalWidth());
}

export function renderArchiveBrowser(campaigns: ArchivedCampaign[]): string {
  if (campaigns.length === 0) {
    return `
${divider()}
  CAMPAIGN ARCHIVE
${divider()}
  No archived campaigns yet.
  Complete a campaign with /conclude and save to create an archive.
${divider()}`;
  }

  const lines: string[] = [];
  lines.push('');
  lines.push(divider());
  lines.push('  CAMPAIGN ARCHIVE');
  lines.push(divider());

  for (let i = 0; i < campaigns.length; i++) {
    const c = campaigns[i];
    const resolution = c.resolutionClass ?? 'unknown';
    const arc = c.dominantArc ?? 'none';
    const resColor = getResolutionLabel(resolution);

    lines.push('');
    lines.push(`  ${i + 1}. ${c.title}`);
    lines.push(`     Arc: ${arc} | Resolution: ${resColor} | Turns: ${c.turnCount}`);

    if (c.companionFates.length > 0) {
      lines.push(`     Companions: ${c.companionFates.join(' · ')}`);
    }
    if (c.relicNames.length > 0) {
      lines.push(`     Relics: ${c.relicNames.join(' · ')}`);
    }
    if (c.chronicleHighlights.length > 0) {
      lines.push(`     Highlights: ${c.chronicleHighlights.slice(0, 3).join(' · ')}`);
    }
  }

  lines.push('');
  lines.push(divider());
  lines.push(`  ${campaigns.length} completed campaign${campaigns.length === 1 ? '' : 's'}`);
  lines.push(`  Use /export md or /export json to export campaign data`);
  lines.push(divider());

  return lines.join('\n');
}

/**
 * Display label per resolution class, keyed by the engine's real enum
 * (@ai-rpg-engine/modules ResolutionClass) instead of a bare `Record<string,
 * string>`, so this table can't silently drop out of sync with what
 * completed campaigns actually produce — TypeScript now errors if a class
 * is missing or misspelled. Exported so other in-domain surfaces (e.g.
 * help-system.ts's renderConcludeHelp) can derive their own class list from
 * this same source instead of hand-duplicating it (F-545cb684).
 */
export const RESOLUTION_CLASS_LABELS: Record<ResolutionClass, string> = {
  'victory': 'VICTORY',
  'exile': 'EXILE',
  'martyrdom': 'MARTYRDOM',
  'collapse': 'COLLAPSE',
  'overthrow': 'OVERTHROW',
  'puppet-master': 'PUPPET MASTER',
  'quiet-retirement': 'QUIET RETIREMENT',
  'tragic-stabilization': 'TRAGIC STABILIZATION',
};

function getResolutionLabel(resolution: string): string {
  return RESOLUTION_CLASS_LABELS[resolution as ResolutionClass] ?? resolution.toUpperCase();
}
