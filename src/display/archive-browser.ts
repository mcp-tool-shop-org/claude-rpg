// archive-browser — render completed campaign archive for terminal display

import type { ResolutionClass } from '@ai-rpg-engine/modules';

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

const DIVIDER = '─'.repeat(60);

export function renderArchiveBrowser(campaigns: ArchivedCampaign[]): string {
  if (campaigns.length === 0) {
    return `
${DIVIDER}
  CAMPAIGN ARCHIVE
${DIVIDER}
  No archived campaigns yet.
  Complete a campaign with /conclude and save to create an archive.
${DIVIDER}`;
  }

  const lines: string[] = [];
  lines.push('');
  lines.push(DIVIDER);
  lines.push('  CAMPAIGN ARCHIVE');
  lines.push(DIVIDER);

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
  lines.push(DIVIDER);
  lines.push(`  ${campaigns.length} completed campaign${campaigns.length === 1 ? '' : 's'}`);
  lines.push(`  Use /export md or /export json to export campaign data`);
  lines.push(DIVIDER);

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
