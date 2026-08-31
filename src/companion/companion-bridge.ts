// Companion bridge — connects engine companion system to GameSession
// Handles recruitment validation, dismissal, zone following, and profile building.

import type { Engine } from '@ai-rpg-engine/core';
import {
  addCompanion,
  removeCompanion,
  getActiveCompanions,
  isCompanionRecruitable,
  type CompanionRole,
  type CompanionState,
  type PartyState,
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
  // F-bdfa6640: every refusal below appends a concrete next step, reusing this
  // exact feature's engine-native equivalent's own hint vocabulary where the
  // failure mode matches (companion-core.ts's recruitHandler, E:/AI/ai-rpg-engine
  // /packages/modules/src/companion-core.ts:638-699) instead of a bare reason
  // sentence with nothing telling the player what to do next.
  const entity = engine.world.entities[npcId];
  // Coordinator stitch (wave 8): unified with game.ts handleRecruit's copy —
  // game.ts surfaces this error verbatim for the recruit path, and the two
  // layers had drifted into two different sentences for the same player
  // mistake (each wave-8 agent fixed its own layer without seeing the other).
  if (!entity) return { ok: false, error: `No one named "${npcId}" is here to recruit — type "look" to see who's nearby.` };

  const hp = entity.resources.hp ?? entity.resources.health;
  if (hp !== undefined && hp <= 0) return { ok: false, error: `${entity.name} is not alive. Find another ally to recruit.` };

  if (!isCompanionRecruitable(entity)) {
    return { ok: false, error: `${entity.name} cannot be recruited — they aren't looking for a traveling companion.` };
  }

  const player = engine.world.entities[engine.world.playerId];
  if (player?.zoneId !== entity.zoneId) {
    // F-bdfa6640: names the target's actual zone (previously it did not),
    // falling back to the raw zoneId when no zone record exists to name it
    // (mirrors play-renderer.ts/scene-context.ts's established
    // `zones[id]?.name ?? id` display-name fallback).
    // Coordinator stitch: entity.zoneId is string | undefined — guard the
    // index (tsc seam the no-node_modules worktree couldn't catch).
    const zoneName = (entity.zoneId ? engine.world.zones?.[entity.zoneId]?.name : undefined) ?? entity.zoneId ?? 'another zone';
    return { ok: false, error: `${entity.name} is not in the same zone. They're in ${zoneName} — stand with them first.` };
  }

  if (party.companions.length >= party.maxSize) {
    return { ok: false, error: `Party is full (${party.maxSize}/${party.maxSize}). Type "/dismiss <npc-id>" to make room.` };
  }

  if (party.companions.some((c) => c.npcId === npcId)) {
    return { ok: false, error: `${entity.name} is already traveling with you.` };
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

  // Tag entity as companion.
  // NOTE: Direct entity mutation is intentional here. The Engine does not expose
  // entity update methods for tags or custom fields, so we mutate the entity
  // reference in-place. This is safe because we hold a reference from world.entities
  // and the engine reads it back on the next tick.
  if (!entity.tags.includes('companion')) {
    entity.tags.push('companion');
  }

  // Set companion morale in entity custom for engine-side goal derivation
  entity.custom = entity.custom ?? {};
  entity.custom.companionMorale = companion.morale;
  entity.custom.companionRole = role;

  // Engine 2.9.x: addCompanion returns { party, success, reason } instead of a
  // bare PartyState — surface the engine's own refusal reason when it declines.
  const addResult = addCompanion(party, companion);
  if (!addResult.success) {
    return {
      ok: false,
      error: addResult.reason === 'party-full'
        ? 'The party is already at full strength. Type "/dismiss <npc-id>" to make room.'
        : 'They are already traveling with you.',
    };
  }

  return { ok: true, party: addResult.party, companion };
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

// --- Role Inference ---
//
// F-4ca425fd: this file previously also exported getCompanionProfiles, a companion-only
// profile builder ("for director views" per its own doc comment). It was fully
// implemented and unit-tested in isolation but had zero production callers -- the
// director-mode companion-profile view it claimed to exist for is actually built by
// buildNpcProfilesForDirector (src/npc/agency.ts, a different domain), whose
// buildAllNpcProfiles call builds profiles for ALL named NPCs, companions included.
// Confirmed by call-site audit: game.ts already gets a companion's profile by filtering
// that all-NPC list (`this.lastNpcProfiles.find((p) => p.npcId === comp.npcId)`,
// processCompanionReactions) rather than ever calling this function. Deleted as dead
// code fully superseded by buildAllNpcProfiles, rather than left to drift as a second,
// unwired "companion profile" path a future contributor could mistake for the live one.

// F-35aef8dd: CompanionRole's own literal members, kept as a runtime array so
// isCompanionRole() below can validate a value against the SAME set the type
// describes, rather than trusting an unchecked cast at the one call site
// (inferCompanionRole) that has no in-domain caller to prove every value it reads
// was written by this domain's own type-checked recruitCompanion() path.
const COMPANION_ROLES: readonly CompanionRole[] = ['fighter', 'scout', 'healer', 'diplomat', 'smuggler', 'scholar'];

function isCompanionRole(value: unknown): value is CompanionRole {
  return typeof value === 'string' && (COMPANION_ROLES as readonly string[]).includes(value);
}

/**
 * Infer companion role from entity tags.
 */
export function inferCompanionRole(entity: { tags: string[]; custom?: Record<string, unknown> }): CompanionRole {
  // Explicit custom role takes precedence -- but only when it's actually one of
  // CompanionRole's known members (F-35aef8dd). inferCompanionRole is exported with
  // no caller anywhere in this domain's own files, so a stale/foreign save (an old
  // campaign recruited under a since-renamed or removed CompanionRole value) or any
  // other writer of entity.custom.companionRole must not be trusted blind -- fall
  // through to the same tag-inference chain used when custom.companionRole is absent.
  if (isCompanionRole(entity.custom?.companionRole)) {
    return entity.custom.companionRole;
  }
  // Infer from tags
  if (entity.tags.includes('healer') || entity.tags.includes('medic')) return 'healer';
  if (entity.tags.includes('diplomat') || entity.tags.includes('noble')) return 'diplomat';
  if (entity.tags.includes('scout') || entity.tags.includes('thief')) return 'scout';
  if (entity.tags.includes('smuggler') || entity.tags.includes('merchant')) return 'smuggler';
  if (entity.tags.includes('scholar') || entity.tags.includes('mage')) return 'scholar';
  return 'fighter'; // Default
}
