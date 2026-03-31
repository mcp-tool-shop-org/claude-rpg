// Interactive character creation flow using readline

import type { Interface as ReadlineInterface } from 'node:readline';
import type { EntityState } from '@ai-rpg-engine/core';
import type { CharacterBuild } from '@ai-rpg-engine/character-creation';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import {
  getAvailableArchetypes,
  getAvailableBackgrounds,
  getAvailableTraits,
  getAvailableDisciplines,
  getStatBudgetRemaining,
  resolveEntity,
  resolveTitle,
} from '@ai-rpg-engine/character-creation';
import { createProfile } from '@ai-rpg-engine/character-profile';
import {
  createEmptyLoadout,
  equipItem,
  addToInventory,
} from '@ai-rpg-engine/equipment';
import { promptText, promptMenu, promptMultiSelect, promptConfirm } from './prompts.js';
import { allPacks, type PackInfo } from './packs.js';

export type BuildResult = {
  build: CharacterBuild;
  profile: CharacterProfile;
  playerEntity: EntityState;
  pack: PackInfo;
};

/** Run the full interactive character creation flow. Uses a loop instead of recursion for retry. */
export async function buildCharacter(rl: ReadlineInterface): Promise<BuildResult> {
  // Loop instead of recursion to avoid unbounded stack growth on repeated rejections
  while (true) {
  // Step 1: Select pack
  const packIndex = await promptMenu(rl, 'Choose your world:', allPacks.map((p) => ({
    label: p.meta.name,
    description: p.meta.tagline,
  })));
  const pack = allPacks[packIndex];
  const catalog = pack.buildCatalog;
  const ruleset = pack.ruleset;

  console.log(`\n  ${pack.meta.name}: ${pack.meta.description}\n`);

  // Step 2: Character name
  let name = '';
  while (!name) {
    name = await promptText(rl, 'Character name');
    if (!name) console.log('  Name cannot be empty.');
  }

  // Step 3: Archetype
  const archetypes = getAvailableArchetypes(catalog);
  const archIdx = await promptMenu(rl, 'Choose your archetype:', archetypes.map((a) => ({
    label: a.name,
    description: a.description,
  })));
  const archetype = archetypes[archIdx];

  // Step 4: Background
  const backgrounds = getAvailableBackgrounds(catalog);
  const bgIdx = await promptMenu(rl, 'Choose your background:', backgrounds.map((b) => ({
    label: b.name,
    description: b.description,
  })));
  const background = backgrounds[bgIdx];

  // Step 5: Traits
  const availableTraits = getAvailableTraits(catalog, []);
  let traitIds: string[] = [];
  if (availableTraits.length > 0) {
    const maxTraits = catalog.maxTraits;
    const traitIndices = await promptMultiSelect(rl, 'Choose traits:', availableTraits.map((t) => ({
      label: `${t.name} (${t.category})`,
      description: t.description,
    })), maxTraits);
    traitIds = traitIndices.map((i) => availableTraits[i].id);
  }

  // Step 6: Discipline (optional)
  const currentTags = [...archetype.startingTags, ...background.startingTags];
  const disciplines = getAvailableDisciplines(catalog, archetype.id, currentTags);
  let disciplineId: string | undefined;
  if (disciplines.length > 0) {
    const wantDiscipline = await promptConfirm(rl, 'Choose a secondary discipline?');
    if (wantDiscipline) {
      const discIdx = await promptMenu(rl, 'Choose your discipline:', disciplines.map((d) => ({
        label: d.name,
        description: d.description,
      })));
      disciplineId = disciplines[discIdx].id;
    }
  }

  // Step 7: Stat allocation
  let statAllocations: Record<string, number> | undefined;
  const budget = getStatBudgetRemaining({ statAllocations: undefined }, catalog);
  if (budget > 0 && ruleset.stats.length > 0) {
    console.log(`\n  You have ${budget} stat points to allocate.\n`);
    statAllocations = {};
    let remaining = budget;
    for (const stat of ruleset.stats) {
      if (remaining <= 0) break;
      const answer = await promptText(rl, `  ${stat.name} (${stat.id}, max ${remaining})`);
      const points = Math.min(Math.max(0, parseInt(answer, 10) || 0), remaining);
      if (points > 0) {
        statAllocations[stat.id] = points;
        remaining -= points;
      }
    }
    if (Object.keys(statAllocations).length === 0) {
      statAllocations = undefined;
    }
  }

  // Build the CharacterBuild
  const build: CharacterBuild = {
    name,
    archetypeId: archetype.id,
    backgroundId: background.id,
    traitIds,
    disciplineId,
    statAllocations,
  };

  // Resolve entity
  const playerEntity = resolveEntity(build, catalog, ruleset);

  // Show summary
  const title = disciplineId ? resolveTitle(archetype.id, disciplineId, catalog) : undefined;
  console.log('\n  ── Character Summary ──');
  console.log(`  Name: ${name}`);
  console.log(`  Archetype: ${archetype.name}`);
  console.log(`  Background: ${background.name}`);
  if (traitIds.length > 0) {
    const traitNames = traitIds.map((id) => availableTraits.find((t) => t.id === id)?.name ?? id);
    console.log(`  Traits: ${traitNames.join(', ')}`);
  }
  if (disciplineId) {
    const disc = disciplines.find((d) => d.id === disciplineId);
    console.log(`  Discipline: ${disc?.name ?? disciplineId}`);
  }
  if (title) console.log(`  Title: ${title}`);
  console.log(`  Stats: ${Object.entries(playerEntity.stats).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  console.log(`  Resources: ${Object.entries(playerEntity.resources).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  console.log('');

  const confirmed = await promptConfirm(rl, 'Accept this character?');
  if (!confirmed) {
    console.log('  Starting over...\n');
    continue; // loop back instead of recursive call
  }

  // Create profile
  const profile = createProfile(
    build,
    playerEntity.stats,
    playerEntity.resources,
    playerEntity.tags,
    pack.meta.id,
  );

  // Equip starting inventory
  let loadout = createEmptyLoadout();
  for (const itemId of playerEntity.inventory ?? []) {
    const equipResult = equipItem(loadout, itemId, pack.itemCatalog, playerEntity.tags);
    if (equipResult.errors.length === 0) {
      loadout = equipResult.loadout;
    } else {
      loadout = addToInventory(loadout, itemId);
    }
  }

  const profileWithLoadout: CharacterProfile = {
    ...profile,
    loadout,
  };

  return { build, profile: profileWithLoadout, playerEntity, pack };
  } // end while
}
