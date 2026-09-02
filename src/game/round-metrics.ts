// WO-A6-2 (slice A6 §5, design lock 2, ADDENDUM-COMMON): per-round metrics
// the Phase-9 composed proof's matrix runner (tests domain) consumes to
// write the tuning program's metrics sheet. Read-only, NOT persisted --
// GameSession.getRoundMetrics() (game.ts) is the only accessor; nothing here
// rides a save.

/**
 * One entry per played round (this session's own per-turn processing, keyed
 * by `tick`). Every count is an EVENT count for that round (how many times
 * the thing happened this round), not a cumulative total, EXCEPT
 * `pressuresActive` (a snapshot of the round-end count) and `rumorHearers`
 * (a snapshot of all-time distinct hearers so far) -- both called out on
 * their own fields below since they read differently from the others.
 */
export type RoundMetrics = {
  /** The engine tick this entry describes. */
  tick: number;
  /** `world.globals[HEAT_KEY]` at round end (0 when absent). */
  heat: number;
  /** `getWorldTickState(world).quietRounds` at round end. */
  quietRounds: number;
  /** `combat.entity.defeated` events this round for non-player entities. */
  kills: number;
  /** Snapshot: `activePressures.length` at round end (not an event count). */
  pressuresActive: number;
  /** Pressures spawned this round (`WorldTickResult.spawned`). */
  pressuresSpawned: number;
  /**
   * Pressures resolved this round -- includes a same-turn PLAYER-driven
   * resolution (applyProfileHints' `pressureResolution` branch, game.ts).
   * That branch runs as a documented POST-turn step, strictly after
   * runWorldRound() returns (game.ts:1192's own comment: "applyProfileHints
   * is a post-turn step, after runWorldRound's..."), so this entry is
   * captured once at the END of this round's full turn-processing (game.ts's
   * captureRoundMetrics() call site, after applyProfileHints/
   * processOpportunityAction have both run) rather than strictly "inside"
   * runWorldRound's own method body -- see that call site's own doc comment
   * for the full honesty-floor note on why.
   */
  pressuresResolved: number;
  /** Pressures expired this round (`WorldTickResult.expired`). */
  pressuresExpired: number;
  /** Faction agency actions new this round (reference-identity diff, runWorldRound). */
  factionActions: number;
  /** Opportunities newly offered this round (`WorldTickResult.opportunitiesSpawned`). */
  opportunitiesSpawned: number;
  /**
   * Opportunities accepted this round (`/jobs accept`, processOpportunityAction
   * -- a POST-turn step, same timing note as pressuresResolved above).
   */
  opportunitiesAccepted: number;
  /** Opportunities expired this round (`WorldTickResult.opportunitiesExpired`). */
  opportunitiesExpired: number;
  /** Ambush encounters spawned this round (`WorldTickResult.encounters`). */
  ambushes: number;
  /** Whether the player's district crossed a mood-tone transition this round. */
  moodTransition: boolean;
  /** Rumors newly created this round (RumorEngine entries with `originTick === tick`). */
  rumorsCreated: number;
  /** Mutation events across this round's per-hearer spread step. */
  rumorsMutated: number;
  /** Snapshot: distinct NPCs across every active player-subject rumor's `spreadPath` so far. */
  rumorHearers: number;
  /** First-hearing 'believe' stances set this round (per-hearer spread step). */
  stanceBelieve: number;
  /** First-hearing 'doubt' stances set this round (per-hearer spread step). */
  stanceDoubt: number;
  /** `buildMarketQuote()?.quotedPrice` when the player's district has a quote this round. */
  priceQuote?: number;
};

/**
 * Cap for GameSession.getRoundMetrics(), oldest-first eviction -- same
 * "recent history for a display/instrumentation surface" order of magnitude
 * as MAX_RESOLVED_FALLOUT_ENTRIES/MAX_ENDGAME_TRIGGERS/MAX_WORLD_MOVED_ENTRIES
 * (game.ts / game/world-moved.ts), scaled up because a tuning matrix's fixed
 * 30-round script across 13 worlds is comfortably inside this ceiling per
 * session while still bounding an unbounded campaign.
 */
export const MAX_ROUND_METRICS = 1000;
