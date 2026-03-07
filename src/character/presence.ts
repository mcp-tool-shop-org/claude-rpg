// Token-budget prompt bridge: builds concise presence strings from CharacterProfile

import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import {
  computeLoadoutEffects,
  type LoadoutEffect,
} from '@ai-rpg-engine/equipment';
import {
  computeLevel,
  getActiveInjuries,
  getReputation,
} from '@ai-rpg-engine/character-profile';

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

/** Build both presence strings from profile + item catalog. */
export function buildPresence(
  profile: CharacterProfile,
  itemCatalog: ItemCatalog,
): PresenceStrings {
  const level = computeLevel(profile.progression.xp);
  const archName = profile.build.archetypeId;
  const discName = profile.build.disciplineId;
  const title = profile.custom.title as string | undefined;
  const injuries = getActiveInjuries(profile);

  // Get equipped item names
  const effects = computeLoadoutEffects(profile.loadout, itemCatalog);
  const equipped = profile.loadout.equipped;
  const itemNames: Record<string, string> = {};
  for (const [slot, itemId] of Object.entries(equipped)) {
    if (itemId) {
      const item = itemCatalog.items.find((i) => i.id === itemId);
      itemNames[slot] = item?.name ?? itemId;
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

  if (itemNames.weapon) npcParts.push(`Armed: ${itemNames.weapon}.`);
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

  return {
    narratorSummary: narratorParts.join(' '),
    npcPerception: npcParts.join(' '),
  };
}

/** Build structured status data for terminal display. */
export function buildStatusData(
  profile: CharacterProfile,
  itemCatalog: ItemCatalog,
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
    archetypeName: profile.build.archetypeId,
    disciplineName: profile.build.disciplineId,
    title: profile.custom.title as string | undefined,
    hp: profile.resources.hp ?? 0,
    maxHp: undefined,
    weaponName: weaponItem?.name,
    armorName: armorItem?.name,
    injuryTags,
    statuses: [],
  };
}
