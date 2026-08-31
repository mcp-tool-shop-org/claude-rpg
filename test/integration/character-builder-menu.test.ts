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

// ─── Grouped Menu Wrapping — Real Terminal Width Safety (F-cbdea35a) ──

// This file drives the real buildDifficultyGroups(allPacks) -> real
// promptGroupedMenu pipeline end-to-end above, but never stubs
// process.stdout.columns, so wrapMenuLine's width-clamped hanging-indent
// wrapping (src/character/prompts.ts:187-208, Math.max(20,
// getTerminalWidth() - 4), itself clamped 40-120 by getTerminalWidth) is
// only ever exercised at whatever process.stdout.columns happens to be in
// the real test runner's environment, never at the addendum's explicitly
// named 40-col floor or 120-col ceiling. The only place wrapMenuLine's
// wrapping mechanics ARE deliberately tested is the cross-domain synthetic
// unit file src/character/prompts.test.ts:266-296 (short/long synthetic
// strings, not real pack descriptions) -- per this codebase's own
// established reasoning elsewhere (F-b54e8238 on director mode), an
// isolated unit test "cannot prove the real pipeline wires through
// correctly end-to-end." This stubs process.stdout.columns to 40 then to
// 120 (try/finally, mirroring game-turn-loop.test.ts:648-664's existing
// pattern) around a real promptGroupedMenu(rl, title,
// buildDifficultyGroups(allPacks)) call, and proves every captured row
// line: (a) never exceeds the width wrapMenuLine itself budgets for at
// that clamp value (derived structurally from prompts.ts's own formula, not
// guessed at, so this holds regardless of what the real pack roster's
// taglines happen to contain), and (b) reconstructs its entry's exact
// original unwrapped text when its wrap segments are rejoined -- which is
// only possible if every wrap point fell on a word boundary, i.e. it never
// broke mid-word.
describe('world-selection menu wraps within the real terminal width, at both clamp boundaries (F-cbdea35a)', () => {
  async function wrapsCleanlyAt(columns: number): Promise<void> {
    const groups = buildDifficultyGroups(allPacks);

    Object.defineProperty(process.stdout, 'columns', { value: columns, writable: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let lines: string[];
    try {
      const rl = createFakeReadline(['1']);
      await promptGroupedMenu(rl, 'Choose your world:', groups);
      lines = logSpy.mock.calls.map((args) => String(args[0]));
    } finally {
      logSpy.mockRestore();
      Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
    }

    // Mirrors wrapMenuLine's own budget (prompts.ts:188) exactly.
    const internalWidth = Math.max(20, columns - 4);
    // promptGroupedMenu prints every wrapped row (first line or hanging
    // continuation) with a fixed 4-space indent -- the title line opens
    // with '\n', group headers use a 2-space indent, and the blank
    // between-group line is empty -- so this filter selects exactly the
    // row lines wrapMenuLine produced and nothing else.
    const rowLines = lines.filter((l) => l.startsWith('    '));

    let cursor = 0;
    let num = 0;
    for (const group of groups) {
      for (const entry of group.items) {
        num += 1;
        const expected = `${num}. ${entry.label}${entry.description ? ` — ${entry.description}` : ''}`;

        expect(rowLines[cursor], `expected a rendered row for entry ${num} at ${columns} cols`).toBeDefined();
        const entryLines: string[] = [rowLines[cursor]];
        cursor += 1;
        // A hanging-indented continuation line carries wrapMenuLine's extra
        // 2-space indent (6 total), so it never matches the numbered-row
        // shape a fresh entry's own first line has.
        while (cursor < rowLines.length && !/^ {4}\d+\. /.test(rowLines[cursor])) {
          entryLines.push(rowLines[cursor]);
          cursor += 1;
        }

        for (const line of entryLines) {
          // (a) width safety: strip the fixed 4-space console indent. Every
          // physical row must fit wrapMenuLine's own budget -- +2 covers a
          // hanging-indented continuation line, whose 2-space indent
          // (prompts.ts:207) is applied AFTER the width check, not before.
          expect(line.length - 4).toBeLessThanOrEqual(internalWidth + 2);
        }

        // (b) no mid-word breaks: strip the fixed 4-space console indent
        // (first line) or the 4-space indent plus wrapMenuLine's own
        // 2-space hanging indent (continuations), then rejoin with single
        // spaces. This reconstructs the exact original unwrapped text only
        // if every wrap point landed on a space -- never inside a word.
        const rejoined = entryLines.map((line, i) => (i === 0 ? line.slice(4) : line.slice(6))).join(' ');
        expect(rejoined).toBe(expected);
      }
    }
    // Every captured row line was claimed by exactly one entry above -- no
    // stray or unaccounted-for output.
    expect(cursor).toBe(rowLines.length);
  }

  it('wraps cleanly at the 40-column clamp floor', async () => {
    await wrapsCleanlyAt(40);
  });

  it('wraps cleanly at the 120-column clamp ceiling', async () => {
    await wrapsCleanlyAt(120);
  });
});
