// F-394f583d (SLATE-3, wave 18 tests domain): structural/visual-regression
// coverage for a grouped world-selection menu, proving all ten pack ids
// remain reachable and selection resolves to the correct pack id after
// grouping.
//
// SCOPE NOTE (disclosed, not silently dropped): the routed finding's Fix
// text recommends "the execute wave export a pure, directly-testable render
// function for the grouped menu ... rather than inlining console.log into
// buildCharacter()". Unlike every other finding this wave, the Coordinator
// Brief's "Pinned seam signatures" list does NOT name that export (no
// function name, no file). Guessing a module path for an import that
// doesn't exist yet risks a hard module-resolution crash for this whole
// file (unlike guessing a wrong *named* export from a module that DOES
// exist, which fails only the one test that touches it) -- so rather than
// invent a signature, this file:
//   1) builds test/helpers/fake-readline.ts (this domain's owned infra for
//      the wave, useful regardless of how the grouped menu ends up named),
//   2) locks down the CURRENT flat-menu selection contract at the
//      `promptMenu` level (src/character/prompts.ts) that buildCharacter()
//      (src/character/builder.ts) depends on today -- these invariants
//      ("every pack name appears", "the last registry entry is reachable
//      and maps to the right pack id") must hold both before AND after a
//      future grouped-menu refactor, so they remain meaningful rather than
//      becoming dead weight the moment grouping lands,
//   3) explicitly skips the "grouped-menu-specific" structural assertions
//      (all ten ids appear exactly once in the GROUPED render; narrow-width/
//      NO_COLOR parity for group headers/dividers) in this run's `skipped`
//      output, since there is no export to import yet.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { promptMenu } from '../../src/character/prompts.js';
import { allPacks } from '../../src/character/packs.js';
import { createFakeReadline } from '../helpers/fake-readline.js';

describe('world-selection menu — current flat-menu contract (F-394f583d, regression lock pending a named grouped-menu export)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('all ten pack ids are reachable: every pack meta.name is printed in the rendered menu (F-00ddfc68 sibling regression shape -- a flat-to-grouped refactor must not silently drop an entry)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = createFakeReadline(['1']); // answer the menu with the first item; content is what's under test here

    await promptMenu(rl, 'Choose your world:', allPacks.map((p) => ({
      label: p.meta.name,
      description: p.meta.tagline,
    })));

    const rendered = logSpy.mock.calls.map((args) => String(args[0])).join('\n');
    expect(allPacks.length).toBe(10);
    for (const p of allPacks) {
      expect(rendered).toContain(p.meta.name);
    }
  });

  it('selection resolves to the correct pack id for the LAST pack in registry order (most likely to be mis-indexed by an off-by-one grouping bug)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const lastIndex = allPacks.length - 1; // colony, per packs.ts's registration order
    const rl = createFakeReadline([String(lastIndex + 1)]); // promptMenu is 1-indexed on stdin

    const chosenIndex = await promptMenu(rl, 'Choose your world:', allPacks.map((p) => ({
      label: p.meta.name,
      description: p.meta.tagline,
    })));

    expect(chosenIndex).toBe(lastIndex);
    expect(allPacks[chosenIndex].meta.id).toBe(allPacks[lastIndex].meta.id);
  });

  it('selection resolves to the correct pack id for at least one pack per plausible grouping boundary (first, middle, last)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const probeIndices = [0, Math.floor(allPacks.length / 2), allPacks.length - 1];

    for (const idx of probeIndices) {
      const rl = createFakeReadline([String(idx + 1)]);
      const chosenIndex = await promptMenu(rl, 'Choose your world:', allPacks.map((p) => ({
        label: p.meta.name,
        description: p.meta.tagline,
      })));
      expect(chosenIndex).toBe(idx);
      expect(allPacks[chosenIndex].meta.id).toBe(allPacks[idx].meta.id);
    }
  });
});
