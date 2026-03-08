// Unified 5-section session recap
// v0.8: character + world + faction + rumor + "what people are saying"

import type { SessionDelta } from './recap-delta.js';
import type { WorldDelta } from './world-delta.js';
import type { PlayerRumor, PressureFallout } from '@ai-rpg-engine/modules';

const DIVIDER = '─'.repeat(60);
const HEAVY_DIVIDER = '═'.repeat(60);

// --- Types ---

export type FactionDelta = {
  factionId: string;
  reputationBefore: number;
  reputationAfter: number;
  pressuresFrom: number;
  rumorsKnownBefore: number;
  rumorsKnownAfter: number;
};

export type RumorDelta = {
  spawned: number;
  mutated: number;
  totalSpread: number;
  mostWidespread?: string;
};

export type WhatPeopleAreSaying = {
  factionId: string;
  factionName: string;
  sentiment: 'hostile' | 'wary' | 'neutral' | 'friendly' | 'admiring';
  latestRumor?: string;
};

// --- Computation ---

export function computeFactionDeltas(
  beforeReputation: { factionId: string; value: number }[],
  afterReputation: { factionId: string; value: number }[],
  rumors: PlayerRumor[],
  resolvedPressures: PressureFallout[],
  sessionStartTick: number,
): FactionDelta[] {
  const deltas: FactionDelta[] = [];
  const factionIds = new Set<string>();

  for (const rep of afterReputation) factionIds.add(rep.factionId);
  for (const rep of beforeReputation) factionIds.add(rep.factionId);

  for (const factionId of factionIds) {
    const before = beforeReputation.find((r) => r.factionId === factionId)?.value ?? 0;
    const after = afterReputation.find((r) => r.factionId === factionId)?.value ?? 0;

    // Count pressures from this faction resolved this session
    const pressuresFrom = resolvedPressures.filter(
      (f) => f.resolution.resolvedBy !== 'expiry' &&
        resolvedPressures.indexOf(f) >= 0,
    ).filter((f) => {
      // Check fallout effects for this faction
      return f.effects.some(
        (e) => (e.type === 'reputation' && e.factionId === factionId) ||
          (e.type === 'alert' && e.factionId === factionId),
      );
    }).length;

    // Count rumors known by this faction before/after session
    const rumorsKnownBefore = rumors.filter(
      (r) => r.spreadTo.includes(factionId) && r.originTick < sessionStartTick,
    ).length;
    const rumorsKnownAfter = rumors.filter(
      (r) => r.spreadTo.includes(factionId),
    ).length;

    // Only include factions where something changed
    if (before !== after || pressuresFrom > 0 || rumorsKnownAfter > rumorsKnownBefore) {
      deltas.push({
        factionId,
        reputationBefore: before,
        reputationAfter: after,
        pressuresFrom,
        rumorsKnownBefore,
        rumorsKnownAfter,
      });
    }
  }

  return deltas.sort((a, b) => {
    const aDiff = Math.abs(a.reputationAfter - a.reputationBefore);
    const bDiff = Math.abs(b.reputationAfter - b.reputationBefore);
    return bDiff - aDiff;
  });
}

export function computeRumorDelta(
  beforeCount: number,
  afterRumors: PlayerRumor[],
): RumorDelta {
  const spawned = afterRumors.length - beforeCount;

  // Count mutations across all rumors
  const mutated = afterRumors.reduce((sum, r) => sum + r.mutationCount, 0);

  // Total faction-reaches
  const totalSpread = afterRumors.reduce((sum, r) => sum + r.spreadTo.length, 0);

  // Most widespread rumor
  let mostWidespread: string | undefined;
  let maxSpread = 0;
  for (const rumor of afterRumors) {
    if (rumor.spreadTo.length > maxSpread) {
      maxSpread = rumor.spreadTo.length;
      mostWidespread = rumor.claim;
    }
  }

  return { spawned, mutated, totalSpread, mostWidespread };
}

export function deriveWhatPeopleAreSaying(
  rumors: PlayerRumor[],
  reputation: { factionId: string; value: number }[],
  factionNames: Record<string, string>,
): WhatPeopleAreSaying[] {
  const results: WhatPeopleAreSaying[] = [];

  for (const rep of reputation) {
    const sentiment: WhatPeopleAreSaying['sentiment'] =
      rep.value <= -50 ? 'hostile'
      : rep.value <= -20 ? 'wary'
      : rep.value >= 50 ? 'admiring'
      : rep.value >= 20 ? 'friendly'
      : 'neutral';

    // Find the most recent rumor this faction has heard
    const factionRumors = rumors
      .filter((r) => r.spreadTo.includes(rep.factionId))
      .sort((a, b) => b.originTick - a.originTick);

    const latestRumor = factionRumors[0]?.claim;

    // Only include factions with non-neutral sentiment or known rumors
    if (sentiment !== 'neutral' || latestRumor) {
      results.push({
        factionId: rep.factionId,
        factionName: factionNames[rep.factionId] ?? rep.factionId,
        sentiment,
        latestRumor,
      });
    }
  }

  return results;
}

// --- Rendering ---

export function renderFullRecap(
  characterDelta: SessionDelta,
  worldDelta: WorldDelta,
  factionDeltas: FactionDelta[],
  rumorDelta: RumorDelta,
  whatPeopleAreSaying: WhatPeopleAreSaying[],
): string {
  // Nothing to show if nothing happened
  if (
    characterDelta.turnsPlayed === 0 &&
    characterDelta.xpGained === 0 &&
    worldDelta.pressuresSpawned === 0 &&
    worldDelta.pressuresResolved === 0
  ) {
    return '';
  }

  const lines: string[] = [];

  lines.push('');
  lines.push(HEAVY_DIVIDER);
  lines.push('  SESSION SUMMARY');
  lines.push(HEAVY_DIVIDER);

  // Section 1: Character Changes
  lines.push('');
  lines.push(`  ${DIVIDER}`);
  lines.push('  CHARACTER CHANGES');
  lines.push(`  ${DIVIDER}`);
  lines.push('');

  const xpStr = characterDelta.xpGained > 0
    ? characterDelta.levelAfter > characterDelta.levelBefore
      ? ` | +${characterDelta.xpGained} XP (Level ${characterDelta.levelBefore} → ${characterDelta.levelAfter})`
      : ` | +${characterDelta.xpGained} XP`
    : '';
  lines.push(`  Turns played: ${characterDelta.turnsPlayed}${xpStr}`);

  if (characterDelta.titleAfter && characterDelta.titleAfter !== characterDelta.titleBefore) {
    lines.push(`  Title: ${characterDelta.titleBefore ?? '(none)'} → "${characterDelta.titleAfter}"`);
  }

  if (characterDelta.newMilestones > 0) {
    lines.push(`  ${characterDelta.newMilestones} new milestone${characterDelta.newMilestones > 1 ? 's' : ''}`);
  }

  if (characterDelta.newInjuries > 0) {
    lines.push(`  ${characterDelta.newInjuries} new injur${characterDelta.newInjuries > 1 ? 'ies' : 'y'}`);
  }

  // Section 2: World Changes
  if (worldDelta.pressuresSpawned > 0 || worldDelta.pressuresResolved > 0) {
    lines.push('');
    lines.push(`  ${DIVIDER}`);
    lines.push('  WORLD CHANGES');
    lines.push(`  ${DIVIDER}`);
    lines.push('');

    if (worldDelta.pressuresSpawned > 0) {
      lines.push(`  Pressures spawned: ${worldDelta.pressuresSpawned}`);
    }
    if (worldDelta.pressuresResolved > 0) {
      lines.push(`  Pressures resolved: ${worldDelta.pressuresResolved}`);
      for (const summary of worldDelta.resolutionSummaries) {
        lines.push(`    - ${summary}`);
      }
    }
    if (worldDelta.chainReactions > 0) {
      lines.push(`  Chain reactions: ${worldDelta.chainReactions}`);
    }
  }

  // Section 3: Faction Shifts
  if (factionDeltas.length > 0) {
    lines.push('');
    lines.push(`  ${DIVIDER}`);
    lines.push('  FACTION SHIFTS');
    lines.push(`  ${DIVIDER}`);
    lines.push('');

    for (const fd of factionDeltas) {
      const repChange = fd.reputationAfter - fd.reputationBefore;
      const sign = repChange > 0 ? '+' : '';
      const rumorInfo = fd.rumorsKnownAfter > fd.rumorsKnownBefore
        ? ` | ${fd.rumorsKnownAfter - fd.rumorsKnownBefore} new rumor${fd.rumorsKnownAfter - fd.rumorsKnownBefore > 1 ? 's' : ''} about you`
        : '';
      if (repChange !== 0) {
        lines.push(`  ${fd.factionId}: ${sign}${repChange} (now ${fd.reputationAfter > 0 ? '+' : ''}${fd.reputationAfter})${rumorInfo}`);
      } else if (rumorInfo) {
        lines.push(`  ${fd.factionId}:${rumorInfo}`);
      }
    }
  }

  // Section 4: Rumor Network
  if (rumorDelta.spawned > 0 || rumorDelta.totalSpread > 0) {
    lines.push('');
    lines.push(`  ${DIVIDER}`);
    lines.push('  RUMOR NETWORK');
    lines.push(`  ${DIVIDER}`);
    lines.push('');

    const parts: string[] = [];
    if (rumorDelta.spawned > 0) parts.push(`${rumorDelta.spawned} new rumor${rumorDelta.spawned > 1 ? 's' : ''}`);
    if (rumorDelta.totalSpread > 0) parts.push(`${rumorDelta.totalSpread} faction-reaches`);
    if (parts.length > 0) lines.push(`  ${parts.join(' | ')}`);

    if (rumorDelta.mostWidespread) {
      const truncated = rumorDelta.mostWidespread.length > 60
        ? rumorDelta.mostWidespread.slice(0, 57) + '...'
        : rumorDelta.mostWidespread;
      lines.push(`  Most widespread: "${truncated}"`);
    }
  }

  // Section 5: What People Are Saying
  if (whatPeopleAreSaying.length > 0) {
    lines.push('');
    lines.push(`  ${DIVIDER}`);
    lines.push('  WHAT PEOPLE ARE SAYING');
    lines.push(`  ${DIVIDER}`);
    lines.push('');

    for (const wps of whatPeopleAreSaying) {
      if (wps.latestRumor) {
        const truncated = wps.latestRumor.length > 50
          ? wps.latestRumor.slice(0, 47) + '...'
          : wps.latestRumor;
        lines.push(`  ${wps.factionName} (${wps.sentiment}): "${truncated}"`);
      } else {
        lines.push(`  ${wps.factionName} (${wps.sentiment})`);
      }
    }
  }

  lines.push('');
  lines.push(HEAVY_DIVIDER);
  lines.push('');

  return lines.join('\n');
}
