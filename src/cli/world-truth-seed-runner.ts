// world-truth-seed-runner.ts — WO-A2T-5 (slice A2-truth, design doc §8):
// the defensive wrapper around game-core's load-time world-truth seed call
// site in bin.ts's runLoad().
//
// Extracted from bin.ts's runLoad() (mirrors the F-6506450c precedent set by
// cli/engine-state-validator.ts) so the seed call's error handling — not a
// hand-copied fork of it — is what both production and tests exercise, and
// so it is unit-testable without a real GameSession/SavedSession/save file
// (seedWorldTruthFromSession's own module, src/game/world-truth-seed.ts, is
// game-core's file and out of this domain's owned globs).
//
// Every other fallible step in runLoad (engine-state validation, the pack
// lookup) fails the load cleanly through classifyForPresentation's 'load'
// context rather than letting an exception fall through to main()'s generic
// 'startup' catch. The seed runs after those steps succeed and after the
// session fields it reads are already restored, so a malformed 1.x field
// surfacing mid-seed gets the same treatment: caught here, never left to
// crash past recap into an inconsistent, half-seeded world.

import type { DebugLogger } from '../game/debug-logger.js';

/** Shape a world-truth seed report is expected to carry at minimum. */
export interface WorldTruthSeedReport {
  seeded: boolean;
  [key: string]: unknown;
}

export type WorldTruthSeedFn = () => WorldTruthSeedReport;

export type WorldTruthSeedOutcome =
  | { ok: true; report: WorldTruthSeedReport }
  | { ok: false; error: unknown };

/**
 * Run a load-time world-truth seed function defensively: log its report
 * through the session's debug logger on success, or capture a thrown error
 * for the caller to route through the standard 'load' error presentation
 * instead of an uncaught throw reaching main()'s generic 'startup' catch.
 */
export function runWorldTruthSeed(
  seedFn: WorldTruthSeedFn,
  debugLog: DebugLogger,
): WorldTruthSeedOutcome {
  try {
    const report = seedFn();
    debugLog.info('world-truth-seed', 'load-time seed', { report });
    return { ok: true, report };
  } catch (error) {
    return { ok: false, error };
  }
}
