// game-narration.ts: LLM-facing narration assembly and fallback shaping.
// This seam consumes canonical state inputs and calls the adapted client.
// It never authors authoritative state. Narration text is display-only.

import type { WorldState } from '@ai-rpg-engine/core';
import type { PresentationState } from '@ai-rpg-engine/presentation';
import type { ClaudeClient } from '../claude-client.js';
import { narrateScene, type NarrationResult } from '../narrator/narrator.js';
import { narrateFinale } from '../narrator/finale-narrator.js';
import type { FinaleOutline } from '@ai-rpg-engine/campaign-memory';

// ─── Opening Narration ───────────────────────────────────────

export type OpeningNarrationContext = {
  client: ClaudeClient;
  world: WorldState;
  tone: string;
  immersionState: PresentationState;
  narratorPresence?: string;
  pressureContext?: string[];
  districtDescriptor?: string;
  partyPresence?: string;
  economyContext?: string;
  arcContext?: string;
  endgameContext?: string;
};

/** Call the LLM to generate the opening scene narration. Returns narration text only. */
export async function generateOpeningNarration(ctx: OpeningNarrationContext): Promise<NarrationResult> {
  return narrateScene(
    ctx.client,
    ctx.world,
    [],
    ctx.tone,
    [],
    undefined,
    ctx.immersionState,
    ctx.narratorPresence,
    ctx.pressureContext,
    ctx.districtDescriptor,
    ctx.partyPresence,
    ctx.economyContext,
    undefined, // craftingContext
    undefined, // opportunityContext
    ctx.arcContext,
    ctx.endgameContext,
  );
}

// ─── Finale Narration ────────────────────────────────────────

export type FinaleNarrationContext = {
  client: ClaudeClient;
  outline: FinaleOutline;
  genre: string;
  characterName?: string;
};

/** Call the LLM to generate the finale epilogue. */
export async function generateFinaleNarration(ctx: FinaleNarrationContext): Promise<{
  deterministicSummary: string;
  epilogue?: string;
  worldAfter: string;
}> {
  return narrateFinale(ctx.client, ctx.outline, ctx.genre, ctx.characterName);
}
