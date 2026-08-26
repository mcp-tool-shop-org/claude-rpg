// Session delta: track what changed since session start

import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import { computeLevel } from '@ai-rpg-engine/character-profile';
import { getTerminalWidth } from '../display/play-renderer.js';

// F-e475c46d: was a fixed 60-char divider regardless of terminal size,
// unlike play-renderer.ts's own dividers (PFE-005). Computed per call (not
// a module-level constant) so it tracks the real terminal width, matching
// play-renderer.ts's makeDivider()/makeThinDivider() pattern (F-38eb3dec
// precedent: director-renderer.ts, status-compact.ts, archive-browser.ts,
// help-system.ts).
function divider(): string {
  return '─'.repeat(getTerminalWidth());
}

export type SessionSnapshot = {
  xp: number;
  level: number;
  reputation: { factionId: string; value: number }[];
  milestoneCount: number;
  injuryCount: number;
  title?: string;
  totalTurns: number;
};

export type SessionDelta = {
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  reputationChanges: { factionId: string; before: number; after: number }[];
  newMilestones: number;
  newInjuries: number;
  titleBefore?: string;
  titleAfter?: string;
  turnsPlayed: number;
};

/** Capture a snapshot of the current profile state. */
export function captureSnapshot(profile: CharacterProfile): SessionSnapshot {
  return {
    xp: profile.progression.xp,
    level: computeLevel(profile.progression.xp),
    reputation: profile.reputation.map((r) => ({ ...r })),
    milestoneCount: profile.milestones.length,
    injuryCount: profile.injuries.filter((i) => !i.healed).length,
    title: profile.custom.title as string | undefined,
    totalTurns: profile.totalTurns,
  };
}

/** Compute what changed between two snapshots. */
export function computeSessionDelta(
  before: SessionSnapshot,
  after: SessionSnapshot,
): SessionDelta {
  const reputationChanges: SessionDelta['reputationChanges'] = [];

  // Find all factions in after snapshot
  for (const rep of after.reputation) {
    const beforeRep = before.reputation.find((r) => r.factionId === rep.factionId);
    const beforeValue = beforeRep?.value ?? 0;
    if (rep.value !== beforeValue) {
      reputationChanges.push({
        factionId: rep.factionId,
        before: beforeValue,
        after: rep.value,
      });
    }
  }

  return {
    xpGained: after.xp - before.xp,
    levelBefore: before.level,
    levelAfter: after.level,
    reputationChanges,
    newMilestones: after.milestoneCount - before.milestoneCount,
    newInjuries: Math.max(0, after.injuryCount - before.injuryCount),
    titleBefore: before.title,
    titleAfter: after.title,
    turnsPlayed: after.totalTurns - before.totalTurns,
  };
}

/**
 * Render session delta as terminal text.
 *
 * F-fc8a9b4a / Coordinator Brief ruling R3: this function has zero
 * production callers in the shipped CLI today (session-recap.ts's
 * renderFullRecap is the live "SESSION SUMMARY" path; this is a parallel,
 * simpler single-section renderer). It is KEPT and re-exported from index.ts
 * as intentional public-library surface — removing it inside a minor release
 * would break semver for any external embedder calling it directly. Do not
 * wire it into bin.ts alongside renderFullRecap: that would create a second,
 * independently-hand-maintained rendering path for the same delta data,
 * exactly the "two copies drift apart" shape this codebase has already been
 * bitten by repeatedly (F-223de079, F-8da2e6f7, F-f1eb58cb, F-aaaa105f).
 *
 * @param factionNames F-4b8a3a39: optional id->display-name map, mirroring
 *   session-recap.ts's already-established FACTION SHIFTS convention
 *   (F-bbcef54a) and sheet.ts's REPUTATION convention (F-9c94c4b5). Default
 *   {} so every pre-existing call site keeps compiling and keeps rendering
 *   the raw factionId exactly as before this fix.
 */
export function renderSessionDelta(delta: SessionDelta, factionNames: Record<string, string> = {}): string {
  const lines: string[] = [];

  // F-579e70a8: gate on every field the body below actually renders, not just
  // turnsPlayed/xpGained — otherwise a session with only e.g. a reputation shift,
  // a milestone, an injury, or a title change renders as fully empty.
  const hasAnyContent =
    delta.turnsPlayed > 0 ||
    delta.xpGained > 0 ||
    delta.reputationChanges.length > 0 ||
    delta.newMilestones > 0 ||
    delta.newInjuries > 0 ||
    (!!delta.titleAfter && delta.titleAfter !== delta.titleBefore);

  if (!hasAnyContent) {
    return '';
  }

  lines.push('');
  lines.push(divider());
  lines.push('  SESSION SUMMARY');
  lines.push(divider());
  lines.push('');

  lines.push(`  Turns played: ${delta.turnsPlayed}`);

  if (delta.xpGained > 0) {
    if (delta.levelAfter > delta.levelBefore) {
      lines.push(`  +${delta.xpGained} XP (Level ${delta.levelBefore} → ${delta.levelAfter})`);
    } else {
      lines.push(`  +${delta.xpGained} XP`);
    }
  }

  for (const rep of delta.reputationChanges) {
    const sign = rep.after > rep.before ? '+' : '';
    const factionName = factionNames[rep.factionId] ?? rep.factionId;
    lines.push(`  ${factionName}: ${sign}${rep.after - rep.before} (now ${rep.after > 0 ? '+' : ''}${rep.after})`);
  }

  if (delta.newMilestones > 0) {
    lines.push(`  ${delta.newMilestones} new milestone${delta.newMilestones > 1 ? 's' : ''}`);
  }

  if (delta.newInjuries > 0) {
    lines.push(`  ${delta.newInjuries} new injur${delta.newInjuries > 1 ? 'ies' : 'y'}`);
  }

  if (delta.titleAfter && delta.titleAfter !== delta.titleBefore) {
    lines.push(`  Title: ${delta.titleBefore ?? '(none)'} → ${delta.titleAfter}`);
  }

  lines.push('');
  lines.push(divider());
  lines.push('');

  return lines.join('\n');
}
