// Character sheet terminal renderer

import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import {
  computeLevel,
  xpToNextLevel,
  getActiveInjuries,
} from '@ai-rpg-engine/character-profile';

const DIVIDER = '═'.repeat(60);
const THIN = '─'.repeat(60);

/** Render a full character sheet for terminal display. */
export function renderCharacterSheet(
  profile: CharacterProfile,
  itemCatalog: ItemCatalog,
): string {
  const parts: string[] = [];
  const level = computeLevel(profile.progression.xp);
  const xpNeeded = xpToNextLevel(profile.progression.xp);
  const title = profile.custom.title as string | undefined;

  parts.push('');
  parts.push(DIVIDER);
  parts.push(`  CHARACTER SHEET`);
  parts.push(DIVIDER);
  parts.push('');

  // Identity
  parts.push(`  Name:       ${profile.build.name}`);
  parts.push(`  Archetype:  ${profile.build.archetypeId}`);
  parts.push(`  Background: ${profile.build.backgroundId}`);
  if (profile.build.disciplineId) {
    parts.push(`  Discipline: ${profile.build.disciplineId}`);
  }
  if (title) {
    parts.push(`  Title:      ${title}`);
  }
  parts.push('');

  // Progression
  parts.push(THIN);
  parts.push(`  Level: ${level}    XP: ${profile.progression.xp}${xpNeeded !== null ? ` (${xpNeeded} to next)` : ' (MAX)'}    Turns: ${profile.totalTurns}`);
  if (profile.progression.archetypeRank > 1) {
    parts.push(`  Archetype Rank: ${profile.progression.archetypeRank}`);
  }
  if (profile.progression.disciplineRank > 0) {
    parts.push(`  Discipline Rank: ${profile.progression.disciplineRank}`);
  }
  parts.push('');

  // Stats
  parts.push(THIN);
  parts.push('  STATS');
  const statEntries = Object.entries(profile.stats);
  if (statEntries.length > 0) {
    parts.push(`  ${statEntries.map(([k, v]) => `${k}: ${v}`).join('  |  ')}`);
  }
  parts.push('');

  // Resources
  parts.push('  RESOURCES');
  const resEntries = Object.entries(profile.resources);
  if (resEntries.length > 0) {
    parts.push(`  ${resEntries.map(([k, v]) => `${k}: ${v}`).join('  |  ')}`);
  }
  parts.push('');

  // Equipment
  parts.push(THIN);
  parts.push('  EQUIPMENT');
  const slots = ['weapon', 'armor', 'accessory', 'tool', 'trinket'] as const;
  for (const slot of slots) {
    const itemId = profile.loadout.equipped[slot];
    if (itemId) {
      const item = itemCatalog.items.find((i) => i.id === itemId);
      parts.push(`  ${slot.padEnd(10)} ${item?.name ?? itemId}`);
    } else {
      parts.push(`  ${slot.padEnd(10)} (empty)`);
    }
  }
  if (profile.loadout.inventory.length > 0) {
    parts.push(`  Inventory:  ${profile.loadout.inventory.join(', ')}`);
  }
  parts.push('');

  // Injuries
  const injuries = getActiveInjuries(profile);
  if (injuries.length > 0) {
    parts.push(THIN);
    parts.push('  INJURIES');
    for (const inj of injuries) {
      parts.push(`  - ${inj.name}: ${inj.description}`);
    }
    parts.push('');
  }

  // Reputation
  const rep = profile.reputation.filter((r) => r.value !== 0);
  if (rep.length > 0) {
    parts.push(THIN);
    parts.push('  REPUTATION');
    for (const r of rep) {
      const bar = r.value > 0 ? '+' : '';
      parts.push(`  ${r.factionId.padEnd(20)} ${bar}${r.value}`);
    }
    parts.push('');
  }

  // Milestones
  if (profile.milestones.length > 0) {
    parts.push(THIN);
    parts.push('  MILESTONES');
    for (const m of profile.milestones.slice(-5)) {
      parts.push(`  - ${m.label}`);
    }
    if (profile.milestones.length > 5) {
      parts.push(`  ... and ${profile.milestones.length - 5} more`);
    }
    parts.push('');
  }

  parts.push(DIVIDER);
  parts.push('');

  return parts.join('\n');
}
