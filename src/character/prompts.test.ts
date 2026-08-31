import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Interface as ReadlineInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { promptGroupedMenu, promptText, promptMultiSelect, promptMenu, promptConfirm, wrapMenuLine, PromptCancelled, CANCEL_KEYWORD, type MenuGroup } from './prompts.js';

// F-6ed5f350 (SLATE-3): prompts.ts had no test file before this wave (2 of
// the 8 character/** files F-8d11d865 already flagged as untested).

/**
 * Minimal fake readline.Interface: scripted answers, ignores prompt text.
 * F-3a8ccf9c: built on a real EventEmitter (not a plain object) so
 * promptText's `rl.once('close', ...)` / `rl.off('close', ...)` guard has
 * real listener semantics to attach to, matching node:readline's actual
 * Interface (which itself extends EventEmitter).
 */
function makeFakeRl(answers: string[]): ReadlineInterface {
  let i = 0;
  const rl = new EventEmitter();
  return Object.assign(rl, {
    question: (_prompt: string, cb: (answer: string) => void) => {
      const answer = answers[i] ?? '';
      i++;
      cb(answer);
    },
  }) as unknown as ReadlineInterface;
}

/**
 * Fake readline.Interface whose `question` never calls back -- simulating
 * stdin ending (Ctrl+D / pipe EOF) while an answer is still pending. Tests
 * trigger the close by emitting 'close' on the returned emitter directly.
 */
function makeHangingFakeRl(): ReadlineInterface {
  const rl = new EventEmitter();
  return Object.assign(rl, {
    question: (_prompt: string, _cb: (answer: string) => void) => {
      // Never invokes cb -- the question is left pending, as it would be if
      // stdin closed before the user answered.
    },
  }) as unknown as ReadlineInterface;
}

describe('promptGroupedMenu (F-6ed5f350 / SLATE-3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeGroups(): MenuGroup<string>[] {
    return [
      { label: 'GROUP A', items: [{ item: 'a1', label: 'Alpha One' }, { item: 'a2', label: 'Alpha Two' }] },
      { label: 'GROUP B', items: [{ item: 'b1', label: 'Beta One' }] },
    ];
  }

  it('(a) numbers items continuously across groups (1..N total, not per-group)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['3']);
    const selected = await promptGroupedMenu(rl, 'Pick one:', makeGroups());
    // item 3 overall is Group B's only item, not Group B's "item 1"
    expect(selected).toBe('b1');
    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('1. Alpha One');
    expect(printed).toContain('2. Alpha Two');
    expect(printed).toContain('3. Beta One');
  });

  it('(b) group-label lines consume no selectable number', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['1']);
    await promptGroupedMenu(rl, 'Pick one:', makeGroups());
    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('GROUP A');
    expect(printed).toContain('GROUP B');
    expect(printed).not.toMatch(/\d+\.\s*GROUP A/);
    expect(printed).not.toMatch(/\d+\.\s*GROUP B/);
  });

  it('(c) selecting N returns the correct item T by reference, not an index or a copy', async () => {
    const marker = { id: 'unique-object' };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['1']);
    const groups: MenuGroup<typeof marker>[] = [{ label: 'ONLY', items: [{ item: marker, label: 'Marker' }] }];
    const selected = await promptGroupedMenu(rl, 'Pick:', groups);
    expect(selected).toBe(marker);
  });

  it('skips empty groups entirely -- no dangling group-label line with zero selectable items', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['1']);
    const groups: MenuGroup<string>[] = [
      { label: 'EMPTY', items: [] },
      { label: 'REAL', items: [{ item: 'x', label: 'X' }] },
    ];
    await promptGroupedMenu(rl, 'Pick:', groups);
    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).not.toContain('EMPTY');
    expect(printed).toContain('REAL');
  });

  it('reprompts on an out-of-range selection instead of returning something invalid', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['99', '0', '1']);
    const groups: MenuGroup<string>[] = [{ label: 'G', items: [{ item: 'only', label: 'Only' }] }];
    const selected = await promptGroupedMenu(rl, 'Pick:', groups);
    expect(selected).toBe('only');
  });

  it('renders an item description when supplied', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['1']);
    const groups: MenuGroup<string>[] = [{ label: 'G', items: [{ item: 'x', label: 'X', description: 'a fine choice' }] }];
    await promptGroupedMenu(rl, 'Pick:', groups);
    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('a fine choice');
  });
});

describe('promptText (F-3a8ccf9c: stdin close guard)', () => {
  it('rejects instead of hanging when stdin closes before the question is answered', async () => {
    const rl = makeHangingFakeRl();
    const pending = promptText(rl, 'Character name');

    // Simulate stdin ending (Ctrl+D / pipe EOF) while the question is still
    // pending -- readline emits 'close', and rl.question's callback never
    // fires because the interface is already closed.
    (rl as unknown as EventEmitter).emit('close');

    await expect(pending).rejects.toThrow('input closed before answering');
  });

  it('resolves normally on a real answer and does not leave a dangling close listener', async () => {
    const rl = makeFakeRl(['  Aria the Bold  ']);
    await expect(promptText(rl, 'Character name')).resolves.toBe('Aria the Bold');
    // The 'close' guard registered per-call must be cleaned up on the
    // resolve path too, or a long multi-prompt flow (character creation
    // asks a dozen+ questions) would accumulate listeners on the shared rl.
    expect(rl.listenerCount('close')).toBe(0);
  });

  it('trims whitespace from the answer (pre-existing behavior, unaffected by the close guard)', async () => {
    const rl = makeFakeRl(['   padded   ']);
    await expect(promptText(rl, 'X')).resolves.toBe('padded');
  });
});

// F-f480fef1: before this fix, none of this file's five prompt primitives
// recognized any cancel/back/quit keyword -- a player partway through
// character creation had no way to back out short of Ctrl+C. promptText is
// the single choke point every other helper awaits, so checking here covers
// all of them without touching each individually.
describe('promptText cancel keyword (F-f480fef1)', () => {
  it('rejects with PromptCancelled when the answer is CANCEL_KEYWORD', async () => {
    const rl = makeFakeRl([CANCEL_KEYWORD]);
    await expect(promptText(rl, 'Anything')).rejects.toBeInstanceOf(PromptCancelled);
  });

  it('is case-insensitive and tolerant of surrounding whitespace', async () => {
    const rl = makeFakeRl(['  CaNcEl  ']);
    await expect(promptText(rl, 'Anything')).rejects.toBeInstanceOf(PromptCancelled);
  });

  it('does not leave a dangling close listener on the cancel path either', async () => {
    const rl = makeFakeRl(['cancel']);
    await expect(promptText(rl, 'Anything')).rejects.toBeInstanceOf(PromptCancelled);
    expect(rl.listenerCount('close')).toBe(0);
  });

  it('a normal answer that merely CONTAINS the keyword is not treated as a cancel (exact match only)', async () => {
    const rl = makeFakeRl(['cancellation']);
    await expect(promptText(rl, 'Anything')).resolves.toBe('cancellation');
  });

  it('propagates the cancellation through promptMenu with no special-case code of its own', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['cancel']);
    await expect(promptMenu(rl, 'Pick:', [{ label: 'A' }, { label: 'B' }])).rejects.toBeInstanceOf(PromptCancelled);
  });

  it('propagates the cancellation through promptConfirm', async () => {
    const rl = makeFakeRl(['cancel']);
    await expect(promptConfirm(rl, 'Sure?')).rejects.toBeInstanceOf(PromptCancelled);
  });

  it('propagates the cancellation through promptMultiSelect', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['cancel']);
    await expect(promptMultiSelect(rl, 'Pick:', [{ label: 'A' }], 1)).rejects.toBeInstanceOf(PromptCancelled);
  });

  it('propagates the cancellation through promptGroupedMenu', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['cancel']);
    const groups: MenuGroup<string>[] = [{ label: 'G', items: [{ item: 'x', label: 'X' }] }];
    await expect(promptGroupedMenu(rl, 'Pick:', groups)).rejects.toBeInstanceOf(PromptCancelled);
  });
});

// F-0d1f3d37: promptMultiSelect's input loop gave no feedback at all for the
// two most likely invalid inputs, unlike its sibling promptMenu/
// promptGroupedMenu (both already print a please-enter-a-number-in-range
// message on any rejection).
describe('promptMultiSelect invalid-input feedback (F-0d1f3d37)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeItems(n: number): Array<{ label: string }> {
    return Array.from({ length: n }, (_, i) => ({ label: `Item ${i + 1}` }));
  }

  it('rejects "done" before any selection with an explicit message, then keeps looping', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['done', '1', 'done']);

    const selected = await promptMultiSelect(rl, 'Pick:', makeItems(3), 2);

    expect(selected).toEqual([0]);
    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toMatch(/pick at least one/i);
  });

  it('rejects a non-numeric, non-"done" answer with an explicit message instead of silent re-prompting', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['banana', '1', 'done']);

    const selected = await promptMultiSelect(rl, 'Pick:', makeItems(3), 2);

    expect(selected).toEqual([0]);
    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toMatch(/please enter a number between 1 and 3/i);
  });

  it('rejects an out-of-range number the same way', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['99', '1', 'done']);

    const selected = await promptMultiSelect(rl, 'Pick:', makeItems(3), 2);

    expect(selected).toEqual([0]);
    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toMatch(/please enter a number between 1 and 3/i);
  });

  it('still returns an empty array when maxSelections is 0 (unaffected by this fix)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl([]);
    const selected = await promptMultiSelect(rl, 'Pick:', makeItems(3), 0);
    expect(selected).toEqual([]);
  });

  it('an already-selected index still gets its own distinct message (pre-existing behavior, unaffected)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['1', '1', 'done']);

    const selected = await promptMultiSelect(rl, 'Pick:', makeItems(3), 2);

    expect(selected).toEqual([0]);
    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toMatch(/already selected/i);
  });
});

// (d) narrow-width / hang-indent parity -- prompts.ts imported neither
// cli/colors.ts nor a terminal-width helper before this fix (a pre-existing
// gap in this domain, not new with the grouped menu).
describe('wrapMenuLine (F-6ed5f350: narrow-width hang-indent)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('returns a single unwrapped line when it fits the terminal width', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 120, writable: true });
    const lines = wrapMenuLine('1. Short Line');
    expect(lines).toEqual(['1. Short Line']);
  });

  it('wraps a long line at a narrow width, with continuation lines hanging-indented', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const longLine = '1. A Very Long World Name Indeed — a description that goes on for quite a while and will not fit on one narrow line';
    const lines = wrapMenuLine(longLine);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].startsWith('1.')).toBe(true);
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i].startsWith('  ')).toBe(true);
    }
    // Reassembling (ignoring the hanging-indent spaces) loses no words.
    const reassembled = lines.map((l) => l.trimStart()).join(' ');
    expect(reassembled.replace(/\s+/g, ' ')).toBe(longLine.replace(/\s+/g, ' '));
  });

  it('never produces a line wider than the clamped terminal width', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const longLine = 'A Very Long World Name Indeed — a description that goes on for quite a while and will not fit on one narrow line at all';
    const lines = wrapMenuLine(longLine);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });
});

// F-5f8defa0: promptMenu/promptMultiSelect rendered each row as a single
// raw, unwrapped `    N. label — description` string with no width-aware
// wrap, unlike this file's own promptGroupedMenu (tested above), which
// already routes every row through wrapMenuLine(). builder.ts calls
// promptMenu for archetype/background/discipline and promptMultiSelect for
// traits -- both now get the same treatment as the grouped world-select menu.
describe('promptMenu / promptMultiSelect row wrapping (F-5f8defa0)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
    vi.restoreAllMocks();
  });

  // Same label/description pair as the wrapMenuLine 'wraps a long line...'
  // test above, so the wrap behavior itself is already proven correct there
  // -- this only needs to prove promptMenu/promptMultiSelect actually route
  // through it now.
  const longLabel = 'A Very Long World Name Indeed';
  const longDesc = 'a description that goes on for quite a while and will not fit on one narrow line';

  it('promptMenu: a short row prints unwrapped at a comfortable width (unchanged)', async () => {
    Object.defineProperty(process.stdout, 'columns', { value: 120, writable: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['1']);
    await promptMenu(rl, 'Pick:', [{ label: 'Alpha', description: 'a fine choice' }]);
    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('    1. Alpha — a fine choice');
  });

  it('promptMenu: a long row wraps at a narrow width with a hanging indent, matching promptGroupedMenu', async () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['1']);
    await promptMenu(rl, 'Pick:', [{ label: longLabel, description: longDesc }]);

    // Row lines are the only console.log calls indented 4+ spaces (title and
    // "please enter a number" messages sit at 2 spaces).
    const rowLines = logSpy.mock.calls.map((c) => c.join(' ')).filter((l) => l.startsWith('    '));
    expect(rowLines).not.toContain(`    1. ${longLabel} — ${longDesc}`);
    expect(rowLines.length).toBeGreaterThan(1);
    // A hanging-indented continuation row exists alongside the base-indented
    // first row (4-space row indent + wrapMenuLine's own 2-space hang = 6).
    expect(rowLines.some((l) => l.startsWith('      '))).toBe(true);
    expect(rowLines.some((l) => !l.startsWith('      '))).toBe(true);
    // Every word survives once the wrapped rows are rejoined.
    const reassembled = rowLines.map((l) => l.trim()).join(' ');
    expect(reassembled).toContain(longLabel);
    expect(reassembled).toContain(longDesc);
  });

  it('promptMultiSelect: a short row prints unwrapped at a comfortable width (unchanged)', async () => {
    Object.defineProperty(process.stdout, 'columns', { value: 120, writable: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['1']);
    await promptMultiSelect(rl, 'Pick:', [{ label: 'Alpha', description: 'a fine choice' }], 1);
    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('    1. Alpha — a fine choice');
  });

  it('promptMultiSelect: a long row wraps at a narrow width with a hanging indent', async () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rl = makeFakeRl(['1']);
    await promptMultiSelect(rl, 'Pick:', [{ label: longLabel, description: longDesc }], 1);

    const rowLines = logSpy.mock.calls.map((c) => c.join(' ')).filter((l) => l.startsWith('    '));
    expect(rowLines).not.toContain(`    1. ${longLabel} — ${longDesc}`);
    expect(rowLines.length).toBeGreaterThan(1);
    expect(rowLines.some((l) => l.startsWith('      '))).toBe(true);
    const reassembled = rowLines.map((l) => l.trim()).join(' ');
    expect(reassembled).toContain(longLabel);
    expect(reassembled).toContain(longDesc);
  });
});
