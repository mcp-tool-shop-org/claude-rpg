// Finale narrator: LLM epilogue generation grounded in FinaleOutline
// v2.0: hybrid finale — deterministic outline + optional prose epilogue

import type { FinaleOutline } from '@ai-rpg-engine/campaign-memory';
import { formatFinaleForTerminal } from '@ai-rpg-engine/campaign-memory';
import type { ClaudeClient } from '../claude-client.js';
import { FINALE_SYSTEM, buildFinalePrompt } from '../prompts/finale-prompt.js';
import { NarrationError, userMessage } from '../llm/claude-errors.js';
import { classifyError } from '../llm/claude-adapter.js';
import type { DebugLogger } from '../game/debug-logger.js';

export type FinaleNarrationResult = {
  epilogue: string;
  deterministicSummary: string;
  worldAfter: string;
  /**
   * F-0f76ecc2: true when `epilogue` is the FALLBACK_EPILOGUE sentinel (the
   * first attempt and a single same-turn retry both failed non-fatally) --
   * mirrors narrator.ts's NarrationResult.isFallback contract so a caller
   * (game-core's renderConcludeOutput, or a future one) can tell placeholder
   * text apart from a real generated epilogue without string-comparing.
   */
  isFallback: boolean;
};

// F-0f76ecc2: shown in place of a real epilogue when both the initial LLM
// attempt and one same-turn retry fail non-fatally. Deliberately non-empty
// (unlike the old '' sentinel) so renderConcludeOutput's `if (result.epilogue)`
// gate (game-presenter.ts, out of this domain's scope but confirmed to need
// no change: it already renders whatever non-empty string it's given) still
// renders a section instead of silently vanishing -- and says plainly that
// the campaign is still concluded (campaignStatus is already stamped
// 'completed' by game.ts's handleConclude before this ever runs) rather than
// leaving the player to guess whether anything went wrong at all.
export const FALLBACK_EPILOGUE =
  '(The narrator could not produce a closing passage — your campaign is complete and the ending above is final. Type /conclude again to retry the epilogue.)';

type EpilogueAttempt =
  | { ok: true; text: string }
  | { ok: false; err: NarrationError };

/** One LLM attempt at the epilogue. Fatal errors rethrow immediately (retrying them can never succeed); non-fatal ones are returned for the caller to retry or fall back on. */
async function attemptEpilogue(client: ClaudeClient, userPrompt: string): Promise<EpilogueAttempt> {
  try {
    const result = await client.generate({
      system: FINALE_SYSTEM,
      prompt: userPrompt,
      maxTokens: 400,
    });
    return { ok: true, text: result.text.trim() };
  } catch (err) {
    // F-6480985e: domain-wide fatal-error contract (documented in claude-errors.ts
    // near NarrationError.fatal) — fatal (auth/bad-request) errors rethrow so
    // bin.ts's presentError renders the structured system-level box, matching
    // narrator.ts's narrateScene/narrateSceneLegacy. Surfacing userMessage() as
    // the epilogue text (the old behavior) made a bad API key indistinguishable
    // from authored campaign prose.
    const narrationErr = err instanceof NarrationError ? err : classifyError(err);
    if (narrationErr.fatal) throw narrationErr;
    return { ok: false, err: narrationErr };
  }
}

/**
 * Generate a full finale: deterministic summary + LLM epilogue prose.
 *
 * @param narratorTone F-f4f6ac90: the pack's `meta.narratorTone`, forwarded
 *   to buildFinalePrompt for the PACK_VOICES epilogue-voice lookup (see
 *   finale-prompt.ts). Optional and currently unwired end-to-end: no
 *   production caller passes it yet. bin.ts already computes
 *   `pack.meta.narratorTone` (as `tone`, threaded into GameSession.tone for
 *   per-turn narration — see bin.ts:241) but game.ts's handleConclude()
 *   (game.ts:~1608-1613) only forwards `genre: this.genre` into
 *   generateFinaleNarration, and game-narration.ts's FinaleNarrationContext
 *   has no narratorTone field to carry it. Wiring `this.tone` through both of
 *   those requires edits to src/game.ts and src/game/game-narration.ts, both
 *   outside src/narrator/**'s domain — tracked as a residual caller-side
 *   remainder rather than made here.
 * @param logger F-e2ef2c38: optional structured logger, same contract as
 *   narrator.ts's NarrateSceneOpts.logger and dialogue-mind.ts's
 *   generateDialogue (this call chain's two siblings under
 *   claude-errors.ts's NarrationError.fatal doc comment — all three are one
 *   unified LLM-call-site contract family). Before this fix, only
 *   narrator.ts's degradations landed in DebugLogger's queryable entries[];
 *   an epilogue that fell back to FALLBACK_EPILOGUE — the narratively
 *   climactic payoff of a whole campaign — was invisible to it. Trailing
 *   positional parameter, matching narrateSceneLegacy's identical reasoning
 *   in narrator.ts. Omitted by every current caller — behavior is unchanged
 *   when absent.
 */
export async function narrateFinale(
  client: ClaudeClient,
  outline: FinaleOutline,
  genre: string,
  playerName?: string,
  narratorTone?: string,
  logger?: DebugLogger,
): Promise<FinaleNarrationResult> {
  const deterministicSummary = formatFinaleForTerminal(outline);
  const userPrompt = buildFinalePrompt(outline, genre, playerName, narratorTone);

  // F-0f76ecc2: this is the single LLM call that produces a campaign's prose
  // epilogue -- the narratively climactic payoff of a potentially
  // several-hundred-turn campaign -- and campaignStatus is already stamped
  // 'completed' by the caller (game.ts's handleConclude) before this runs, so
  // there's no player-visible cue that anything could be retried. A
  // rate-limit/timeout/transport blip here is a realistic trigger (this is
  // plausibly the point in a session with the largest accumulated prompt
  // context). One same-turn retry meaningfully improves the odds a transient
  // blip doesn't cost the player their epilogue outright. This is a second
  // whole-call attempt reserved for this single highest-stakes narrative
  // moment, not a new generic retry policy layered under
  // claude-adapter.ts's withRetry (which already ran its own budget beneath
  // `client.generate` if `client` came from createAdaptedClient) -- fatal
  // errors still never get a second attempt (see attemptEpilogue above).
  let epilogue: string;
  let isFallback = false;

  const first = await attemptEpilogue(client, userPrompt);
  if (first.ok) {
    epilogue = first.text;
  } else {
    const firstFailureMessage = `LLM epilogue generation failed (attempt 1/2): ${first.err.message}. Retrying once.`;
    console.warn(`[finale-narrator] ${firstFailureMessage}`);
    logger?.warn('finale-narrator', firstFailureMessage);
    const second = await attemptEpilogue(client, userPrompt);
    if (second.ok) {
      epilogue = second.text;
    } else {
      // F-afb978de: userMessage()'s actionable per-kind guidance was dead
      // code in this domain -- wired into the final-failure log alongside
      // the diagnostic message (not into FALLBACK_EPILOGUE's player-facing
      // text, which stays a generic, always-true system notice rather than
      // guessing at a kind-specific cause).
      const secondFailureMessage = `LLM epilogue generation failed after retry (attempt 2/2): ${second.err.message}. ${userMessage(second.err)} Falling back to deterministic summary only.`;
      console.warn(`[finale-narrator] ${secondFailureMessage}`);
      logger?.warn('finale-narrator', secondFailureMessage);
      epilogue = FALLBACK_EPILOGUE;
      isFallback = true;
    }
  }

  const worldAfter = buildWorldAfter(outline);

  return { epilogue, deterministicSummary, worldAfter, isFallback };
}

/** Compact glanceable "world after" snapshot — max ~10 lines. */
function buildWorldAfter(outline: FinaleOutline): string {
  const lines: string[] = [];
  lines.push('  ═══ WORLD AFTER ═══');

  if (outline.factionFates.length > 0) {
    const factions = outline.factionFates
      .map((f) => `${f.factionId} (${f.outcome})`)
      .join(' · ');
    lines.push(`  Factions:    ${factions}`);
  }

  if (outline.districtFates.length > 0) {
    const districts = outline.districtFates
      .map((d) => `${d.name} (${d.stability}/${d.economyTone})`)
      .join(' · ');
    lines.push(`  Districts:   ${districts}`);
  }

  if (outline.companionFates.length > 0) {
    const companions = outline.companionFates
      .map((c) => `${c.name} (${c.outcome})`)
      .join(' · ');
    lines.push(`  Companions:  ${companions}`);
  }

  // Relics from legacy entries with high significance
  const relics = outline.legacy
    .filter((l) => l.significance >= 0.8)
    .slice(0, 4)
    .map((l) => l.label);
  if (relics.length > 0) {
    lines.push(`  Relics:      ${relics.join(' · ')}`);
  }

  lines.push(`  Resolution:  ${outline.resolutionClass}${outline.dominantArc ? ` (${outline.dominantArc} arc)` : ''}`);
  lines.push(`  Duration:    ${outline.campaignDuration} turns`);

  return lines.join('\n');
}
