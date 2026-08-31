// Play mode terminal renderer
// v0.2: enhanced status bar with profile data
// v1.1: leverage status line + contextual suggestions
// v1.2: semantic terminal coloring

import type { WorldState } from '@ai-rpg-engine/core';
import type { DialogueResult } from '../dialogue/dialogue-mind.js';
import type { StatusData } from '../character/presence.js';
import type { ContextualSuggestion } from './contextual-suggestions.js';
import { bold, dim, secondary, speaker, hint, cyan, yellow, red, critical } from '../cli/colors.js';

// PFE-005: Adapt divider width to terminal, clamped to 40-120, fallback 60.
function getTerminalWidth(): number {
  const cols = process.stdout.columns ?? 60;
  return Math.max(40, Math.min(120, cols));
}

function makeDivider(): string {
  return dim('─'.repeat(getTerminalWidth()));
}

/**
 * Build a turn-numbered divider using double-line box characters.
 *
 * F-a2a609b6: used to open with its own hardcoded '\n' on top of the blank
 * line renderPlayScreen's own `parts.push('')` already supplies right
 * before calling this -- giving every numbered turn one more blank line
 * above its rule than the non-numbered makeDivider() fallback gets. The
 * caller already supplies that blank line, so this must not add a second
 * one.
 */
export function makeTurnDivider(turnNumber: number): string {
  const label = ` Turn ${turnNumber} `;
  const width = getTerminalWidth();
  const remaining = Math.max(0, width - label.length);
  const left = Math.floor(remaining / 2);
  const right = remaining - left;
  return dim('═'.repeat(left)) + cyan(bold(label)) + dim('═'.repeat(right));
}

function makeThinDivider(): string {
  return dim('·'.repeat(getTerminalWidth()));
}

/**
 * F-ce17a470: colors.ts's `critical` composite (bold red, doc'd "Critical
 * danger / death") had zero production call sites -- HP, the single most
 * important number in the game, rendered as plain uncolored text at every
 * severity in both this file's full status bar and status-compact.ts's
 * snapshot. Shared here (and imported by status-compact.ts) so both screens
 * agree on one threshold instead of two independently-tuned ones. 25% of
 * max is a conventional "low health" cutoff, wide enough to warn a player
 * before HP hits 0. Only applies when maxHp is known -- without it there's
 * no scale to measure "low" against, so callers leave the number plain
 * rather than guessing an absolute, scale-inappropriate cutoff.
 */
const CRITICAL_HP_RATIO = 0.25;

export function isCriticalHp(hp: number, maxHp?: number): boolean {
  return maxHp !== undefined && maxHp > 0 && hp / maxHp <= CRITICAL_HP_RATIO;
}

/**
 * F-61e67d85: src/npc/ambient-dialogue.ts's generateZoneAmbience can return
 * up to 3 lines for a busy multi-NPC zone -- showing all 3 every single turn
 * would compete with and drown out the status footer below. A defensive
 * display-layer ceiling, independent of whatever cadence/throttle game-core
 * designs upstream for how often ambience fires at all.
 */
const MAX_AMBIENT_LINES_SHOWN = 1;

// Exported for testing
export { getTerminalWidth };

/** Render the full play mode screen. */
export function renderPlayScreen(opts: {
  narration: string;
  dialogue?: DialogueResult | null;
  world: WorldState;
  /**
   * F-fa6524ec: this function body never reads opts.availableActions --
   * every caller (in this domain and out of it) had to compute the full
   * available-actions list purely to satisfy what was a REQUIRED field, for
   * a value unconditionally discarded here. Engine 3.9 widens what that
   * computation returns (~24 player-leverage verbs plus the new
   * salvage/craft/repair/modify and quest/equip verbs), so callers were
   * paying more to produce a value nothing here reads. Made optional rather
   * than deleted so no caller in another domain needs an edit this wave.
   * Wiring this into an actual rendered hint line (e.g. an "Available:
   * ..." line) is a feature-pass candidate gated on a Director ruling, not
   * decided here.
   */
  availableActions?: string[];
  profileStatus?: StatusData;
  leverageStatus?: string;
  partyStatusLine?: string;
  suggestions?: ContextualSuggestion[];
  hasEndgameTriggers?: boolean;
  turnNumber?: number;
  /**
   * F-61e67d85: template-generated ambient NPC flavor lines (see
   * src/npc/ambient-dialogue.ts's generateZoneAmbience -- zero-API-cost,
   * fully unit-tested, but had no rendering surface anywhere in cli-display
   * until now). Optional so every existing caller that doesn't pass one
   * keeps rendering unchanged. Capped at MAX_AMBIENT_LINES_SHOWN regardless
   * of how many the channel supplies.
   */
  ambientLines?: string[];
}): string {
  const parts: string[] = [];

  parts.push('');
  if (opts.turnNumber != null && opts.turnNumber > 0) {
    parts.push(makeTurnDivider(opts.turnNumber));
  } else {
    parts.push(makeDivider());
  }

  // Endgame approach banner (v2.1)
  if (opts.hasEndgameTriggers) {
    parts.push(yellow('  ── approaching conclusion ──'));
  }

  // Narration
  parts.push('');
  parts.push(opts.narration);
  parts.push('');

  // Dialogue
  if (opts.dialogue) {
    parts.push(makeThinDivider());
    parts.push(`  ${speaker(opts.dialogue.speakerName)}: "${opts.dialogue.text}"`);
    parts.push('');
  }

  // Ambient NPC flavor lines (F-61e67d85) -- peripheral, non-primary
  // texture, subordinate to both plain narration (unstyled) and direct
  // dialogue (speaker()+bold) above. Styled dim() with the same '  · '
  // bullet convention presentation-renderer.ts's cue lines already use, for
  // one visual language across every "peripheral, non-primary" text block
  // in the app. Capped at MAX_AMBIENT_LINES_SHOWN regardless of how many the
  // channel supplies -- see that const's own doc comment.
  if (opts.ambientLines && opts.ambientLines.length > 0) {
    for (const line of opts.ambientLines.slice(0, MAX_AMBIENT_LINES_SHOWN)) {
      parts.push(dim(`  · ${line}`));
    }
    parts.push('');
  }

  parts.push(makeThinDivider());

  // Player status bar — enhanced when profile available
  if (opts.profileStatus) {
    const ps = opts.profileStatus;
    const titlePart = ps.title ? ` "${ps.title}"` : '';
    const nameLine = `${ps.name}${titlePart} (Lv${ps.level} ${ps.archetypeName})`;

    const statParts: string[] = [];
    const hpText = `HP: ${ps.hp}`;
    statParts.push(isCriticalHp(ps.hp, ps.maxHp) ? critical(hpText) : hpText);
    if (ps.weaponName) statParts.push(ps.weaponName);
    if (ps.armorName) statParts.push(ps.armorName);
    if (ps.injuryTags.length > 0) {
      statParts.push(red(`[${ps.injuryTags.join(', ')}]`));
    }

    parts.push(`  ${bold(nameLine)} | ${statParts.join(' | ')}`);
  } else {
    // Legacy status bar
    const player = opts.world.entities[opts.world.playerId];
    if (player) {
      const statParts: string[] = [];
      for (const [key, val] of Object.entries(player.resources)) {
        statParts.push(`${key}: ${val}`);
      }
      const statuses = (player.statuses ?? []).map((s) => s.statusId);
      if (statuses.length > 0) {
        statParts.push(`[${statuses.join(', ')}]`);
      }
      parts.push(`  ${player.name} | ${statParts.join(' | ')}`);
    }
  }

  // Leverage status line
  if (opts.leverageStatus && opts.leverageStatus !== 'No leverage') {
    parts.push(`  ${opts.leverageStatus}`);
  }

  // Party status line
  if (opts.partyStatusLine) {
    parts.push(opts.partyStatusLine);
  }

  // Zone info
  const zone = opts.world.zones[opts.world.locationId];
  if (zone) {
    const exits = zone.neighbors
      .map((id) => opts.world.zones[id]?.name ?? id)
      .join(', ');
    parts.push(`  Location: ${zone.name}${exits ? ` | Exits: ${exits}` : ''}`);
  }

  parts.push(makeDivider());

  // Contextual suggestions
  if (opts.suggestions && opts.suggestions.length > 0) {
    for (const s of opts.suggestions) {
      parts.push(hint(`  hint: ${s.text}`));
    }
  }

  // Prompt
  parts.push('');
  parts.push(bold('  What do you do?'));
  parts.push('');

  return parts.join('\n');
}

/** Render a simple status line for between turns (non-TTY fallback). */
export function renderThinking(): string {
  return dim('\n  ...\n');
}

/** Render the welcome screen. */
export function renderWelcome(title: string, tone?: string): string {
  const parts: string[] = [];
  parts.push('');
  parts.push(makeDivider());
  parts.push(`  ${bold(title)}`);
  if (tone) {
    parts.push(`  ${secondary(tone)}`);
  }
  parts.push(makeDivider());
  parts.push('');
  parts.push(hint('  Type actions in plain English. Type "quit" to exit, "save" to save.'));
  parts.push(hint('  Type "/director" to inspect hidden truth, "/sheet" to view character.'));
  // F-55401320: this was the only hint line on the very first screen a
  // player sees, and it pointed at a niche diagnostic mode plus the
  // character sheet -- never at the one command that surfaces everything
  // else the game supports.
  parts.push(hint('  Type "/help" for the full command reference.'));
  parts.push('');
  return parts.join('\n');
}

/**
 * F-7484bd2e (SLATE-6): nothing rendered a distinct on-screen consequence
 * when the presentation state machine reached 'menu' (player death) -- the
 * screen fell straight back to the ordinary "What do you do?" prompt as if
 * nothing happened, even though the fade-to-black cue itself already
 * rendered correctly (presentation-renderer.ts's renderScreenPause).
 *
 * Colocated with the other full-screen composers (renderPlayScreen/
 * renderWelcome above), not with presentation-renderer.ts's narrower
 * cue-line-mapping concern. Layout deliberately matches renderScreenPause's
 * critical()+'═' signature (NOT game-presenter.ts's renderConcludeOutput,
 * which uses bare uncolored dividers -- campaign conclusion is a neutral/
 * celebratory closure across many possible endings; death is a narrower,
 * always-dramatic beat that keeps its own signature).
 *
 * Director ruling R3 (wave-18/cli-display.md coordinator brief): death is a
 * SETBACK, not an ending. The headline may still read '<name> HAS FALLEN',
 * but the affordance line is continue-first ("rise"), not a farewell --
 * save/quit are noted as still available, not offered as the primary next
 * step. Whether "continue" needs special turn-loop dispatch, or gating so
 * an ordinary verb doesn't silently resume play, is game-core's/
 * turn-loop.ts's decision (F-961f14aa's territory) -- outside what a
 * screen-rendering function can enforce.
 *
 * Deliberately drops everything renderPlayScreen normally carries (status
 * bar, zone/exits, leverage/party lines, suggestions), mirroring
 * renderConcludeOutput's own minimalism -- this is a full-screen interrupt,
 * not a variant of the ordinary turn screen.
 *
 * All copy below is DRAFT, pending coordinator/director review.
 */
export function renderDeathScreen(opts: { narration: string; characterName?: string }): string {
  const rule = critical('═'.repeat(getTerminalWidth()));
  const headline = opts.characterName ? `${opts.characterName} HAS FALLEN` : 'YOU HAVE FALLEN';

  const parts: string[] = [];
  parts.push('');
  parts.push(rule);
  parts.push(`  ${critical(headline)}`);
  parts.push(rule);
  parts.push('');
  parts.push(opts.narration);
  parts.push('');
  parts.push(dim('─'.repeat(getTerminalWidth())));
  parts.push(hint('  Type "continue" when you are ready to rise.'));
  parts.push(hint('  "quit" will save and exit.'));
  parts.push('');
  return parts.join('\n');
}
