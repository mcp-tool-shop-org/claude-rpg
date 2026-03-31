// status-compact — compact all-in-one strategic snapshot
// v1.1: Campaign UX & Product Hardening
// v1.2: semantic terminal coloring

import type { LeverageState, ScoredMove } from '@ai-rpg-engine/modules';
import { formatLeverageStatus } from '@ai-rpg-engine/modules';
import type { StatusData } from '../character/presence.js';
import { bold, dim, red, yellow, green, cyan, danger } from '../cli/colors.js';

const DIVIDER = dim('\u2500'.repeat(60));

export function renderCompactStatus(opts: {
  statusData: StatusData;
  leverageState: LeverageState;
  topThreat: { description: string; urgency: number } | null;
  suggestedMove: ScoredMove | null;
  situationTag: string;
  economySummary?: string;
  materialsSummary?: string;
  opportunitySummary?: string;
  arcIndicator?: string;
  endgameIndicator?: string;
  fastMode?: boolean;
}): string {
  const { statusData: s, leverageState, topThreat, suggestedMove, situationTag, economySummary, materialsSummary } = opts;
  const lines: string[] = [];

  lines.push('');
  lines.push(DIVIDER);
  const fastLabel = opts.fastMode ? ' (Fast Campaign)' : '';
  lines.push(bold(`  STATUS \u2014 ${situationTag}${fastLabel}`));
  lines.push(DIVIDER);

  // Character line
  const titlePart = s.title ? ` "${s.title}"` : '';
  const discipline = s.disciplineName ? ` ${s.disciplineName}` : '';
  const hpPart = s.maxHp ? `HP: ${s.hp}/${s.maxHp}` : `HP: ${s.hp}`;
  const weaponPart = s.weaponName ? ` | ${s.weaponName}` : '';
  const armorPart = s.armorName ? ` | ${s.armorName}` : '';
  lines.push(`  ${bold(s.name)}${titlePart} (Lv${s.level} ${s.archetypeName}${discipline}) | ${hpPart}${weaponPart}${armorPart}`);

  // Injuries / statuses
  const tags = [...s.injuryTags, ...s.statuses];
  if (tags.length > 0) {
    lines.push(`  Conditions: ${red(tags.join(', '))}`);
  }

  // Leverage line
  const leverageLine = formatLeverageStatus(leverageState);
  if (leverageLine !== 'No leverage') {
    lines.push(`  ${leverageLine}`);
  }

  // Economy line
  if (economySummary) {
    lines.push(`  Market: ${economySummary}`);
  }

  // Materials line (v1.8)
  if (materialsSummary) {
    lines.push(`  ${materialsSummary}`);
  }

  // Opportunities line (v1.9)
  if (opts.opportunitySummary) {
    lines.push(`  Jobs: ${opts.opportunitySummary}`);
  }

  // Arc line (v2.0)
  if (opts.arcIndicator) {
    lines.push(`  Arc: ${opts.arcIndicator}`);
  }

  // Endgame line (v2.1)
  if (opts.endgameIndicator) {
    lines.push(`  Endgame: ${opts.endgameIndicator}`);
  }

  // Threat line
  if (topThreat) {
    const urgencyLabel = topThreat.urgency >= 0.7 ? 'urgent' : topThreat.urgency >= 0.4 ? 'growing' : 'distant';
    const colorFn = topThreat.urgency >= 0.7 ? danger : yellow;
    lines.push(`  Threat: ${colorFn(`${topThreat.description} (${urgencyLabel})`)}`);
  }

  // Suggested move
  if (suggestedMove && suggestedMove.feasibility > 0) {
    lines.push(`  Suggested: ${cyan(suggestedMove.reason)}`);
  }

  lines.push(DIVIDER);
  lines.push('');
  return lines.join('\n');
}
