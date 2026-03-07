// Narrator: scene narration pipeline

import type { WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import type { ClaudeClient } from '../claude-client.js';
import { NARRATE_SYSTEM, buildNarratePrompt } from '../prompts/narrate-scene.js';
import { buildSceneContext, type SceneContext } from './scene-context.js';

export type NarrationResult = {
  narration: string;
  sceneContext: SceneContext;
};

/** Narrate the current scene after action resolution. */
export async function narrateScene(
  client: ClaudeClient,
  world: WorldState,
  recentEvents: ResolvedEvent[],
  tone: string,
  recentNarration: string[],
  previousLocationId?: string,
): Promise<NarrationResult> {
  const sceneContext = buildSceneContext(
    world,
    recentEvents,
    tone,
    recentNarration,
    previousLocationId,
  );

  const prompt = buildNarratePrompt(sceneContext.narrationInput);

  const result = await client.generate({
    system: NARRATE_SYSTEM,
    prompt,
    maxTokens: 300,
  });

  return {
    narration: result.text.trim(),
    sceneContext,
  };
}
