// Narrator: scene narration pipeline
// v0.2: outputs NarrationPlan for multi-modal presentation

import type { WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import type { NarrationPlan, PresentationState } from '@ai-rpg-engine/presentation';
import { isValidNarrationPlan } from '@ai-rpg-engine/presentation';
import type { ClaudeClient, StreamCallback } from '../claude-client.js';
import { NarrationError } from '../llm/claude-errors.js';
import { NARRATE_SYSTEM, NARRATE_SYSTEM_LEGACY, buildNarratePrompt } from '../prompts/narrate-scene.js';
import { buildSceneContext, type SceneContext } from './scene-context.js';

export type NarrationResult = {
  narration: string;
  plan: NarrationPlan | null;
  sceneContext: SceneContext;
  /**
   * F-b6915850: true when `narration` is the FALLBACK_NARRATION sentinel
   * (a non-fatal NarrationError occurred and no real LLM prose was produced).
   * Lets downstream consumers — e.g. recap.ts's renderRecap — tell placeholder
   * text apart from authored narrative instead of quoting it as if it were real.
   */
  isFallback: boolean;
};

// F-304fc328: safe fallback narration used when the LLM call fails outright,
// mirroring dialogue-mind.ts's PBR-002 in-character fallback pattern.
// F-b6915850: exported so downstream consumers (recap.ts) can recognize the
// sentinel by value where `isFallback` isn't threaded all the way through
// (e.g. TurnRecord in session/history.ts, which only stores narration text).
export const FALLBACK_NARRATION = 'The scene holds its breath, waiting for the story to catch up.';

// F-e8630a73 / F-18f4dd88: the fatal-path fallback sentinel, recorded via
// history.record() when narrateScene()/narrateSceneLegacy() rethrow a fatal
// NarrationError after engine.submitAction() has already mutated world state
// (F-c4332895). Single definition — turn-loop.ts re-exports it (history.ts
// imports from there), keeping the chain one-way: history → turn-loop → narrator.
export const FATAL_NARRATION_FALLBACK =
  '(The narrator could not describe what happened — your action was still resolved.)';

/**
 * Every known fallback-narration sentinel, old and new (see the two constants
 * above). Consumers that need to recognize placeholder narration — the
 * LLM-facing recentNarration filter below, and recap.ts's save-load recap
 * screen — compare against this list rather than FALLBACK_NARRATION alone, so
 * a turn recorded via either fallback path is treated consistently.
 */
export const KNOWN_FALLBACK_NARRATION_SENTINELS: readonly string[] = [
  FALLBACK_NARRATION,
  FATAL_NARRATION_FALLBACK,
];

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

  // F-e8630a73 (seam contract): never echo a fallback-narration sentinel back
  // into the LLM-facing prompt as if it were real authored prose. Filtered
  // once here, before recentNarration flows into buildSceneContext ->
  // narrationInput.recentNarration -> buildNarratePrompt's 'Previous
  // narration (for continuity)' section (prompts/narrate-scene.ts:114) —
  // shared by narrateScene and narrateSceneLegacy below, so scene-context.ts
  // and prompts/narrate-scene.ts don't need to import from this module (both
  // are already imported BY this module; importing back would cycle).
  // Mirrors recap.ts:45's sentinel-comparison filter on the save-load path.
  const filteredRecentNarration = recentNarration.filter(
    (n) => !KNOWN_FALLBACK_NARRATION_SENTINELS.includes(n),
  );

  const sceneContext = buildSceneContext(
    world,
    recentEvents,
    tone,
    filteredRecentNarration,
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
        isFallback: false,
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
        isFallback: false,
      };
    }

    // Fallback: treat as plain text narration
    return {
      narration: result.text.trim(),
      plan: null,
      sceneContext,
      isFallback: false,
    };
  } catch (err) {
    // Fatal kinds (auth/bad-request) rethrow: retrying can never succeed, and the
    // per-turn presenter surfaces an actionable message — swallowing them here
    // would make a bad API key indistinguishable from an in-fiction hiccup
    // (the exact failure F-afb978de fixed for dialogue/finale).
    if (err instanceof NarrationError && err.fatal) throw err;
    console.warn(
      `[narrator] narrateScene: LLM generation failed: ${err instanceof Error ? err.message : String(err)}. Using fallback.`,
    );
    return {
      narration: FALLBACK_NARRATION,
      plan: null,
      sceneContext,
      isFallback: true,
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
  // F-e8630a73: same filter as narrateScene above.
  const filteredRecentNarration = recentNarration.filter(
    (n) => !KNOWN_FALLBACK_NARRATION_SENTINELS.includes(n),
  );

  const sceneContext = buildSceneContext(
    world,
    recentEvents,
    tone,
    filteredRecentNarration,
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
      isFallback: false,
    };
  } catch (err) {
    // Same fatal-rethrow contract as narrateScene above.
    if (err instanceof NarrationError && err.fatal) throw err;
    console.warn(
      `[narrator] narrateSceneLegacy: LLM generation failed: ${err instanceof Error ? err.message : String(err)}. Using fallback.`,
    );
    return {
      narration: FALLBACK_NARRATION,
      plan: null,
      sceneContext,
      isFallback: true,
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
