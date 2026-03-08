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

  // Social verbs (bribe, intimidate, recruit, petition, disguise, stake claim)
  if (verbs.includes('social')) {
    const socialMatch = tryLeverageVerb(lower, 'social', entities);
    if (socialMatch) return socialMatch;
  }

  // Rumor verbs (spread rumor, deny rumor, frame, bury, leak)
  if (verbs.includes('rumor')) {
    const rumorMatch = tryLeverageVerb(lower, 'rumor', entities);
    if (rumorMatch) return rumorMatch;
  }

  // Diplomacy verbs (negotiate, broker, request meeting, improve standing)
  if (verbs.includes('diplomacy')) {
    const diploMatch = tryLeverageVerb(lower, 'diplomacy', entities);
    if (diploMatch) return diploMatch;
  }

  // Sabotage verbs (sabotage, plant evidence, blackmail)
  if (verbs.includes('sabotage')) {
    const saboMatch = tryLeverageVerb(lower, 'sabotage', entities);
    if (saboMatch) return saboMatch;
  }

  // Crafting verbs (craft, salvage, repair, modify)
  if (/^(craft|salvage|repair|modify)\s*/.test(lower)) {
    const craftMatch = lower.match(/^(craft|salvage|repair|modify)\s*(.*)/);
    if (craftMatch) {
      const craftVerb = craftMatch[1];
      const craftArg = craftMatch[2]?.trim() || '';
      let targetId: string | null = null;
      if (craftArg && (craftVerb === 'salvage' || craftVerb === 'repair' || craftVerb === 'modify')) {
        const entity = findEntityByName(craftArg, entities);
        if (entity) targetId = entity.id;
      }
      return {
        verb: 'craft',
        targetIds: targetId ? [targetId] : null,
        toolId: null,
        parameters: { subAction: craftVerb, recipeOrItem: craftArg },
        confidence: 'high',
        reasoning: `${craftVerb}${craftArg ? ` ${craftArg}` : ''}`,
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

// --- Leverage verb fast path patterns ---

type LeverageVerbMap = { pattern: RegExp; subAction: string; extractTarget: boolean };

const SOCIAL_PATTERNS: LeverageVerbMap[] = [
  { pattern: /^bribe\s+(.+)/i, subAction: 'bribe', extractTarget: true },
  { pattern: /^intimidate\s+(.+)/i, subAction: 'intimidate', extractTarget: true },
  { pattern: /^recruit\s+(.+)/i, subAction: 'recruit-ally', extractTarget: true },
  { pattern: /^petition\s+(.+)/i, subAction: 'petition-authority', extractTarget: true },
  { pattern: /^(disguise|hide identity|conceal)/i, subAction: 'disguise', extractTarget: false },
  { pattern: /^stake\s+claim/i, subAction: 'stake-claim', extractTarget: false },
  { pattern: /^call\s+in\s+(a\s+)?favor/i, subAction: 'call-in-favor', extractTarget: false },
];

const RUMOR_PATTERNS: LeverageVerbMap[] = [
  { pattern: /^spread\s+(a\s+)?(rumor|rumour)\s+(about\s+|that\s+)?(.+)/i, subAction: 'seed', extractTarget: true },
  { pattern: /^(seed|plant)\s+(a\s+)?(rumor|rumour)/i, subAction: 'seed', extractTarget: false },
  { pattern: /^deny\s+(the\s+)?(rumor|rumour|accusation)/i, subAction: 'deny', extractTarget: false },
  { pattern: /^frame\s+(.+)/i, subAction: 'frame', extractTarget: true },
  { pattern: /^(bury|suppress)\s+(the\s+)?(scandal|rumor|rumour)/i, subAction: 'bury-scandal', extractTarget: false },
  { pattern: /^leak\s+(the\s+)?truth/i, subAction: 'leak-truth', extractTarget: false },
  { pattern: /^(spread\s+)?counter[\s-]?rumor/i, subAction: 'spread-counter-rumor', extractTarget: false },
  { pattern: /^claim\s+(false\s+)?credit/i, subAction: 'claim-false-credit', extractTarget: false },
];

const DIPLOMACY_PATTERNS: LeverageVerbMap[] = [
  { pattern: /^request\s+(a\s+)?meeting\s+(with\s+)?(.+)/i, subAction: 'request-meeting', extractTarget: true },
  { pattern: /^improve\s+standing\s+(with\s+)?(.+)/i, subAction: 'improve-standing', extractTarget: true },
  { pattern: /^negotiate\s+access\s+(with\s+|to\s+)?(.+)/i, subAction: 'negotiate-access', extractTarget: true },
  { pattern: /^broker\s+(a\s+)?truce/i, subAction: 'broker-truce', extractTarget: false },
  { pattern: /^trade\s+(a\s+)?secret/i, subAction: 'trade-secret', extractTarget: false },
  { pattern: /^(form|propose)\s+(a\s+)?(temporary\s+)?alliance/i, subAction: 'temporary-alliance', extractTarget: false },
  { pattern: /^cash\s+(in\s+)?(a\s+)?milestone/i, subAction: 'cash-milestone', extractTarget: false },
];

const SABOTAGE_PATTERNS: LeverageVerbMap[] = [
  { pattern: /^sabotage\s+(.+)/i, subAction: 'sabotage', extractTarget: true },
  { pattern: /^plant\s+evidence\s+(against\s+)?(.+)/i, subAction: 'plant-evidence', extractTarget: true },
  { pattern: /^blackmail\s+(.+)/i, subAction: 'blackmail-target', extractTarget: true },
];

const VERB_PATTERN_MAP: Record<string, LeverageVerbMap[]> = {
  social: SOCIAL_PATTERNS,
  rumor: RUMOR_PATTERNS,
  diplomacy: DIPLOMACY_PATTERNS,
  sabotage: SABOTAGE_PATTERNS,
};

function tryLeverageVerb(
  lower: string,
  verb: string,
  entities: EntityState[],
): InterpretedAction | null {
  const patterns = VERB_PATTERN_MAP[verb];
  if (!patterns) return null;

  for (const { pattern, subAction, extractTarget } of patterns) {
    const match = lower.match(pattern);
    if (match) {
      let targetId: string | null = null;
      if (extractTarget) {
        // Get the last capture group as the potential target name
        const targetText = match[match.length - 1];
        if (targetText) {
          const entity = findEntityByName(targetText.trim(), entities);
          if (entity) targetId = entity.id;
        }
      }
      return {
        verb,
        targetIds: targetId ? [targetId] : null,
        toolId: null,
        parameters: { subAction },
        confidence: 'high',
        reasoning: `${verb}: ${subAction}`,
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
