// WO-A5-5 (slice A5 §7, docs/living-world-slice-a5.md "Recap and
// chronicle"): the round-by-round "the world moved" ledger — pressures
// spawned/resolved/expired, opportunities offered/expired, ambushes,
// district mood transitions, rumors mutated.
//
// Uniform `{ tick, kind, headline }` shape rather than a bespoke union with
// kind-specific fields, because the design doc's own §7 frames the recap's
// job as "counts + the headline of each (mechanical register)" — several
// kinds have no independently useful identifier beyond an already-formatted
// one-line summary (e.g. OpportunityFallout carries `opportunityKind` +
// `summary`, no title of its own), so routing every kind through the two
// fields the recap actually consumes is simpler and more honest about what
// the engine hands back than forcing a title-shaped field onto every kind.

export type WorldMovedKind =
  | 'pressure-spawned'
  | 'pressure-resolved'
  | 'pressure-expired'
  | 'opportunity-offered'
  | 'opportunity-expired'
  | 'ambush'
  | 'mood-transition'
  | 'rumor-mutated';

export type WorldMovedEntry = {
  tick: number;
  kind: WorldMovedKind;
  headline: string;
};

/**
 * Runtime list mirroring WorldMovedKind — session.ts's load-side shape
 * guard (isValidWorldMovedEntry) uses this to validate a persisted entry's
 * `kind` without duplicating the literal union by hand (the same
 * VALID_STATUSES/VALID_STANCES convention @ai-rpg-engine/rumor-system's own
 * types.ts already uses for its own string-literal unions).
 */
export const VALID_WORLD_MOVED_KINDS: readonly WorldMovedKind[] = [
  'pressure-spawned',
  'pressure-resolved',
  'pressure-expired',
  'opportunity-offered',
  'opportunity-expired',
  'ambush',
  'mood-transition',
  'rumor-mutated',
];

/**
 * F-51e110b9 cap-pattern precedent (game.ts's capOldestFirst, shared by
 * resolvedOpportunities/endgameTriggers): this ledger rides every save
 * (session.ts's `worldMoved` field) and is fed from up to eight independent
 * call sites across a single round, so an unbounded campaign would grow it
 * faster than either of those single-source ledgers. Same order of
 * magnitude as MAX_RESOLVED_FALLOUT_ENTRIES/MAX_ENDGAME_TRIGGERS (game.ts)
 * since this is a comparable "recent history for a display surface"
 * ledger, not an unbounded archive.
 */
export const MAX_WORLD_MOVED_ENTRIES = 200;
