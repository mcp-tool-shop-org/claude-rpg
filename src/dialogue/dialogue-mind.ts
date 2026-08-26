// Dialogue Mind: generate NPC dialogue grounded in simulation state

import type { WorldState } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { PlayerRumor, WorldPressure, NpcActionResult } from '@ai-rpg-engine/modules';
import type { ClaudeClient } from '../claude-client.js';
import { DIALOGUE_SYSTEM, buildDialoguePrompt, buildDialogueSystemPrompt, type ConversationExchange } from '../prompts/dialogue-npc.js';
import { buildNPCDialogueContext } from './npc-context.js';
import { NarrationError, userMessage } from '../llm/claude-errors.js';
import { classifyError } from '../llm/claude-adapter.js';

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
): Promise<DialogueResult | null> {
  const context = buildNPCDialogueContext(world, npcId, playerUtterance, tone, playerPresence, playerProfile ?? undefined, playerRumors, activePressures, lastNpcActions);
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
    console.warn(
      `[dialogue-mind] LLM generation failed for NPC "${npcId}": ${narrationErr.message}. ${guidance} Using fallback.`,
    );
    const npc = world.entities[npcId];
    return {
      speakerId: npcId,
      speakerName: npc?.name ?? npcId,
      text: 'The NPC pauses, gathering their thoughts...',
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
