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

// F-304fc328: safe fallback narration used when the LLM call fails outright,
// mirroring dialogue-mind.ts's PBR-002 in-character fallback pattern.
const FALLBACK_NARRATION = 'The scene holds its breath, waiting for the story to catch up.';

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
  /**
   * F-7815df9e (game-core seam contract): compact, pre-condensed long-term-memory
   * summary drawn from the campaign chronicle. Folded into the narration prompt
   * as its own section when present.
   */
  chronicleContext?: string;
  onChunk?: StreamCallback;
};

/** Narrate the current scene after action resolution. Returns structured plan when possible. */
export async function narrateScene(opts: NarrateSceneOpts): Promise<NarrationResult> {
  const {
    client, world, recentEvents, tone, recentNarration,
    previousLocationId, presentationState, characterPresence,
    activePressures, districtDescriptor, partyPresence,
    economyContext, craftingContext, opportunityContext,
    arcContext, endgameContext, chronicleContext, onChunk,
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

  // Add presentation state and long-term chronicle context to the narration input
  const enrichedInput = {
    ...sceneContext.narrationInput,
    presentationState,
    chronicleContext,
  };

  const prompt = buildNarratePrompt(enrichedInput);

  // F-304fc328: Wrap both call paths in try/catch — client.generate/generateStream
  // can throw a NarrationError (fatal kinds immediately, retryable kinds after
  // withRetry exhausts its budget). Mirrors dialogue-mind.ts's PBR-002 pattern:
  // log and return a safe fallback NarrationResult instead of throwing uncaught.
  try {
    // FT-BR-004: When streaming with onChunk, use LEGACY plain-text prompt so prose
    // streams naturally to the player (no JSON fragments). Reserve NarrationPlan JSON
    // mode for non-streaming calls.
    if (onChunk && client.generateStream) {
      const result = await client.generateStream({
        system: NARRATE_SYSTEM_LEGACY,
        prompt,
        maxTokens: 300,
        onChunk,
      });
      return {
        narration: result.text.trim(),
        plan: null,
        sceneContext,
      };
    }

    const result = await client.generate({ system: NARRATE_SYSTEM, prompt, maxTokens: 500 });

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
  } catch (err) {
    console.warn(
      `[narrator] narrateScene: LLM generation failed: ${err instanceof Error ? err.message : String(err)}. Using fallback.`,
    );
    return {
      narration: FALLBACK_NARRATION,
      plan: null,
      sceneContext,
    };
  }
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

  // F-304fc328: same try/catch fallback as narrateScene above.
  try {
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
  } catch (err) {
    console.warn(
      `[narrator] narrateSceneLegacy: LLM generation failed: ${err instanceof Error ? err.message : String(err)}. Using fallback.`,
    );
    return {
      narration: FALLBACK_NARRATION,
      plan: null,
      sceneContext,
    };
  }
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
