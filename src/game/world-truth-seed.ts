// WO-A2T-1 (slice A2 §8): load-time seed of world truth from 1.x
// SavedSession fields.
//
// A 1.x save carries its pressures/opportunities/NPC state/economies/
// rumors in SavedSession fields and NOTHING in the engine's own
// world.modules namespaces (those namespaces did not exist until A2-core
// wired runWorldTick in). On load, if the namespaces have never been seeded
// from this save (world.globals['claude_rpg.stores_seeded'] absent), this
// writes each session field INTO its namespace exactly once, then stamps
// the marker so a second load never re-seeds. A save written AFTER adoption
// carries the marker inside its own serialized engineState, so a resumed
// post-adoption save ignores the SavedSession fields entirely (the world is
// truth from then on) — this function's own idempotency check is what makes
// that true regardless of caller discipline.
//
// Ownership: game-core owns this function (and the shared reputation-view
// helper it calls for baseline stamping); cli-display owns the CALL SITE in
// bin.ts's runLoad / resumeHarness, placed after initializeNamespaces and
// before the first turn (design lock 1) — this module is never invoked
// from anywhere else in game-core.
import type { Engine } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import {
  getWorldTickState,
  setPersistedOpportunities,
  setPersistedNpcState,
  getPersistedNpcRecapEntries,
  setPersistedFactionState,
  getPersistedFactionMemberCounts,
  getEconomyCoreState,
  setPlayerRumorState,
} from '@ai-rpg-engine/modules';
import type { SavedSession } from '../session/session.js';
import {
  loadPressuresFromSession,
  loadResolvedPressuresFromSession,
  loadOpportunitiesFromSession,
  loadNpcAgencyFromSession,
  loadObligationsFromSession,
  loadConsequenceChainsFromSession,
  loadEconomiesFromSession,
  loadRumorsFromSession,
} from '../session/session.js';
import { stampReputationBaselines } from './reputation-view.js';

/**
 * `world.globals` key marking that this seed already ran for this world.
 * Absent → seed once, then stamp. Present → never re-seed. Value shape:
 * `"<SavedSession.schemaVersion>@<engineVersion>"` (design lock 1).
 */
export const STORES_SEEDED_KEY = 'claude_rpg.stores_seeded';

export type WorldTruthSeedReport = {
  /** False when the marker was already present — no namespace was touched. */
  seeded: boolean;
  /** Which world-truth stores were written this call (empty when seeded is false). */
  stores: string[];
};

/**
 * Seed every world-truth namespace from `session`'s 1.x fields, exactly
 * once per world.
 *
 * `engineVersion` is supplied by the caller: `@ai-rpg-engine/core`'s
 * package.json is not import-able as a subpath under its own "exports" map
 * (verified against the installed 3.11 dist — the map names only the "."
 * entry point), so this module does not try to resolve it itself. Only the
 * marker's diagnostic value depends on the string the caller passes; the
 * idempotency decision reads presence/absence of the key alone, never its
 * contents.
 */
export function seedWorldTruthFromSession(
  engine: Engine,
  session: SavedSession,
  profile: CharacterProfile | null,
  engineVersion: string,
): WorldTruthSeedReport {
  const world = engine.world;
  if (world.globals[STORES_SEEDED_KEY] !== undefined) {
    return { seeded: false, stores: [] };
  }
  // Coordinator stitch (slice A3, wave 6 — the tests agent's data-loss
  // finding): a v3 save never carries the ten legacy fields, so seeding from
  // it would overwrite real world-truth namespaces with empty defaults. A v3
  // save's engineState IS the truth. Stamp the marker so the invariant
  // "every v3 world carries it" holds from here on, and seed nothing.
  // (Keyed on the PRESENCE of legacy fields, not on schemaVersion: after
  // migrateSave every loaded save reads as the current schema, so the only
  // honest signal that there is something to seed from is the fields.)
  const legacyFields: Array<keyof SavedSession> = [
    'playerRumors', 'activePressures', 'resolvedPressures', 'npcAgencySnapshot',
    'npcObligations', 'consequenceChains', 'districtEconomies', 'activeOpportunities',
  ];
  if (!legacyFields.some((f) => session[f] !== undefined)) {
    world.globals[STORES_SEEDED_KEY] = `${session.schemaVersion}@${engineVersion}`;
    return { seeded: false, stores: [] };
  }

  const stores: string[] = [];

  // Pressures + resolvedPressures (design doc §8/§3: the engine's own
  // resolvedPressures ledger becomes the history from adoption on —
  // seeding it from the app's pre-adoption fallout array preserves that
  // history instead of starting the ledger empty on adoption day, per lock
  // 5 — "never lose history at seed"). getWorldTickState returns the live,
  // non-cloned namespace object (confirmed against the installed 3.11
  // dist's world-tick.js), so these are direct field assignments.
  const tickState = getWorldTickState(world);
  tickState.pressures = loadPressuresFromSession(session);
  tickState.resolvedPressures = loadResolvedPressuresFromSession(session);
  stores.push('pressures');

  // Opportunities. (resolvedOpportunities is NOT a world-truth store this
  // slice — design doc §3's own table marks it an app-side accumulator,
  // loaded directly from the session by the caller exactly as before; this
  // seed function does not touch it.)
  setPersistedOpportunities(world, loadOpportunitiesFromSession(session));
  stores.push('opportunities');

  // NPC state: profiles + last actions + obligations + chains together
  // (setPersistedNpcState writes the whole namespace slice in one call).
  // recapEntries has no 1.x SavedSession field to seed from (a v3.x-era
  // construct with no legacy shape) — preserved from whatever the fresh
  // namespace already holds (empty for a namespace that has never run)
  // rather than discarded.
  const { profiles: npcProfiles, actions: npcActions } = loadNpcAgencyFromSession(session);
  const npcObligations = loadObligationsFromSession(session);
  const npcChains = [...loadConsequenceChainsFromSession(session).values()];
  setPersistedNpcState(world, npcProfiles, npcActions, npcObligations, npcChains, getPersistedNpcRecapEntries(world));
  stores.push('npc');

  // Faction state: claude-rpg's SavedSession has never carried a
  // faction-agency snapshot field — GameSession.lastFactionActions /
  // lastFactionProfiles have always initialized to `[]` with no load path
  // (verified against session.ts's full SavedSession shape and its
  // complete set of load* helpers: none mention factions) — so there is
  // nothing to seed FROM. Called anyway with empty arrays (idempotent
  // no-op parity with every other store, and it still stamps this store as
  // "seeded" so a 1.x save's total absence of faction history is honestly
  // represented as "no history," not silently skipped) with the
  // namespace's own existing member-count overlay preserved.
  setPersistedFactionState(world, [], [], getPersistedFactionMemberCounts(world));
  stores.push('faction');

  // District economies — getEconomyCoreState(world).districts is the live
  // namespace object (non-cloned; confirmed against the installed 3.11
  // dist's economy-core.js), so this assigns each loaded entry directly
  // into it rather than replacing the object.
  const districts = getEconomyCoreState(world).districts;
  for (const [districtId, economy] of loadEconomiesFromSession(session)) {
    districts[districtId] = economy;
  }
  stores.push('economies');

  // Player rumors.
  setPlayerRumorState(world, { rumors: loadRumorsFromSession(session) });
  stores.push('rumors');

  // Reputation baseline (WO-A2T-2, design doc §9): stamped from the
  // profile's own pre-adoption value, once, at seed time — the only
  // profile-reading step in this function. A session with no profile (an
  // observer/director-only load) simply skips baseline stamping; there is
  // no profile view to compose for it anyway.
  if (profile) {
    stampReputationBaselines(profile, world);
    stores.push('reputation-baseline');
  }

  world.globals[STORES_SEEDED_KEY] = `${session.schemaVersion}@${engineVersion}`;
  return { seeded: true, stores };
}
