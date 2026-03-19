// game-narration.ts: LLM-facing narration assembly and fallback shaping.
// This seam consumes canonical state inputs and calls the adapted client.
// It never authors authoritative state. Narration text is display-only.

import type { WorldState } from '@ai-rpg-engine/core';
import type { PresentationState } from '@ai-rpg-engine/presentation';
import type { ClaudeClient, StreamCallback } from '../claude-client.js';
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
  onChunk?: StreamCallback;
};

/** Call the LLM to generate the opening scene narration. Returns narration text only. */
export async function generateOpeningNarration(ctx: OpeningNarrationContext): Promise<NarrationResult> {
  return narrateScene({
    client: ctx.client,
    world: ctx.world,
    recentEvents: [],
    tone: ctx.tone,
    recentNarration: [],
    presentationState: ctx.immersionState,
    characterPresence: ctx.narratorPresence,
    activePressures: ctx.pressureContext,
    districtDescriptor: ctx.districtDescriptor,
    partyPresence: ctx.partyPresence,
    economyContext: ctx.economyContext,
    arcContext: ctx.arcContext,
    endgameContext: ctx.endgameContext,
    onChunk: ctx.onChunk,
  });
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
