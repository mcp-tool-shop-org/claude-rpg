// NPC agency bridge — connects engine NPC agency to GameSession
// v1.2: NPC Agency phase 1

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
 * Apply effects from an NPC action to session state.
 * Mirrors applyFactionEffects() pattern in game.ts.
 * Returns the updated profile (reputation changes produce a new profile instance).
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
        addMemory(cognition, effect.memType, tick, effect.data);
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
        ctx.playerRumors.push(
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
        ctx.playerRumors.push(
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
