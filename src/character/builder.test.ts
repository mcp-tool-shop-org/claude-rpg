import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Interface as ReadlineInterface } from 'node:readline';
import { buildCharacter, buildDifficultyGroups } from './builder.js';
import { allPacks, type PackInfo } from './packs.js';
import { PromptCancelled } from './prompts.js';

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
function makeScriptedRl(opts: { acceptAnswers?: string[]; statAnswers?: string[] } = {}): { rl: ReadlineInterface; prompts: string[] } {
  const prompts: string[] = [];
  const acceptAnswers = opts.acceptAnswers ?? ['y'];
  // F-86c50a80: scripted per-call queue for stat-allocation prompts (shape
  // "<name> (<id>, max <remaining>)"). Draining via shift() lets a test
  // script an invalid answer followed by a valid retry for the SAME stat --
  // the re-prompt reuses this exact prompt text (only `remaining` could
  // differ, and it doesn't change on a rejected answer) -- while every
  // other/unscripted stat prompt keeps the pre-existing safe '0' default.
  const statAnswers = opts.statAnswers ? [...opts.statAnswers] : undefined;
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
      } else if (prompt.includes(', max ')) {
        if (statAnswers && statAnswers.length > 0) {
          answer = statAnswers.shift()!;
        }
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
    // Coordinator stitch (wave 6): F-3a8ccf9c's promptText now guards
    // against stdin-close hangs via rl.once('close', …)/rl.off(…) — this
    // mock answers synchronously and never closes, so no-op listeners are
    // the faithful shape.
    once: () => {},
    off: () => {},
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

// F-86c50a80: stat allocation was the one step in the 7-step flow that
// silently absorbed bad input (NaN/negative -> 0 points, over-budget ->
// silently capped) instead of re-prompting like every promptMenu-based step
// elsewhere in this same flow. allPacks[0] (fantasy) has a 3-point budget
// across 3 stats (vigor/instinct/will) -- see ruleset.ts -- so its very
// first stat prompt always has `max 3`.
describe('buildCharacter stat allocation (F-86c50a80)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a non-numeric answer, re-prompts, and accepts a valid retry for the same stat', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { rl } = makeScriptedRl({ statAnswers: ['abc', '3'] });

    await expect(buildCharacter(rl)).resolves.toBeDefined();

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toMatch(/Please enter a number between 0 and \d+\./);
  });

  it('rejects a negative answer the same way as a non-numeric one', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { rl } = makeScriptedRl({ statAnswers: ['-5', '1'] });

    await expect(buildCharacter(rl)).resolves.toBeDefined();

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toMatch(/Please enter a number between 0 and \d+\./);
  });

  it('clamps an over-budget answer to the remaining budget AND prints an explicit notice (not silent)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { rl } = makeScriptedRl({ statAnswers: ['9999'] });

    await expect(buildCharacter(rl)).resolves.toBeDefined();

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toMatch(/Only \d+ left\. Allocating \d+ to/);
  });

  it('keeps accepting an explicit "0" silently, with no rejection message (unchanged default behavior)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Default scripted answer for every stat prompt is '0' -- see makeScriptedRl.
    const { rl } = makeScriptedRl();

    await expect(buildCharacter(rl)).resolves.toBeDefined();

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).not.toMatch(/Please enter a number between/);
    expect(printed).not.toMatch(/Only \d+ left\. Allocating/);
  });
});

// F-f480fef1: character creation's ~7 linear prompts had no way to back out
// to the caller short of Ctrl+C, which (per F-4997779f) hits Node's raw
// default SIGINT disposition during this exact window. promptText (the
// choke point every helper in prompts.ts awaits) now throws PromptCancelled
// when the player types "cancel"; buildCharacter catches it, prints a clean
// confirmation, and rethrows so its own caller can define what happens next.
describe('buildCharacter cancel keyword (F-f480fef1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Answers 'cancel' on the Nth rl.question() call (0-indexed), '1' on every other call. */
  function makeCancelingRl(cancelOnCallIndex: number, cancelWord = 'cancel'): ReadlineInterface {
    let callIndex = 0;
    return {
      question: (_prompt: string, cb: (answer: string) => void) => {
        const answer = callIndex === cancelOnCallIndex ? cancelWord : '1';
        callIndex++;
        cb(answer);
      },
      once: () => {},
      off: () => {},
    } as unknown as ReadlineInterface;
  }

  it('rejects with PromptCancelled when the player types "cancel" at the very first prompt', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeCancelingRl(0);

    await expect(buildCharacter(rl)).rejects.toBeInstanceOf(PromptCancelled);
  });

  it('is case-insensitive -- "CANCEL" also cancels', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeCancelingRl(0, 'CANCEL');

    await expect(buildCharacter(rl)).rejects.toBeInstanceOf(PromptCancelled);
  });

  it('cancels partway through the flow (at character name), not just at the very first prompt', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // Call 0: world-select menu -> '1'. Call 1: character name -> 'cancel'.
    const rl = makeCancelingRl(1);

    await expect(buildCharacter(rl)).rejects.toBeInstanceOf(PromptCancelled);
  });

  it('prints the cancel hint up front and a clean confirmation line on cancellation', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeCancelingRl(0);

    await expect(buildCharacter(rl)).rejects.toThrow('Character creation cancelled. No character was created.');

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('Type "cancel" at any prompt to stop character creation.');
    expect(printed).toContain('Character creation cancelled. No character was created.');
  });
});

// F-7360c1a0: the Character Summary header -- the closing screen of
// character creation, shown to every new player right before they accept
// their character -- used to be a bare `── Character Summary ──` line
// matching neither of this domain's two established header idioms.
// Promoted to the full-width divider()+ALL-CAPS convention (matching
// sheet.ts's CHARACTER SHEET / recap.ts's LAST TIME ON CLAUDE RPG), framed
// top and bottom, same as this wave's F-8e8ac939 fix to its five sibling
// files in this domain.
describe('buildCharacter Character Summary header (F-7360c1a0)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
    vi.restoreAllMocks();
  });

  it('renders CHARACTER SUMMARY in ALL CAPS instead of the old bare hyphen-bracketed title, framed top and bottom by a full-width divider', async () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { rl } = makeScriptedRl();

    await buildCharacter(rl);

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).not.toContain('── Character Summary ──');
    expect(printed).toContain('CHARACTER SUMMARY');
    // divider() is called before the header, after the header, and again
    // after the Resources line -- three full-width rules framing the screen.
    const dividerCount = printed.split('═'.repeat(40)).length - 1;
    expect(dividerCount).toBeGreaterThanOrEqual(3);
  });

  it('divider width tracks the terminal instead of a fixed width', async () => {
    Object.defineProperty(process.stdout, 'columns', { value: 100, writable: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { rl } = makeScriptedRl();

    await buildCharacter(rl);

    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('═'.repeat(100));
    // A 100-char run trivially contains any shorter same-character run as a
    // substring, so proving this ISN'T hardcoded needs a probe ONE LONGER
    // than the real width (never a substring of it) -- the same technique
    // recap.test.ts's/sheet.test.ts's own F-e475c46d width tests already use.
    expect(printed).not.toContain('═'.repeat(101));
  });
});
