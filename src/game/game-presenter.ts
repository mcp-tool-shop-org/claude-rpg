// game-presenter.ts: Terminal-facing output assembly.
// Consumes already-decided outcomes (canonical state + narration result).
// Never mutates state. Never calls the client.

import type { WorldState } from '@ai-rpg-engine/core';
import type { DialogueResult } from '../dialogue/dialogue-mind.js';
import { renderPlayScreen, renderWelcome, renderThinking } from '../display/play-renderer.js';
import { getOnboardingByGenre, renderFirstTurnOrientation } from '../display/help-system.js';
import { formatPartyStatusLine } from '@ai-rpg-engine/modules';
import type { PartyState } from '@ai-rpg-engine/modules';
import type { StatusData } from '../character/presence.js';
import type { ContextualSuggestion } from '../display/contextual-suggestions.js';

// ─── Simple Delegates ────────────────────────────────────────

/** Get the welcome screen text. */
export function renderWelcomeScreen(title: string, tone: string): string {
  return renderWelcome(title, tone);
}

/** Get the "thinking" indicator. */
export function renderThinkingIndicator(): string {
  return renderThinking();
}

// ─── Play Screen Assembly ────────────────────────────────────

/** Render the play screen from decided outcomes. */
export function renderPlayOutput(input: {
  narration: string;
  dialogue?: DialogueResult | null;
  world: WorldState;
  availableActions: string[];
  profileStatus?: StatusData;
  leverageStatus?: string;
  partyStatusLine?: string;
  suggestions?: ContextualSuggestion[];
  hasEndgameTriggers?: boolean;
}): string {
  return renderPlayScreen(input);
}

/** Render the opening play screen with optional first-turn onboarding. */
export function renderOpeningOutput(
  narration: string,
  world: WorldState,
  availableActions: string[],
  profileStatus: StatusData | undefined,
  genre: string,
): string {
  let output = renderPlayScreen({
    narration,
    world,
    availableActions,
    profileStatus,
  });

  const onboarding = getOnboardingByGenre(genre);
  if (onboarding) {
    output += renderFirstTurnOrientation(onboarding);
  }

  return output;
}

// ─── Finale Output ───────────────────────────────────────────

/** Format the conclusion terminal output from decided finale data. */
export function renderConcludeOutput(result: {
  deterministicSummary: string;
  epilogue?: string;
  worldAfter: string;
}): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('  ═'.repeat(30));
  lines.push('  CAMPAIGN CONCLUSION');
  lines.push('  ═'.repeat(30));
  lines.push('');
  lines.push(result.deterministicSummary);
  if (result.epilogue) {
    lines.push('');
    lines.push('  ─'.repeat(30));
    lines.push('');
    lines.push(`  ${result.epilogue.split('\n').join('\n  ')}`);
  }
  lines.push('');
  lines.push(result.worldAfter);
  lines.push('');
  lines.push('  ─'.repeat(30));
  lines.push('  Continue playing  |  Type "save" to archive  |  /export md  |  Type "quit" to exit');

  return lines.join('\n');
}

// ─── Party Status ────────────────────────────────────────────

/** Build party status line from party state + entity names. */
export function buildPartyStatusLine(
  partyState: PartyState,
  world: WorldState,
): string | undefined {
  if (partyState.companions.length === 0) return undefined;
  const companionNames: Record<string, string> = {};
  for (const comp of partyState.companions) {
    companionNames[comp.npcId] = world.entities[comp.npcId]?.name ?? comp.npcId;
  }
  return formatPartyStatusLine(partyState, companionNames) ?? undefined;
}
