// World Foundry: generate a world from a creative prompt

import { Engine } from '@ai-rpg-engine/core';
import type { ZoneState, EntityState, RulesetDefinition } from '@ai-rpg-engine/core';
import {
  traversalCore,
  statusCore,
  combatCore,
  createCognitionCore,
  createPerceptionFilter,
  createFactionCognition,
  createRumorPropagation,
  createDistrictCore,
  createBeliefProvenance,
  createObserverPresentation,
  createSimulationInspector,
  createEnvironmentCore,
  setBelief,
  getCognition,
} from '@ai-rpg-engine/modules';
import type { ClaudeClient } from '../claude-client.js';
import { WORLDGEN_SYSTEM, buildWorldGenPrompt } from '../prompts/world-gen.js';
import type { DebugLogger } from '../game/debug-logger.js';

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
  /** FT-BR-006: Generated quests from the LLM proposal. Stored here so callers can consume them.
   *  TODO: Wire quests into a proper quest journal / quest tracker system when the engine supports it. */
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
 * Generate a world from a creative prompt.
 * @param client - LLM client for structured generation
 * @param worldPrompt - Creative world description
 * @param seed - Optional deterministic seed for reproducible world generation.
 *               When omitted, a random seed is used.
 * @param opts.onAttempt - F-9da15f24: optional callback fired immediately before
 *               each RETRIED attempt (never the initial one), so a caller (e.g.
 *               bin.ts's spinner) can distinguish a validation/transient retry
 *               from one slow call. Omitted by every current caller -- behavior
 *               is unchanged when absent.
 * @param opts.logger - F-e23cc3ac: optional structured logger (src/game/debug-logger.ts).
 *               When provided (and enabled), the routine LLM-variance diagnostics
 *               below (missing NPC stats, resolved id collisions, skipped
 *               malformed NPCs, etc.) are recorded through it instead of printing
 *               unconditionally, mirroring immersion-runtime.ts's debugMode gating
 *               in this same domain. Omitted entirely, a normal (non-debug) run
 *               stays silent on these expected, already-handled cases.
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
      engine: null,
      proposal: attemptProposal,
      tone: attemptProposal?.toneGuide ?? '',
      errors: allErrors,
      errorKind,
      quests: attemptProposal?.quests ?? [],
    };
  }

  const proposal = attemptProposal;

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

  // Instantiate engine
  const engine = new Engine({
    manifest: {
      id: proposal.title.toLowerCase().replace(/\s+/g, '-'),
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
    seed: seed ?? Math.floor(Math.random() * 100000),
    ruleset,
    modules: [
      traversalCore,
      statusCore,
      combatCore,
      createCognitionCore({
        decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 },
      }),
      createPerceptionFilter(),
      createEnvironmentCore({
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
      }),
      createFactionCognition({
        factions: proposal.factions.map((f) => ({
          factionId: f.id,
          entityIds: f.memberIds,
          cohesion: 0.7,
        })),
      }),
      createRumorPropagation({ propagationDelay: 2 }),
      // F-d907f10e: registered with ZERO district definitions, unlike every
      // sibling module in this construction block, which is fully configured
      // from the LLM world-gen proposal. Deliberately unfed, not an
      // oversight-in-waiting: no module registered in this list depends on
      // district-core (checked dependsOn on all of them -- only district-core
      // itself declares one, ['environment-core'], and nothing declares a
      // reverse dependency on district-core), so nothing here structurally
      // requires its presence. Effect, verified against ai-rpg-engine
      // packages/modules/src/district-core.ts: the world.zone.entered handler
      // (lines 176-184) returns early because state.definitions is empty, and
      // processDistrictTick's own loop (lines 337-342) iterates
      // state.districts, which is always {} -- dead by construction. Its two
      // resolveEntityFaction call sites (district-core.ts:191 intruder-
      // likelihood, :380 surveillance count) are therefore unreachable in
      // every world this file generates today. Feeding it (e.g. deriving
      // districts from proposal zone tags or faction territory) or removing
      // the registration outright is a Director-gated design decision, not
      // resolved here.
      createDistrictCore({ districts: [] }),
      createBeliefProvenance(),
      createObserverPresentation({ rules: [] }),
      createSimulationInspector(),
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

  return {
    ok: true,
    engine,
    proposal,
    tone: proposal.toneGuide ?? '',
    errors: [],
    // FT-BR-006: Preserve generated quests so callers can consume them
    quests: proposal.quests ?? [],
  };
}
