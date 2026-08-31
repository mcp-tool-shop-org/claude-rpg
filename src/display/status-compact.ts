// status-compact — compact all-in-one strategic snapshot
// v1.1: Campaign UX & Product Hardening
// v1.2: semantic terminal coloring

import type { LeverageState, ScoredMove } from '@ai-rpg-engine/modules';
import { formatLeverageStatus } from '@ai-rpg-engine/modules';
import type { StatusData } from '../character/presence.js';
import { bold, dim, red, yellow, cyan, danger, critical } from '../cli/colors.js';
import { getTerminalWidth, isCriticalHp, wrapStatusLine } from './play-renderer.js';

// F-38eb3dec: was a fixed 60-char divider regardless of terminal size,
// unlike play-renderer.ts's own dividers (PFE-005). Computed per call (not
// a module-level constant) so it tracks the real terminal width, matching
// play-renderer.ts's makeDivider() pattern.
function divider(): string {
  return dim('\u2500'.repeat(getTerminalWidth()));
}

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
  lines.push(divider());
  const fastLabel = opts.fastMode ? ' (Fast Campaign)' : '';
  lines.push(bold(`  STATUS \u2014 ${situationTag}${fastLabel}`));
  lines.push(divider());

  // Character line
  const titlePart = s.title ? ` "${s.title}"` : '';
  const discipline = s.disciplineName ? ` ${s.disciplineName}` : '';
  // F-ce17a470: colored critical (bold red) at/below the shared threshold
  // (play-renderer.ts's isCriticalHp) so this snapshot and the full play
  // screen can't disagree about what counts as dangerously low HP.
  const rawHpPart = s.maxHp ? `HP: ${s.hp}/${s.maxHp}` : `HP: ${s.hp}`;
  const hpPart = isCriticalHp(s.hp, s.maxHp) ? critical(rawHpPart) : rawHpPart;
  // F-7eff9b3a: routed through play-renderer.ts's wrapStatusLine (shared
  // helper, same fix as that file's own character-status line) instead of
  // raw concatenation -- segments wrap at " | " boundaries with a hanging
  // indent once the line exceeds getTerminalWidth(), instead of the
  // terminal hard-wrapping wherever it falls mid-word. Behavior-preserving
  // when everything fits on one line (see wrapStatusLine's doc comment).
  const nameSeg = `${bold(s.name)}${titlePart} (Lv${s.level} ${s.archetypeName}${discipline})`;
  const segs = [nameSeg, hpPart];
  if (s.weaponName) segs.push(s.weaponName);
  if (s.armorName) segs.push(s.armorName);
  lines.push(wrapStatusLine('  ', segs));

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
    // F-ae95efb8: urgencyLabel distinguishes 3 tiers, but colorFn used to
    // only distinguish 2 (>=0.7 danger, else yellow) -- 'distant' and
    // 'growing' rendered in identical plain yellow(), under-differentiating
    // the label's 3-way split on the line meant to let a player triage
    // threats at a glance. 'distant' now gets dim(), matching this domain's
    // convention that the least-urgent tier of a scale reads as
    // peripheral/secondary, not equal-weight with an active warning.
    const colorFn = topThreat.urgency >= 0.7 ? danger : topThreat.urgency >= 0.4 ? yellow : dim;
    lines.push(`  Threat: ${colorFn(`${topThreat.description} (${urgencyLabel})`)}`);
  }

  // Suggested move
  if (suggestedMove && suggestedMove.feasibility > 0) {
    lines.push(`  Suggested: ${cyan(suggestedMove.reason)}`);
  }

  lines.push(divider());
  lines.push('');
  return lines.join('\n');
}
