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
import { promptText, promptMenu, promptMultiSelect, promptConfirm, promptGroupedMenu, PromptCancelled, CANCEL_KEYWORD, type MenuGroup } from './prompts.js';
import { allPacks, type PackInfo } from './packs.js';
import type { PackDifficulty } from '@ai-rpg-engine/pack-registry';
import { getTerminalWidth } from '../display/play-renderer.js';
import { dim } from '../cli/colors.js';

/**
 * F-7360c1a0: the Character Summary header used to be a bare
 * `\n  ── Character Summary ──` line matching neither of this domain's two
 * established header idioms -- not the full-width, getTerminalWidth()-driven
 * divider()+ALL-CAPS convention every peer summary screen uses (recap.ts's
 * LAST TIME ON CLAUDE RPG, sheet.ts's CHARACTER SHEET, session-recap.ts's
 * SESSION SUMMARY, chronicle-renderer.ts's three headers -- all framed top
 * and bottom by full-width rules), nor the short colored inline-marker idiom
 * used elsewhere for a similar bracketed aside (play-renderer.ts's
 * yellow-wrapped '── approaching conclusion ──' banner). Promoted to the
 * full convention here -- Character Summary is a full-screen recap of a
 * completed character, functionally closest to sheet.ts's CHARACTER SHEET
 * (hence the same heavy '═' weight, not world-delta.ts's/recap-delta.ts's
 * thinner '─'). dim()-wrapped from the outset to match this same wave's
 * F-8e8ac939 fix (recap.ts/recap-delta.ts/sheet.ts/world-delta.ts/
 * session-recap.ts's dividers all gained dim() this wave) -- introducing a
 * sixth undimmed divider the moment after fixing the other five would just
 * relocate the exact gap being closed.
 */
function divider(): string {
  return dim('═'.repeat(getTerminalWidth()));
}

export type BuildResult = {
  build: CharacterBuild;
  profile: CharacterProfile;
  playerEntity: EntityState;
  pack: PackInfo;
};

// F-6ed5f350 (SLATE-3): fixed group order/labels for the grouped world-select
// menu. difficulty is single-valued on PackMetadata (no array-index collision
// risk, unlike genres[0]/tones[0]) and already fully populated on all 10 live
// packs. Labels are DRAFT copy -- coordinator wording welcome.
const DIFFICULTY_ORDER: PackDifficulty[] = ['beginner', 'intermediate', 'advanced'];
const DIFFICULTY_LABEL: Record<PackDifficulty, string> = {
  beginner: 'BEGINNER-FRIENDLY',
  intermediate: 'STANDARD',
  advanced: 'ADVANCED',
};

/**
 * Group packs by difficulty tier for the grouped world-select menu
 * (F-6ed5f350 / SLATE-3). Exported so a drift guard can assert the current
 * pack-roster split directly, without driving the full interactive flow.
 */
export function buildDifficultyGroups(packs: PackInfo[]): MenuGroup<PackInfo>[] {
  return DIFFICULTY_ORDER
    .map((d) => ({
      label: DIFFICULTY_LABEL[d],
      items: packs
        .filter((p) => p.meta.difficulty === d)
        .map((p) => ({ item: p, label: p.meta.name, description: p.meta.tagline })),
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * Run the full interactive character creation flow. Uses a loop instead of recursion for retry.
 *
 * @param presetPack F-ef4a283d (SLATE-4) / Coordinator Brief contract #4: when
 *   supplied (bin.ts resolves --world to a PackInfo via resolveWorldFlag +
 *   getPackById BEFORE calling this), Step 1's world-select prompt is skipped
 *   entirely -- never shown, not even on a retry. Per Director ruling R2, the
 *   preset stays LOCKED for the lifetime of this call: rejecting the
 *   character summary and looping back does NOT fall through to the normal
 *   menu. The only acknowledgment of a reject while a world is preset is a
 *   hint line telling the player how to change it (rerun the CLI without
 *   --world) -- there is no in-session escape hatch by design.
 */
export async function buildCharacter(rl: ReadlineInterface, presetPack?: PackInfo): Promise<BuildResult> {
  // F-f480fef1: printed once, before the flow starts (not re-printed on a
  // reject-and-retry pass) -- see PromptCancelled's doc comment (prompts.ts)
  // for the full contract this hint advertises.
  console.log(`  Type "${CANCEL_KEYWORD}" at any prompt to stop character creation.`);
  try {
  // Loop instead of recursion to avoid unbounded stack growth on repeated rejections
  while (true) {
  // Step 1: Select pack.
  // F-ef4a283d: presetPack (--world) skips this prompt on every pass,
  // locked per R2. F-6ed5f350 (SLATE-3): the un-preset path now groups the
  // flat 10-pack list by difficulty instead of one long undifferentiated list.
  let pack: PackInfo;
  if (presetPack) {
    pack = presetPack;
    console.log(`\n  World: ${pack.meta.name} (preselected via --world)`);
  } else {
    const groups = buildDifficultyGroups(allPacks);
    pack = await promptGroupedMenu(rl, 'Choose your world:', groups);
  }
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
  // F-67f0cf3d investigated: this second argument is `selectedTraitIds` (traits
  // already picked, used to exclude them + their `incompatibleWith` set — see
  // getAvailableTraits's own doc comment) — NOT an archetype/background tags
  // array like getAvailableDisciplines's `currentTags` below. `[]` is correct
  // here: no traits have been selected yet at this point in the flow (traitIds
  // is declared on the next line). Passing currentTags here would be wrong —
  // it would filter traits against an unrelated tag/incompatibility model.
  const availableTraits = getAvailableTraits(catalog, []);
  let traitIds: string[] = [];
  if (availableTraits.length > 0) {
    const maxTraits = catalog.maxTraits;
    // ai-playtest finding (2026-09-01): the menu never said a flaw was
    // required, and a build without one failed validation AFTER stat
    // allocation -- see the resolveEntity guard below. Say it up front.
    const requiredFlaws = catalog.requiredFlaws ?? 0;
    const traitTitle = requiredFlaws > 0
      ? `Choose traits (at least ${requiredFlaws} flaw${requiredFlaws === 1 ? '' : 's'} required):`
      : 'Choose traits:';
    const traitIndices = await promptMultiSelect(rl, traitTitle, availableTraits.map((t) => ({
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
      // F-86c50a80: this was the one step in the whole 7-step flow that
      // silently absorbed bad input instead of re-prompting like every
      // promptMenu-based step elsewhere here (archetype, background,
      // discipline, world/trait selection) -- a non-numeric answer became
      // NaN || 0 = 0 points with zero feedback, a negative number was
      // clamped to 0 the same silent way, and an over-budget number was
      // silently capped with no notice at all. Now: reject non-numeric/
      // negative input and re-ask (mirroring promptMenu's message), and
      // print an explicit notice when an over-budget number is scaled down
      // instead of silently substituting a smaller value.
      let points: number | undefined;
      while (points === undefined) {
        const answer = await promptText(rl, `  ${stat.name} (${stat.id}, max ${remaining})`);
        const parsed = parseInt(answer, 10);
        if (Number.isNaN(parsed) || parsed < 0) {
          console.log(`  Please enter a number between 0 and ${remaining}.`);
          continue;
        }
        if (parsed > remaining) {
          points = remaining;
          console.log(`  Only ${remaining} left. Allocating ${remaining} to ${stat.name}.`);
        } else {
          points = parsed;
        }
      }
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
  // ai-playtest finding (2026-09-01): an invalid build (e.g. no flaw picked
  // where the pack requires one) threw out of the whole creation flow and
  // ended the session with "Unexpected error ... Exiting". A rejected build
  // is a prompt outcome, not a crash: say why and start the pass over.
  let playerEntity: ReturnType<typeof resolveEntity>;
  try {
    playerEntity = resolveEntity(build, catalog, ruleset);
  } catch (err) {
    if (err instanceof PromptCancelled) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    console.log(`
  That build is not allowed: ${reason}
  Let's build the character again.
`);
    continue;
  }

  // Show summary
  const title = disciplineId ? resolveTitle(archetype.id, disciplineId, catalog) : undefined;
  console.log('');
  console.log(divider());
  console.log('  CHARACTER SUMMARY');
  console.log(divider());
  console.log('');
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
  console.log(divider());
  console.log('');

  const confirmed = await promptConfirm(rl, 'Accept this character?');
  if (!confirmed) {
    // F-ef4a283d / R2: a preset world stays locked across retries -- the
    // hint tells the player the only way to change it (rerun without
    // --world) instead of silently offering a menu the locked design no
    // longer shows.
    console.log(presetPack
      ? '  Starting over... (rerun without --world to pick a different world)\n'
      : '  Starting over...\n');
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
  } catch (err) {
    // F-f480fef1: PromptCancelled seam contract -- see its doc comment in
    // prompts.ts. This is the one piece of graceful handling fully owned by
    // this domain: print a clean, in-voice confirmation immediately, then
    // rethrow unchanged so bin.ts's runPlay (outside this domain's globs)
    // can decide what happens next.
    if (err instanceof PromptCancelled) {
      console.log(`\n  ${err.message}\n`);
    }
    throw err;
  }
}
