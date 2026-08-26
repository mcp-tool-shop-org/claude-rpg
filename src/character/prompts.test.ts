import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Interface as ReadlineInterface } from 'node:readline';
import { promptGroupedMenu, wrapMenuLine, type MenuGroup } from './prompts.js';

// F-6ed5f350 (SLATE-3): prompts.ts had no test file before this wave (2 of
// the 8 character/** files F-8d11d865 already flagged as untested).

/** Minimal fake readline.Interface: scripted answers, ignores prompt text. */
function makeFakeRl(answers: string[]): ReadlineInterface {
  let i = 0;
  return {
    question: (_prompt: string, cb: (answer: string) => void) => {
      const answer = answers[i] ?? '';
      i++;
      cb(answer);
    },
  } as unknown as ReadlineInterface;
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
