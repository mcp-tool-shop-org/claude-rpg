// Session recap: "LAST TIME ON CLAUDE RPG..." from profile + recent turns

import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import { computeLevel, getActiveInjuries } from '@ai-rpg-engine/character-profile';
import { TurnHistory } from '../session/history.js';
import { FALLBACK_NARRATION } from '../narrator/narrator.js';

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
  // F-b6915850: TurnRecord (session/history.ts) has no isFallback flag — that
  // would require threading NarrationResult.isFallback through history.record()
  // call sites, which live outside this domain. As the narrower in-domain
  // mitigation, filter out any turn whose narration is exactly narrator.ts's
  // FALLBACK_NARRATION sentinel so a non-fatal LLM failure on a recent turn
  // never gets quoted here as if it were real authored narrative.
  const recentNarration = history.getRecentNarration(3).filter((n) => n !== FALLBACK_NARRATION);
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
