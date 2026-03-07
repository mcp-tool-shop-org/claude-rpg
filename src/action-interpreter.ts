// Interpret freeform player input into a structured ActionIntent

import type { WorldState, EntityState } from '@ai-rpg-engine/core';
import type { ClaudeClient } from './claude-client.js';
import { INTERPRET_SYSTEM, buildInterpretPrompt } from './prompts/interpret-action.js';

export type InterpretedAction = {
  verb: string;
  targetIds: string[] | null;
  toolId: string | null;
  parameters: Record<string, string | number | boolean> | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  alternatives: Array<{ verb: string; targetIds: string[] }> | null;
};

/** Try fast keyword-based interpretation first, fall back to Claude. */
export async function interpretAction(
  client: ClaudeClient,
  world: WorldState,
  playerInput: string,
  availableVerbs: string[],
): Promise<InterpretedAction> {
  // Fast path: direct keyword matching
  const fast = tryFastInterpret(playerInput, world, availableVerbs);
  if (fast) return fast;

  // Slow path: Claude interpretation
  const zone = world.zones[world.locationId];
  const entities = Object.values(world.entities).filter(
    (e) => e.zoneId === world.locationId && e.id !== world.playerId,
  );
  const exits = (zone?.neighbors ?? [])
    .map((id) => world.zones[id])
    .filter((z): z is NonNullable<typeof z> => z != null)
    .map((z) => ({ id: z.id, name: z.name }));

  const prompt = buildInterpretPrompt({
    playerInput,
    availableVerbs,
    visibleEntities: entities.map((e) => ({ id: e.id, name: e.name, type: e.type })),
    zoneExits: exits,
  });

  const result = await client.generateStructured<InterpretedAction>({
    system: INTERPRET_SYSTEM,
    prompt,
    maxTokens: 256,
  });

  if (result.ok && result.data) {
    return result.data;
  }

  // Fallback: look around
  return {
    verb: 'look',
    targetIds: null,
    toolId: null,
    parameters: null,
    confidence: 'low',
    reasoning: 'Could not interpret input',
    alternatives: null,
  };
}

/** Fast keyword-based interpretation for common actions. */
function tryFastInterpret(
  input: string,
  world: WorldState,
  verbs: string[],
): InterpretedAction | null {
  const lower = input.toLowerCase().trim();
  const zone = world.zones[world.locationId];
  const entities = Object.values(world.entities).filter(
    (e) => e.zoneId === world.locationId && e.id !== world.playerId,
  );

  // Look/examine
  if (/^(look|l|examine|inspect)(\s|$)/.test(lower)) {
    const target = findEntityByName(lower.replace(/^(look|l|examine|inspect)\s*/i, ''), entities);
    return {
      verb: target ? 'inspect' : 'look',
      targetIds: target ? [target.id] : null,
      toolId: null,
      parameters: null,
      confidence: 'high',
      reasoning: target ? `Inspect ${target.name}` : 'Look around',
      alternatives: null,
    };
  }

  // Movement
  if (/^(go|move|walk|head|travel)\s+/.test(lower)) {
    const dest = lower.replace(/^(go|move|walk|head|travel)\s+(to\s+)?/i, '');
    const target = findZoneByName(dest, zone?.neighbors ?? [], world);
    if (target) {
      return {
        verb: 'move',
        targetIds: [target],
        toolId: null,
        parameters: null,
        confidence: 'high',
        reasoning: `Move to ${target}`,
        alternatives: null,
      };
    }
  }

  // Attack
  if (/^(attack|fight|hit|strike)\s+/.test(lower) && verbs.includes('attack')) {
    const targetName = lower.replace(/^(attack|fight|hit|strike)\s+/i, '');
    const target = findEntityByName(targetName, entities);
    if (target) {
      return {
        verb: 'attack',
        targetIds: [target.id],
        toolId: null,
        parameters: null,
        confidence: 'high',
        reasoning: `Attack ${target.name}`,
        alternatives: null,
      };
    }
  }

  // Speak/talk
  if (/^(talk|speak|chat|ask)\s+(to\s+|with\s+)?/.test(lower) && verbs.includes('speak')) {
    const targetName = lower.replace(/^(talk|speak|chat|ask)\s+(to\s+|with\s+)?/i, '');
    const target = findEntityByName(targetName, entities);
    if (target) {
      return {
        verb: 'speak',
        targetIds: [target.id],
        toolId: null,
        parameters: null,
        confidence: 'high',
        reasoning: `Speak to ${target.name}`,
        alternatives: null,
      };
    }
  }

  // Use item
  if (/^use\s+/.test(lower) && verbs.includes('use')) {
    const itemName = lower.replace(/^use\s+/i, '');
    const player = world.entities[world.playerId];
    const item = (player?.inventory ?? []).find(
      (i) => i.toLowerCase().includes(itemName),
    );
    if (item) {
      return {
        verb: 'use',
        targetIds: null,
        toolId: item,
        parameters: null,
        confidence: 'high',
        reasoning: `Use ${item}`,
        alternatives: null,
      };
    }
  }

  return null;
}

function findEntityByName(name: string, entities: EntityState[]): EntityState | null {
  const lower = name.toLowerCase().trim();
  if (!lower) return null;
  return (
    entities.find((e) => e.name.toLowerCase() === lower) ??
    entities.find((e) => e.name.toLowerCase().includes(lower)) ??
    entities.find((e) => e.id.toLowerCase().includes(lower)) ??
    null
  );
}

function findZoneByName(
  name: string,
  neighborIds: string[],
  world: WorldState,
): string | null {
  const lower = name.toLowerCase().trim();
  if (!lower) return null;
  return (
    neighborIds.find((id) => {
      const z = world.zones[id];
      return z && (z.name.toLowerCase().includes(lower) || z.id.toLowerCase().includes(lower));
    }) ?? null
  );
}
