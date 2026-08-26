// Dialogue Mind: generate NPC dialogue grounded in simulation state

import type { WorldState } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { PlayerRumor, WorldPressure, NpcActionResult } from '@ai-rpg-engine/modules';
import type { ClaudeClient } from '../claude-client.js';
import { DIALOGUE_SYSTEM, buildDialoguePrompt, buildDialogueSystemPrompt, type ConversationExchange } from '../prompts/dialogue-npc.js';
import { buildNPCDialogueContext } from './npc-context.js';
import { NarrationError } from '../llm/claude-errors.js';
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
};

/** Generate grounded NPC dialogue. */
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
    console.warn(
      `[dialogue-mind] LLM generation failed for NPC "${npcId}": ${narrationErr.message}. Using fallback.`,
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
  };
}
