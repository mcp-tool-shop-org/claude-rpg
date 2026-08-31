// Session recap: "LAST TIME ON CLAUDE RPG..." from profile + recent turns

import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import { computeLevel, getActiveInjuries } from '@ai-rpg-engine/character-profile';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import { TurnHistory, type TurnRecord } from '../session/history.js';
import { KNOWN_FALLBACK_NARRATION_SENTINELS } from '../narrator/narrator.js';
import { getTerminalWidth } from '../display/play-renderer.js';
import { dim } from '../cli/colors.js';
import { resolveArchetypeName } from './catalog-names.js';

// F-e475c46d: was a fixed 60-char divider regardless of terminal size,
// unlike play-renderer.ts's own dividers (PFE-005). Computed per call (not
// a module-level constant) so it tracks the real terminal width, matching
// play-renderer.ts's makeDivider()/makeThinDivider() pattern (F-38eb3dec
// precedent: director-renderer.ts, status-compact.ts, archive-browser.ts,
// help-system.ts).
// F-8e8ac939: also wrapped in dim() -- colors.ts documents dim as the
// semantic choice for "dividers and secondary text", and the reference
// implementation this comment already claims to match
// (play-renderer.ts's makeDivider()/makeThinDivider(), and this same
// six-file family's own chronicle-renderer.ts sibling) both wrap every
// divider in dim(). This file rendered its rule bright/undimmed until now.
function divider(): string {
  return dim('═'.repeat(getTerminalWidth()));
}

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

/**
 * Render a session recap shown when loading a save.
 *
 * @param catalog F-4b8a3a39: optional BuildCatalog used to resolve
 *   archetypeId to its display name (same contract as presence.ts's
 *   buildStatusData/buildPresence and sheet.ts's renderCharacterSheet
 *   catalog param). Omitted callers keep getting the raw id back, same as
 *   before this fix.
 */
export function renderRecap(
  profile: CharacterProfile | null,
  history: TurnHistory,
  catalog?: BuildCatalog,
): string {
  const parts: string[] = [];

  parts.push('');
  parts.push(divider());
  parts.push('  LAST TIME ON CLAUDE RPG...');
  parts.push(divider());
  parts.push('');

  if (profile) {
    const level = computeLevel(profile.progression.xp);
    const title = profile.custom.title as string | undefined;
    const injuries = getActiveInjuries(profile);
    const archetypeName = resolveArchetypeName(catalog, profile.build.archetypeId);

    parts.push(`  ${profile.build.name}, level ${level} ${archetypeName}${title ? ` — "${title}"` : ''}`);
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
  } else if (recentTurns.length > 0) {
    // F-08c1896e: recentTurns is non-empty but every turn in the window was
    // a non-fatal LLM fallback, so recentNarration filtered down to nothing.
    // The section used to be skipped entirely here -- visually identical to
    // the genuinely-no-history case above (a fresh character) -- leaving a
    // player who saved during an outage with no re-orientation at all on
    // load. Kept in the same out-of-fiction parenthetical convention as
    // FALLBACK_NARRATION/FALLBACK_NARRATION_REPEATED (narrator.ts, imported
    // above) rather than a quoted line, since this is a system notice about
    // missing narration, not narration itself.
    parts.push('  (Recent events are unclear — the last few moments didn\'t come through cleanly.)');
    parts.push('');
  }

  parts.push(divider());
  parts.push('');

  return parts.join('\n');
}
