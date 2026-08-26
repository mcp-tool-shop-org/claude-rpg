import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Interface as ReadlineInterface } from 'node:readline';
import { buildCharacter, buildDifficultyGroups } from './builder.js';
import { allPacks, type PackInfo } from './packs.js';

// F-ef4a283d (SLATE-4) / F-6ed5f350 (SLATE-3): builder.ts had no test file
// before this wave (2 of the 8 character/** files F-8d11d865 already
// flagged as untested).

/**
 * Defensive fake readline.Interface that drives a REAL pack's full creation
 * flow (real catalog/ruleset data from allPacks) without needing to know in
 * advance how many trait/discipline/stat-allocation questions that pack's
 * catalog happens to ask. Disambiguates by prompt TEXT, not call order --
 * every question builder.ts asks has a distinctive substring EXCEPT the bare
 * "Choose (1-N)" shape shared by the world/archetype/background/discipline
 * menus (none of promptMenu/promptGroupedMenu embed their section title into
 * the actual rl.question() text, only into a separate console.log call) --
 * for those, always picking option 1 is a safe, valid answer regardless of
 * which menu it is. Trait multi-select cycles through fresh indices
 * (1..N, wrapping) instead of ever answering "done with 0 selected", which
 * would stall promptMultiSelect's loop forever.
 */
function makeScriptedRl(opts: { acceptAnswers?: string[] } = {}): { rl: ReadlineInterface; prompts: string[] } {
  const prompts: string[] = [];
  const acceptAnswers = opts.acceptAnswers ?? ['y'];
  let acceptIdx = 0;
  let traitCounter = 0;

  const rl = {
    question: (prompt: string, cb: (answer: string) => void) => {
      prompts.push(prompt);
      let answer = '0'; // safe default: skips stat allocation, harmless elsewhere
      if (prompt.includes('Character name')) {
        answer = 'Test Hero';
      } else if (prompt.includes('Accept this character?')) {
        answer = acceptAnswers[Math.min(acceptIdx, acceptAnswers.length - 1)];
        acceptIdx++;
      } else if (prompt.includes('Choose a secondary discipline?')) {
        answer = 'n';
      } else if (prompt.includes('Choose (1-') && prompt.includes('"done"')) {
        // The "[N selected]" suffix is absent only on the FIRST question of
        // a fresh promptMultiSelect call (remaining === maxSelections) --
        // used here to reset the counter each round, so every retry pass
        // picks the SAME item order (1, 2, 3, ...) instead of drifting into
        // a combination the catalog's own incompatibleWith rules reject.
        if (!prompt.includes('selected]')) traitCounter = 0;
        const match = prompt.match(/Choose \(1-(\d+)/);
        const n = match ? parseInt(match[1], 10) : 1;
        answer = String((traitCounter % n) + 1);
        traitCounter++;
      } else if (prompt.includes('Choose (1-')) {
        // World / archetype / background / discipline menu -- always pick
        // option 1, whichever menu this happens to be.
        answer = '1';
      }
      cb(answer);
    },
  } as unknown as ReadlineInterface;

  return { rl, prompts };
}

describe('buildCharacter presetPack (F-ef4a283d / SLATE-4, Coordinator Brief contract #4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never invokes the pack-selection prompt when a presetPack is supplied -- proceeds straight to character-name prompting', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { rl, prompts } = makeScriptedRl();
    const presetPack = allPacks[0];

    const result = await buildCharacter(rl, presetPack);

    // The FIRST question asked is character name, not a world-select menu.
    expect(prompts[0]).toContain('Character name');
    expect(result.pack).toBe(presetPack);
  });

  it('shows the grouped world menu (with difficulty-tier group labels) when no presetPack is supplied', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { rl } = makeScriptedRl();

    await buildCharacter(rl);

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('Choose your world');
    expect(printed).toMatch(/BEGINNER-FRIENDLY|STANDARD|ADVANCED/);
  });

  it('never shows the world menu at all when a presetPack is supplied', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { rl } = makeScriptedRl();
    const presetPack = allPacks[0];

    await buildCharacter(rl, presetPack);

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).not.toContain('Choose your world');
    // One-line confirmation of which world was picked instead (DRAFT copy).
    expect(printed).toContain(presetPack.meta.name);
  });

  // R2 (Director ruling, overrules the original "first-pass-only" design):
  // the preset world stays LOCKED across every retry iteration, softened
  // only by a hint line at the reject point telling the player how to
  // change it (rerun without --world).
  it('keeps the preset world LOCKED across a reject-retry -- the world menu never appears even on the second pass, and a hint is printed at the reject point', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { rl } = makeScriptedRl({ acceptAnswers: ['n', 'y'] });
    const presetPack = allPacks[0];

    const result = await buildCharacter(rl, presetPack);

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).not.toContain('Choose your world');
    expect(printed).toContain('rerun without --world');
    expect(result.pack).toBe(presetPack);
  });

  it('does NOT print the --world hint when rejecting with no presetPack (unpreset path unaffected)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { rl } = makeScriptedRl({ acceptAnswers: ['n', 'y'] });

    await buildCharacter(rl);

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).not.toContain('rerun without --world');
    expect(printed).toContain('Starting over');
  });
});

// F-6ed5f350 (SLATE-3) test plan item (e): structural drift-guard
// snapshotting the current difficulty split, mirroring
// help-system.test.ts's PACK_ONBOARDING/GENRE_TO_PACK reconciliation
// pattern (F-6c9e02d4) -- so an 11th pack either lands correctly or this
// test flags it for a human to look at.
describe('buildDifficultyGroups (F-6ed5f350 test plan item e: difficulty-split drift guard)', () => {
  it('groups all 10 live packs into the expected 2/6/2 beginner/intermediate/advanced split', () => {
    const groups = buildDifficultyGroups(allPacks);
    const byLabel = Object.fromEntries(groups.map((g) => [g.label, g.items.length]));

    expect(byLabel).toEqual({
      'BEGINNER-FRIENDLY': 2,
      STANDARD: 6,
      ADVANCED: 2,
    });
  });

  it('never drops or duplicates a pack across groups', () => {
    const groups = buildDifficultyGroups(allPacks);
    const seenIds = groups.flatMap((g) => g.items.map((i) => i.item.meta.id));
    expect(seenIds.sort()).toEqual(allPacks.map((p) => p.meta.id).sort());
  });

  it('omits a difficulty tier entirely when it has zero packs (no empty group)', () => {
    const onlyBeginner: PackInfo[] = allPacks.filter((p) => p.meta.difficulty === 'beginner');
    const groups = buildDifficultyGroups(onlyBeginner);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('BEGINNER-FRIENDLY');
  });

  it('preserves fixed beginner -> intermediate -> advanced group ordering', () => {
    const groups = buildDifficultyGroups(allPacks);
    expect(groups.map((g) => g.label)).toEqual(['BEGINNER-FRIENDLY', 'STANDARD', 'ADVANCED']);
  });
});
