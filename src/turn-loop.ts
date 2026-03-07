// Core turn loop: input → interpret → resolve → narrate → present
// v0.2: integrated with ImmersionRuntime for multi-modal output

import type { Engine, ResolvedEvent } from '@ai-rpg-engine/core';
import type { NarrationPlan } from '@ai-rpg-engine/presentation';
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

  // Extract profile hints from events
  const profileHints = extractProfileHints(events, interpreted.verb);

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
function extractProfileHints(events: ResolvedEvent[], verb: string): ProfileUpdateHints {
  const hints: ProfileUpdateHints = { xpGained: 0 };

  for (const event of events) {
    switch (event.type) {
      case 'combat.entity.defeated':
        hints.xpGained += 15;
        break;
      case 'world.zone.entered':
        hints.xpGained += 5;
        break;
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

  return hints;
}
