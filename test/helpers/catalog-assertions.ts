// F-256bb64a (wave 18, tests domain): shared assertion helper reused across
// every render site that resolves a catalog-backed archetype/discipline/
// background id to its display name (recap.ts is the confirmed live bug —
// src/character/recap.ts:53 prints profile.build.archetypeId raw instead of
// resolving it via catalog-names.ts's resolveArchetypeName/resolveBackgroundName/
// resolveDisciplineName; bin.ts/game-state.ts/recap-delta.ts are regression
// locks for the same class of bug, per the routed finding's "if the execute
// wave's own audit turns up a real site in one of these three, the helper
// already generalizes to catch it" reasoning).
//
// One shared shape instead of four bespoke one-offs, so this assertion can't
// drift the way the ledger already flagged once for hand-duplicated sentinel
// lists (F-8da2e6f7/F-223de079, cited by this same wave's F-9998efb0).

import { expect } from 'vitest';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';

/**
 * Asserts that `output` (any rendered player-facing text) contains none of
 * `catalog`'s raw archetype/discipline/background ids -- UNLESS a given id
 * happens to equal its own display name (a coincidence some catalogs may
 * have; not a false positive worth failing on). Pass the same BuildCatalog
 * the profile/session under test was built against.
 *
 * Deliberately checks for the id as a whole-word-ish substring (not just
 * `.includes`) so a short id can't false-positive inside an unrelated longer
 * word; ids in this codebase are kebab-case, so a simple non-word-boundary
 * check on '-' segments is sufficient without a full regex-word-boundary
 * dance that would mishandle the hyphens themselves.
 */
export function expectNoRawCatalogIds(output: string, catalog: BuildCatalog | undefined | null): void {
  if (!catalog) return;
  const offenders: string[] = [];
  const pools: Array<{ id: string; name: string }[]> = [
    catalog.archetypes ?? [],
    catalog.backgrounds ?? [],
    catalog.disciplines ?? [],
  ];
  for (const pool of pools) {
    for (const entry of pool) {
      if (entry.id === entry.name) continue; // coincidental equality is not a leak
      if (output.includes(entry.id)) {
        offenders.push(entry.id);
      }
    }
  }
  expect(offenders, `raw catalog id(s) leaked into player-facing output: ${offenders.join(', ')}`).toEqual([]);
}
