// Character sheet terminal renderer

import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import {
  computeLevel,
  xpToNextLevel,
  getActiveInjuries,
} from '@ai-rpg-engine/character-profile';
import { getTerminalWidth } from '../display/play-renderer.js';
import { dim } from '../cli/colors.js';
import { resolveArchetypeName, resolveBackgroundName, resolveDisciplineName } from './catalog-names.js';

// F-e475c46d: was a fixed 60-char divider regardless of terminal size,
// unlike play-renderer.ts's own dividers (PFE-005). Computed per call (not
// a module-level constant) so it tracks the real terminal width, matching
// play-renderer.ts's makeDivider()/makeThinDivider() pattern (F-38eb3dec
// precedent: director-renderer.ts, status-compact.ts, archive-browser.ts,
// help-system.ts).
// F-8e8ac939: both also wrapped in dim() -- colors.ts documents dim as the
// semantic choice for "dividers and secondary text", and the reference
// implementation this comment already claims to match
// (play-renderer.ts's makeDivider()/makeThinDivider(), and this same
// six-file family's own chronicle-renderer.ts sibling) both wrap every
// divider in dim(). This file rendered its rules bright/undimmed until now.
function divider(): string {
  return dim('═'.repeat(getTerminalWidth()));
}
function thinDivider(): string {
  return dim('─'.repeat(getTerminalWidth()));
}

/**
 * Render a full character sheet for terminal display.
 *
 * @param catalog F-9c94c4b5: optional BuildCatalog used to resolve
 *   archetypeId/backgroundId/disciplineId to their display name (same
 *   contract as presence.ts's buildStatusData/buildPresence catalog param).
 * @param factionNames F-9c94c4b5: optional id->display-name map for
 *   REPUTATION, mirroring session-recap.ts's already-established
 *   `factionNames: Record<string, string>` convention. Both are optional and
 *   trailing so every pre-existing call site keeps compiling and, when
 *   omitted, keeps rendering the raw id exactly as before.
 */
export function renderCharacterSheet(
  profile: CharacterProfile,
  itemCatalog: ItemCatalog,
  catalog?: BuildCatalog,
  factionNames?: Record<string, string>,
): string {
  const parts: string[] = [];
  const level = computeLevel(profile.progression.xp);
  const xpNeeded = xpToNextLevel(profile.progression.xp);
  const title = profile.custom.title as string | undefined;

  parts.push('');
  parts.push(divider());
  parts.push(`  CHARACTER SHEET`);
  parts.push(divider());
  parts.push('');

  // Identity
  parts.push(`  Name:       ${profile.build.name}`);
  parts.push(`  Archetype:  ${resolveArchetypeName(catalog, profile.build.archetypeId)}`);
  parts.push(`  Background: ${resolveBackgroundName(catalog, profile.build.backgroundId)}`);
  if (profile.build.disciplineId) {
    parts.push(`  Discipline: ${resolveDisciplineName(catalog, profile.build.disciplineId)}`);
  }
  if (title) {
    parts.push(`  Title:      ${title}`);
  }
  parts.push('');

  // Progression
  parts.push(thinDivider());
  parts.push(`  Level: ${level}    XP: ${profile.progression.xp}${xpNeeded !== null ? ` (${xpNeeded} to next)` : ' (MAX)'}    Turns: ${profile.totalTurns}`);
  if (profile.progression.archetypeRank > 1) {
    parts.push(`  Archetype Rank: ${profile.progression.archetypeRank}`);
  }
  if (profile.progression.disciplineRank > 0) {
    parts.push(`  Discipline Rank: ${profile.progression.disciplineRank}`);
  }
  parts.push('');

  // Stats
  parts.push(thinDivider());
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
  parts.push(thinDivider());
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
    parts.push(thinDivider());
    parts.push('  INJURIES');
    for (const inj of injuries) {
      parts.push(`  - ${inj.name}: ${inj.description}`);
    }
    parts.push('');
  }

  // Reputation
  const rep = profile.reputation.filter((r) => r.value !== 0);
  if (rep.length > 0) {
    parts.push(thinDivider());
    parts.push('  REPUTATION');
    for (const r of rep) {
      const bar = r.value > 0 ? '+' : '';
      const factionName = factionNames?.[r.factionId] ?? r.factionId;
      parts.push(`  ${factionName.padEnd(20)} ${bar}${r.value}`);
    }
    parts.push('');
  }

  // Milestones
  if (profile.milestones.length > 0) {
    parts.push(thinDivider());
    parts.push('  MILESTONES');
    for (const m of profile.milestones.slice(-5)) {
      parts.push(`  - ${m.label}`);
    }
    if (profile.milestones.length > 5) {
      parts.push(`  ... and ${profile.milestones.length - 5} more`);
    }
    parts.push('');
  }

  parts.push(divider());
  parts.push('');

  return parts.join('\n');
}
