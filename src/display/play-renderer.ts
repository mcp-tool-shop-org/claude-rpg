// Play mode terminal renderer
// v0.2: enhanced status bar with profile data
// v1.1: leverage status line + contextual suggestions

import type { WorldState } from '@ai-rpg-engine/core';
import type { DialogueResult } from '../dialogue/dialogue-mind.js';
import type { StatusData } from '../character/presence.js';
import type { ContextualSuggestion } from './contextual-suggestions.js';

// PFE-005: Adapt divider width to terminal, clamped to 40-120, fallback 60.
function getTerminalWidth(): number {
  const cols = process.stdout.columns ?? 60;
  return Math.max(40, Math.min(120, cols));
}

function makeDivider(): string {
  return '─'.repeat(getTerminalWidth());
}

function makeThinDivider(): string {
  return '·'.repeat(getTerminalWidth());
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
}): string {
  const parts: string[] = [];

  parts.push('');
  parts.push(makeDivider());

  // Endgame approach banner (v2.1)
  if (opts.hasEndgameTriggers) {
    parts.push('  ── approaching conclusion ──');
  }

  // Narration
  parts.push('');
  parts.push(opts.narration);
  parts.push('');

  // Dialogue
  if (opts.dialogue) {
    parts.push(makeThinDivider());
    parts.push(`  ${opts.dialogue.speakerName}: "${opts.dialogue.text}"`);
    parts.push('');
  }

  parts.push(makeThinDivider());

  // Player status bar — enhanced when profile available
  if (opts.profileStatus) {
    const ps = opts.profileStatus;
    const titlePart = ps.title ? ` "${ps.title}"` : '';
    const nameLine = `${ps.name}${titlePart} (Lv${ps.level} ${ps.archetypeName})`;

    const statParts: string[] = [];
    statParts.push(`HP: ${ps.hp}`);
    if (ps.weaponName) statParts.push(ps.weaponName);
    if (ps.armorName) statParts.push(ps.armorName);
    if (ps.injuryTags.length > 0) {
      statParts.push(`[${ps.injuryTags.join(', ')}]`);
    }

    parts.push(`  ${nameLine} | ${statParts.join(' | ')}`);
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
      parts.push(`  hint: ${s.text}`);
    }
  }

  // Prompt
  parts.push('');
  parts.push('  What do you do?');
  parts.push('');

  return parts.join('\n');
}

/** Render a simple status line for between turns. */
export function renderThinking(): string {
  return '\n  ...\n';
}

/** Render the welcome screen. */
export function renderWelcome(title: string, tone?: string): string {
  const parts: string[] = [];
  parts.push('');
  parts.push(makeDivider());
  parts.push(`  ${title}`);
  if (tone) {
    parts.push(`  ${tone}`);
  }
  parts.push(makeDivider());
  parts.push('');
  parts.push('  Type actions in plain English. Type "quit" to exit, "save" to save.');
  parts.push('  Type "/director" to inspect hidden truth, "/sheet" to view character.');
  parts.push('');
  return parts.join('\n');
}
