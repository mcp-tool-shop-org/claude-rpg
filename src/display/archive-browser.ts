// archive-browser — render completed campaign archive for terminal display

import type { ResolutionClass } from '@ai-rpg-engine/modules';
import { getTerminalWidth } from './play-renderer.js';
import { critical, danger, dim, positive, yellow } from '../cli/colors.js';

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
// F-624591cf: was missing the dim() wrap every other divider-producing
// helper in this domain applies (play-renderer.ts's makeDivider()/
// makeThinDivider(), director-renderer.ts's divider(), status-compact.ts's
// divider(), usage.ts's rule) -- this was one of the two exceptions left in
// the whole domain (help-system.ts's divider()/thinDivider() was the other).
function divider(): string {
  return dim('─'.repeat(getTerminalWidth()));
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
    // F-0aee91cc: resColor read as though it already carried color, but
    // getResolutionLabel only uppercases text -- every one of the 8
    // ResolutionClass outcomes rendered in identical, uncolored text despite
    // spanning triumphant wins to total failure. Now actually colored, via
    // getResolutionColor below.
    const resColor = getResolutionColor(resolution)(getResolutionLabel(resolution));

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

/**
 * F-0aee91cc: semantic color per ResolutionClass, matched against the same
 * tone guide finale-prompt.ts (epilogue narration) and help-system.ts's
 * RESOLUTION_CLASS_HELP already use for these 8 classes, so this table can't
 * independently invent a different read of any given ending. Clear wins
 * (victory/overthrow/quiet-retirement) get positive(); catastrophic or fatal
 * outcomes (collapse/martyrdom) get critical(); exile is bad but survived,
 * one notch down at danger(); and the two morally-ambiguous endings
 * (puppet-master's "shadow victory," tragic-stabilization's "bittersweet,
 * pyrrhic") get plain yellow(), matching this wave's "yellow = warning"
 * convention rather than a false positive() or critical().
 */
const RESOLUTION_CLASS_COLOR: Record<ResolutionClass, (t: string) => string> = {
  'victory': positive,
  'overthrow': positive,
  'quiet-retirement': positive,
  'puppet-master': yellow,
  'tragic-stabilization': yellow,
  'exile': danger,
  'martyrdom': critical,
  'collapse': critical,
};

function getResolutionColor(resolution: string): (t: string) => string {
  return RESOLUTION_CLASS_COLOR[resolution as ResolutionClass] ?? ((t: string) => t);
}
