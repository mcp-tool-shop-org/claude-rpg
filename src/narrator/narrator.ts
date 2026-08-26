// Narrator: scene narration pipeline
// v0.2: outputs NarrationPlan for multi-modal presentation

import type { WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import type { NarrationPlan, PresentationState } from '@ai-rpg-engine/presentation';
import { isValidNarrationPlan } from '@ai-rpg-engine/presentation';
import type { ClaudeClient, StreamCallback } from '../claude-client.js';
import { NarrationError, userMessage } from '../llm/claude-errors.js';
import { classifyError } from '../llm/claude-adapter.js';
import { NARRATE_SYSTEM, NARRATE_SYSTEM_LEGACY, buildNarratePrompt } from '../prompts/narrate-scene.js';
import { buildSceneContext, type SceneContext } from './scene-context.js';
// F-fa65fe50: type-only import of the game-core seam's existing structured
// logger. debug-logger.ts has no imports of its own (a standalone leaf
// module), so this doesn't introduce a circular dependency even though the
// established direction elsewhere is game/** -> narrator/** (e.g.
// game-narration.ts already imports narrateScene/narrateFinale from here).
import type { DebugLogger } from '../game/debug-logger.js';

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
  /**
   * F-afb978de (family-of-call-sites sibling of dialogue-mind.ts/
   * finale-narrator.ts): userMessage(narrationErr)'s actionable per-kind
   * guidance (claude-errors.ts), set only alongside isFallback: true.
   * `narration` stays FALLBACK_NARRATION/FALLBACK_NARRATION_REPEATED for
   * every non-fatal kind — this is a separate, explicitly out-of-fiction
   * channel (logs, a --debug panel, a future toast) for *why* the fallback
   * happened, not a replacement for the in-fiction sentinel text.
   */
  fallbackMessage?: string;
};

// F-304fc328: safe fallback narration used when the LLM call fails outright,
// mirroring dialogue-mind.ts's PBR-002 in-character fallback pattern.
// F-b6915850: exported so downstream consumers (recap.ts) can recognize the
// sentinel by value where `isFallback` isn't threaded all the way through
// (e.g. TurnRecord in session/history.ts, which only stores narration text).
export const FALLBACK_NARRATION = 'The scene holds its breath, waiting for the story to catch up.';

// F-681d3382: shown from the 2nd consecutive non-fatal fallback onward (see
// NarrateSceneOpts.consecutiveFallbacks below) instead of FALLBACK_NARRATION.
// During a real outage FALLBACK_NARRATION's isolated-hiccup framing repeats
// byte-for-byte every turn with no acknowledgment anything is actually
// wrong; this sentinel names the pattern and gives the player something
// actionable, the way claude-errors.ts's userMessage() differentiates by
// failure kind (which this plain-narration path otherwise has no equivalent
// of at all). Kept as a second constant sentence — not a template — so it
// stays in KNOWN_FALLBACK_NARRATION_SENTINELS's exact-string-match contract
// below.
export const FALLBACK_NARRATION_REPEATED =
  'The story can\'t reach the narrator right now — this looks like more than a one-off; check your connection or type "save" to be safe.';

// F-e8630a73 / F-18f4dd88: the fatal-path fallback sentinel, recorded via
// history.record() when narrateScene()/narrateSceneLegacy() rethrow a fatal
// NarrationError after engine.submitAction() has already mutated world state
// (F-c4332895). Single definition — turn-loop.ts re-exports it (history.ts
// imports from there), keeping the chain one-way: history → turn-loop → narrator.
export const FATAL_NARRATION_FALLBACK =
  '(The narrator could not describe what happened — your action was still resolved.)';

/**
 * Every known fallback-narration sentinel, old and new (see the constants
 * above). Consumers that need to recognize placeholder narration — the
 * LLM-facing recentNarration filter below, and recap.ts's save-load recap
 * screen — compare against this list rather than FALLBACK_NARRATION alone, so
 * a turn recorded via any fallback path is treated consistently.
 */
export const KNOWN_FALLBACK_NARRATION_SENTINELS: readonly string[] = [
  FALLBACK_NARRATION,
  FALLBACK_NARRATION_REPEATED,
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
  /**
   * F-681d3382: count of consecutive non-fatal LLM fallbacks immediately
   * preceding this turn (0 or omitted = none / unknown). When >= 1 — i.e.
   * this call's own fallback, if it happens, would be the 2nd+ in a row —
   * narrateScene switches to FALLBACK_NARRATION_REPEATED instead of the
   * isolated-hiccup FALLBACK_NARRATION text, so a real outage reads as a
   * pattern instead of the same silent sentence every turn.
   *
   * recentNarration can't answer this itself in production: session/
   * history.ts's getRecentNarration() already excludes fallback turns
   * entirely before this module ever sees them (filtering them out, not just
   * marking them), so a run of fallback turns looks identical to a short
   * real history from in here — the opts.recentNarration filter below (line
   * ~116) only ever has sentinels to strip when a caller passes an
   * unfiltered array directly (as several tests in this file do). The
   * caller that still has the actual run of turns (turn-loop.ts, game-core,
   * outside this domain's scope) is the only place that can count consecutive
   * fallbacks and must track + pass this; omitted, behavior is unchanged
   * from before this fix.
   */
  consecutiveFallbacks?: number;
  /**
   * F-fa65fe50: optional structured logger (src/game/debug-logger.ts). When
   * provided, every degradation this module can hit -- parseNarrationPlan's
   * three failure paths plus its own generation-failure catch below -- is
   * also recorded via logger.warn('narrator', ...) alongside the existing
   * console.warn, so occurrences land in the logger's queryable entries[]
   * (available via getEntries() regardless of whether --debug is set) and
   * can eventually be tallied into a per-session degradation rate instead of
   * only ever appearing as scattered terminal scrollback. Omitted entirely
   * by every current caller (bin.ts doesn't construct/pass one here yet) --
   * behavior is unchanged when absent.
   */
  logger?: DebugLogger;
};

/** Narrate the current scene after action resolution. Returns structured plan when possible. */
export async function narrateScene(opts: NarrateSceneOpts): Promise<NarrationResult> {
  const {
    client, world, recentEvents, tone, recentNarration,
    previousLocationId, presentationState, characterPresence,
    activePressures, districtDescriptor, partyPresence,
    economyContext, craftingContext, opportunityContext,
    arcContext, endgameContext, chronicleContext, onChunk, logger,
    consecutiveFallbacks,
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
    const plan = parseNarrationPlan(result.text, logger);

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
    // F-afb978de: classify non-NarrationError throws too (matching
    // dialogue-mind.ts/finale-narrator.ts's pattern) so userMessage() below
    // always has a real NarrationError to read a kind off of.
    const narrationErr = err instanceof NarrationError ? err : classifyError(err);
    if (narrationErr.fatal) throw narrationErr;
    // F-afb978de: userMessage() was dead code here too (sibling of the
    // dialogue-mind.ts/finale-narrator.ts fix) -- folded into the warning
    // and returned via fallbackMessage, not into `narration` itself (see
    // NarrationResult's doc).
    const guidance = userMessage(narrationErr);
    const failureMessage = `narrateScene: LLM generation failed: ${narrationErr.message}. ${guidance} Using fallback.`;
    console.warn(`[narrator] ${failureMessage}`);
    logger?.warn('narrator', failureMessage);
    // F-681d3382: from the 2nd consecutive fallback onward, name the pattern
    // instead of repeating the isolated-hiccup sentence unchanged.
    const narration = (consecutiveFallbacks ?? 0) >= 1 ? FALLBACK_NARRATION_REPEATED : FALLBACK_NARRATION;
    return {
      narration,
      plan: null,
      sceneContext,
      isFallback: true,
      fallbackMessage: guidance,
    };
  }
}

/**
 * Narrate using legacy plain-text mode (for tests or fallback).
 *
 * @param logger F-fa65fe50: optional structured logger, same contract as
 *   NarrateSceneOpts.logger above -- this function predates the opts-object
 *   shape narrateScene uses, so it's a trailing positional parameter instead.
 * @param consecutiveFallbacks F-681d3382: same contract as
 *   NarrateSceneOpts.consecutiveFallbacks above, also trailing-positional for
 *   the same reason as `logger`.
 */
export async function narrateSceneLegacy(
  client: ClaudeClient,
  world: WorldState,
  recentEvents: ResolvedEvent[],
  tone: string,
  recentNarration: string[],
  previousLocationId?: string,
  logger?: DebugLogger,
  consecutiveFallbacks?: number,
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
    const narrationErr = err instanceof NarrationError ? err : classifyError(err);
    if (narrationErr.fatal) throw narrationErr;
    // F-afb978de: same userMessage() wiring as narrateScene above.
    const guidance = userMessage(narrationErr);
    const failureMessage = `narrateSceneLegacy: LLM generation failed: ${narrationErr.message}. ${guidance} Using fallback.`;
    console.warn(`[narrator] ${failureMessage}`);
    logger?.warn('narrator', failureMessage);
    // F-681d3382: same repeat-aware switch as narrateScene above.
    const narration = (consecutiveFallbacks ?? 0) >= 1 ? FALLBACK_NARRATION_REPEATED : FALLBACK_NARRATION;
    return {
      narration,
      plan: null,
      sceneContext,
      isFallback: true,
      fallbackMessage: guidance,
    };
  }
}

/**
 * Try to parse Claude's response as a NarrationPlan JSON.
 *
 * @param logger F-fa65fe50: optional structured logger -- see
 *   NarrateSceneOpts.logger's doc comment above for the full contract. Every
 *   branch below that previously only console.warn'd now also calls
 *   logger?.warn('narrator', ...), and the validation-fails-but-sceneText
 *   branch (previously silent on BOTH channels) now warns on both too.
 */
function parseNarrationPlan(text: string, logger?: DebugLogger): NarrationPlan | null {
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
      const message = 'parseNarrationPlan: no JSON structure found in response';
      const raw = text.slice(0, 200);
      console.warn(`[narrator] ${message}. Raw (truncated): "${raw}"`);
      logger?.warn('narrator', message, { raw });
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
      // F-fa65fe50: this branch previously returned a silently-coerced plan
      // with no warning on EITHER channel -- the only one of the three
      // "didn't get a fully valid NarrationPlan" degrees that wasn't counted
      // anywhere. Now warns like its two harder-failure siblings above/below.
      const message = 'parseNarrationPlan: parsed JSON failed full NarrationPlan validation but has sceneText; using coerced plan';
      const raw = text.slice(0, 200);
      console.warn(`[narrator] ${message}. Raw (truncated): "${raw}"`);
      logger?.warn('narrator', message, { raw });
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
    const message = 'parseNarrationPlan: parsed JSON but missing sceneText';
    const raw = text.slice(0, 200);
    console.warn(`[narrator] ${message}. Raw (truncated): "${raw}"`);
    logger?.warn('narrator', message, { raw });
    return null;
  } catch (err) {
    // PBR-004: Log JSON parse failures with truncated raw text
    const message = `parseNarrationPlan: JSON parse failed: ${err instanceof Error ? err.message : String(err)}`;
    const raw = text.slice(0, 200);
    console.warn(`[narrator] ${message}. Raw (truncated): "${raw}"`);
    logger?.warn('narrator', message, { raw });
    return null;
  }
}
