// Session recap: "LAST TIME ON CLAUDE RPG..." from profile + recent turns

import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import { computeLevel, getActiveInjuries } from '@ai-rpg-engine/character-profile';
import { TurnHistory } from '../session/history.js';

const DIVIDER = '═'.repeat(60);

/** Render a session recap shown when loading a save. */
export function renderRecap(
  profile: CharacterProfile | null,
  history: TurnHistory,
): string {
  const parts: string[] = [];

  parts.push('');
  parts.push(DIVIDER);
  parts.push('  LAST TIME ON CLAUDE RPG...');
  parts.push(DIVIDER);
  parts.push('');

  if (profile) {
    const level = computeLevel(profile.progression.xp);
    const title = profile.custom.title as string | undefined;
    const injuries = getActiveInjuries(profile);

    parts.push(`  ${profile.build.name}, level ${level} ${profile.build.archetypeId}${title ? ` — "${title}"` : ''}`);
    parts.push(`  ${profile.totalTurns} turns played`);

    if (injuries.length > 0) {
      parts.push(`  Carrying wounds: ${injuries.map((i) => i.name.toLowerCase()).join(', ')}`);
    }

    parts.push('');
  }

  // Show last few narration snippets
  const recentNarration = history.getRecentNarration(3);
  if (recentNarration.length > 0) {
    for (const narration of recentNarration) {
      // Truncate long narration
      const truncated = narration.length > 120 ? narration.slice(0, 117) + '...' : narration;
      parts.push(`  "${truncated}"`);
    }
    parts.push('');
  }

  parts.push(DIVIDER);
  parts.push('');

  return parts.join('\n');
}
