// Narrator: scene narration pipeline
// v0.2: outputs NarrationPlan for multi-modal presentation

import type { WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import type { NarrationPlan, PresentationState } from '@ai-rpg-engine/presentation';
import { isValidNarrationPlan } from '@ai-rpg-engine/presentation';
import type { ClaudeClient } from '../claude-client.js';
import { NARRATE_SYSTEM, NARRATE_SYSTEM_LEGACY, buildNarratePrompt } from '../prompts/narrate-scene.js';
import { buildSceneContext, type SceneContext } from './scene-context.js';

export type NarrationResult = {
  narration: string;
  plan: NarrationPlan | null;
  sceneContext: SceneContext;
};

/** Narrate the current scene after action resolution. Returns structured plan when possible. */
export async function narrateScene(
  client: ClaudeClient,
  world: WorldState,
  recentEvents: ResolvedEvent[],
  tone: string,
  recentNarration: string[],
  previousLocationId?: string,
  presentationState?: PresentationState,
  characterPresence?: string,
): Promise<NarrationResult> {
  const sceneContext = buildSceneContext(
    world,
    recentEvents,
    tone,
    recentNarration,
    previousLocationId,
    characterPresence,
  );

  // Add presentation state to the narration input
  const enrichedInput = {
    ...sceneContext.narrationInput,
    presentationState,
  };

  const prompt = buildNarratePrompt(enrichedInput);

  const result = await client.generate({
    system: NARRATE_SYSTEM,
    prompt,
    maxTokens: 500,
  });

  // Try to parse as NarrationPlan JSON
  const plan = parseNarrationPlan(result.text);

  if (plan) {
    return {
      narration: plan.sceneText,
      plan,
      sceneContext,
    };
  }

  // Fallback: treat as plain text narration
  return {
    narration: result.text.trim(),
    plan: null,
    sceneContext,
  };
}

/** Narrate using legacy plain-text mode (for tests or fallback). */
export async function narrateSceneLegacy(
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
    system: NARRATE_SYSTEM_LEGACY,
    prompt,
    maxTokens: 300,
  });

  return {
    narration: result.text.trim(),
    plan: null,
    sceneContext,
  };
}

/** Try to parse Claude's response as a NarrationPlan JSON. */
function parseNarrationPlan(text: string): NarrationPlan | null {
  let jsonStr = text.trim();

  const jsonBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    jsonStr = jsonBlockMatch[1].trim();
  } else {
    const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      jsonStr = braceMatch[0];
    } else {
      return null;
    }
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // Ensure required arrays exist
    if (!parsed.sfx) parsed.sfx = [];
    if (!parsed.ambientLayers) parsed.ambientLayers = [];
    if (!parsed.uiEffects) parsed.uiEffects = [];
    if (!parsed.interruptibility) parsed.interruptibility = 'free';

    if (isValidNarrationPlan(parsed)) {
      return parsed;
    }
    // If validation fails but we have sceneText, still use it
    if (typeof parsed.sceneText === 'string') {
      return {
        sceneText: parsed.sceneText,
        tone: parsed.tone ?? 'calm',
        urgency: parsed.urgency ?? 'normal',
        sfx: parsed.sfx ?? [],
        ambientLayers: parsed.ambientLayers ?? [],
        uiEffects: parsed.uiEffects ?? [],
        interruptibility: parsed.interruptibility ?? 'free',
      };
    }
    return null;
  } catch {
    return null;
  }
}
