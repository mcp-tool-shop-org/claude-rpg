// game-presenter.ts: Terminal-facing output assembly.
// Consumes already-decided outcomes (canonical state + narration result).
// Never mutates state. Never calls the client.

import type { WorldState } from '@ai-rpg-engine/core';
import type { DialogueResult } from '../dialogue/dialogue-mind.js';
// F-6bc0721e (SLATE-6, contract amendment #6, brief ruled 2026-08-26):
// cli-display exports renderDeathScreen from src/display/play-renderer.ts
// this same wave -- not yet present in this isolated worktree's copy. See
// this file's own test for the vi.mock covering this gap.
import { renderPlayScreen, renderWelcome, renderThinking, getTerminalWidth, renderDeathScreen } from '../display/play-renderer.js';
import { getOnboardingForSession, renderFirstTurnOrientation } from '../display/help-system.js';
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
  /**
   * Cross-domain contract (game-core half): the current turn number, passed
   * straight through to renderPlayScreen — cli-display's play-renderer
   * already consumes this via makeTurnDivider when present (see
   * src/display/play-renderer.ts / turn-divider.test.ts). Optional so every
   * existing caller that doesn't pass one keeps rendering the plain divider.
   */
  turnNumber?: number;
  /**
   * F-6e75fa93 (SLATE-1, brief ruled 2026-08-26): zero-LLM-cost ambient NPC
   * chatter lines generated this turn (turn-loop.ts's TurnResult.ambientLines),
   * passed straight through to renderPlayScreen — mirrors turnNumber's own
   * passthrough contract just above. Optional so every existing caller that
   * doesn't pass one keeps rendering without an ambient-lines block.
   */
  ambientLines?: string[];
}): string {
  return renderPlayScreen(input);
}

// ─── Downed / Death Screen ───────────────────────────────────

/**
 * F-6bc0721e (SLATE-6, contract amendment #6, brief ruled 2026-08-26): thin
 * wrapper around cli-display's renderDeathScreen, mirroring
 * renderConcludeOutput's role just below as the dedicated-framing screen for
 * a distinct game state (there, campaign conclusion; here, the player going
 * down) rather than the ordinary play screen.
 */
export function renderDeathOutput(narration: string, characterName?: string): string {
  return renderDeathScreen({ narration, characterName });
}

/** Render the opening play screen with optional first-turn onboarding. */
export function renderOpeningOutput(
  narration: string,
  world: WorldState,
  availableActions: string[],
  profileStatus: StatusData | undefined,
  genre: string,
  packId?: string,
): string {
  let output = renderPlayScreen({
    narration,
    world,
    availableActions,
    profileStatus,
  });

  // F-ed5f7d25: prefer the pack-id lookup — genre keying collides ('historical'
  // is shared) and misses 7 of 10 packs; genre stays as the custom-world fallback.
  const onboarding = getOnboardingForSession(packId, genre);
  if (onboarding) {
    output += renderFirstTurnOrientation(onboarding);
  }

  return output;
}

// ─── Finale Output ───────────────────────────────────────────

/**
 * Format the conclusion terminal output from decided finale data.
 *
 * F-001ef2af / F-81067750: the section dividers used to be built as
 * '  ═'.repeat(30) / '  ─'.repeat(30) — repeating the entire 3-character
 * UNIT "two spaces + the glyph" 30 times, not "2 spaces followed by 30
 * solid glyphs". That produced a 90-character, space-gapped
 * "  ═  ═  ═ ..." string instead of a solid banner rule, on the single
 * most narratively climactic screen in the game. Fixed to match the
 * established sibling pattern (sheet.ts's DIVIDER, chronicle-renderer.ts's
 * HEAVY_DIVIDER, play-renderer.ts's makeDivider): a bare, solid repeated
 * glyph with no baked-in indent — content lines carry their own 2-space
 * indent instead — sized via play-renderer.ts's getTerminalWidth() so the
 * banner adapts to narrow terminals instead of staying hardcoded.
 */
export function renderConcludeOutput(result: {
  deterministicSummary: string;
  epilogue?: string;
  worldAfter: string;
}): string {
  const heavyDivider = '═'.repeat(getTerminalWidth());
  const thinDivider = '─'.repeat(getTerminalWidth());
  const lines: string[] = [];
  lines.push('');
  lines.push(heavyDivider);
  lines.push('  CAMPAIGN CONCLUSION');
  lines.push(heavyDivider);
  lines.push('');
  lines.push(result.deterministicSummary);
  if (result.epilogue) {
    lines.push('');
    lines.push(thinDivider);
    lines.push('');
    lines.push(`  ${result.epilogue.split('\n').join('\n  ')}`);
  }
  lines.push('');
  lines.push(result.worldAfter);
  lines.push('');
  lines.push(thinDivider);
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
