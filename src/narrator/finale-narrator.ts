// Finale narrator: LLM epilogue generation grounded in FinaleOutline
// v2.0: hybrid finale — deterministic outline + optional prose epilogue

import type { FinaleOutline } from '@ai-rpg-engine/campaign-memory';
import { formatFinaleForTerminal } from '@ai-rpg-engine/campaign-memory';
import type { ClaudeClient } from '../claude-client.js';
import { FINALE_SYSTEM, buildFinalePrompt } from '../prompts/finale-prompt.js';

export type FinaleNarrationResult = {
  epilogue: string;
  deterministicSummary: string;
};

/** Generate a full finale: deterministic summary + LLM epilogue prose. */
export async function narrateFinale(
  client: ClaudeClient,
  outline: FinaleOutline,
  genre: string,
  playerName?: string,
): Promise<FinaleNarrationResult> {
  const deterministicSummary = formatFinaleForTerminal(outline);

  let epilogue: string;
  try {
    const userPrompt = buildFinalePrompt(outline, genre, playerName);
    const result = await client.generate({
      system: FINALE_SYSTEM,
      prompt: userPrompt,
      maxTokens: 400,
    });
    epilogue = result.text.trim();
  } catch {
    // Fallback: no LLM epilogue, just the deterministic summary
    epilogue = '';
  }

  return { epilogue, deterministicSummary };
}
