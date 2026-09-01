// NPC agency bridge — connects engine NPC agency to GameSession
// v1.2: NPC Agency phase 1
//
// v2.0 (slice A2-core, WO-A2-7): tickNpcAgency() and applyNpcEffects() —
// and their private helpers (pushPlayerRumor, warnedForRumorArray,
// MAX_PLAYER_RUMORS) and types (NpcAgencyState, NpcEffectApplicationContext)
// — DELETED. The engine step that replaces them: runWorldTick's step 5a
// (packages/modules/src/world-tick.ts, runNpcAgencyStep). That step ticks
// obligation decay, runs runNpcAgencyTick itself, and applies every returned
// NpcEffect through its own application style — reputation/alert →
// world.globals (addGlobal), chains → makePressure (respecting the
// one-active-per-kind invariant), opportunities → setPersistedOpportunities,
// belief/memory → setBelief/addMemory, zone-change → direct zoneId
// mutation, morale-on-a-companion/companion-departure → companion-core,
// npc-rumor → spawnNpcOriginatedRumor — then persists profiles, last
// actions, and obligation ledgers to world.modules['npc-agency'] every round
// at least one named NPC exists (world-tick.ts's own SEED-0 gate). Running
// tickNpcAgency/applyNpcEffects again from GameSession (game.ts's own
// tickNpcAgencyTurn, deleted this wave by game-core per design doc §5) would
// simulate the same round's NPC agency TWICE on two disagreeing ledgers —
// the exact defect slice A2-core (docs/living-world-slice-a2.md) exists to
// close by replacing every hand-ticker with the one driver.
//
// buildNpcProfilesForDirector survives as a VIEW ADAPTER (design doc §3):
// it used to call buildAllNpcProfiles itself, recomputing profiles fresh
// from activePressures/playerRumors/npcObligations parameters every round —
// a second, independent computation of the same round the tick (once
// adopted) already ran. It now simply reads the tick's own persisted result,
// the same way every other session-field view in this slice reads its
// engine accessor (getActivePressures, getPersistedOpportunities, etc).

import type { Engine } from '@ai-rpg-engine/core';
import {
  getPersistedNpcProfiles,
  type NpcProfile,
} from '@ai-rpg-engine/modules';

/**
 * Director-view profiles for all named NPCs — a read-only view over
 * world.modules['npc-agency'], written every round by runWorldTick's step
 * 5a (runNpcAgencyStep). [] when no named NPC has ever existed (the tick's
 * own SEED-0 identity) or before the first tick has run.
 */
export function buildNpcProfilesForDirector(engine: Engine): NpcProfile[] {
  return getPersistedNpcProfiles(engine.world);
}
