// Pack registry: all 10 starter packs with metadata + factory functions

import type { Engine, RulesetDefinition } from '@ai-rpg-engine/core';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';


// F-00ddfc68 (unblocked by the engine 2.9.x migration): the three packs the
// wave-10 tripwire guarded — importable now that @ai-rpg-engine/modules
// exports BUILTIN_PACK_BIASES.
import {
  createGame as createGladiatorGame,
  packMeta as gladiatorMeta,
  buildCatalog as gladiatorBuild,
  itemCatalog as gladiatorItems,
  gladiatorMinimalRuleset,
} from '@ai-rpg-engine/starter-gladiator';

import {
  createGame as createRoninGame,
  packMeta as roninMeta,
  buildCatalog as roninBuild,
  itemCatalog as roninItems,
  roninMinimalRuleset,
} from '@ai-rpg-engine/starter-ronin';

import {
  createGame as createVampireGame,
  packMeta as vampireMeta,
  buildCatalog as vampireBuild,
  itemCatalog as vampireItems,
  vampireMinimalRuleset,
} from '@ai-rpg-engine/starter-vampire';

import {
  createGame as createColonyGame,
  packMeta as colonyMeta,
  buildCatalog as colonyBuild,
  itemCatalog as colonyItems,
  colonyMinimalRuleset,
} from '@ai-rpg-engine/starter-colony';

import {
  createGame as createCyberpunkGame,
  packMeta as cyberpunkMeta,
  buildCatalog as cyberpunkBuild,
  itemCatalog as cyberpunkItems,
  cyberpunkMinimalRuleset,
} from '@ai-rpg-engine/starter-cyberpunk';

import {
  createGame as createDetectiveGame,
  packMeta as detectiveMeta,
  buildCatalog as detectiveBuild,
  itemCatalog as detectiveItems,
  detectiveMinimalRuleset,
} from '@ai-rpg-engine/starter-detective';

import {
  createGame as createFantasyGame,
  packMeta as fantasyMeta,
  buildCatalog as fantasyBuild,
  itemCatalog as fantasyItems,
  fantasyMinimalRuleset,
} from '@ai-rpg-engine/starter-fantasy';

import {
  createGame as createPirateGame,
  packMeta as pirateMeta,
  buildCatalog as pirateBuild,
  itemCatalog as pirateItems,
  pirateMinimalRuleset,
} from '@ai-rpg-engine/starter-pirate';

import {
  createGame as createWeirdWestGame,
  packMeta as weirdWestMeta,
  buildCatalog as weirdWestBuild,
  itemCatalog as weirdWestItems,
  weirdWestMinimalRuleset,
} from '@ai-rpg-engine/starter-weird-west';

import {
  createGame as createZombieGame,
  packMeta as zombieMeta,
  buildCatalog as zombieBuild,
  itemCatalog as zombieItems,
  zombieMinimalRuleset,
} from '@ai-rpg-engine/starter-zombie';

export type PackInfo = {
  meta: PackMetadata;
  buildCatalog: BuildCatalog;
  itemCatalog: ItemCatalog;
  ruleset: RulesetDefinition;
  createGame: (seed?: number) => Engine;
};

export const allPacks: PackInfo[] = [
  { meta: fantasyMeta, buildCatalog: fantasyBuild, itemCatalog: fantasyItems, ruleset: fantasyMinimalRuleset, createGame: createFantasyGame },
  { meta: gladiatorMeta, buildCatalog: gladiatorBuild, itemCatalog: gladiatorItems, ruleset: gladiatorMinimalRuleset, createGame: createGladiatorGame },
  { meta: roninMeta, buildCatalog: roninBuild, itemCatalog: roninItems, ruleset: roninMinimalRuleset, createGame: createRoninGame },
  { meta: vampireMeta, buildCatalog: vampireBuild, itemCatalog: vampireItems, ruleset: vampireMinimalRuleset, createGame: createVampireGame },
  { meta: cyberpunkMeta, buildCatalog: cyberpunkBuild, itemCatalog: cyberpunkItems, ruleset: cyberpunkMinimalRuleset, createGame: createCyberpunkGame },
  { meta: detectiveMeta, buildCatalog: detectiveBuild, itemCatalog: detectiveItems, ruleset: detectiveMinimalRuleset, createGame: createDetectiveGame },
  { meta: pirateMeta, buildCatalog: pirateBuild, itemCatalog: pirateItems, ruleset: pirateMinimalRuleset, createGame: createPirateGame },
  { meta: weirdWestMeta, buildCatalog: weirdWestBuild, itemCatalog: weirdWestItems, ruleset: weirdWestMinimalRuleset, createGame: createWeirdWestGame },
  { meta: zombieMeta, buildCatalog: zombieBuild, itemCatalog: zombieItems, ruleset: zombieMinimalRuleset, createGame: createZombieGame },
  { meta: colonyMeta, buildCatalog: colonyBuild, itemCatalog: colonyItems, ruleset: colonyMinimalRuleset, createGame: createColonyGame },
];

export function getPackById(id: string): PackInfo | undefined {
  return allPacks.find((p) => p.meta.id === id);
}

/** Map legacy --world names to pack IDs. */
export function resolveWorldFlag(worldName: string): string | undefined {
  const map: Record<string, string> = {
    fantasy: 'chapel-threshold',
    gladiator: 'iron-colosseum',
    ronin: 'jade-veil',
    vampire: 'crimson-court',
    cyberpunk: 'neon-lockbox',
    detective: 'gaslight-detective',
    pirate: 'black-flag-requiem',
    'weird-west': 'dust-devils-bargain',
    zombie: 'ashfall-dead',
    colony: 'signal-loss',
  };
  const result = map[worldName];
  if (!result) {
    console.warn(`resolveWorldFlag: unknown world name "${worldName}"`);
  }
  return result;
}
