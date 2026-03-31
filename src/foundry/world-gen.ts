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

export type WorldGenResult = {
  ok: boolean;
  engine: Engine | null;
  proposal: WorldGenProposal | null;
  tone: string;
  errors: string[];
};

/** Validate that a WorldGenProposal has the required structure. Returns error strings. */
export function validateWorldGenProposal(proposal: WorldGenProposal): string[] {
  const errors: string[] = [];

  // Validate basic structure
  if (!proposal.zones?.length) errors.push('No zones generated');
  if (!proposal.npcs?.length) errors.push('No NPCs generated');
  if (!proposal.factions?.length) errors.push('No factions generated');
  if (!proposal.player) errors.push('No player generated');

  // Validate NPC required fields
  if (proposal.npcs) {
    const zoneIds = new Set((proposal.zones ?? []).map((z) => z.id));
    for (const npc of proposal.npcs) {
      if (!npc.id) errors.push(`NPC missing required field: id`);
      if (!npc.name) errors.push(`NPC "${npc.id ?? '?'}" missing required field: name`);
      if (!npc.zoneId) errors.push(`NPC "${npc.id ?? '?'}" missing required field: zoneId`);
      else if (!zoneIds.has(npc.zoneId)) errors.push(`NPC "${npc.id}" has zoneId "${npc.zoneId}" that does not match any zone`);
    }
  }

  // Validate zone required fields
  if (proposal.zones) {
    for (const zone of proposal.zones) {
      if (!zone.id) errors.push('Zone missing required field: id');
      if (!zone.name) errors.push(`Zone "${zone.id ?? '?'}" missing required field: name`);
    }
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
 */
export async function generateWorld(
  client: ClaudeClient,
  worldPrompt: string,
  seed?: number,
): Promise<WorldGenResult> {
  const prompt = buildWorldGenPrompt(worldPrompt);

  // Generate world proposal
  const result = await client.generateStructured<WorldGenProposal>({
    system: WORLDGEN_SYSTEM,
    prompt,
    maxTokens: 4096,
  });

  if (!result.ok || !result.data) {
    return {
      ok: false,
      engine: null,
      proposal: null,
      tone: '',
      errors: [result.error ?? 'Failed to generate world proposal'],
    };
  }

  const proposal = result.data;
  const errors = validateWorldGenProposal(proposal);

  if (errors.length > 0) {
    return { ok: false, engine: null, proposal, tone: proposal.toneGuide ?? '', errors };
  }

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
      engineVersion: '2.0.0',
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

  // Add NPCs
  for (const npc of proposal.npcs) {
    const entity: EntityState = {
      id: npc.id,
      blueprintId: npc.id,
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
      const cognition = getCognition(engine.world, npc.id);
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
        console.warn(
          `[world-gen] Cannot set belief for NPC "${npc.id}": cognition not initialized. ` +
          `Belief "${belief.key}" on subject "${belief.subject}" was skipped.`,
        );
      }
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

  return {
    ok: true,
    engine,
    proposal,
    tone: proposal.toneGuide ?? '',
    errors: [],
  };
}
