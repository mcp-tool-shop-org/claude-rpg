// Pack registry: all 12 starter packs with metadata + factory functions

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

// Coordinator stitch (wave 13, Director-approved Group D): the two packs
// the wave-13 narrative-llm envelope left unregistered (and undeclared) —
// registered here per the pack-registration ritual the addendum locked:
// entries + WORLD_FLAG_MAP + PACK_VOICES (finale-prompt.ts) + the
// pending-registration list emptied and its tripwire deleted, one commit.
import {
  createGame as createMerchantGame,
  packMeta as merchantMeta,
  buildCatalog as merchantBuild,
  itemCatalog as merchantItems,
  merchantMinimalRuleset,
} from '@ai-rpg-engine/starter-merchant';

import {
  createGame as createBountyHunterGame,
  packMeta as bountyHunterMeta,
  buildCatalog as bountyHunterBuild,
  itemCatalog as bountyHunterItems,
  bountyHunterMinimalRuleset,
} from '@ai-rpg-engine/starter-bounty-hunter';

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
  { meta: merchantMeta, buildCatalog: merchantBuild, itemCatalog: merchantItems, ruleset: merchantMinimalRuleset, createGame: createMerchantGame },
  { meta: bountyHunterMeta, buildCatalog: bountyHunterBuild, itemCatalog: bountyHunterItems, ruleset: bountyHunterMinimalRuleset, createGame: createBountyHunterGame },
];

export function getPackById(id: string): PackInfo | undefined {
  return allPacks.find((p) => p.meta.id === id);
}

/**
 * F-ef4a283d (SLATE-4) / Coordinator Brief contract #3: hoisted from
 * resolveWorldFlag's own inline map so cli-display (bin.ts) can build its
 * "valid worlds are: ..." error copy from the SAME source this module
 * resolves against, instead of hand-duplicating the list.
 */
export const WORLD_FLAG_MAP: Record<string, string> = {
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
  merchant: 'salt-road-ledger',
  'bounty-hunter': 'hue-and-cry',
};

/**
 * Map legacy --world names to pack IDs.
 *
 * F-ef4a283d / Coordinator Brief ruling R1: unknown --world handling
 * (structured error + exit 1) is decided pre-interactively in bin.ts
 * (cli-display's half). This module stays QUIET on an unknown name — no
 * console.warn here (removed; previously the only thing standing between
 * "unknown" and the ordinary menu was an easy-to-miss warn line above it).
 */
export function resolveWorldFlag(worldName: string): string | undefined {
  return WORLD_FLAG_MAP[worldName];
}
