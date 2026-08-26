// Session recap: "LAST TIME ON CLAUDE RPG..." from profile + recent turns

import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import { computeLevel, getActiveInjuries } from '@ai-rpg-engine/character-profile';
import { TurnHistory, type TurnRecord } from '../session/history.js';
import { KNOWN_FALLBACK_NARRATION_SENTINELS } from '../narrator/narrator.js';

const DIVIDER = '═'.repeat(60);

/**
 * F-18f4dd88 (seam contract, wave 6): TurnRecord (session/history.ts) doesn't
 * declare `isFallback` in this worktree — game-core adds it this same wave in
 * a parallel worktree (turn-loop.ts passing narrationResult.isFallback into
 * history.record()), which this domain can't see or depend on compiling
 * against until the worktrees merge. This narrow local extension lets
 * renderRecap() read the flag when a record actually carries it (true after
 * merge) while still compiling today, when every real TurnRecord simply lacks
 * the field (a plain object without an optional property is assignable to a
 * type that declares it optional, so no cast is needed to read `.isFallback`
 * off records TurnHistory hands back). Records that predate the flag — or
 * predate the merge entirely — fall through to the sentinel-string comparison
 * below, matching both KNOWN_FALLBACK_NARRATION_SENTINELS values.
 */
type MaybeFallback = TurnRecord & { isFallback?: boolean };

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
  // F-b6915850 / F-18f4dd88: a non-fatal LLM failure on a recent turn must
  // never get quoted here as if it were real authored narrative. Prefer the
  // isFallback flag when a record actually carries it (see MaybeFallback
  // above); records that predate the flag fall back to comparing narration
  // text against every known fallback sentinel (both FALLBACK_NARRATION and
  // turn-loop.ts's mirrored FATAL_NARRATION_FALLBACK — see narrator.ts's
  // KNOWN_FALLBACK_NARRATION_SENTINELS for why there are two).
  const recentTurns: MaybeFallback[] = history.getRecent(3);
  const recentNarration = recentTurns
    .filter((t) => !(t.isFallback ?? KNOWN_FALLBACK_NARRATION_SENTINELS.includes(t.narration)))
    .map((t) => t.narration);
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
