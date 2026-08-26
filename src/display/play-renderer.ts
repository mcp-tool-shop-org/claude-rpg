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

// Exported for testing
export { getTerminalWidth };

/** Render the full play mode screen. */
export function renderPlayScreen(opts: {
  narration: string;
  dialogue?: DialogueResult | null;
  world: WorldState;
  availableActions: string[];
  profileStatus?: StatusData;
  leverageStatus?: string;
  partyStatusLine?: string;
  suggestions?: ContextualSuggestion[];
  hasEndgameTriggers?: boolean;
  turnNumber?: number;
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
