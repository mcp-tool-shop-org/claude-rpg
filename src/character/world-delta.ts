// World delta: track what changed in the world since session start
// Parallel to recap-delta.ts for character changes.
// "What changed in the world because of you?"

import type { PressureKind, WorldPressure, PressureFallout } from '@ai-rpg-engine/modules';
import type { PlayerRumor } from '@ai-rpg-engine/modules';

const DIVIDER = '─'.repeat(60);

export type WorldSnapshot = {
  activePressureCount: number;
  activePressureKinds: PressureKind[];
  resolvedCount: number;
  rumorCount: number;
};

export type WorldDelta = {
  pressuresSpawned: number;
  pressuresResolved: number;
  resolutionSummaries: string[];
  chainReactions: number;
  rumorsDelta: number;
};

/** Capture a snapshot of current world state. */
export function captureWorldSnapshot(
  pressures: WorldPressure[],
  rumors: PlayerRumor[],
  resolvedHistory: PressureFallout[],
): WorldSnapshot {
  return {
    activePressureCount: pressures.length,
    activePressureKinds: pressures.map((p) => p.kind),
    resolvedCount: resolvedHistory.length,
    rumorCount: rumors.length,
  };
}

/** Compute what changed between two world snapshots. */
export function computeWorldDelta(
  before: WorldSnapshot,
  after: WorldSnapshot,
  falloutHistory: PressureFallout[],
): WorldDelta {
  // Only count fallout entries that appeared after the "before" snapshot
  const newFallout = falloutHistory.slice(before.resolvedCount);

  const chainReactions = newFallout.reduce((count, f) => {
    return count + f.effects.filter((e) => e.type === 'spawn-pressure').length;
  }, 0);

  return {
    pressuresSpawned: Math.max(
      0,
      after.activePressureCount - before.activePressureCount + newFallout.length,
    ),
    pressuresResolved: newFallout.length,
    resolutionSummaries: newFallout.map((f) => f.summary),
    chainReactions,
    rumorsDelta: after.rumorCount - before.rumorCount,
  };
}

/** Render world delta as terminal text. */
export function renderWorldDelta(delta: WorldDelta): string {
  // Nothing to show if no world changes
  if (
    delta.pressuresSpawned === 0 &&
    delta.pressuresResolved === 0 &&
    delta.rumorsDelta === 0
  ) {
    return '';
  }

  const lines: string[] = [];

  lines.push('');
  lines.push(DIVIDER);
  lines.push('  WORLD CHANGES');
  lines.push(DIVIDER);
  lines.push('');

  if (delta.pressuresSpawned > 0) {
    lines.push(`  Pressures spawned: ${delta.pressuresSpawned}`);
  }

  if (delta.pressuresResolved > 0) {
    lines.push(`  Pressures resolved: ${delta.pressuresResolved}`);
    for (const summary of delta.resolutionSummaries) {
      lines.push(`    - ${summary}`);
    }
  }

  if (delta.chainReactions > 0) {
    lines.push(`  Chain reactions: ${delta.chainReactions}`);
  }

  if (delta.rumorsDelta > 0) {
    lines.push(`  New rumors: ${delta.rumorsDelta}`);
  }

  lines.push('');
  lines.push(DIVIDER);
  lines.push('');

  return lines.join('\n');
}
