// archive-browser — render completed campaign archive for terminal display

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

function getResolutionLabel(resolution: string): string {
  const labels: Record<string, string> = {
    'victory': 'VICTORY',
    'exile': 'EXILE',
    'martyrdom': 'MARTYRDOM',
    'collapse': 'COLLAPSE',
    'overthrow': 'OVERTHROW',
    'puppet-master': 'PUPPET MASTER',
    'quiet-retirement': 'QUIET RETIREMENT',
    'tragic-stabilization': 'TRAGIC STABILIZATION',
  };
  return labels[resolution] ?? resolution.toUpperCase();
}
