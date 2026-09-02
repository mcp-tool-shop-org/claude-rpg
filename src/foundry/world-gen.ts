// World Foundry: generate a world from a creative prompt

import { Engine } from '@ai-rpg-engine/core';
import type { ZoneState, EntityState, RulesetDefinition } from '@ai-rpg-engine/core';
import {
  traversalCore,
  statusCore,
  combatCore,
  createCognitionCore,
  createDialogueCore,
  createPerceptionFilter,
  createSimulationInspector,
  buildWorldStack,
  validateQuestRuntimeContent,
  setBelief,
  getCognition,
} from '@ai-rpg-engine/modules';
import type {
  FactionMembership,
  DistrictDefinition,
  EncounterSpawnContent,
  EncounterParticipant,
} from '@ai-rpg-engine/modules';
import { validateQuestDefinition } from '@ai-rpg-engine/content-schema';
import type { QuestDefinition } from '@ai-rpg-engine/content-schema';
import type { ClaudeClient } from '../claude-client.js';
import { WORLDGEN_SYSTEM, buildWorldGenPrompt } from '../prompts/world-gen.js';
import type { DebugLogger } from '../game/debug-logger.js';

/**
 * WO-A1-2 (slice A1, §2): the union of economy-core.ts's GENRE_SUPPLY_DEFAULTS
 * keys and pressure-system.ts's evaluateGenreRules switch cases, read from the
 * installed 3.11 dist at implementation time (neither table is exported at
 * runtime -- both are module-local consts/switches -- so this is a hand copy
 * pinned by a test that reads the same dist files' source text, not
 * re-derived from memory). An unknown value is dropped with a warn at the
 * call site below; the world still boots on engine defaults (lock 2/3,
 * ADDENDUM-COMMON.md).
 */
export const KNOWN_WORLDGEN_GENRES: ReadonlySet<string> = new Set([
  'colony',
  'cyberpunk',
  'detective',
  'fantasy',
  'horror',
  'merchant',
  'mystery',
  'pirate',
  'post-apocalyptic',
  'weird-west',
  'zombie',
]);

export type WorldGenProposal = {
  title: string;
  theme: string;
  toneGuide: string;
  ruleset: {
    id: string;
    name: string;
    stats: Array<{ id: string; name: string; default: number }>;
    resources: Array<{ id: string; name: string; default: number; max?: number }>;
  };
  zones: Array<{
    id: string;
    roomId: string;
    name: string;
    tags: string[];
    neighbors: string[];
    light: number;
    noise?: number;
    hazards?: string[];
    interactables?: string[];
  }>;
  factions: Array<{
    id: string;
    name: string;
    disposition: string;
    description: string;
    memberIds: string[];
  }>;
  npcs: Array<{
    id: string;
    name: string;
    type: string;
    tags: string[];
    zoneId: string;
    personality: string;
    goals: string[];
    stats: Record<string, number>;
    resources: Record<string, number>;
    beliefs: Array<{
      subject: string;
      key: string;
      value: string | number | boolean;
      confidence: number;
    }>;
  }>;
  player: {
    name: string;
    stats: Record<string, number>;
    resources: Record<string, number>;
    startZoneId: string;
  };
  quests: Array<{
    id: string;
    name: string;
    description: string;
    stages: Array<{ id: string; description: string }>;
  }>;
  /**
   * WO-A1-2 (§2): buyable-stock/starting-supply/crafting genre passthrough --
   * validated against KNOWN_WORLDGEN_GENRES above. Optional so every existing
   * fixture and every LLM reply that omits it stays valid (lock 2); an
   * unknown value is dropped with a warn, never a validation error.
   */
  genre?: string;
  /**
   * WO-A1-2 (§2): district definitions. Optional -- when omitted, generateWorld
   * derives one district per zone (see mapDistrictsFromProposal below).
   */
  districts?: Array<{
    id: string;
    name: string;
    zoneIds: string[];
    tags: string[];
    controllingFaction?: string;
  }>;
  /**
   * WO-A1-2 (§2): encounter content. Optional -- when omitted (or when every
   * authored encounter fails validation), no encounter-spawn module joins the
   * world stack (buildWorldStack's own presence-optional contract).
   */
  encounters?: Array<{
    id: string;
    name: string;
    zoneIds: string[];
    hostiles: Array<{ npcId: string; count?: number }>;
  }>;
};

/**
 * F-cbc186cb: distinguishes generateWorld's two failure classes so a caller (e.g.
 * bin.ts's runNew()) can offer a next-action hint instead of dumping raw shape-check
 * strings. 'transient' means the LLM call itself didn't produce usable JSON this
 * attempt (retrying the identical prompt may succeed). 'validation' means it returned
 * parseable JSON that fails validateWorldGenProposal's shape checks (e.g. a faction
 * missing memberIds) -- also frequently transient in practice (structured-generation
 * completeness is stochastic per attempt), but named distinctly since the underlying
 * cause differs.
 */
export type WorldGenErrorKind = 'transient' | 'validation';

/**
 * F-9da15f24: passed to generateWorld's optional `onAttempt` callback, shape
 * mirroring ClaudeClient.generateStream's onStreamReset (claude-client.ts:
 * `{attempt, maxAttempts, kind, delayMs}`, minus delayMs -- this loop has no
 * inter-attempt delay of its own to report). `kind` is the errorKind of the
 * attempt that just failed, i.e. the reason THIS retry is happening.
 */
export type WorldGenAttemptInfo = {
  attempt: number;
  maxAttempts: number;
  kind: WorldGenErrorKind;
};

export type WorldGenResult = {
  ok: boolean;
  engine: Engine | null;
  proposal: WorldGenProposal | null;
  tone: string;
  errors: string[];
  /** F-cbc186cb: which failure class `errors` came from. Undefined when ok is true. */
  errorKind?: WorldGenErrorKind;
  /**
   * WO-A4-6 (slice A4, §4): the seed the world WAS (or would have been, on a
   * failed attempt) instantiated with -- resolved once by `generateWorld`
   * before the LLM call (`seed ?? Math.floor(Math.random() * 100000)`, moved
   * out of `instantiateWorld` so a caller resolving its own seed, e.g. a
   * resumed generated-world load, can reuse the saved one deterministically).
   * Present on both branches: a caller building the `SavedSession.worldSeed`
   * field for a fresh game (runNew, game-core/cli-display territory) needs it
   * whether or not this particular generation attempt succeeded.
   */
  seed: number;
  /**
   * FT-BR-006: Generated quests from the LLM proposal, in the RAW proposal
   * shape (callers already consume this shape -- kept stable, additive
   * only). WO-A1-3 (§3): this is no longer the only place quests live -- a
   * validated subset (each mapped through validateQuestDefinition, invalid
   * ones dropped with a warn) is ALSO wired into the engine itself via
   * buildWorldStack's `quests` config, so `createQuestCore`'s runtime (offer/
   * advance/complete events, journal reads) is live for a generated world's
   * `world.meta.gameId`, not merely returned for a caller to render once.
   */
  quests: WorldGenProposal['quests'];
};

// F-840c1a1c: title/toneGuide and every zone/npc/faction .name are pure LLM
// creative-generation output (prompts/world-gen.ts's WORLDGEN_SYSTEM has no schema
// enforcement beyond `"name": "string"`), and every one of these fields previously had
// at most a truthy presence check (`if (!x)`) -- a check that a whitespace-only LLM
// output like "   " silently passes, since non-empty whitespace is truthy in JS.
// Nothing capped length either. The immediate consumer is the literal first screen a
// player sees after any LLM-generated world: play-renderer.ts's renderWelcome() frames
// title/toneGuide between two terminal-width-clamped divider rules while the
// title/tone line itself is neither wrapped nor truncated, so an overlong or blank LLM
// name breaks that framed layout on first impression. The same title is also echoed at
// bin.ts's "World ... created!" message, and unbounded npc names reach
// companion-bridge.ts's recruitment error prose -- both already protected transitively
// by rejecting a bad name here, before generateWorld ever constructs the engine.
const MAX_NAME_LENGTH = 80;

/**
 * Push a blank/whitespace-only or over-length error for one name-shaped field, in
 * addition to (never instead of) each call site's own presence check above. Presence
 * (`if (!x)`) and blankness (`if (!x.trim())`) are deliberately kept as separate
 * checks with distinct messages -- collapsing them would either lose the existing
 * "missing required field" wording other tests already assert on, or let a
 * whitespace-only value read as "missing" when it is actually present-but-garbage.
 */
function pushNameFieldErrors(errors: string[], value: string, label: string): void {
  if (!value.trim()) {
    errors.push(`${label} must not be blank or whitespace-only`);
  } else if (value.length > MAX_NAME_LENGTH) {
    errors.push(`${label} exceeds ${MAX_NAME_LENGTH} characters`);
  }
}

/** Validate that a WorldGenProposal has the required structure. Returns error strings. */
export function validateWorldGenProposal(proposal: WorldGenProposal): string[] {
  const errors: string[] = [];

  // Validate basic structure
  // F-840c1a1c: title had no presence check at all before this -- generateWorld
  // dereferences proposal.title.toLowerCase() unconditionally to build the engine
  // manifest id, so a missing title must be caught here rather than throwing a raw
  // TypeError, mirroring the existing "No X generated" checks below.
  if (!proposal.title) {
    errors.push('No title generated');
  } else {
    pushNameFieldErrors(errors, proposal.title, 'Title');
  }
  // toneGuide stays optional (WorldGenResult falls back to `proposal.toneGuide ?? ''`
  // in both branches below) -- only guard it when present, so a genuinely omitted
  // toneGuide keeps behaving exactly as before this fix.
  if (proposal.toneGuide) pushNameFieldErrors(errors, proposal.toneGuide, 'toneGuide');
  if (!proposal.zones?.length) errors.push('No zones generated');
  if (!proposal.npcs?.length) errors.push('No NPCs generated');
  if (!proposal.factions?.length) errors.push('No factions generated');
  if (!proposal.player) errors.push('No player generated');
  if (!proposal.ruleset) errors.push('No ruleset generated');

  // Validate NPC required fields
  if (proposal.npcs) {
    const zoneIds = new Set((proposal.zones ?? []).map((z) => z.id));
    for (const npc of proposal.npcs) {
      if (!npc.id) errors.push(`NPC missing required field: id`);
      if (!npc.name) {
        errors.push(`NPC "${npc.id ?? '?'}" missing required field: name`);
      } else {
        pushNameFieldErrors(errors, npc.name, `NPC "${npc.id ?? '?'}" name`);
      }
      if (!npc.zoneId) errors.push(`NPC "${npc.id ?? '?'}" missing required field: zoneId`);
      else if (!zoneIds.has(npc.zoneId)) errors.push(`NPC "${npc.id}" has zoneId "${npc.zoneId}" that does not match any zone`);
    }
  }

  // Validate zone required fields
  if (proposal.zones) {
    for (const zone of proposal.zones) {
      if (!zone.id) errors.push('Zone missing required field: id');
      if (!zone.name) {
        errors.push(`Zone "${zone.id ?? '?'}" missing required field: name`);
      } else {
        pushNameFieldErrors(errors, zone.name, `Zone "${zone.id ?? '?'}" name`);
      }
    }
  }

  // Validate faction required fields (F-dd5436c0). memberIds feeds
  // createFactionCognition eagerly and synchronously while the Engine's `modules: [...]`
  // array is being built, BEFORE `new Engine(...)` itself runs -- the compiled module
  // factory does `[...faction.entityIds]` / `for (const id of faction.entityIds)` with no
  // guard, so a faction whose memberIds is missing/non-array throws
  // "entityIds is not iterable" before any zone, player, or NPC entity has been added.
  // Empty memberIds is fine (a faction with no members yet); missing/non-array is not.
  if (proposal.factions) {
    for (const faction of proposal.factions) {
      if (!faction.id) errors.push('Faction missing required field: id');
      // F-840c1a1c: faction.name previously had NO check at all (unlike its zone/npc
      // siblings) -- added here so it gets the same "missing" + blank/length coverage.
      if (!faction.name) {
        errors.push(`Faction "${faction.id ?? '?'}" missing required field: name`);
      } else {
        pushNameFieldErrors(errors, faction.name, `Faction "${faction.id ?? '?'}" name`);
      }
      if (!Array.isArray(faction.memberIds)) {
        errors.push(`Faction "${faction.id ?? '?'}" missing required field: memberIds`);
      }
    }
  }

  // Validate ruleset required fields (F-d68e103d). Immediately after this function
  // returns zero errors, ruleset construction dereferences proposal.ruleset
  // unconditionally (proposal.ruleset.id/.name/.stats.map(...)/.resources.map(...)) to
  // build the Engine's RulesetDefinition -- generateStructured casts the LLM's JSON to
  // WorldGenProposal with no runtime validation of its own, so a truncated/malformed
  // proposal that omits ruleset (or omits its stats/resources) must be caught here
  // instead of throwing a raw TypeError during Engine construction.
  if (proposal.ruleset) {
    if (!proposal.ruleset.id) errors.push('Ruleset missing required field: id');
    if (!proposal.ruleset.name) errors.push('Ruleset missing required field: name');
    if (!Array.isArray(proposal.ruleset.stats)) errors.push('Ruleset missing required field: stats');
    if (!Array.isArray(proposal.ruleset.resources)) errors.push('Ruleset missing required field: resources');
  }

  // Validate player startZoneId references a real zone
  if (proposal.player) {
    const zoneIds = new Set((proposal.zones ?? []).map((z) => z.id));
    if (!proposal.player.startZoneId) {
      errors.push('Player missing required field: startZoneId');
    } else if (!zoneIds.has(proposal.player.startZoneId)) {
      errors.push(`Player startZoneId "${proposal.player.startZoneId}" does not match any zone`);
    }
  }

  return errors;
}

/**
 * WO-A1-2 (§2): validate proposal.genre against KNOWN_WORLDGEN_GENRES.
 * Warn-and-drop, never fatal (lock 3, ADDENDUM-COMMON.md) -- an unknown or
 * absent genre resolves to `undefined`, which every buildWorldStack genre
 * passthrough (economyGenre/tradeGenre/craftingGenre) treats as "use the
 * universal/default table only", not an error.
 */
function validateGenre(genre: string | undefined, logger?: DebugLogger): string | undefined {
  if (!genre) return undefined;
  if (!KNOWN_WORLDGEN_GENRES.has(genre)) {
    logger?.warn('world-gen', `Unknown genre "${genre}" -- world boots on engine defaults`, { genre });
    return undefined;
  }
  return genre;
}

/**
 * WO-A1-2 (§2): the faction with the most members placed in `zoneId`, for the
 * one-district-per-zone derivation fallback below. "Placed in the zone" means
 * an NPC whose own zoneId matches AND whose id is named in the faction's
 * memberIds. Ties resolve to whichever faction appears first in
 * `proposal.factions` (strict `>` below never lets a later, equal-count
 * faction displace an earlier one) -- deterministic, not written to
 * discriminate a "correct" tie-break the design doc does not specify one for.
 */
function deriveControllingFactionForZone(proposal: WorldGenProposal, zoneId: string): string | undefined {
  const npcIdsInZone = new Set(proposal.npcs.filter((n) => n.zoneId === zoneId).map((n) => n.id));
  if (npcIdsInZone.size === 0) return undefined;

  let best: { factionId: string; count: number } | undefined;
  for (const faction of proposal.factions) {
    const count = faction.memberIds.filter((id) => npcIdsInZone.has(id)).length;
    if (count > 0 && (!best || count > best.count)) {
      best = { factionId: faction.id, count };
    }
  }
  return best?.factionId;
}

/**
 * WO-A1-2 (§2): map proposal.districts -> DistrictDefinition[], or derive one
 * district per zone when the proposal authored none. Warn-and-drop semantics
 * throughout (lock 3): an authored district naming an unknown zoneId has that
 * zoneId dropped (not the whole district, unless every zoneId was unknown); an
 * authored district naming an unknown controllingFaction has just that field
 * cleared. Never throws, never fails world creation.
 */
function mapDistrictsFromProposal(proposal: WorldGenProposal, logger?: DebugLogger): DistrictDefinition[] {
  const zoneIds = new Set(proposal.zones.map((z) => z.id));
  const factionIds = new Set(proposal.factions.map((f) => f.id));

  if (proposal.districts && proposal.districts.length > 0) {
    const districts: DistrictDefinition[] = [];
    for (const district of proposal.districts) {
      const validZoneIds = district.zoneIds.filter((zoneId) => {
        const known = zoneIds.has(zoneId);
        if (!known) {
          logger?.warn('world-gen', `District "${district.id}" references unknown zone "${zoneId}" -- dropped`, {
            districtId: district.id,
            zoneId,
          });
        }
        return known;
      });
      if (validZoneIds.length === 0) {
        logger?.warn('world-gen', `District "${district.id}" has no valid zones after validation -- dropped`, {
          districtId: district.id,
        });
        continue;
      }

      let controllingFaction = district.controllingFaction;
      if (controllingFaction && !factionIds.has(controllingFaction)) {
        logger?.warn(
          'world-gen',
          `District "${district.id}" references unknown controllingFaction "${controllingFaction}" -- dropped`,
          { districtId: district.id, controllingFaction },
        );
        controllingFaction = undefined;
      }

      districts.push({
        id: district.id,
        name: district.name,
        zoneIds: validZoneIds,
        tags: district.tags,
        ...(controllingFaction ? { controllingFaction } : {}),
      });
    }
    return districts;
  }

  // Derivation fallback (§2): a generated world without districts is the
  // dead district-core this slice retires -- one district per zone, so the
  // economy/mood/safety systems have somewhere to move.
  return proposal.zones.map((zone) => {
    const controllingFaction = deriveControllingFactionForZone(proposal, zone.id);
    return {
      id: zone.id,
      name: zone.name,
      zoneIds: [zone.id],
      tags: zone.tags,
      ...(controllingFaction ? { controllingFaction } : {}),
    };
  });
}

/**
 * WO-A1-2 (§2): map proposal.encounters -> EncounterSpawnContent, mirroring
 * starter-fantasy's encounterSpawnContent shape (content.ts) and
 * encounter-spawn.ts's own documented content shape. Returns undefined when
 * the proposal authored no encounters, or when every authored encounter
 * failed validation -- buildWorldStack only registers encounter-spawn when
 * `encounterSpawn` is present (presence-optional, world-stack.ts).
 *
 * Validation is per-encounter, warn-and-drop (lock 3): an encounter with no
 * valid zoneIds, no hostiles, or whose hostiles name no valid enemy-type NPC
 * is dropped whole rather than aborting the whole encounters list.
 */
function mapEncountersFromProposal(proposal: WorldGenProposal, logger?: DebugLogger): EncounterSpawnContent | undefined {
  const proposedEncounters = proposal.encounters;
  if (!proposedEncounters || proposedEncounters.length === 0) return undefined;

  const zoneIds = new Set(proposal.zones.map((z) => z.id));
  const npcById = new Map(proposal.npcs.map((n) => [n.id, n]));

  const encounters: EncounterSpawnContent['encounters'] = [];
  const entityTemplatesById = new Map<string, EntityState>();
  const zoneTables: Record<string, string[]> = {};

  for (const encounter of proposedEncounters) {
    const validZoneIds = (encounter.zoneIds ?? []).filter((zoneId) => zoneIds.has(zoneId));
    if (validZoneIds.length === 0) {
      logger?.warn('world-gen', `Encounter "${encounter.id}" has no valid zoneIds -- dropped`, {
        encounterId: encounter.id,
      });
      continue;
    }

    const participants: EncounterParticipant[] = [];
    for (const hostile of encounter.hostiles ?? []) {
      const npc = npcById.get(hostile.npcId);
      if (!npc || npc.type !== 'enemy') {
        logger?.warn(
          'world-gen',
          `Encounter "${encounter.id}" hostile "${hostile.npcId}" does not name a proposal NPC of type "enemy" -- skipped`,
          { encounterId: encounter.id, npcId: hostile.npcId },
        );
        continue;
      }
      if (!entityTemplatesById.has(npc.id)) {
        // WO-A1-2: clone the proposal NPC's own shape (stats/resources/tags)
        // into an entityTemplate, tagged 'hostile' and typed 'enemy' -- the
        // spawn system clones a FRESH deterministic id off this template at
        // spawn time (encounter-spawn.d.ts's own EncounterSpawnContent doc
        // comment), so the authored instance here is never itself placed.
        entityTemplatesById.set(npc.id, {
          id: npc.id,
          blueprintId: npc.id,
          type: 'enemy',
          name: npc.name,
          tags: [...(npc.tags ?? []), 'hostile'],
          stats: npc.stats ?? {},
          resources: npc.resources ?? {},
          statuses: [],
        });
      }
      const count = hostile.count ?? 1;
      for (let i = 0; i < count; i++) {
        participants.push({ entityId: npc.id });
      }
    }

    if (participants.length === 0) {
      logger?.warn('world-gen', `Encounter "${encounter.id}" has no valid hostiles after validation -- dropped`, {
        encounterId: encounter.id,
      });
      continue;
    }

    encounters.push({ id: encounter.id, name: encounter.name, participants });
    // §2: repetition = weight; list once per zone (the hostile `count` loop
    // above is where repetition already lives -- zoneTables is not a second
    // weighting axis).
    for (const zoneId of validZoneIds) {
      (zoneTables[zoneId] ??= []).push(encounter.id);
    }
  }

  if (encounters.length === 0) return undefined;

  return { encounters, entityTemplates: [...entityTemplatesById.values()], zoneTables };
}

/**
 * WO-A1-3 (§3): the proposal stage type carries no `name` field at all (only
 * `id`/`description`) -- QuestStage.name is REQUIRED by the engine's schema,
 * so a name is always synthesized here from the description: the first
 * clause (text up to the first `.`/`!`/`?`/`;`, matching how a title reads
 * naturally as the sentence's opening thought), truncated to
 * MAX_QUEST_STAGE_NAME_LENGTH.
 */
const MAX_QUEST_STAGE_NAME_LENGTH = 60;

function deriveQuestStageName(description: string): string {
  const clauseMatch = description.match(/^[^.!?;]+/);
  const clause = (clauseMatch ? clauseMatch[0] : description).trim();
  return clause.length > MAX_QUEST_STAGE_NAME_LENGTH
    ? clause.slice(0, MAX_QUEST_STAGE_NAME_LENGTH).trimEnd()
    : clause;
}

/**
 * WO-A1-3 (§3): map proposal.quests -> QuestDefinition[], validated before
 * anything is handed to createQuestCore, which is fail-loud by contract
 * (THROWS on any problem) -- a quest that fails is dropped with a
 * logger?.warn naming the quest id and the first problem, and the world
 * still boots (lock 3).
 *
 * HONESTY FLOOR (ADDENDUM-COMMON.md): §3 names only validateQuestDefinition
 * (content-schema's SHAPE check) as the pre-construction gate, and says "No
 * triggers/rewards/failConditions" are authored. Against the installed 3.11
 * dist that is incomplete: createQuestCore (quest-core.ts:683, verified by a
 * live throw during this wave's own test run) ALSO runs
 * validateQuestRuntimeContent internally and THROWS "needs at least one
 * quest-level trigger (the offer surface)" for any quest with zero
 * quest-level triggers -- which EVERY quest mapped per §3's own "no
 * triggers" instruction always has zero of. Pre-validating with
 * validateQuestDefinition alone is therefore not sufficient to satisfy lock
 * 3 ("never let content kill world creation") -- it lets a quest through
 * that createQuestCore then throws on, uncaught, inside buildWorldStack.
 * This function runs BOTH checks (validateQuestDefinition, then
 * validateQuestRuntimeContent -- the same order createQuestCore itself
 * uses) before a quest is ever handed to buildWorldStack, so the fail-loud
 * contract never fires on content built here. The honest consequence: since
 * this slice authors no quest-level triggers (§3, and no proposal field
 * exists to carry one -- WorldGenProposal['quests'][number] has no
 * `triggers`), every mapped quest currently fails the runtime check and is
 * dropped with a warning naming exactly that reason; the world still boots
 * (ok:true). Authoring quest-level triggers (and the proposal field/prompt
 * support to carry them) is follow-up scope this wave does not claim.
 */
function mapQuestsFromProposal(proposal: WorldGenProposal, logger?: DebugLogger): QuestDefinition[] {
  const quests: QuestDefinition[] = [];
  for (const quest of proposal.quests ?? []) {
    const mapped: QuestDefinition = {
      id: quest.id,
      name: quest.name,
      // Coordinator stitch (slice A1, run swarm-1788288802-f5a0 wave 3): the
      // engine's runtime validation (quest-core.ts validateQuestRuntimeContent)
      // rejects a quest with no quest-level trigger -- "a quest with no offer
      // trigger can never enter play". The proposal authors no triggers, so
      // without this every generated quest was warn-dropped and R2's "quests
      // stop being decorative" silently failed (the composed floor caught it:
      // WO-A1-9 red after merge). The default offer surface is the player's
      // starting zone: claude-rpg emits world.zone.entered for it on every
      // fresh boot (src/cli/boot-zone-entry.ts), so the quest is offered the
      // moment the world opens -- the same trigger shape starter-fantasy's
      // authored quests use. Stage triggers stay unauthored (a stage without
      // an advance trigger is offered and waits); slice A5 deepens them.
      triggers: [
        {
          event: 'world.zone.entered',
          condition: {
            type: 'payload-equals',
            params: { key: 'zoneId', value: proposal.player.startZoneId },
          },
          effect: { type: 'offer', params: {} },
        },
      ],
      stages: (quest.stages ?? []).map((stage) => ({
        id: stage.id,
        name: deriveQuestStageName(stage.description),
        description: stage.description,
        objectives: [stage.description],
      })),
    };

    const shapeValidation = validateQuestDefinition(mapped);
    if (!shapeValidation.ok) {
      logger?.warn(
        'world-gen',
        `Quest "${quest.id}" failed shape validation -- dropped: ${shapeValidation.errors[0]?.message ?? 'unknown problem'}`,
        { questId: quest.id, errors: shapeValidation.errors },
      );
      continue;
    }

    // HONESTY FLOOR above: createQuestCore's OWN second validation pass,
    // replicated here so its fail-loud throw never reaches buildWorldStack.
    const runtimeProblems = validateQuestRuntimeContent([mapped]);
    if (runtimeProblems.length > 0) {
      logger?.warn('world-gen', `Quest "${quest.id}" failed runtime validation -- dropped: ${runtimeProblems[0]}`, {
        questId: quest.id,
        problems: runtimeProblems,
      });
      continue;
    }

    quests.push(mapped);
  }
  return quests;
}

/**
 * WO-A4-6 (slice A4, §4): the LLM half of `generateWorld` -- prompt build,
 * structured call, shape validation, retries -- everything up to a validated
 * `WorldGenProposal`. Split out of `generateWorld` (behavior-preserving: the
 * retry loop, error accumulation, and errorKind discriminant below are
 * byte-identical to what `generateWorld` ran inline before this slice) so a
 * caller resuming a generated world from a saved proposal (cli-display's
 * `runLoad`, doc §4) never needs an LLM client at all -- it goes straight to
 * `instantiateWorld` with the proposal it already has.
 */
export type WorldGenProposalResult = {
  ok: boolean;
  proposal: WorldGenProposal | null;
  tone: string;
  errors: string[];
  /** F-cbc186cb: which failure class `errors` came from. Undefined when ok is true. */
  errorKind?: WorldGenErrorKind;
  /** FT-BR-006: raw proposal quest shape (see WorldGenResult.quests doc). */
  quests: WorldGenProposal['quests'];
};

/**
 * Generate (and validate) a world proposal from a creative prompt. The LLM
 * half of `generateWorld` -- see `instantiateWorld` for the engine
 * construction half and `generateWorld` for the composition of the two.
 * @param client - LLM client for structured generation
 * @param worldPrompt - Creative world description
 * @param opts.onAttempt - F-9da15f24: optional callback fired immediately before
 *               each RETRIED attempt (never the initial one), so a caller (e.g.
 *               bin.ts's spinner) can distinguish a validation/transient retry
 *               from one slow call. Omitted by every current caller -- behavior
 *               is unchanged when absent.
 */
export async function proposeWorld(
  client: ClaudeClient,
  worldPrompt: string,
  opts?: {
    onAttempt?: (info: WorldGenAttemptInfo) => void;
  },
): Promise<WorldGenProposalResult> {
  const { onAttempt } = opts ?? {};
  const prompt = buildWorldGenPrompt(worldPrompt);

  // F-cbc186cb: generate-plus-validate is retried internally before surfacing anything
  // to the player. Both failure classes below are largely stochastic per attempt --
  // generateStructured's fixed 4096-token budget covers
  // title/theme/ruleset/zones/factions/npcs/player/quests in a single completion, so a
  // dropped field (e.g. a faction's memberIds) is a sampling artifact of that one
  // attempt, not a property of worldPrompt itself. Mirrors the "retryable failure
  // kinds get retried" convention llm/claude-adapter.ts's withRetry already applies
  // one layer down, for transport-level failures (rate-limit/timeout/transport) -- this
  // loop covers the layer above it: a structurally fine HTTP response whose JSON
  // payload is incomplete or fails this module's own shape checks, which withRetry has
  // no visibility into. A thrown NarrationError (e.g. auth/bad-request) is
  // deliberately NOT caught here and propagates unchanged: retrying can never fix
  // those (see claude-errors.ts's fatal-error contract, F-6480985e), so swallowing one
  // into a generic "transient, try again" result would be actively misleading.
  const MAX_ATTEMPTS = 3;
  let attemptProposal: WorldGenProposal | null = null;
  let errors: string[] = [];
  let errorKind: WorldGenErrorKind = 'transient';
  // F-9da15f24: accumulate (not overwrite) errors across attempts, deduped in
  // insertion order, so a final failure report after e.g. attempt 1 failing
  // shape validation for reason A and attempt 2 failing for a DIFFERENT
  // reason B shows both -- previously `errors` was reassigned each iteration,
  // so only the LAST attempt's reasons ever reached the player, with nothing
  // indicating 3 separate generations were even attempted.
  const allErrors: string[] = [];
  const pushErrors = (attemptErrors: string[]): void => {
    for (const e of attemptErrors) {
      if (!allErrors.includes(e)) allErrors.push(e);
    }
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      // F-9da15f24: fired only immediately before a RETRIED attempt (never the
      // initial one), mirroring generateStream's onStreamReset timing/shape
      // (claude-client.ts) -- `kind` is the errorKind the PRECEDING attempt
      // just failed with, so a caller's spinner can show "retrying (invalid
      // response)" instead of leaving an unchanging "thinking" label across
      // what is silently a second or third LLM call.
      onAttempt?.({ attempt, maxAttempts: MAX_ATTEMPTS, kind: errorKind });
    }

    const result = await client.generateStructured<WorldGenProposal>({
      system: WORLDGEN_SYSTEM,
      prompt,
      maxTokens: 4096,
    });

    if (!result.ok || !result.data) {
      attemptProposal = null;
      errors = [result.error ?? 'Failed to generate world proposal'];
      errorKind = 'transient';
      pushErrors(errors);
      continue;
    }

    const shapeErrors = validateWorldGenProposal(result.data);
    if (shapeErrors.length > 0) {
      attemptProposal = result.data;
      errors = shapeErrors;
      errorKind = 'validation';
      pushErrors(errors);
      continue;
    }

    attemptProposal = result.data;
    errors = [];
    break;
  }

  if (errors.length > 0 || !attemptProposal) {
    return {
      ok: false,
      proposal: attemptProposal,
      tone: attemptProposal?.toneGuide ?? '',
      errors: allErrors,
      errorKind,
      quests: attemptProposal?.quests ?? [],
    };
  }

  return {
    ok: true,
    proposal: attemptProposal,
    tone: attemptProposal.toneGuide ?? '',
    errors: [],
    quests: attemptProposal.quests ?? [],
  };
}

/**
 * WO-A4-6 (slice A4, §4): the engine-construction half of `generateWorld` --
 * everything from ruleset assembly through the faction-cognition membership
 * reconciliation, moved intact (byte-identical) out of `generateWorld`'s
 * body. Exported so a caller can rebuild an engine from a proposal it already
 * has validated (a resumed generated-world load, doc §4) without an LLM
 * client. Takes the ALREADY-RESOLVED seed the world is to be built with --
 * the `seed ?? Math.floor(Math.random() * 100000)` fallback that used to live
 * here moved OUTSIDE, into `generateWorld`, so a resumed world can pass the
 * saved seed straight through instead of this function silently drawing a
 * new random one.
 * @param proposal - a validated `WorldGenProposal` (e.g. from `proposeWorld`,
 *               or `JSON.parse`d from a `SavedSession.worldGenProposal`).
 * @param seed - the deterministic seed to construct the engine with.
 * @param logger - F-e23cc3ac: optional structured logger (src/game/debug-logger.ts).
 *               When provided (and enabled), the routine LLM-variance diagnostics
 *               below (missing NPC stats, resolved id collisions, skipped
 *               malformed NPCs, etc.) are recorded through it instead of printing
 *               unconditionally, mirroring immersion-runtime.ts's debugMode gating
 *               in this same domain. Omitted entirely, a normal (non-debug) run
 *               stays silent on these expected, already-handled cases.
 */
export function instantiateWorld(proposal: WorldGenProposal, seed: number, logger?: DebugLogger): Engine {
  // Build ruleset
  const ruleset: RulesetDefinition = {
    id: proposal.ruleset.id,
    name: proposal.ruleset.name,
    version: '1.0.0',
    stats: proposal.ruleset.stats.map((s) => ({
      id: s.id,
      name: s.name,
      min: 0,
      max: 100,
      default: s.default,
    })),
    resources: proposal.ruleset.resources.map((r) => ({
      id: r.id,
      name: r.name,
      min: 0,
      max: r.max ?? 100,
      default: r.default,
    })),
    verbs: [
      { id: 'move', name: 'Move' },
      { id: 'look', name: 'Look' },
      { id: 'attack', name: 'Attack' },
      { id: 'speak', name: 'Speak' },
      { id: 'use', name: 'Use' },
      { id: 'inspect', name: 'Inspect' },
    ],
    formulas: [],
    defaultModules: [],
    progressionModels: [],
  };

  // WO-A1-1 (§1): the manifest id both names the engine AND becomes
  // world.meta.gameId (core's Engine construction copies manifest.id
  // verbatim -- world.js:333) -- computed ONCE and threaded into
  // encounterSpawn/quests below so both registries key on the SAME id the
  // world actually boots under.
  const gameId = proposal.title.toLowerCase().replace(/\s+/g, '-');

  // WO-A1-1 (§1): the ONE faction roster that feeds BOTH faction-cognition
  // (cohesion) and defeat-fallout (membership only) inside buildWorldStack --
  // the SAME array the F-105a5718 remap reconciliation below reads
  // proposal.factions from, so nothing here can drift out of sync with it.
  const factionRoster: FactionMembership[] = proposal.factions.map((f) => ({
    factionId: f.id,
    entityIds: f.memberIds,
    cohesion: 0.7,
  }));

  const genre = validateGenre(proposal.genre, logger);
  const districts = mapDistrictsFromProposal(proposal, logger);
  const encounterSpawnContent = mapEncountersFromProposal(proposal, logger);
  const questDefinitions = mapQuestsFromProposal(proposal, logger);

  // WO-A1-1 (§1): buildWorldStack replaces the strategic tail this hand list
  // used to register module-by-module (environment-core, faction-cognition,
  // rumor-propagation, district-core, belief-provenance,
  // observer-presentation -- every one of them REMOVED from the modules
  // array below; a double registration throws at construction, which is
  // exactly what the parity sentinel in world-gen.test.ts proves). The
  // builder ALSO always includes economy-core/trade-core/companion-core/
  // npc-agency/faction-agency/player-leverage/crafting-core/
  // opportunity-core/defeat-fallout/world-tick -- modules a generated world
  // never registered before this slice (F-d907f10e's dead district-core is
  // retired the same way: fed real districts instead of `{ districts: [] }`).
  const worldStack = buildWorldStack({
    playerId: 'player',
    factions: factionRoster,
    environment: {
      hazards: proposal.zones
        .filter((z) => z.hazards && z.hazards.length > 0)
        .flatMap((z) =>
          (z.hazards ?? []).map((h) => ({
            id: `${z.id}-${h.replace(/\s+/g, '-')}`,
            triggerOn: 'world.zone.entered' as const,
            condition: (zone: ZoneState) => zone.id === z.id,
            // F-e57d6a60: this hazard mutates hp directly and returns no events, so
            // it is a second, independent death path alongside combat that the
            // runtime's death presentation used to miss entirely (it keyed
            // exclusively on combat.entity.defeated). That is NOT fixable by
            // changing this return value: environment-core.js's checkHazard() calls
            // `hazard.effect(...)` for its side effect only and discards whatever it
            // returns (verified in
            // node_modules/@ai-rpg-engine/modules/dist/environment-core.js — the
            // effect callback also has no event-bus handle to push an event through
            // any other way; `world` here is a plain WorldState data bag, not the
            // WorldStore/EventBus). The actual fix lives in
            // src/runtime/hooks.ts's isPlayerAtZeroHp, which reads
            // world.entities[playerId].resources.hp directly instead of waiting for
            // an event this hazard has no way to deliver.
            effect: (_zone: ZoneState, entity: EntityState) => {
              entity.resources.hp = Math.max(0, (entity.resources.hp ?? 0) - 1);
              return [];
            },
          })),
        ),
    },
    rumors: { propagationDelay: 2 },
    districts,
    presentationRules: [],
    economyGenre: genre,
    tradeGenre: genre,
    craftingGenre: genre,
    ...(encounterSpawnContent ? { encounterSpawn: { gameId, ...encounterSpawnContent } } : {}),
    ...(questDefinitions.length > 0 ? { quests: { gameId, quests: questDefinitions } } : {}),
  });
  // §1: warnings are surfaced through the existing logger channel, never
  // thrown, never printed raw to the player (today: unspawnable
  // encounter-spawn zone-table entries from validateEncounterSpawnContent).
  for (const warning of worldStack.warnings) {
    logger?.warn('world-gen', warning);
  }

  // Instantiate engine
  const engine = new Engine({
    manifest: {
      id: gameId,
      title: proposal.title,
      version: '1.0.0',
      // F-f28c3098 (3.9 slice): a semver RANGE, per the engine's own
      // GameManifest.engineVersion doctrine (core/types.ts — a bare pinned
      // version hardcoded in an exporter is the drift anti-pattern its C0
      // incident documents). Not read by this direct-construction path
      // today; kept honest for anything that starts reading it.
      engineVersion: '>=3.9.0 <4.0.0',
      ruleset: ruleset.id,
      modules: [],
      contentPacks: [],
    },
    seed,
    ruleset,
    // WO-A1-1 (§1): traversal/status/combat/cognition-core/perception-filter/
    // simulation-inspector are the ONLY hand-listed modules left -- kept
    // ahead of the stack's modules per the stack's own prerequisite contract
    // (cognition-core + perception-filter must precede faction-cognition/
    // rumor-propagation/belief-provenance/observer-presentation, all inside
    // worldStack.modules).
    modules: [
      traversalCore,
      statusCore,
      combatCore,
      // Stitch (wave 7, surfaced by WO-A4-9's generated-world dialogue proof):
      // the `speak` verb is registered by dialogue-core, which every starter
      // pack composes and this path never did -- so a generated world listed
      // no speak action, the interpreter's fast path could not resolve
      // "talk to <npc>", and every talk turn fell through to the LLM
      // interpreter. Authored dialogues are a pack concern; generated worlds
      // get LLM dialogue app-side (turn-loop step 5), so the registry is empty.
      createDialogueCore([]),
      createCognitionCore({
        decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 },
      }),
      createPerceptionFilter(),
      createSimulationInspector(),
      ...worldStack.modules,
    ],
  });

  // Add zones
  for (const zone of proposal.zones) {
    engine.store.addZone({
      id: zone.id,
      roomId: zone.roomId,
      name: zone.name,
      tags: zone.tags,
      neighbors: zone.neighbors,
      light: zone.light,
      noise: zone.noise,
      hazards: zone.hazards,
      interactables: zone.interactables,
    });
  }

  // Add player entity
  const playerEntity: EntityState = {
    id: 'player',
    blueprintId: 'player',
    type: 'player',
    name: proposal.player.name,
    tags: ['player'],
    stats: proposal.player.stats,
    resources: proposal.player.resources,
    statuses: [],
    inventory: [],
    zoneId: proposal.player.startZoneId,
  };
  engine.store.addEntity(playerEntity);

  // Add NPCs — with collision guard and per-NPC error isolation
  const usedEntityIds = new Set<string>(Object.keys(engine.world.entities));
  // F-105a5718: tracks each NPC's original proposed id -> its actual final entityId, so
  // faction memberIds (captured into createFactionCognition's config above, BEFORE this
  // loop resolves PBR-007 collisions) can be reconciled afterward. Populated below from
  // the SAME entityId used for engine.store.addEntity, so it can't drift from reality.
  const npcIdRemap = new Map<string, string>();
  for (const npc of proposal.npcs) {
    try {
      // PBR-001: Defensive coercion for missing stats/resources
      // F-e23cc3ac: routine, already-handled LLM stochastic variance -- gated
      // behind the optional logger (mirroring immersion-runtime.ts's debugMode
      // convention in this same domain) instead of an unconditional
      // console.warn, so a normal (non-debug) player no longer sees raw
      // implementation-detail strings at the "World ... created!" moment.
      if (!npc.stats || typeof npc.stats !== 'object') {
        logger?.warn('world-gen', `NPC "${npc.id}" has missing/invalid stats — defaulting to {}`, { npcId: npc.id });
        npc.stats = {};
      }
      if (!npc.resources || typeof npc.resources !== 'object') {
        logger?.warn('world-gen', `NPC "${npc.id}" has missing/invalid resources — defaulting to {}`, { npcId: npc.id });
        npc.resources = {};
      }
      if (!npc.tags || !Array.isArray(npc.tags)) {
        npc.tags = [];
      }
      if (!npc.beliefs || !Array.isArray(npc.beliefs)) {
        npc.beliefs = [];
      }
      if (!npc.goals || !Array.isArray(npc.goals)) {
        npc.goals = [];
      }
      // Shape check: skip NPCs missing critical identity fields
      if (!npc.id || !npc.name || !npc.zoneId) {
        logger?.warn('world-gen', `Skipping NPC with missing identity fields: id="${npc.id}", name="${npc.name}", zoneId="${npc.zoneId}"`, {
          npcId: npc.id,
          npcName: npc.name,
          zoneId: npc.zoneId,
        });
        continue;
      }

      // PBR-007: Resolve colliding NPC IDs with numeric suffix
      let entityId = npc.id;
      if (usedEntityIds.has(entityId)) {
        let suffix = 2;
        while (usedEntityIds.has(`${npc.id}-${suffix}`)) suffix++;
        entityId = `${npc.id}-${suffix}`;
        logger?.warn('world-gen', `NPC ID collision: "${npc.id}" already exists. Using "${entityId}" instead.`, {
          originalId: npc.id,
          resolvedId: entityId,
        });
      }
      usedEntityIds.add(entityId);
      npcIdRemap.set(npc.id, entityId);

      const entity: EntityState = {
        id: entityId,
        blueprintId: entityId,
        type: npc.type,
        name: npc.name,
        tags: npc.tags,
        stats: npc.stats,
        resources: npc.resources,
        statuses: [],
        zoneId: npc.zoneId,
        ai: {
          profileId: npc.personality,
          goals: npc.goals,
          fears: [],
          alertLevel: 0,
          knowledge: {},
        },
      };
      engine.store.addEntity(entity);

      // Set initial beliefs
      for (const belief of npc.beliefs) {
        const cognition = getCognition(engine.world, entityId);
        if (cognition) {
          setBelief(
            cognition,
            belief.subject,
            belief.key,
            belief.value,
            belief.confidence,
            'initial',
            0,
          );
        } else {
          logger?.warn(
            'world-gen',
            `Cannot set belief for NPC "${entityId}": cognition not initialized. ` +
            `Belief "${belief.key}" on subject "${belief.subject}" was skipped.`,
            { entityId, subject: belief.subject, key: belief.key },
          );
        }
      }
    } catch (err) {
      logger?.warn('world-gen', `Failed to add NPC "${npc.id}": ${err instanceof Error ? err.message : String(err)}. Skipping.`, {
        npcId: npc.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Set player and location
  engine.store.state.playerId = 'player';
  engine.store.state.locationId = proposal.player.startZoneId;

  // Add factions to world state
  for (const faction of proposal.factions) {
    engine.store.state.factions[faction.id] = {
      id: faction.id,
      name: faction.name,
      reputation: 0,
      disposition: faction.disposition,
    };
  }

  // F-105a5718: reconcile faction cognition membership against final (post-collision) NPC
  // ids. createFactionCognition (passed into the Engine's modules array above) was
  // configured from each faction's raw, un-reconciled memberIds BEFORE this function's NPC
  // loop resolved PBR-007 id collisions, so any memberIds entry naming an id that got
  // suffixed above was left tracking a stray id instead of the entity's real final one.
  //
  // F-01b60e73: unlike every other fallible step in this function (the per-NPC loop
  // immediately above, the LLM generation+validation loop), this block had no failure
  // isolation of its own -- it reads/writes an inline shape cast from
  // engine.world.modules['faction-cognition'] with no exported engine type backing it
  // (@ai-rpg-engine/modules's faction-cognition.ts exports only READ accessors for this
  // state; verified no setter exists anywhere in that module). Byte-accurate against
  // today's engine, but a future engine version restructuring this internal, unversioned
  // module state would throw a raw TypeError here, uncaught by anything in this function,
  // discarding an otherwise-fully-built Engine plus every already-added zone/player/NPC.
  // Degrade the same way the per-NPC loop above does: warn and skip, don't abort.
  try {
    const factionCogState = engine.world.modules['faction-cognition'] as
      | { membership: Record<string, string>; factionMembers: Record<string, string[]> }
      | undefined;
    if (factionCogState && typeof factionCogState.factionMembers === 'object' && typeof factionCogState.membership === 'object') {
      for (const faction of proposal.factions) {
        const reconciledIds = faction.memberIds.map((id) => npcIdRemap.get(id) ?? id);
        factionCogState.factionMembers[faction.id] = reconciledIds;
        for (const entityId of reconciledIds) {
          factionCogState.membership[entityId] = faction.id;
        }
      }
    }
  } catch (err) {
    logger?.warn(
      'world-gen',
      `Failed to reconcile faction-cognition membership for factions ` +
      `[${proposal.factions.map((f) => f.id).join(', ')}]: ` +
      `${err instanceof Error ? err.message : String(err)}. Skipping reconciliation.`,
      { factionIds: proposal.factions.map((f) => f.id), error: err instanceof Error ? err.message : String(err) },
    );
  }

  return engine;
}

/**
 * Generate a world from a creative prompt. Composes `proposeWorld` (the LLM
 * half) and `instantiateWorld` (the engine-construction half) -- byte-
 * identical behavior to the pre-split single function (WO-A4-6, slice A4
 * §4): the seed fallback that used to run only after a successful proposal
 * now resolves up front so a failed attempt's `WorldGenResult.seed` is still
 * populated (a caller building `SavedSession.worldSeed`/`worldGenProposal`
 * for a fresh game needs the seed regardless of this attempt's outcome), but
 * this reordering changes nothing observable: the fallback only ever fires
 * when the caller omitted `seed` in the first place, in which case no test
 * or caller depends on which random value was drawn.
 * @param client - LLM client for structured generation
 * @param worldPrompt - Creative world description
 * @param seed - Optional deterministic seed for reproducible world generation.
 *               When omitted, a random seed is used.
 * @param opts.onAttempt - see `proposeWorld`.
 * @param opts.logger - see `instantiateWorld`.
 */
export async function generateWorld(
  client: ClaudeClient,
  worldPrompt: string,
  seed?: number,
  opts?: {
    onAttempt?: (info: WorldGenAttemptInfo) => void;
    logger?: DebugLogger;
  },
): Promise<WorldGenResult> {
  const { onAttempt, logger } = opts ?? {};
  const resolvedSeed = seed ?? Math.floor(Math.random() * 100000);

  const proposed = await proposeWorld(client, worldPrompt, { onAttempt });

  if (!proposed.ok || !proposed.proposal) {
    return {
      ok: false,
      engine: null,
      proposal: proposed.proposal,
      tone: proposed.tone,
      errors: proposed.errors,
      errorKind: proposed.errorKind,
      quests: proposed.quests,
      seed: resolvedSeed,
    };
  }

  const proposal = proposed.proposal;
  const engine = instantiateWorld(proposal, resolvedSeed, logger);

  return {
    ok: true,
    engine,
    proposal,
    tone: proposal.toneGuide ?? '',
    errors: [],
    // FT-BR-006: Preserve generated quests so callers can consume them
    quests: proposal.quests ?? [],
    seed: resolvedSeed,
  };
}
