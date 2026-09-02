// WO-A6-1 (slice A6 §3, design lock 1, ADDENDUM-COMMON): the tuning surface
// -- ONE object every app lever named in docs/living-world-slice-a6-phase9.md
// §3 ("App levers") reads from, so the post-proof-balance-tuning waves (T1…Tn)
// move ONE named field per wave instead of hunting hard-coded literals across
// game.ts. This wave changes NO value -- every default below is TODAY's
// effective, measured constant (cited per field), and `resolveTuning()` with
// no override is contracted to equal `DEFAULT_LIVING_WORLD_TUNING` exactly
// (game.test.ts's defaults proof) so every existing behavior stays
// byte-identical until a tuning wave actually overrides a field.

import { MAX_WORLD_MOVED_ENTRIES } from './world-moved.js';

/**
 * One tunable app lever per field (design doc §3's "App levers" list).
 * Engine constants (HEAT_WAKE_THRESHOLD, per-kill heat, etc.) are OUT of this
 * surface by design (§3: "Engine constants (asks, with measured evidence)")
 * -- those are filed upstream, never app-tunable.
 */
export type LivingWorldTuning = {
  /**
   * RumorEngine's own `stanceFadeTicks` config (ticks of inactivity before a
   * per-hearer stance decays back to 'unknown', RumorEngineConfig.stanceFadeTicks
   * — @ai-rpg-engine/rumor-system). Measured default: 24 -- game.ts's
   * constructor hard-coded `{ stanceFadeTicks: 24 }` before this wave (the
   * literal this field now replaces).
   */
  rumorStanceFadeTicks: number;
  /**
   * The first-hearing stance rule's suspicion threshold (design lock 6,
   * runWorldRound's per-hearer spread step): a hearer whose cognition-core
   * suspicion is BELOW this value believes the rumor by default (absent
   * shared faction uptake). Measured pre-tuning value: 50 -- the SAME
   * threshold cognition-core.js's own intent evaluation uses for
   * "increasingly suspicious" behavior. A6 wave T1 set the default to 0
   * (dogfood/tuning/WAVE_1_OUTCOMES.md): suspicion alone never earns belief.
   */
  rumorBelieveSuspicionBelow: number;
  /**
   * Per-round rumor spread scope (runWorldRound's named-NPC predicate):
   * 'district' spreads to every named NPC in the player's current district;
   * 'adjacent-districts' (A6 wave T2, dogfood/tuning/WAVE_2_OUTCOMES.md) adds
   * every district that shares a zone edge with it;
   * 'zone' restricts to the player's own zone. Measured default: 'district'
   * -- today's only behavior, pre-wave (the filter's `getDistrictForZone(...)
   * === playerDistrictId` clause).
   */
  rumorSpreadScope: 'district' | 'zone' | 'adjacent-districts';
  /**
   * Cap for `worldMovedLedger` (game/world-moved.ts's MAX_WORLD_MOVED_ENTRIES),
   * oldest-first eviction. Measured default: `MAX_WORLD_MOVED_ENTRIES` (200)
   * -- the existing constant, imported (not re-guessed) so this field's
   * default can never drift from it; the eviction call site (game.ts's
   * pushWorldMoved) now reads the resolved tuning instead of the constant
   * directly.
   */
  worldMovedCap: number;
  /**
   * Narration prompt budget: max world-pressure lines threaded to
   * narrateScene's `budget` option (design lock 1, additive — narrative-llm's
   * own WO-A6-4 makes narrate-scene.ts actually honor it; "green expected at
   * merge" until then, same pattern as WO-A5-2's moodTransition threading).
   * Measured default: 10 -- src/prompts/narrate-scene.ts's own
   * `PRESSURES_MAX_COUNT` constant (that file is out of this domain's owned
   * globs; the NUMBER is copied here deliberately rather than imported, to
   * avoid a game-core -> prompts compile-time dependency for a single
   * literal -- narrate-scene.test.ts already pins that constant's own value
   * on its own side).
   */
  narrationPressureLines: number;
  /**
   * Narration prompt budget: max opportunity lines. Measured default:
   * `Infinity` (no cap) -- verified against the installed 3.11 dist and this
   * app's own src/prompts/narrate-scene.ts / src/narrator/scene-context.ts:
   * `SceneNarrationInput.opportunityContext` is a SINGLE pre-formatted
   * compact string from the engine (`getOpportunityContext`, "~20 tokens"
   * per that method's own doc comment, game.ts), not a capped line list —
   * there is no existing "opportunity lines" cap to measure, so this field
   * defaults to no-op (byte-identical) until narrative-llm's WO-A6-4 gives
   * narration an actual multi-line opportunity section to cap.
   */
  narrationOpportunityLines: number;
  /**
   * Narration prompt budget: max rumor lines. Measured default: `Infinity`
   * (no cap) -- verified against src/prompts/narrate-scene.ts /
   * src/narrator/scene-context.ts: `SceneNarrationInput` carries NO rumor
   * field at all today (rumors reach only the DIALOGUE prompt,
   * src/prompts/dialogue-npc.ts's `hearerRumors`/`formatHearerRumors`, itself
   * uncapped) -- scene narration has zero rumor lines to cap yet, so this
   * field also defaults to no-op (byte-identical) until narrative-llm's own
   * WO-A6-4 adds a rumor section to scene narration.
   */
  narrationRumorLines: number;
  /**
   * Ambush headline policy (game.ts's `buildAmbushHeadline` call site,
   * game/ambush-headline.ts): 'always' renders the round's encounter.spawned
   * headline on the play screen (today's only behavior); 'never' suppresses
   * it. Measured default: 'always'.
   */
  ambushHeadline: 'always' | 'never';
  /**
   * WO-B1-2 (slice B1 §2, design lock 3): the hostile turn's aggression
   * policy. `'telegraphed'` (default) is the doc's designed behavior — an
   * aware hostile's first attack decision sets a telegraph and emits the
   * telegraph line instead of landing that same round; the attack lands the
   * round after. `'immediate'` skips the telegraph step (attacks land the
   * round they're chosen). `'off'` disables runHostileTurn entirely — no
   * awareness is set, no hostile ever acts here — so a session with
   * `enemyAggression: 'off'` reproduces every pre-slice-B1 log byte-for-byte
   * (the living-world-driver proof's own fixtures at these defaults).
   */
  enemyAggression: 'off' | 'telegraphed' | 'immediate';
  /**
   * WO-B1-2 (design lock 3): multiplier applied to a landed hostile attack's
   * damage, post-event (the installed 3.11 engine's combat formula has no
   * damage-scale hook the app can thread through submitActionAs — see
   * hostile-turn.ts's own doc comment for the verified call site) — applied
   * as a documented post-event HP adjustment on the player entity. Default 1
   * (no scaling) keeps every existing fixture byte-identical.
   */
  enemyDamageScale: number;
  /**
   * WO-B1-4 (slice B1 §4, design lock 7): fraction of newly-offered asks
   * whose truth resolves to `'predatory'` (deterministic per-ask hash roll,
   * game/asks.ts's `chooseAskTruth`). Design doc §4: "Roughly one predatory
   * ask in three at the start." Default 0.33.
   */
  askPredatorRatio: number;
  /**
   * WO-B1-4 (design lock 7): rounds after offer before a predatory ask's
   * reveal fires (`offeredTick + askRevealRounds`). Design doc §4: "three to
   * ten rounds later"; default 6 (the design doc's own §6 proof 4 measured
   * midpoint).
   */
  askRevealRounds: number;
  /**
   * WO-B1-5 (slice B1 §5, design lock 8): the per-faction reputation
   * (`reputation_<f>` global) threshold at which the street's honorific
   * unlocks (game/recognition.ts's `getHonorific`). Default 25.
   */
  honorificAt: number;
};

/**
 * Every default below is the value the code uses TODAY (measured, not
 * guessed) -- resolveTuning() with no override equals this object exactly,
 * so a `GameConfig` that omits `tuning` entirely (every session before this
 * wave, and the living-world-driver proof) gets byte-identical behavior.
 */
export const DEFAULT_LIVING_WORLD_TUNING: LivingWorldTuning = {
  rumorStanceFadeTicks: 24,
  // A6 wave T1 (dogfood/tuning/WAVE_1_OUTCOMES.md): 50 -> 0. Suspicion alone
  // never earns belief; a hearer believes a rumor about the player only when
  // their faction has already taken it up, and doubts it otherwise.
  rumorBelieveSuspicionBelow: 0,
  // A6 wave T2 (dogfood/tuning/WAVE_2_OUTCOMES.md): 'district' -> 'adjacent-districts'.
  // The street talks across a doorway: named NPCs in the player's district
  // and every district sharing a zone edge with it hear a rumor about the
  // player once per round.
  rumorSpreadScope: 'adjacent-districts',
  worldMovedCap: MAX_WORLD_MOVED_ENTRIES,
  narrationPressureLines: 10,
  narrationOpportunityLines: Infinity,
  narrationRumorLines: Infinity,
  ambushHeadline: 'always',
  enemyAggression: 'telegraphed',
  // A6 lever T3 (2026-09-02, dogfood/tuning/WAVE_3_OUTCOMES.md): at 1 the
  // scripted walker is downed on 12 of 13 matrix worlds by median round 12
  // (3 hits) and every family-playtest seat died by turn 33; at 0.5 no world
  // downs it in 30 rounds and kills rise 14 -> 23. 0.25 adds nothing.
  enemyDamageScale: 0.5,
  askPredatorRatio: 0.33,
  askRevealRounds: 6,
  honorificAt: 25,
};

/** Resolve a partial tuning override onto the measured defaults. */
export function resolveTuning(partial?: Partial<LivingWorldTuning>): LivingWorldTuning {
  return { ...DEFAULT_LIVING_WORLD_TUNING, ...partial };
}
