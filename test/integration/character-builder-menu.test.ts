// F-394f583d (SLATE-3, wave 18 tests domain): structural/visual-regression
// coverage for a grouped world-selection menu, proving all ten pack ids
// remain reachable and selection resolves to the correct pack id after
// grouping.
//
// F-44c11c9b (wave 8 amend): buildCharacter() now imports promptGroupedMenu
// from './prompts.js' (src/character/builder.ts:22) and calls it directly
// with buildDifficultyGroups(allPacks) (builder.ts:85-86) for world
// selection -- promptMenu (the flat, ungrouped prompt) is no longer used
// for this step at all. This file used to lock down promptMenu's flat-menu
// contract instead, because at the time promptGroupedMenu wasn't yet named
// in the Coordinator Brief's pinned seam signatures and guessing an
// unpinned import risked a hard module-resolution crash for the whole
// file. That blocking condition no longer holds -- promptGroupedMenu and
// buildDifficultyGroups are both real, shipped exports -- so this file now
// drives the REAL buildDifficultyGroups(allPacks) output through the REAL
// promptGroupedMenu, mirroring builder.ts's actual call site exactly,
// instead of the retired promptMenu version.
//
// Division of labor with this file's two siblings (neither of which, on
// its own, proves the full real pipeline end to end):
//   - src/character/prompts.test.ts unit-tests promptGroupedMenu's
//     cross-group numbering/selection mechanics generically, against a
//     synthetic 2-group/3-item fixture.
//   - src/character/builder.test.ts's `buildDifficultyGroups` describe
//     block proves the real allPacks registry splits into the correct
//     2/6/2 groups with no drops or duplicates, but only inspects the
//     returned MenuGroup[] structurally and never calls promptGroupedMenu.
// This file closes the gap between them: real allPacks -> real
// buildDifficultyGroups -> real promptGroupedMenu -> correct pack id,
// including at both real group-boundary seams (the flat position where
// BEGINNER hands off to STANDARD, and where STANDARD hands off to
// ADVANCED) -- exactly the "off-by-one grouping bug" scenario this file's
// own test titles were written to guard against.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { promptGroupedMenu } from '../../src/character/prompts.js';
import { buildDifficultyGroups } from '../../src/character/builder.js';
import { allPacks } from '../../src/character/packs.js';
import { createFakeReadline } from '../helpers/fake-readline.js';

describe('world-selection menu — real grouped pipeline (F-44c11c9b: buildDifficultyGroups(allPacks) driven through the real promptGroupedMenu)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('all ten pack ids are reachable: every pack meta.name is printed in the rendered grouped menu (F-00ddfc68 sibling regression shape -- grouping must not silently drop an entry)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const groups = buildDifficultyGroups(allPacks);
    const rl = createFakeReadline(['1']); // answer the menu with the first item; content is what's under test here

    await promptGroupedMenu(rl, 'Choose your world:', groups);

    const rendered = logSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(allPacks.length).toBe(10);
    for (const p of allPacks) {
      expect(rendered).toContain(p.meta.name);
    }
  });

  it('selecting each flat position 1..10 resolves to the correct pack id, in the real grouped display order', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const groups = buildDifficultyGroups(allPacks);
    const flatOrder = groups.flatMap((g) => g.items.map((entry) => entry.item));

    // Grouping must be a re-ordering of allPacks, not a lossy projection --
    // the same invariant builder.test.ts's "never drops or duplicates" case
    // proves structurally, re-asserted here against the SAME allPacks this
    // test then drives through the real prompt.
    expect(flatOrder.map((p) => p.meta.id).sort()).toEqual(allPacks.map((p) => p.meta.id).sort());

    for (let i = 0; i < flatOrder.length; i++) {
      const rl = createFakeReadline([String(i + 1)]); // promptGroupedMenu is 1-indexed on stdin
      const selected = await promptGroupedMenu(rl, 'Choose your world:', groups);
      expect(selected.meta.id).toBe(flatOrder[i].meta.id);
    }
  });

  it('the two real group-boundary seams (first STANDARD-tier pack, first ADVANCED-tier pack) resolve to the correct pack id -- the exact off-by-one risk this file guards against', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const groups = buildDifficultyGroups(allPacks);
    const [beginnerGroup, standardGroup, advancedGroup] = groups;
    expect(beginnerGroup.label).toBe('BEGINNER-FRIENDLY');
    expect(standardGroup.label).toBe('STANDARD');
    expect(advancedGroup.label).toBe('ADVANCED');

    // The flat position where a new group's FIRST item lands is the
    // position most likely to be mis-indexed by an off-by-one grouping bug
    // -- one seam per group handoff. Derived from the groups themselves
    // (not hardcoded pack names) so this stays meaningful if the roster's
    // per-pack difficulty tags ever shift, while still pinning the exact
    // numeric seams (3, 9) the routed finding named.
    const firstStandardPosition = beginnerGroup.items.length + 1;
    const firstAdvancedPosition = beginnerGroup.items.length + standardGroup.items.length + 1;
    expect(firstStandardPosition).toBe(3);
    expect(firstAdvancedPosition).toBe(9);

    const rlStandard = createFakeReadline([String(firstStandardPosition)]);
    const selectedStandard = await promptGroupedMenu(rlStandard, 'Choose your world:', groups);
    expect(selectedStandard.meta.id).toBe(standardGroup.items[0].item.meta.id);
    expect(selectedStandard.meta.difficulty).toBe('intermediate');

    const rlAdvanced = createFakeReadline([String(firstAdvancedPosition)]);
    const selectedAdvanced = await promptGroupedMenu(rlAdvanced, 'Choose your world:', groups);
    expect(selectedAdvanced.meta.id).toBe(advancedGroup.items[0].item.meta.id);
    expect(selectedAdvanced.meta.difficulty).toBe('advanced');
  });
});
