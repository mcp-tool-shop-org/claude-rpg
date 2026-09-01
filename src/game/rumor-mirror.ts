// WO-A3-2/WO-A3-3 (slice A3 §3): the write-side bridge from the app's
// existing 4-valence PlayerRumor ledger into the admitted
// @ai-rpg-engine/rumor-system RumorEngine. Write side ONLY this slice —
// dialogue and the /rumors surface keep reading the 4-valence view
// unchanged; A5 flips readers to stanceOf/heardBy/formatRumorForPlayer.
//
// Ownership: game-core (GameSession's own `rumorEngine` instance, game.ts,
// calls mirrorPlayerRumor at its one addRumor write-through helper plus a
// post-round sweep in runWorldRound).
import type { RumorEngine } from '@ai-rpg-engine/rumor-system';
import type { PlayerRumor, RumorValence } from '@ai-rpg-engine/modules';

/**
 * WO-A3-3: emotional charge per RumorValence member, on the RumorEngine's
 * -1..1 `emotionalCharge` scale.
 *
 * Honesty-floor note: the design doc's own table names a `notorious` member
 * with charge -0.3. That member does not exist in the installed 3.11
 * dist — `@ai-rpg-engine/modules`'s `PlayerRumor['valence']` union (see
 * node_modules/@ai-rpg-engine/modules/dist/player-rumor.d.ts) is actually
 * `'heroic' | 'fearsome' | 'tragic' | 'mysterious'`. This repo's own
 * game/game-state.ts `addRumor` (companion rumor-suppression) already
 * branches on the real members (`rumor.valence === 'fearsome' ||
 * rumor.valence === 'tragic'`), confirming `tragic` — not `notorious` — is
 * the real fourth member. `tragic` takes the doc's `notorious` charge slot:
 * reputationally unflattering but not the outright hostile `fearsome`.
 * This table is exhaustive over `RumorValence` (a missing member is a
 * TypeScript error, not a silent runtime gap) — rumor-mirror.test.ts pins
 * every member against the same union so a future engine valence addition
 * goes red here instead of silently mapping to `undefined` charge.
 */
const VALENCE_CHARGE: Record<RumorValence, number> = {
  heroic: 0.6,
  fearsome: -0.6,
  tragic: -0.3,
  mysterious: 0,
};

/** Emotional charge for one RumorValence, on the RumorEngine's -1..1 scale. */
export function chargeOf(valence: RumorValence): number {
  return VALENCE_CHARGE[valence];
}

/**
 * Mirror one player-rumor ledger entry into the RumorEngine.
 *
 * Idempotent by `(subject: 'player', key: rumor.id)` — `findBySubjectKey`
 * is checked first, so a second call for the same ledger entry (the
 * post-round sweep re-scanning rumors already mirrored at `addRumor` time)
 * is a no-op, never a sibling duplicate (design doc §4, "Mirror
 * completeness": no duplicates after a second round).
 *
 * `create`'s own `id` is engine-generated and deliberately NOT `rumor.id` —
 * `key` is the field `findBySubjectKey`/idempotency reads; `recordFactionUptake`
 * below uses the CREATED rumor's own engine id, per its signature.
 */
export function mirrorPlayerRumor(engine: RumorEngine, rumor: PlayerRumor): void {
  if (engine.findBySubjectKey('player', rumor.id)) return;
  const created = engine.create({
    claim: rumor.claim,
    subject: 'player',
    key: rumor.id,
    value: true,
    sourceId: rumor.originFactionId ?? 'world',
    originTick: rumor.originTick,
    confidence: rumor.confidence,
    emotionalCharge: chargeOf(rumor.valence),
  });
  if (rumor.originFactionId) {
    engine.recordFactionUptake(created.id, rumor.originFactionId);
  }
}
