// Dialogue Mind: generate NPC dialogue grounded in simulation state

import type { WorldState } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { PlayerRumor, WorldPressure, NpcActionResult } from '@ai-rpg-engine/modules';
import type { ClaudeClient } from '../claude-client.js';
import { DIALOGUE_SYSTEM, buildDialoguePrompt } from '../prompts/dialogue-npc.js';
import { buildNPCDialogueContext } from './npc-context.js';

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
): Promise<DialogueResult | null> {
  const context = buildNPCDialogueContext(world, npcId, playerUtterance, tone, playerPresence, playerProfile ?? undefined, playerRumors, activePressures, lastNpcActions);
  if (context && economyContext) context.economyContext = economyContext;
  if (context && craftingContext) context.craftingContext = craftingContext;
  if (context && opportunityContext) context.opportunityContext = opportunityContext;
  if (!context) return null;

  const prompt = buildDialoguePrompt(context);

  // PBR-002: Wrap LLM call in try/catch — return in-character fallback on failure
  let resultText: string;
  try {
    const result = await client.generate({
      system: DIALOGUE_SYSTEM,
      prompt,
      maxTokens: 200,
    });
    resultText = result.text.trim();
  } catch (err) {
    console.warn(
      `[dialogue-mind] LLM generation failed for NPC "${npcId}": ${err instanceof Error ? err.message : String(err)}. Using fallback.`,
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
