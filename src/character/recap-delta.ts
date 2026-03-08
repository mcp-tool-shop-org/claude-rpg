// Session delta: track what changed since session start

import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import { computeLevel } from '@ai-rpg-engine/character-profile';

const DIVIDER = '─'.repeat(60);

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

/** Render session delta as terminal text. */
export function renderSessionDelta(delta: SessionDelta): string {
  const lines: string[] = [];

  if (delta.turnsPlayed === 0 && delta.xpGained === 0) {
    return '';
  }

  lines.push('');
  lines.push(DIVIDER);
  lines.push('  SESSION SUMMARY');
  lines.push(DIVIDER);
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
    lines.push(`  ${rep.factionId}: ${sign}${rep.after - rep.before} (now ${rep.after > 0 ? '+' : ''}${rep.after})`);
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
  lines.push(DIVIDER);
  lines.push('');

  return lines.join('\n');
}
