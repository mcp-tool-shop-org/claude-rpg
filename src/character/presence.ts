// Token-budget prompt bridge: builds concise presence strings from CharacterProfile

import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import type { WorldState } from '@ai-rpg-engine/core';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import {
  computeLoadoutEffects,
  evaluateRelicGrowth,
  getItemHistory,
  getItemKillCount,
  TIER_LABELS,
  type LoadoutEffect,
} from '@ai-rpg-engine/equipment';
import {
  computeLevel,
  getActiveInjuries,
  getReputation,
} from '@ai-rpg-engine/character-profile';
import {
  deriveStance,
  getCognition,
  getEntityFaction,
  getFactionCognition,
} from '@ai-rpg-engine/modules';
import { resolveArchetypeName, resolveDisciplineName } from './catalog-names.js';

export type PresenceStrings = {
  /** For the narrator: gear, injuries, title woven into descriptive context. */
  narratorSummary: string;
  /** For NPCs: mechanical tags, reputation, visible gear for reaction logic. */
  npcPerception: string;
};

export type StatusData = {
  name: string;
  level: number;
  archetypeName: string;
  disciplineName?: string;
  title?: string;
  hp: number;
  maxHp?: number;
  weaponName?: string;
  armorName?: string;
  injuryTags: string[];
  statuses: string[];
};

/**
 * Build both presence strings from profile + item catalog.
 *
 * @param catalog F-3c282b18: optional BuildCatalog used to resolve
 *   archetypeId/disciplineId to their display name (mirrors builder.ts's own
 *   `archetype.name` / `disc?.name ?? disciplineId` pattern). Omitted callers
 *   keep getting the raw id back, same as before this fix.
 */
export function buildPresence(
  profile: CharacterProfile,
  itemCatalog: ItemCatalog,
  npcStance?: string,
  catalog?: BuildCatalog,
): PresenceStrings {
  const level = computeLevel(profile.progression.xp);
  const archName = resolveArchetypeName(catalog, profile.build.archetypeId);
  const discName = profile.build.disciplineId
    ? resolveDisciplineName(catalog, profile.build.disciplineId)
    : profile.build.disciplineId;
  const title = profile.custom.title as string | undefined;
  const injuries = getActiveInjuries(profile);

  // Get equipped item names, enriched with relic epithets
  const effects = computeLoadoutEffects(profile.loadout, itemCatalog);
  const equipped = profile.loadout.equipped;
  const itemNames: Record<string, string> = {};
  for (const [slot, itemId] of Object.entries(equipped)) {
    if (itemId) {
      const item = itemCatalog.items.find((i) => i.id === itemId);
      if (item) {
        const chronicle = getItemHistory(profile.itemChronicle, itemId);
        const relic = evaluateRelicGrowth(item, chronicle, profile.totalTurns);
        if (relic.currentEpithet) {
          const killCount = getItemKillCount(profile.itemChronicle, itemId);
          const tierLabel = TIER_LABELS[relic.tier] ?? '';
          itemNames[slot] = `${relic.currentEpithet} (${tierLabel}, ${killCount} kills)`;
        } else {
          itemNames[slot] = item.name;
        }
      } else {
        itemNames[slot] = itemId;
      }
    }
  }

  // Narrator summary (~60-100 tokens)
  const narratorParts: string[] = [];
  narratorParts.push(`${profile.build.name}, Lv${level} ${archName}${discName ? `/${discName}` : ''}.`);

  const equippedItems: string[] = [];
  if (itemNames.weapon) equippedItems.push(itemNames.weapon);
  if (itemNames.armor) equippedItems.push(itemNames.armor);
  if (itemNames.accessory) equippedItems.push(itemNames.accessory);
  if (equippedItems.length > 0) {
    narratorParts.push(`Equipped: ${equippedItems.join(', ')}.`);
  }

  if (injuries.length > 0) {
    const injuryDesc = injuries.map((inj) => inj.name.toLowerCase()).join(', ');
    narratorParts.push(`Injuries: ${injuryDesc}.`);
  }

  if (title) narratorParts.push(`Title: ${title}.`);

  // NPC perception (~60-100 tokens)
  const npcParts: string[] = [];
  npcParts.push(`Player: ${profile.build.name} (${archName}, Lv${level}).`);

  // Weapon with provenance flags for NPC perception
  if (equipped.weapon) {
    const wpnItem = itemCatalog.items.find((i) => i.id === equipped.weapon);
    if (wpnItem) {
      const flags = wpnItem.provenance?.flags;
      const flagStr = flags && flags.length > 0 ? ` (${flags.join(', ')})` : '';
      npcParts.push(`Armed: ${itemNames.weapon ?? wpnItem.name}${flagStr}.`);
    } else {
      npcParts.push(`Armed: ${itemNames.weapon ?? equipped.weapon}.`);
    }
  }
  if (itemNames.armor) npcParts.push(`Armor: ${itemNames.armor}.`);

  const visibleTags: string[] = [...effects.grantedTags];
  for (const injury of injuries) {
    visibleTags.push(...injury.grantedTags);
  }
  if (visibleTags.length > 0) {
    npcParts.push(`Tags: ${visibleTags.join(', ')}.`);
  }

  // Reputation summary (top factions by magnitude)
  const repEntries = profile.reputation
    .filter((r) => Math.abs(r.value) >= 10)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 3);
  if (repEntries.length > 0) {
    const repStr = repEntries.map((r) => `${r.factionId} ${r.value > 0 ? '+' : ''}${r.value}`).join(', ');
    npcParts.push(`Rep: ${repStr}.`);
  }

  // Stance indicator for NPC perception
  if (npcStance && npcStance !== 'neutral') {
    npcParts.push(`Stance toward player: ${npcStance}.`);
  }

  return {
    narratorSummary: narratorParts.join(' '),
    npcPerception: npcParts.join(' '),
  };
}

/**
 * Build stance-aware NPC presence for a specific NPC.
 *
 * @param catalog F-3c282b18: same optional BuildCatalog contract as
 *   buildPresence, forwarded straight through.
 */
export function buildNPCStancePresence(
  profile: CharacterProfile,
  itemCatalog: ItemCatalog,
  world: WorldState,
  npcId: string,
  catalog?: BuildCatalog,
): PresenceStrings {
  const factionId = getEntityFaction(world, npcId);
  const repValue = factionId ? getReputation(profile, factionId) : 0;
  const cognition = getCognition(world, npcId);
  const factionCog = factionId ? getFactionCognition(world, factionId) : null;
  const stance = deriveStance(repValue, cognition, factionCog?.alertLevel ?? 0);

  return buildPresence(profile, itemCatalog, stance, catalog);
}

/**
 * Build structured status data for terminal display.
 *
 * F-0d9b451a: buildStatusData only receives CharacterProfile + ItemCatalog, so it
 * has no access to the live WorldState the player's active status effects live on.
 * Callers that DO have a WorldState can resolve the same way scene-context.ts does
 * — `(player?.statuses ?? []).map((s) => s.statusId)` — and pass the result here;
 * callers without one keep the empty-array default (backward compatible).
 *
 * F-3c282b18: StatusData's own type promises resolved display names for
 * archetypeName/disciplineName, but this used to assign the raw catalog slug
 * verbatim (feeds play-renderer.ts's per-turn status bar, the most frequently
 * rendered line in the app). `catalog` is optional and trailing so every
 * existing call site keeps compiling and, when omitted, keeps returning the
 * raw id exactly as before.
 */
export function buildStatusData(
  profile: CharacterProfile,
  itemCatalog: ItemCatalog,
  statuses: string[] = [],
  catalog?: BuildCatalog,
): StatusData {
  const level = computeLevel(profile.progression.xp);
  const injuries = getActiveInjuries(profile);
  const equipped = profile.loadout.equipped;

  const weaponItem = equipped.weapon ? itemCatalog.items.find((i) => i.id === equipped.weapon) : null;
  const armorItem = equipped.armor ? itemCatalog.items.find((i) => i.id === equipped.armor) : null;

  const injuryTags: string[] = [];
  for (const injury of injuries) {
    injuryTags.push(...injury.grantedTags);
  }

  return {
    name: profile.build.name,
    level,
    archetypeName: resolveArchetypeName(catalog, profile.build.archetypeId),
    disciplineName: profile.build.disciplineId
      ? resolveDisciplineName(catalog, profile.build.disciplineId)
      : profile.build.disciplineId,
    title: profile.custom.title as string | undefined,
    hp: profile.resources.hp ?? 0,
    maxHp: (profile.resources as Record<string, unknown>).maxHp as number | undefined
      ?? (profile.custom.maxHp as number | undefined),
    weaponName: weaponItem?.name,
    armorName: armorItem?.name,
    injuryTags,
    statuses,
  };
}
