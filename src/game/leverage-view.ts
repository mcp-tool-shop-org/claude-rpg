// WO-A2T-3 (slice A2 §10, R6 — "leverage income on, verbs off"): the
// one-ledger helpers for the player entity's leverage currencies.
//
// Pre-adoption: the app wrote `leverage.<currency>` keys straight onto
// `profile.custom`. The engine's own leverage-income step
// (world-tick.ts's runLeverageIncomeStep, step 5a2 — straight-adopted,
// unconditional, since the A2-core wave-4 stitch) writes the SAME key
// family onto the PLAYER ENTITY's own custom map
// (`world.entities[world.playerId].custom`).
//
// SCOPE (narrower than the design doc's own framing might suggest, fixed
// against a real regression this session): only game.ts's
// tickPlayerLeverage calls writeLeverageDeltas below. The wave addendum's
// own WO-A2T-3 text names only tickPlayerLeverage for conversion — an
// earlier attempt this session to also route applyOpportunityFalloutEffects'
// / applyLeverageEffects' / applyCraftEffects' leverage/heat cases through
// this same entity ledger broke a currently-passing test
// (game.test.ts's F-5b48354f bribe-resolution case): those three sites'
// READS (the cost/cooldown checks gating a leverage verb) still read
// `profile.custom` directly and are NOT converted, so writing their
// deltas to the entity ledger instead created two genuinely disagreeing
// stores — a full-ledger view refresh from either side would silently
// revert the other's currency change. Those three sites are reverted to
// their pre-wave `profile.custom` writes (game.ts's own doc comments at
// each site explain this). Fully closing the gap requires converting
// every leverage read+write site in game.ts to the entity ledger — a
// materially larger change than this WO authorizes; see game.ts's
// tickPlayerLeverage doc comment for the narrower residual risk this
// scoping leaves (a same-turn collision between a verb's direct write and
// a non-empty tickPlayerLeverage gain).
import type { WorldState } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import { getLeverageState, applyLeverageDeltas, type LeverageCurrency } from '@ai-rpg-engine/modules';

/** The live player entity's custom map, or undefined pre-chargen / no player entity yet. */
function getPlayerCustom(world: WorldState): Record<string, string | number | boolean> | undefined {
  return world.entities[world.playerId]?.custom;
}

/**
 * Recompute the profile's `leverage.<currency>` keys (all six —
 * getLeverageState always returns every currency, defaulting absent ones to
 * 0) from the player entity's own custom map — the view half of the
 * one-ledger design. Every other custom key on the profile (the
 * `stats.leverage.*.gained/spent` bookkeeping, `access.<factionId>`,
 * cooldowns, title, etc.) is untouched. A no-op (returns `profile`
 * unchanged) when there is no player entity yet.
 */
export function refreshLeverageView(profile: CharacterProfile, world: WorldState): CharacterProfile {
  const entityCustom = getPlayerCustom(world);
  if (!entityCustom) return profile;
  const state = getLeverageState(entityCustom);
  const custom = { ...profile.custom };
  for (const [currency, value] of Object.entries(state)) {
    custom[`leverage.${currency}`] = value;
  }
  return { ...profile, custom };
}

/**
 * ADD `deltas` to the player entity's own leverage ledger via
 * applyLeverageDeltas (the same helper world-tick.ts's runLeverageIncomeStep
 * itself calls, so both paths clamp/key identically), then return the
 * profile with its `leverage.*` view refreshed. Every leverage/heat effect
 * writer in game.ts calls this instead of mutating profile.custom directly.
 * A no-op (returns `profile` unchanged) when there is no player entity yet.
 */
export function writeLeverageDeltas(
  profile: CharacterProfile,
  world: WorldState,
  deltas: Partial<Record<LeverageCurrency, number>>,
): CharacterProfile {
  const player = world.entities[world.playerId];
  if (!player) return profile;
  player.custom = applyLeverageDeltas(player.custom, deltas);
  return refreshLeverageView(profile, world);
}
