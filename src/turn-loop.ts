// Core turn loop: input → interpret → resolve → narrate → present
// v0.2: integrated with ImmersionRuntime for multi-modal output
// v0.7: pressure resolution detection heuristic

import type { Engine, ResolvedEvent, WorldState } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { NarrationPlan } from '@ai-rpg-engine/presentation';
import { getEntityFaction, type PlayerRumor, type WorldPressure, type ResolutionType, type NpcActionResult } from '@ai-rpg-engine/modules';
import type { ClaudeClient } from './claude-client.js';
import { interpretAction, type InterpretedAction } from './action-interpreter.js';
import { narrateScene, type NarrationResult } from './narrator/narrator.js';
import { generateDialogue, type DialogueResult } from './dialogue/dialogue-mind.js';
import { TurnHistory } from './session/history.js';
import type { ImmersionRuntime } from './runtime/immersion-runtime.js';
import type { McpToolCall } from './runtime/audio-bridge.js';

export type ProfileUpdateHints = {
  xpGained: number;
  injurySustained?: { name: string; description: string };
  milestoneTriggered?: { label: string; description: string; tags: string[] };
  reputationDelta?: { factionId: string; delta: number };
  pressureResolution?: { pressureId: string; resolutionType: ResolutionType };
};

export type TurnResult = {
  playerInput: string;
  interpreted: InterpretedAction;
  events: ResolvedEvent[];
  narration: string;
  narrationPlan: NarrationPlan | null;
  dialogue: DialogueResult | null;
  audioCalls: McpToolCall[];
  tick: number;
  profileHints: ProfileUpdateHints;
};

/** Execute one full turn of the game loop. */
export async function executeTurn(
  engine: Engine,
  client: ClaudeClient,
  history: TurnHistory,
  playerInput: string,
  tone: string,
  immersion?: ImmersionRuntime,
  characterPresence?: string,
  npcPlayerPresence?: string,
  playerProfile?: CharacterProfile | null,
  playerRumors?: PlayerRumor[],
  pressureContext?: string[],
  worldPressures?: WorldPressure[],
  lastNpcActions?: NpcActionResult[],
  districtDescriptor?: string,
  partyPresence?: string,
  economyContext?: string,
  craftingContext?: string,
): Promise<TurnResult> {
  const previousLocationId = engine.world.locationId;

  // Step 1: Interpret player input into an action
  const availableVerbs = engine.getAvailableActions();
  const interpreted = await interpretAction(
    client,
    engine.world,
    playerInput,
    availableVerbs,
  );

  // If low confidence, return clarification without resolving
  if (interpreted.confidence === 'low') {
    const alts = interpreted.alternatives?.map((a) => a.verb).join(' or ') ?? 'something else';
    return {
      playerInput,
      interpreted,
      events: [],
      narration: `I'm not sure what you mean. Did you want to ${alts}?`,
      narrationPlan: null,
      dialogue: null,
      audioCalls: [],
      tick: engine.tick,
      profileHints: { xpGained: 0 },
    };
  }

  // Step 2: Resolve through the engine
  let events: ResolvedEvent[] = [];
  try {
    events = engine.submitAction(interpreted.verb, {
      targetIds: interpreted.targetIds ?? undefined,
      toolId: interpreted.toolId ?? undefined,
      parameters: interpreted.parameters ?? undefined,
    });
  } catch {
    return {
      playerInput,
      interpreted,
      events: [],
      narration: `You try to ${interpreted.verb}, but nothing happens.`,
      narrationPlan: null,
      dialogue: null,
      audioCalls: [],
      tick: engine.tick,
      profileHints: { xpGained: 0 },
    };
  }

  // Step 3 + 4: Build scene context with perception filtering and narrate
  const recentNarration = history.getRecentNarration(3);
  const presentationState = immersion?.stateMachine.current;
  const narrationResult: NarrationResult = await narrateScene(
    client,
    engine.world,
    events,
    tone,
    recentNarration,
    previousLocationId,
    presentationState,
    characterPresence,
    pressureContext,
    districtDescriptor,
    partyPresence,
    economyContext,
    craftingContext,
  );

  // Step 4.5: Process through immersion runtime if available
  let audioCalls: McpToolCall[] = [];
  if (immersion) {
    audioCalls = await immersion.processPresentation(
      engine,
      events,
      interpreted.verb,
      narrationResult.plan ?? undefined,
    );
  }

  // Step 5: Generate NPC dialogue if speaking
  let dialogue: DialogueResult | null = null;
  if (interpreted.verb === 'speak' && interpreted.targetIds?.[0]) {
    dialogue = await generateDialogue(
      client,
      engine.world,
      interpreted.targetIds[0],
      playerInput,
      tone,
      npcPlayerPresence,
      playerProfile,
      playerRumors,
      worldPressures,
      lastNpcActions,
      economyContext,
      craftingContext,
    );

    // Add voice cast to dialogue if immersion is active
    if (dialogue && immersion) {
      const cast = immersion.getVoiceCast(interpreted.targetIds[0]);
      dialogue.voiceCast = {
        voiceId: cast.voiceId,
        emotion: cast.defaultEmotion,
        speed: cast.defaultSpeed,
      };
    }
  }

  // Extract profile hints from events (includes pressure resolution detection)
  const profileHints = extractProfileHints(events, interpreted.verb, engine.world, worldPressures);

  // Record turn in history
  history.record({
    tick: engine.tick,
    playerInput,
    verb: interpreted.verb,
    narration: narrationResult.narration,
    dialogue: dialogue
      ? { speaker: dialogue.speakerName, text: dialogue.text }
      : undefined,
  });

  return {
    playerInput,
    interpreted,
    events,
    narration: narrationResult.narration,
    narrationPlan: narrationResult.plan,
    dialogue,
    audioCalls,
    tick: engine.tick,
    profileHints,
  };
}

/** Extract profile update hints from resolved events. */
function extractProfileHints(
  events: ResolvedEvent[],
  verb: string,
  world: WorldState,
  activePressures?: WorldPressure[],
): ProfileUpdateHints {
  const hints: ProfileUpdateHints = { xpGained: 0 };

  for (const event of events) {
    switch (event.type) {
      case 'combat.entity.defeated': {
        hints.xpGained += 15;

        // Reputation: killing a faction member angers their faction
        const defeatedId = event.payload.entityId as string | undefined;
        if (defeatedId) {
          const factionId = getEntityFaction(world, defeatedId);
          if (factionId && !hints.reputationDelta) {
            hints.reputationDelta = { factionId, delta: -15 };
          }

          // Milestone: defeating a boss
          const entity = world.entities[defeatedId];
          if (entity?.tags.includes('boss') && !hints.milestoneTriggered) {
            hints.milestoneTriggered = {
              label: `Defeated ${entity.name}`,
              description: `Slew ${entity.name} in combat.`,
              tags: ['combat', 'boss-kill'],
            };
          }
        }
        break;
      }
      case 'world.zone.entered': {
        hints.xpGained += 5;

        // Milestone: entering a landmark or boss lair
        const zoneId = event.payload.zoneId as string | undefined;
        if (zoneId && !hints.milestoneTriggered) {
          const zone = world.zones[zoneId];
          if (zone) {
            const tags = zone.tags ?? [];
            if (tags.includes('boss-lair') || tags.includes('landmark')) {
              const tag = tags.includes('boss-lair') ? 'boss-lair' : 'landmark';
              hints.milestoneTriggered = {
                label: `Entered ${zone.name}`,
                description: `Discovered ${zone.name}.`,
                tags: ['exploration', tag],
              };
            }
          }
        }
        break;
      }
      case 'combat.damage.applied': {
        const dmg = event.payload.damage as number | undefined;
        if (dmg && dmg >= 10) {
          hints.injurySustained = {
            name: 'Battle Wound',
            description: `Sustained ${dmg} damage in combat.`,
          };
        }
        break;
      }
      case 'inventory.item.received':
        hints.xpGained += 3;
        break;
    }
  }

  // Base XP for taking any action
  if (verb !== 'look' && events.length > 0) {
    hints.xpGained += 2;
  }

  // Pressure resolution detection (heuristic, no LLM call)
  if (activePressures && activePressures.length > 0) {
    hints.pressureResolution = detectPressureResolution(events, verb, world, activePressures);
  }

  return hints;
}

/**
 * Heuristic: match player actions against active pressures.
 * False negatives are fine — undetected resolutions just expire normally.
 */
function detectPressureResolution(
  events: ResolvedEvent[],
  verb: string,
  world: WorldState,
  pressures: WorldPressure[],
): ProfileUpdateHints['pressureResolution'] {
  // Combat victory → resolves bounty or revenge attempt
  const defeatedFactions = new Set<string>();
  for (const event of events) {
    if (event.type === 'combat.entity.defeated') {
      const defeatedId = event.payload.entityId as string | undefined;
      if (defeatedId) {
        const factionId = getEntityFaction(world, defeatedId);
        if (factionId) defeatedFactions.add(factionId);
      }
    }
  }

  if (defeatedFactions.size > 0) {
    for (const p of pressures) {
      if (
        (p.kind === 'bounty-issued' || p.kind === 'revenge-attempt') &&
        defeatedFactions.has(p.sourceFactionId)
      ) {
        return { pressureId: p.id, resolutionType: 'resolved-by-player' };
      }
    }
  }

  // Speaking to a faction with a summons → resolves it
  if (verb === 'speak') {
    for (const p of pressures) {
      if (p.kind === 'faction-summons') {
        // Check if we spoke to someone from that faction
        for (const entity of Object.values(world.entities)) {
          if (entity.zoneId === world.locationId && entity.id !== world.playerId) {
            const factionId = getEntityFaction(world, entity.id);
            if (factionId === p.sourceFactionId) {
              return { pressureId: p.id, resolutionType: 'resolved-by-player' };
            }
          }
        }
      }
    }
  }

  return undefined;
}
