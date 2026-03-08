// Companion bridge — connects engine companion system to GameSession
// Handles recruitment validation, dismissal, zone following, and profile building.

import type { Engine } from '@ai-rpg-engine/core';
import {
  createPartyState,
  addCompanion,
  removeCompanion,
  getActiveCompanions,
  isCompanionRecruitable,
  buildNpcProfile,
  type CompanionRole,
  type CompanionState,
  type PartyState,
  type NpcProfile,
  type PlayerRumor,
  type WorldPressure,
  type NpcObligationLedger,
} from '@ai-rpg-engine/modules';

// --- Types ---

export type RecruitResult =
  | { ok: true; party: PartyState; companion: CompanionState }
  | { ok: false; error: string };

export type DismissResult = {
  party: PartyState;
  removed: CompanionState | undefined;
};

// --- Recruitment ---

/**
 * Recruit an NPC into the player's party.
 * Validates: entity exists, alive, recruitable, same zone, party not full.
 */
export function recruitCompanion(
  engine: Engine,
  party: PartyState,
  npcId: string,
  role: CompanionRole,
  tick: number,
  abilityTags?: string[],
  personalGoal?: string,
): RecruitResult {
  const entity = engine.world.entities[npcId];
  if (!entity) return { ok: false, error: `Entity "${npcId}" not found.` };

  const hp = entity.resources.hp ?? entity.resources.health;
  if (hp !== undefined && hp <= 0) return { ok: false, error: `${entity.name} is not alive.` };

  if (!isCompanionRecruitable(entity)) {
    return { ok: false, error: `${entity.name} cannot be recruited.` };
  }

  const player = engine.world.entities[engine.world.playerId];
  if (player?.zoneId !== entity.zoneId) {
    return { ok: false, error: `${entity.name} is not in the same zone.` };
  }

  if (party.companions.length >= party.maxSize) {
    return { ok: false, error: `Party is full (${party.maxSize}/${party.maxSize}).` };
  }

  if (party.companions.some((c) => c.npcId === npcId)) {
    return { ok: false, error: `${entity.name} is already in your party.` };
  }

  // Infer ability tags from entity custom data if not provided
  const tags = abilityTags ??
    (entity.custom?.companionAbilities
      ? String(entity.custom.companionAbilities).split(',').map((s) => s.trim())
      : []);

  const goal = personalGoal ?? (entity.custom?.personalGoal as string | undefined);

  const companion: CompanionState = {
    npcId,
    role,
    joinedAtTick: tick,
    personalGoal: goal,
    abilityTags: tags,
    morale: 60, // Start at moderate morale
    active: true,
  };

  // Tag entity as companion
  if (!entity.tags.includes('companion')) {
    entity.tags.push('companion');
  }

  // Set companion morale in entity custom for engine-side goal derivation
  entity.custom = entity.custom ?? {};
  entity.custom.companionMorale = companion.morale;
  entity.custom.companionRole = role;

  const newParty = addCompanion(party, companion);

  return { ok: true, party: newParty, companion };
}

// --- Dismissal ---

/**
 * Dismiss a companion from the party.
 * Entity stays in current zone, loses 'companion' tag.
 */
export function dismissCompanion(
  engine: Engine,
  party: PartyState,
  npcId: string,
): DismissResult {
  const result = removeCompanion(party, npcId);

  if (result.removed) {
    const entity = engine.world.entities[npcId];
    if (entity) {
      entity.tags = entity.tags.filter((t) => t !== 'companion');
      if (entity.custom) {
        delete entity.custom.companionMorale;
        delete entity.custom.companionRole;
      }
    }
  }

  return result;
}

// --- Zone Following ---

/**
 * Move all active companions to the player's current zone.
 * Called after player zone changes.
 */
export function followPlayer(engine: Engine, party: PartyState): void {
  const player = engine.world.entities[engine.world.playerId];
  if (!player?.zoneId) return;

  const active = getActiveCompanions(party);
  for (const comp of active) {
    const entity = engine.world.entities[comp.npcId];
    if (entity && entity.zoneId !== player.zoneId) {
      entity.zoneId = player.zoneId;
    }
  }
}

// --- Morale Sync ---

/**
 * Sync companion morale from PartyState to entity custom fields.
 * Called after morale adjustments so engine-side goal derivation sees current values.
 */
export function syncCompanionMorale(engine: Engine, party: PartyState): void {
  for (const comp of party.companions) {
    const entity = engine.world.entities[comp.npcId];
    if (entity) {
      entity.custom = entity.custom ?? {};
      entity.custom.companionMorale = comp.morale;
    }
  }
}

// --- Profile Building ---

/**
 * Build NPC profiles for all companions (for director views).
 */
export function getCompanionProfiles(
  engine: Engine,
  party: PartyState,
  activePressures: WorldPressure[],
  playerRumors?: PlayerRumor[],
  npcObligations?: Map<string, NpcObligationLedger>,
): NpcProfile[] {
  const profiles: NpcProfile[] = [];
  for (const comp of party.companions) {
    const obligations = npcObligations?.get(comp.npcId);
    const profile = buildNpcProfile(
      engine.world,
      comp.npcId,
      engine.world.playerId,
      activePressures,
      playerRumors,
      obligations,
    );
    profiles.push(profile);
  }
  return profiles;
}

// --- Role Inference ---

/**
 * Infer companion role from entity tags.
 */
export function inferCompanionRole(entity: { tags: string[]; custom?: Record<string, unknown> }): CompanionRole {
  // Explicit custom role takes precedence
  if (entity.custom?.companionRole) {
    return entity.custom.companionRole as CompanionRole;
  }
  // Infer from tags
  if (entity.tags.includes('healer') || entity.tags.includes('medic')) return 'healer';
  if (entity.tags.includes('diplomat') || entity.tags.includes('noble')) return 'diplomat';
  if (entity.tags.includes('scout') || entity.tags.includes('thief')) return 'scout';
  if (entity.tags.includes('smuggler') || entity.tags.includes('merchant')) return 'smuggler';
  if (entity.tags.includes('scholar') || entity.tags.includes('mage')) return 'scholar';
  return 'fighter'; // Default
}
