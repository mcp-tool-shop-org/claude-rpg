// Play mode terminal renderer
// v0.2: enhanced status bar with profile data

import type { WorldState } from '@ai-rpg-engine/core';
import type { DialogueResult } from '../dialogue/dialogue-mind.js';
import type { StatusData } from '../character/presence.js';

const DIVIDER = '─'.repeat(60);
const THIN_DIVIDER = '·'.repeat(60);

/** Render the full play mode screen. */
export function renderPlayScreen(opts: {
  narration: string;
  dialogue?: DialogueResult | null;
  world: WorldState;
  availableActions: string[];
  profileStatus?: StatusData;
}): string {
  const parts: string[] = [];

  parts.push('');
  parts.push(DIVIDER);

  // Narration
  parts.push('');
  parts.push(opts.narration);
  parts.push('');

  // Dialogue
  if (opts.dialogue) {
    parts.push(THIN_DIVIDER);
    parts.push(`  ${opts.dialogue.speakerName}: "${opts.dialogue.text}"`);
    parts.push('');
  }

  parts.push(THIN_DIVIDER);

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

  // Zone info
  const zone = opts.world.zones[opts.world.locationId];
  if (zone) {
    const exits = zone.neighbors
      .map((id) => opts.world.zones[id]?.name ?? id)
      .join(', ');
    parts.push(`  Location: ${zone.name}${exits ? ` | Exits: ${exits}` : ''}`);
  }

  parts.push(DIVIDER);

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
  parts.push(DIVIDER);
  parts.push(`  ${title}`);
  if (tone) {
    parts.push(`  ${tone}`);
  }
  parts.push(DIVIDER);
  parts.push('');
  parts.push('  Type actions in plain English. Type "quit" to exit, "save" to save.');
  parts.push('  Type "/director" to inspect hidden truth, "/sheet" to view character.');
  parts.push('');
  return parts.join('\n');
}
