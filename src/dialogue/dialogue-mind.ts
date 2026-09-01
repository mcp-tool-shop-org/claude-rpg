// Dialogue Mind: generate NPC dialogue grounded in simulation state

import type { WorldState } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { PlayerRumor, WorldPressure, NpcActionResult, OpportunityState, NpcObligationLedger } from '@ai-rpg-engine/modules';
import type { ClaudeClient } from '../claude-client.js';
import { DIALOGUE_SYSTEM, buildDialoguePrompt, buildDialogueSystemPrompt, type ConversationExchange } from '../prompts/dialogue-npc.js';
import { buildNPCDialogueContext } from './npc-context.js';
import { NarrationError, userMessage } from '../llm/claude-errors.js';
import { classifyError } from '../llm/claude-adapter.js';
import type { DebugLogger } from '../game/debug-logger.js';

export type DialogueResult = {
  speakerId: string;
  speakerName: string;
  text: string;
  grounding: {
    beliefCount: number;
    memoryCount: number;
    factionId?: string;
    morale: number;
    suspicion: number;
  };
  voiceCast?: {
    voiceId: string;
    emotion: string;
    speed: number;
  };
  /**
   * F-8b6a50b5: true when `text` is the hardcoded in-character stall (a
   * non-fatal NarrationError occurred and no real LLM dialogue was
   * produced), mirroring NarrationResult.isFallback's contract (narrator.ts)
   * so callers can tell placeholder text apart from authored dialogue
   * instead of quoting it as if it were real -- e.g. to log/count it, or
   * render it distinctly (dimmed, or with a small out-of-character marker)
   * in a future UI pass.
   */
  isFallback: boolean;
  /**
   * F-afb978de: userMessage(narrationErr)'s actionable per-kind guidance
   * (claude-errors.ts), set only alongside isFallback: true. `text` stays
   * the generic in-character stall for every non-fatal kind, preserving
   * F-6480985e's immersion contract -- this is a separate, explicitly
   * out-of-character channel for a caller (chronicle logs, a --debug panel,
   * a future toast) that wants to say *why* the NPC stalled, not just that
   * it did.
   */
  fallbackMessage?: string;
};

// F-304fc328: the stall line shown for the FIRST non-fatal fallback in a run.
// Unchanged by F-c3d1fcdf below -- existing callers/tests that assert this
// exact string for a one-off failure keep passing.
const STALL_LINE = 'The NPC pauses, gathering their thoughts...';

// F-c3d1fcdf: shown from the 2nd consecutive non-fatal fallback onward (see
// the `consecutiveFallbacks` param on generateDialogue below), instead of
// repeating STALL_LINE unchanged every turn for the outage's entire
// duration -- the same repeated-silent-sentence gap F-681d3382 already
// closed for narrator.ts's narrateScene, carried over to this named sibling.
// Unlike narrateScene's FALLBACK_NARRATION_REPEATED, this stays fully
// in-character (no out-of-fiction marker) per this file's own
// immersion-preserving design intent (F-6480985e) -- a transient hiccup, or
// even a real outage, shouldn't break the fourth wall for NPC dialogue the
// way it's allowed to for narration. A small rotating set instead of one
// fixed second line, so a multi-turn outage doesn't just trade "identical
// every turn" for "identical every turn after the 1st." Each variant leans
// on "again"/"still"/"another" to read as a continuation of the same stall,
// not a fresh unrelated hesitation.
const REPEATED_STALL_LINES: readonly string[] = [
  'The NPC pauses again, still gathering their thoughts.',
  'The NPC hesitates once more, the words slow to come.',
  'The NPC\'s attention drifts before settling back on you.',
  'The NPC takes another long moment before answering.',
];

/**
 * F-c3d1fcdf: deterministic variant pick, keyed off consecutiveFallbacks
 * itself rather than Math.random() -- this file's LLM-failure branch has no
 * other per-turn seed to draw from, and a random choice would make the same
 * outage-turn produce a different line on every test run. `consecutiveFallbacks`
 * is guaranteed >= 1 by the only call site below (REPEATED_STALL_LINES is
 * only consulted once `(consecutiveFallbacks ?? 0) >= 1`), so `- 1` keeps the
 * very first escalation (the 2nd consecutive fallback overall) on index 0.
 */
function pickRepeatedStallLine(consecutiveFallbacks: number): string {
  const idx = (consecutiveFallbacks - 1) % REPEATED_STALL_LINES.length;
  return REPEATED_STALL_LINES[idx];
}

/**
 * F-35969d3a (SLATE-2): `conversationHistory` below is already fully wired —
 * threaded into context.conversationHistory (see the assignment a few lines
 * down) and rendered by formatConversationHistory (prompts/dialogue-npc.ts),
 * which already self-caps at the last 5 exchanges AND an ~800-char budget
 * (oldest-out). This domain needs no further code change. The remainder is a
 * CONTRACT for the game-core caller that owns the buffer this parameter
 * expects to receive:
 *
 * 1. Shape: `ConversationExchange = { speaker: string; text: string }`
 *    (prompts/dialogue-npc.ts). `speaker` is the fixed literal `'Player'` for
 *    the player's turns, and the NPC's resolved display name
 *    (`world.entities[npcId]?.name ?? npcId`) for the NPC's — the same
 *    resolution this file already uses for `speakerName` below. Do not
 *    thread the player's own character name in here — nothing in this
 *    domain's LLM prompts references it today (buildDialoguePrompt's closing
 *    section says the generic "Player says:").
 * 2. Buffer ownership: keyed per-NPC (`Map<string, ConversationExchange[]>`),
 *    never a single flat shared list — a flat list would leak one NPC's
 *    lines into an unrelated NPC's conversation in the same session.
 *    Persisted via SavedSession.npcConversations (Director ruling, wave 18)
 *    behind a shape-guarded loader (loadNpcConversationsFromSession) — an
 *    old or malformed save degrades to an empty map, never a crash.
 * 3. Growth cap: cap each per-NPC array at push time, oldest-out, at
 *    20 entries (4x formatConversationHistory's own 5-read window; the
 *    storage cap bounds save size, the read side self-limits the prompt).
 * 4. Never record a fallback exchange: skip pushing when
 *    `DialogueResult.isFallback === true` (see that field's own doc comment
 *    above) — feeding a hardcoded stall line back in as "the NPC's prior
 *    line" would quote a placeholder as real dialogue, the same anti-pattern
 *    already fixed for narration (F-e8630a73).
 * 5. Player-turn append: push the player's line into the SAME NPC's buffer
 *    at the same time as the NPC's reply, or "recent conversation" reads as
 *    a one-sided monologue.
 *
 * @param logger F-e2ef2c38: optional structured logger, same contract as
 *   narrator.ts's NarrateSceneOpts.logger — when provided, the non-fatal
 *   fallback path below also logs via logger.warn('dialogue-mind', ...)
 *   alongside the existing console.warn, so an NPC-dialogue stall lands in
 *   DebugLogger's queryable entries[] like narrator.ts's own degradations
 *   already do, instead of undercounting a per-session degradation tally
 *   that only ever tallied narrator.ts's. Trailing positional parameter
 *   (matching narrateSceneLegacy's identical reasoning in narrator.ts) since
 *   this function predates any opts-object shape. Omitted by every current
 *   caller — behavior is unchanged when absent.
 * @param consecutiveFallbacks F-c3d1fcdf: count of consecutive non-fatal LLM
 *   fallbacks immediately preceding this call (0 or omitted = none/unknown),
 *   same contract as narrator.ts's NarrateSceneOpts.consecutiveFallbacks
 *   (F-681d3382). When >= 1, the non-fatal catch branch below picks from
 *   REPEATED_STALL_LINES instead of repeating STALL_LINE. The caller that
 *   tracks the actual run of turns per NPC (game-core, outside this domain's
 *   scope) owns counting this; omitted, behavior is unchanged from before
 *   this fix. Trailing positional parameter after `logger`, for the same
 *   reason `logger` itself trails everything else.
 * @param activeOpportunities F-d8184410: full opportunity roster, forwarded
 *   straight through to buildNPCDialogueContext (npc-context.ts), which
 *   derives a speaker-scoped opportunityHint from it -- see that file's own
 *   doc comment for why this is a threaded param rather than a
 *   getPersistedOpportunities(world) read. The caller that owns the live
 *   array (GameSession.activeOpportunities, game-core, outside this
 *   domain's scope) must pass it for the hint to activate; omitted, behavior
 *   is unchanged from before this fix.
 * @param partyPresence F-ff0b4af6 (party half): pre-formatted active-party
 *   line, forwarded straight through to buildNPCDialogueContext. Same
 *   contract as narrate-scene.ts's own partyPresence field -- a caller that
 *   already computes one for scene narration (e.g. via game-state.ts's
 *   getPartyPresence) can reuse the identical string here. Omitted, behavior
 *   is unchanged from before this fix.
 * @param obligations WO-A4-5 (slice A4, §2 lock 4): the NPC's obligation
 *   ledger, forwarded straight through to buildNPCDialogueContext (npc-
 *   context.ts), which threads it to buildNpcProfile's sixth argument --
 *   see that file's own doc comment for the "read it from the world"
 *   default. Additive; omitted, buildNPCDialogueContext reads
 *   getPersistedNpcObligations(world).get(npcId) itself, so no existing
 *   caller has to change for obligations to reach goal derivation.
 */
export async function generateDialogue(
  client: ClaudeClient,
  world: WorldState,
  npcId: string,
  playerUtterance: string,
  tone: string,
  playerPresence?: string,
  playerProfile?: CharacterProfile | null,
  playerRumors?: PlayerRumor[],
  activePressures?: WorldPressure[],
  lastNpcActions?: NpcActionResult[],
  economyContext?: string,
  craftingContext?: string,
  opportunityContext?: string,
  conversationHistory?: ConversationExchange[],
  logger?: DebugLogger,
  consecutiveFallbacks?: number,
  activeOpportunities?: OpportunityState[],
  partyPresence?: string,
  obligations?: NpcObligationLedger,
): Promise<DialogueResult | null> {
  const context = buildNPCDialogueContext(world, npcId, playerUtterance, tone, playerPresence, playerProfile ?? undefined, playerRumors, activePressures, lastNpcActions, activeOpportunities, partyPresence, obligations);
  if (context && economyContext) context.economyContext = economyContext;
  if (context && craftingContext) context.craftingContext = craftingContext;
  if (context && opportunityContext) context.opportunityContext = opportunityContext;
  if (context && conversationHistory) context.conversationHistory = conversationHistory;
  // Resolve NPC tags for voice style
  if (context) {
    const npc = world.entities[npcId];
    if (npc?.tags) context.npcTags = npc.tags;
  }
  if (!context) return null;

  const prompt = buildDialoguePrompt(context);

  // PBR-002: Wrap LLM call in try/catch — return in-character fallback on failure
  let resultText: string;
  try {
    const systemPrompt = buildDialogueSystemPrompt(context);
    const result = await client.generate({
      system: systemPrompt,
      prompt,
      maxTokens: 200,
    });
    resultText = result.text.trim();
  } catch (err) {
    // F-6480985e: domain-wide fatal-error contract (documented in claude-errors.ts
    // near NarrationError.fatal) — fatal (auth/bad-request) errors rethrow so
    // bin.ts's presentError renders the structured system-level box, matching
    // narrator.ts's narrateScene/narrateSceneLegacy. Surfacing userMessage() as
    // the NPC's own spoken line (the old behavior) made a bad API key
    // indistinguishable from in-fiction dialogue. Non-fatal kinds keep the
    // in-character stall — a transient hiccup shouldn't break immersion.
    const narrationErr = err instanceof NarrationError ? err : classifyError(err);
    if (narrationErr.fatal) throw narrationErr;
    // F-afb978de: userMessage() maps each NarrationErrorKind to a specific,
    // actionable string (claude-errors.ts) but was dead code in this domain.
    // Logged here alongside the diagnostic message, and returned via
    // fallbackMessage below -- `text` itself stays the in-character stall
    // (see the comment above) rather than being replaced by it.
    const guidance = userMessage(narrationErr);
    const failureMessage = `LLM generation failed for NPC "${npcId}": ${narrationErr.message}. ${guidance} Using fallback.`;
    console.warn(`[dialogue-mind] ${failureMessage}`);
    logger?.warn('dialogue-mind', failureMessage);
    const npc = world.entities[npcId];
    // F-c3d1fcdf: from the 2nd consecutive fallback onward, rotate through
    // REPEATED_STALL_LINES instead of repeating STALL_LINE unchanged for the
    // outage's entire duration -- same escalation trigger narrator.ts uses
    // for FALLBACK_NARRATION_REPEATED (F-681d3382).
    const text = (consecutiveFallbacks ?? 0) >= 1
      ? pickRepeatedStallLine(consecutiveFallbacks ?? 0)
      : STALL_LINE;
    return {
      speakerId: npcId,
      speakerName: npc?.name ?? npcId,
      text,
      grounding: {
        beliefCount: context.beliefs.length,
        memoryCount: context.recentMemories.length,
        factionId: context.faction?.name,
        morale: context.morale,
        suspicion: context.suspicion,
      },
      isFallback: true,
      fallbackMessage: guidance,
    };
  }

  const npc = world.entities[npcId];

  return {
    speakerId: npcId,
    speakerName: npc?.name ?? npcId,
    text: resultText,
    grounding: {
      beliefCount: context.beliefs.length,
      memoryCount: context.recentMemories.length,
      factionId: context.faction?.name,
      morale: context.morale,
      suspicion: context.suspicion,
    },
    isFallback: false,
  };
}
