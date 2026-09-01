// WO-A2T-2 (slice A2 §9, R1 — "the accrued ledger is honored"):
// reputation-composition helpers shared between the load-time seed
// (world-truth-seed.ts, WO-A2T-1) and the per-round write/view path
// (GameSession.adjustFactionReputation / refreshWorldViews, game.ts) plus
// game-state.ts's applyFalloutEffects reputation case.
//
// Two ledgers exist pre-adoption: CharacterProfile.reputation[] (the app's
// own direct writes via character-profile's adjustReputation) and
// world.globals['reputation_<factionId>'] (the engine's own accrued
// kill/fallout ledger — defeat-fallout since 3.9, joined by pressure/
// opportunity/leverage fallout from A2-core on). From this wave on there is
// exactly ONE write path for reputation deltas (addFactionReputationGlobal
// below) and the profile's own `.reputation[]` becomes a VIEW recomputed by
// refreshReputationProfile: value(f) = baseline(f) + globals['reputation_<f>'],
// where baseline(f) is stamped exactly once from the profile's own
// pre-adoption value — the mechanism that lets the accrued kill/fallout
// history compose into the profile's number on adoption day instead of
// being silently discarded.
import type { WorldState } from '@ai-rpg-engine/core';
import type { CharacterProfile, ReputationEntry } from '@ai-rpg-engine/character-profile';

/** Once-only stamp marking baseline capture done for this world (design lock 2). */
const REP_BASELINED_KEY = 'claude_rpg.rep_baselined';
/** Per-faction baseline key prefix: `${REP_BASELINE_PREFIX}${factionId}`. */
const REP_BASELINE_PREFIX = 'claude_rpg.rep_baseline_';
/**
 * The engine's own accrued-delta ledger key prefix — the SAME
 * `reputation_${factionId}` global defeat-fallout (3.9+), pressure/
 * opportunity fallout, and player-leverage effects already write (verified
 * against the installed 3.11 dist: modules/dist/defeat-fallout.js,
 * opportunity-resolution.js, player-leverage.js, world-tick.js all use this
 * exact key family). Never read/written by any OTHER prefix from this file.
 */
const REP_GLOBAL_PREFIX = 'reputation_';

function numGlobal(world: WorldState, key: string): number {
  const value = world.globals[key];
  return typeof value === 'number' ? value : 0;
}

/**
 * Stamp `world.globals['claude_rpg.rep_baseline_<f>']` from the profile's
 * CURRENT (pre-adoption) reputation value, for every faction the profile
 * knows, then set `claude_rpg.rep_baselined = 1`. Idempotent via that same
 * marker: called from BOTH the load-time seed (WO-A2T-1, once per legacy
 * save) and unconditionally on every round's refreshWorldViews (the "first
 * round of a fresh world" case design doc §9 also names) — the second and
 * subsequent calls are guaranteed no-ops, so calling it every round is safe
 * and is the only way a NEW game (no SavedSession to seed from) ever gets a
 * baseline stamped at all.
 */
export function stampReputationBaselines(profile: CharacterProfile, world: WorldState): void {
  if (world.globals[REP_BASELINED_KEY] !== undefined) return;
  for (const entry of profile.reputation) {
    world.globals[`${REP_BASELINE_PREFIX}${entry.factionId}`] = entry.value;
  }
  world.globals[REP_BASELINED_KEY] = 1;
}

/**
 * ADD (never set) `delta` to the accrued ledger for `factionId` — the same
 * `reputation_<factionId>` global the engine's own fallout appliers write
 * (addGlobal semantics per the wave addendum's engine-reuse lock). Every
 * remaining app write site for reputation funnels through this:
 * GameSession.adjustFactionReputation (game.ts, replacing the 4 direct
 * `adjustReputation` call sites) and game-state.ts's applyFalloutEffects
 * reputation case (replacing its 1) — `adjustReputation` from
 * character-profile is never called directly anywhere in src/ after this
 * wave.
 */
export function addFactionReputationGlobal(world: WorldState, factionId: string, delta: number): void {
  if (!Number.isFinite(delta)) return; // F-586e744e parity: adjustReputation itself skips a non-finite delta
  const key = `${REP_GLOBAL_PREFIX}${factionId}`;
  world.globals[key] = numGlobal(world, key) + delta;
}

/**
 * Recompute the profile's `.reputation[]` as a VIEW:
 * `value(f) = baseline(f) + globals['reputation_<f>']`, clamped to
 * [-100, 100] — the exact clamp character-profile's own adjustReputation
 * always applied (milestones.js), preserved here so dialogueBias and every
 * other profile reader keep the same range assumption unchanged.
 *
 * Union of every faction the profile already knows (order preserved, so a
 * profile's own faction ordering stays stable turn over turn) plus any
 * faction with an accrued global the profile has never recorded before
 * (appended, sorted lexicographically for determinism — matters for the
 * slice's byte-identical-event-log proof's sibling guarantee on saved
 * profile shape).
 */
export function refreshReputationProfile(profile: CharacterProfile, world: WorldState): CharacterProfile {
  const known = new Set(profile.reputation.map((r) => r.factionId));
  const extra: string[] = [];
  for (const key of Object.keys(world.globals)) {
    if (!key.startsWith(REP_GLOBAL_PREFIX)) continue;
    const factionId = key.slice(REP_GLOBAL_PREFIX.length);
    if (!known.has(factionId)) extra.push(factionId);
  }
  extra.sort();

  const valueFor = (factionId: string): number => {
    const baseline = numGlobal(world, `${REP_BASELINE_PREFIX}${factionId}`);
    const accrued = numGlobal(world, `${REP_GLOBAL_PREFIX}${factionId}`);
    return Math.max(-100, Math.min(100, baseline + accrued));
  };

  const reputation: ReputationEntry[] = [
    ...profile.reputation.map((r) => ({ factionId: r.factionId, value: valueFor(r.factionId) })),
    ...extra.map((factionId) => ({ factionId, value: valueFor(factionId) })),
  ];

  return { ...profile, reputation };
}
