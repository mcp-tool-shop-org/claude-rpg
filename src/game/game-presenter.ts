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
import type { HostileDescriptor } from './condition.js';

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
  /** Stitch (wave 8, slice A5 §5): passed straight through to renderPlayScreen's ambush banner slot. */
  ambushHeadline?: string;
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
  /**
   * WO-B1-1 (slice B1 §1, design lock 1): the zone's live hostiles, one
   * token-vocabulary reading (game/condition.ts's `describeHostiles`) for
   * cli-display's own status-hostile-line WO this same wave to render.
   * Passed through to renderPlayScreen as a plain (non-literal) reference,
   * so an extra field renderPlayScreen's OWN param type doesn't declare yet
   * is not an excess-property error here -- cli-display's own WO-B1-*
   * (ADDENDUM-COMMON design lock 1/5) adds the matching field to
   * src/display/play-renderer.ts this same wave; green expected at merge,
   * same cross-domain-threading pattern turnNumber/ambientLines already
   * established above.
   */
  hostiles?: HostileDescriptor[];
  /**
   * WO-B1-3 (design lock 2): the reserved combat channel's lines for this
   * turn (turn-loop.ts's TurnResult.combatLines) -- cli-display renders
   * this in a reserved block above the narration (their own WO this same
   * wave). Green expected at merge, same as `hostiles` above.
   */
  combatLines?: string[];
  /**
   * WO-B1-5 (design lock 8): the acknowledgment line for a genuine ask
   * helped this turn (game.ts's own post-executeTurn computation, game/
   * recognition.ts). Green expected at merge, same as `hostiles` above.
   */
  recognitionLine?: string;
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
 * F-2e80b14b: the trailer/actions line below (renderConcludeOutput) was a
 * single unwrapped string pushed straight into `lines`, unlike that
 * function's own heavyDivider/thinDivider two lines above it, which are
 * explicitly sized via getTerminalWidth() -- the same overflow-at-narrow-
 * width bug class already fixed for this exact pattern elsewhere in the
 * codebase (help-system.ts's renderNameDescriptionRow, F-a17315ac/
 * F-d36903d0/F-1367afd9; play-renderer.ts's wrapStatusLine, F-7eff9b3a,
 * which this mirrors). Segments are treated as atomic units -- never split
 * mid-segment -- and wrapped once a candidate line would exceed
 * getTerminalWidth(), with a hanging indent on continuation lines.
 * Reimplemented locally rather than calling wrapStatusLine directly: that
 * helper lives in cli-display's domain (play-renderer.ts, out of scope
 * here) and hardcodes a " | " separator, which would silently change this
 * line's existing "  |  " spacing even when nothing wraps. Each step
 * measures the real candidate length against the real width, so
 * correctness doesn't depend on the lead and hanging indents being the
 * same length (a plain wrapWords-with-a-precomputed-budget approach would
 * need that invariant to hold and silently overflow by (hangIndent.length -
 * leadIndent.length) columns if it didn't). Byte-identical to the old raw
 * string when every segment fits on one line.
 */
function wrapTrailerLine(leadIndent: string, segments: string[]): string {
  const width = getTerminalWidth();
  const contIndent = '    ';
  const rows: string[] = [];
  let current = '';
  for (const seg of segments) {
    if (current === '') {
      current = `${leadIndent}${seg}`;
      continue;
    }
    const candidate = `${current}  |  ${seg}`;
    if (candidate.length > width) {
      rows.push(current);
      current = `${contIndent}${seg}`;
    } else {
      current = candidate;
    }
  }
  if (current !== '') rows.push(current);
  return rows.join('\n');
}

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
  lines.push(
    wrapTrailerLine('  ', [
      'Continue playing',
      'Type "save" to archive',
      '/export md',
      'Type "quit" to exit',
    ]),
  );

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
