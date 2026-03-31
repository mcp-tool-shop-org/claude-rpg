// Narrator: scene narration pipeline
// v0.2: outputs NarrationPlan for multi-modal presentation

import type { WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import type { NarrationPlan, PresentationState } from '@ai-rpg-engine/presentation';
import { isValidNarrationPlan } from '@ai-rpg-engine/presentation';
import type { ClaudeClient, StreamCallback } from '../claude-client.js';
import { NARRATE_SYSTEM, NARRATE_SYSTEM_LEGACY, buildNarratePrompt } from '../prompts/narrate-scene.js';
import { buildSceneContext, type SceneContext } from './scene-context.js';

export type NarrationResult = {
  narration: string;
  plan: NarrationPlan | null;
  sceneContext: SceneContext;
};

export type NarrateSceneOpts = {
  client: ClaudeClient;
  world: WorldState;
  recentEvents: ResolvedEvent[];
  tone: string;
  recentNarration: string[];
  previousLocationId?: string;
  presentationState?: PresentationState;
  characterPresence?: string;
  activePressures?: string[];
  districtDescriptor?: string;
  partyPresence?: string;
  economyContext?: string;
  craftingContext?: string;
  opportunityContext?: string;
  arcContext?: string;
  endgameContext?: string;
  onChunk?: StreamCallback;
};

/** Narrate the current scene after action resolution. Returns structured plan when possible. */
export async function narrateScene(opts: NarrateSceneOpts): Promise<NarrationResult> {
  const {
    client, world, recentEvents, tone, recentNarration,
    previousLocationId, presentationState, characterPresence,
    activePressures, districtDescriptor, partyPresence,
    economyContext, craftingContext, opportunityContext,
    arcContext, endgameContext, onChunk,
  } = opts;
  const sceneContext = buildSceneContext(
    world,
    recentEvents,
    tone,
    recentNarration,
    previousLocationId,
    characterPresence,
    activePressures,
    districtDescriptor,
    partyPresence,
    economyContext,
    craftingContext,
    opportunityContext,
    arcContext,
    endgameContext,
  );

  // Add presentation state to the narration input
  const enrichedInput = {
    ...sceneContext.narrationInput,
    presentationState,
  };

  const prompt = buildNarratePrompt(enrichedInput);

  // Use streaming if callback provided and client supports it.
  // NOTE: When streaming is active, onChunk receives raw JSON fragments (partial
  // NarrationPlan tokens). Callers should NOT display streamed chunks directly as
  // narrative text — instead, wait for the full response and use the parsed plan's
  // sceneText field. Displaying raw chunks will show JSON syntax to the player.
  const result = onChunk && client.generateStream
    ? await client.generateStream({ system: NARRATE_SYSTEM, prompt, maxTokens: 500, onChunk })
    : await client.generate({ system: NARRATE_SYSTEM, prompt, maxTokens: 500 });

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
      // PBR-004: Log when no JSON structure found
      console.warn(`[narrator] parseNarrationPlan: no JSON structure found in response. Raw (truncated): "${text.slice(0, 200)}"`);
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
    // PBR-004: Log when parsed JSON doesn't match expected shape
    console.warn(`[narrator] parseNarrationPlan: parsed JSON but missing sceneText. Raw (truncated): "${text.slice(0, 200)}"`);
    return null;
  } catch (err) {
    // PBR-004: Log JSON parse failures with truncated raw text
    console.warn(`[narrator] parseNarrationPlan: JSON parse failed: ${err instanceof Error ? err.message : String(err)}. Raw (truncated): "${text.slice(0, 200)}"`);
    return null;
  }
}
