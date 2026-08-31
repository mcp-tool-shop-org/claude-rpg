// NPC agency bridge — connects engine NPC agency to GameSession
// v1.2: NPC Agency phase 1

import { isDebugEnabled } from '../game/debug-logger.js';
import type { Engine } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import { getReputation, adjustReputation } from '@ai-rpg-engine/character-profile';
import {
  runNpcAgencyTick,
  buildAllNpcProfiles,
  getCognition,
  setBelief,
  addMemory,
  getFactionCognition,
  modifyDistrictMetric,
  spawnPlayerRumor,
  spawnNpcOriginatedRumor,
  makePressure,
  makeOpportunity,
  createObligation,
  addObligation,
  type NpcActionResult,
  type NpcEffect,
  type NpcProfile,
  type NpcObligationLedger,
  type PlayerRumor,
  type WorldPressure,
  type OpportunityState,
} from '@ai-rpg-engine/modules';

// --- Types ---

export type NpcAgencyState = {
  lastActions: NpcActionResult[];
  lastProfiles: NpcProfile[];
};

export type NpcEffectApplicationContext = {
  profile: CharacterProfile;
  playerRumors: PlayerRumor[];
  activePressures: WorldPressure[];
  engine: Engine;
  getPlayerDistrictId: () => string | undefined;
  npcObligations?: Map<string, NpcObligationLedger>;
  activeOpportunities?: OpportunityState[];
  genre?: string;
};

// --- Tick ---

/**
 * Run one NPC agency tick and return results.
 * Does NOT apply effects — caller must apply via applyNpcEffects().
 */
export function tickNpcAgency(
  engine: Engine,
  activePressures: WorldPressure[],
  playerRumors?: PlayerRumor[],
  npcObligations?: Map<string, NpcObligationLedger>,
): NpcActionResult[] {
  return runNpcAgencyTick(
    engine.world,
    engine.world.playerId,
    activePressures,
    engine.tick,
    playerRumors,
    npcObligations,
  );
}

/**
 * Build profiles for all named NPCs (for director views).
 */
export function buildNpcProfilesForDirector(
  engine: Engine,
  activePressures: WorldPressure[],
  playerRumors?: PlayerRumor[],
  npcObligations?: Map<string, NpcObligationLedger>,
): NpcProfile[] {
  return buildAllNpcProfiles(
    engine.world,
    engine.world.playerId,
    activePressures,
    playerRumors,
    npcObligations,
  );
}

// --- Effect Application ---

/**
 * F-74ff036d: ctx.playerRumors is session-level state, persisted as
 * SavedSession.playerRumors and JSON.stringify'd on every save — unlike
 * MAX_ACTIVE/MAX_OPPS below (small bounded *active* working sets: pressures
 * and opportunities currently in play), this is cumulative rumor history
 * across a "potentially several-hundred-turn campaign" (finale-narrator.ts's
 * own framing), read in full on every deriveWhatPeopleAreSaying /
 * computeRumorDelta / getRumorsFrom call. Sized between this codebase's
 * smaller bounded caps (dialogue/npc-context.ts's own read-side fix,
 * F-b52349e0: BELIEFS_MAX=8, RUMORS_MAX=5 — but those are a per-NPC,
 * per-dialogue-turn slice, not the full session history this caps) and the
 * engine's own larger historical-log caps (perception-filter.ts
 * DEFAULT_MAX_PERCEPTION_LOG=200, narrative-authority.ts objectiveLog=500)
 * — large enough to keep a rich rumor history across a long campaign, small
 * enough to bound save-file size and those full-array scans.
 */
const MAX_PLAYER_RUMORS = 100;

/**
 * F-74ff036d: tracks which ctx.playerRumors array instances have already
 * logged the capacity-drop diagnostic, so a long campaign that keeps
 * evicting doesn't spam a warning on every single drop once steady-state is
 * reached — "first drop only" per session (a WeakSet keyed on the array
 * itself rather than a module-level boolean so independent sessions/tests,
 * each with their own fresh playerRumors array, get independent tracking).
 */
const warnedForRumorArray = new WeakSet<PlayerRumor[]>();

/**
 * Push a newly-spawned rumor onto ctx.playerRumors, evicting the oldest
 * entry first once at MAX_PLAYER_RUMORS capacity (ring-buffer / shift-on-
 * overflow, matching the engine's own perception-filter.ts logPerception()).
 *
 * Drop-oldest rather than this file's sibling 'pressure'/'spawn-opportunity'
 * cases' skip-the-new-one strategy: those cap small *active* working sets
 * where an already-in-flight item deserves to resolve before a new one
 * starts, but playerRumors is a rolling history where a late-campaign rumor
 * is more likely to still be currently relevant than one from turn 3 —
 * mirroring dialogue/npc-context.ts's own read-side fix (F-b52349e0), which
 * sorts most-recent-first before its own cap for the same reason.
 */
function pushPlayerRumor(ctx: NpcEffectApplicationContext, rumor: PlayerRumor): void {
  const rumors = ctx.playerRumors;
  rumors.push(rumor);
  if (rumors.length > MAX_PLAYER_RUMORS) {
    rumors.shift();
    if (isDebugEnabled() && !warnedForRumorArray.has(rumors)) {
      warnedForRumorArray.add(rumors);
      console.warn(
        `[npc-agency] playerRumors exceeded MAX_PLAYER_RUMORS (${MAX_PLAYER_RUMORS}); evicting oldest entries to bound save-file size (further drops this session are silent).`,
      );
    }
  }
}

/**
 * Apply effects from an NPC action to session state.
 * Mirrors applyFactionEffects() pattern in game.ts.
 * Returns the updated profile (reputation changes produce a new profile instance).
 *
 * NOTE: The NpcEffect union type relies on discriminated union narrowing via the
 * 'type' field in the switch statement below. Each case branch accesses properties
 * specific to that variant (e.g., effect.subject for 'belief', effect.delta for
 * 'morale'). TypeScript narrows the type within each case block automatically.
 */
export function applyNpcEffects(
  result: NpcActionResult,
  ctx: NpcEffectApplicationContext,
): CharacterProfile {
  let { profile } = ctx;
  const { engine } = ctx;
  const tick = engine.tick;

  for (const effect of result.effects) {
    switch (effect.type) {
      case 'belief': {
        const cognition = getCognition(engine.world, effect.entityId);
        if (!cognition) break;
        setBelief(cognition, effect.subject, effect.key, effect.value, effect.confidence, 'npc-agency', tick);
        break;
      }

      case 'memory': {
        const cognition = getCognition(engine.world, effect.entityId);
        if (!cognition) break;
        // Engine 2.9.x: addMemory takes the world first (zone-aware memories).
        addMemory(engine.world, cognition, effect.memType, tick, effect.data, effect.entityId);
        break;
      }

      case 'morale': {
        const cognition = getCognition(engine.world, effect.entityId);
        if (!cognition) break;
        cognition.morale = Math.max(0, Math.min(100, cognition.morale + effect.delta));
        break;
      }

      case 'suspicion': {
        const cognition = getCognition(engine.world, effect.entityId);
        if (!cognition) break;
        cognition.suspicion = Math.max(0, Math.min(100, cognition.suspicion + effect.delta));
        break;
      }

      case 'reputation':
        profile = adjustReputation(profile, effect.factionId, effect.delta);
        break;

      case 'rumor':
        pushPlayerRumor(
          ctx,
          spawnPlayerRumor(
            { label: effect.claim, description: effect.claim, tags: [effect.valence] },
            profile,
            effect.targetFactionIds[0],
            ctx.getPlayerDistrictId(),
            tick,
          ),
        );
        break;

      case 'npc-rumor':
        pushPlayerRumor(
          ctx,
          spawnNpcOriginatedRumor(
            effect.claim,
            effect.valence,
            effect.sourceEvent as 'npc-accusation' | 'npc-betrayal' | 'npc-warning' | 'npc-concealment' | 'npc-gossip',
            effect.originNpcId,
            effect.targetFactionIds[0],
            ctx.getPlayerDistrictId(),
            tick,
          ),
        );
        break;

      case 'zone-change': {
        const entity = engine.world.entities[effect.entityId];
        if (entity) {
          entity.zoneId = effect.toZoneId;
        }
        break;
      }

      case 'alert': {
        const fcog = getFactionCognition(engine.world, effect.factionId);
        // PBR-005: Null guard — faction cognition may not exist
        if (!fcog) {
          console.warn(`[npc-agency] Cannot apply alert effect: no faction cognition for "${effect.factionId}"`);
          break;
        }
        fcog.alertLevel = Math.max(0, Math.min(100, fcog.alertLevel + effect.delta));
        break;
      }

      case 'obligation': {
        if (ctx.npcObligations) {
          const ledger = ctx.npcObligations.get(effect.npcId) ?? { obligations: [] };
          const obl = createObligation(
            effect.kind, effect.direction, effect.npcId, effect.counterpartyId,
            effect.magnitude, effect.sourceTag, tick, effect.decayTurns,
          );
          ctx.npcObligations.set(effect.npcId, addObligation(ledger, obl));
        }
        break;
      }

      case 'pressure': {
        const MAX_ACTIVE = 3;
        if (ctx.activePressures.length < MAX_ACTIVE) {
          ctx.activePressures.push(makePressure({
            kind: effect.kind,
            sourceFactionId: effect.sourceFactionId,
            description: effect.description,
            triggeredBy: `npc-agency:${result.action.verb}`,
            urgency: effect.urgency,
            visibility: 'hidden',
            turnsRemaining: 8,
            potentialOutcomes: [],
            tags: ['npc-agency'],
            currentTick: tick,
            sourceNpcId: effect.sourceNpcId,
          }));
        }
        break;
      }

      case 'companion-departure':
        // Handled by GameSession.handleCompanionDeparture() — flagged here for caller
        break;

      case 'spawn-opportunity': {
        const MAX_OPPS = 5;
        const opps = ctx.activeOpportunities;
        if (opps && opps.length < MAX_OPPS) {
          const npcEntity = engine.world.entities[result.action.npcId];
          const factionId = npcEntity?.tags.find((t) => t.startsWith('faction:'))?.replace('faction:', '');
          opps.push(makeOpportunity({
            kind: effect.kind,
            sourceNpcId: effect.targetNpcId ?? result.action.npcId,
            sourceFactionId: factionId,
            title: effect.description,
            description: effect.description,
            objectiveDescription: `Complete the ${effect.kind} from ${npcEntity?.name ?? 'an NPC'}`,
            linkedNpcIds: [effect.targetNpcId ?? result.action.npcId],
            urgency: 0.4,
            turnsRemaining: 12,
            visibility: 'offered',
            rewards: [{ type: 'reputation', factionId: factionId ?? '', delta: 10 }],
            risks: [{ type: 'reputation', factionId: factionId ?? '', delta: -5 }],
            genre: ctx.genre ?? 'fantasy',
            currentTick: tick,
            tags: ['npc-spawned'],
          }));
        }
        break;
      }
    }
  }

  return profile;
}
