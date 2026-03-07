// Core turn loop: input → interpret → resolve → narrate → display

import type { Engine, ResolvedEvent } from '@ai-rpg-engine/core';
import type { ClaudeClient } from './claude-client.js';
import { interpretAction, type InterpretedAction } from './action-interpreter.js';
import { narrateScene, type NarrationResult } from './narrator/narrator.js';
import { generateDialogue, type DialogueResult } from './dialogue/dialogue-mind.js';
import { TurnHistory } from './session/history.js';

export type TurnResult = {
  playerInput: string;
  interpreted: InterpretedAction;
  events: ResolvedEvent[];
  narration: string;
  dialogue: DialogueResult | null;
  tick: number;
};

/** Execute one full turn of the game loop. */
export async function executeTurn(
  engine: Engine,
  client: ClaudeClient,
  history: TurnHistory,
  playerInput: string,
  tone: string,
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
      dialogue: null,
      tick: engine.tick,
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
  } catch (err) {
    // Action validation failed — narrate the failure
    return {
      playerInput,
      interpreted,
      events: [],
      narration: `You try to ${interpreted.verb}, but nothing happens.`,
      dialogue: null,
      tick: engine.tick,
    };
  }

  // Step 3 + 4: Build scene context with perception filtering and narrate
  const recentNarration = history.getRecentNarration(3);
  const narrationResult: NarrationResult = await narrateScene(
    client,
    engine.world,
    events,
    tone,
    recentNarration,
    previousLocationId,
  );

  // Step 5: Generate NPC dialogue if speaking
  let dialogue: DialogueResult | null = null;
  if (interpreted.verb === 'speak' && interpreted.targetIds?.[0]) {
    dialogue = await generateDialogue(
      client,
      engine.world,
      interpreted.targetIds[0],
      playerInput,
      tone,
    );
  }

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
    dialogue,
    tick: engine.tick,
  };
}
