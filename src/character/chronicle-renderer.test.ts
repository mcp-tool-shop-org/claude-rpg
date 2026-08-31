import { describe, it, expect, afterEach } from 'vitest';
import { renderChronicle } from './chronicle-renderer.js';
import type { CampaignRecord } from '@ai-rpg-engine/campaign-memory';
import type { CompactedChronicle, EraSummary } from '../session/chronicle.js';

function makeRecord(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: 'rec-1',
    tick: 5,
    category: 'kill',
    actorId: 'player',
    description: 'defeated a bandit',
    significance: 0.5,
    witnesses: [],
    data: {},
    ...overrides,
  };
}

function makeEra(overrides: Partial<EraSummary> = {}): EraSummary {
  return {
    fromTick: 0,
    toTick: 10,
    label: 'The Early Days',
    eventCount: 3,
    topEvents: ['found the old map'],
    ...overrides,
  };
}

function makeChronicle(records: CampaignRecord[], eraSummaries: EraSummary[] = []): CompactedChronicle {
  return {
    canonicalEvents: records,
    eraSummaries,
    totalRecords: records.length,
  };
}

describe('renderChronicle bardic mode', () => {
  it('should render a dramatic passage for a positive tick', () => {
    const chronicle = makeChronicle([makeRecord({ tick: 5, category: 'kill' })]);
    const result = renderChronicle(chronicle, 'bardic', 'Kael');
    expect(result).toContain('Kael');
    expect(result).toContain('defeated a bandit');
  });

  // F-20ec59de sibling: renderRecordBardic indexes BARDIC_OPENERS[category] with
  // `record.tick % openers.length` — the same bare-modulo-on-a-plain-number pattern
  // as generateAmbientLine's seed bug. CampaignRecord.tick is typed as a plain
  // `number` with no non-negative constraint, so a negative tick would otherwise
  // index the openers array out of range and throw on the following .replace() call.
  it('should not throw and should still render for a negative tick', () => {
    const chronicle = makeChronicle([makeRecord({ tick: -1, category: 'kill' })]);
    expect(() => renderChronicle(chronicle, 'bardic', 'Kael')).not.toThrow();
    const result = renderChronicle(chronicle, 'bardic', 'Kael');
    expect(result).toContain('Kael');
    expect(result).toContain('defeated a bandit');
  });

  it('should produce deterministic output for the same negative tick', () => {
    const chronicle = makeChronicle([makeRecord({ tick: -1, category: 'kill' })]);
    const a = renderChronicle(chronicle, 'bardic', 'Kael');
    const b = renderChronicle(chronicle, 'bardic', 'Kael');
    expect(a).toBe(b);
  });
});

// F-3a024f07 / F-e475c46d: DIVIDER/HEAVY_DIVIDER were both a fixed
// '─'.repeat(60)/'═'.repeat(60), uncolored, unlike every other divider in the
// display layer (play-renderer.ts's PFE-005, F-38eb3dec's precedent), which
// adapt to getTerminalWidth() and wrap in dim(). Mirrors
// play-renderer-divider.test.ts's F-38eb3dec assertions -- structural
// (exact-width substring), not a full-screen snapshot. dim() is a no-op in
// this non-TTY test environment (colors.ts's `enabled` gate), so the
// asserted substrings are the plain repeated-character runs either way.
describe('renderChronicle divider width (F-3a024f07 / F-e475c46d)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('timeline heavy divider matches a narrow terminal width instead of a fixed 60', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const chronicle = makeChronicle([makeRecord()]);
    const result = renderChronicle(chronicle, 'timeline', 'Kael');
    expect(result).toContain('═'.repeat(40));
    expect(result).not.toContain('═'.repeat(60));
  });

  it('timeline heavy divider matches a wide terminal width, clamped to 120', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 200, writable: true });
    const chronicle = makeChronicle([makeRecord()]);
    const result = renderChronicle(chronicle, 'timeline', 'Kael');
    expect(result).toContain('═'.repeat(120));
    expect(result).not.toContain('═'.repeat(121));
  });

  it('bardic heavy divider matches a narrow terminal width instead of a fixed 60', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const chronicle = makeChronicle([makeRecord()]);
    const result = renderChronicle(chronicle, 'bardic', 'Kael');
    expect(result).toContain('═'.repeat(40));
    expect(result).not.toContain('═'.repeat(60));
  });

  it('director outer frame matches a narrow terminal width instead of a fixed 60', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const chronicle = makeChronicle([makeRecord()]);
    const result = renderChronicle(chronicle, 'director');
    expect(result).not.toContain('═'.repeat(60));
    expect(result).not.toContain('─'.repeat(60));
  });

  // F-6be2f98b: timeline/bardic frame their header with HEAVY_DIVIDER while
  // director -- the same conceptual "titled top-level screen" -- used the
  // thinner DIVIDER instead, for no apparent semantic reason. Director's
  // outer frame (open/close) now matches its two siblings' weight.
  it('director outer frame now uses the same heavy weight as timeline/bardic (F-6be2f98b)', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const chronicle = makeChronicle([makeRecord()]);
    const result = renderChronicle(chronicle, 'director');
    expect(result).toContain('═'.repeat(40));
  });

  it('era-summary divider (timeline mode) matches a narrow terminal width instead of a fixed 60', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const chronicle = makeChronicle([], [makeEra()]);
    const result = renderChronicle(chronicle, 'timeline', 'Kael');
    expect(result).toContain('─'.repeat(40));
    expect(result).not.toContain('─'.repeat(60));
  });
});

// F-6be2f98b: timeline mode's ' *' high-significance marker (renderRecordTimeline,
// significance >= 0.7) had no legend anywhere in its own output explaining what
// it means -- a player running /chronicle timeline saw asterisks on some
// entries with no stated meaning. Shown only when at least one rendered
// record actually carries the marker (no dead legend on a chronicle with no
// pivotal moments yet).
describe('renderChronicle timeline legend (F-6be2f98b)', () => {
  it('shows the pivotal-moment legend when a rendered record carries the * marker', () => {
    const chronicle = makeChronicle([makeRecord({ significance: 0.9 })]);
    const result = renderChronicle(chronicle, 'timeline', 'Kael');
    expect(result).toContain('* = pivotal moment');
  });

  it('omits the legend when no rendered record carries the * marker', () => {
    const chronicle = makeChronicle([makeRecord({ significance: 0.3 })]);
    const result = renderChronicle(chronicle, 'timeline', 'Kael');
    expect(result).not.toContain('pivotal moment');
  });

  it('omits the legend when the chronicle has no canonical events at all', () => {
    const chronicle = makeChronicle([]);
    const result = renderChronicle(chronicle, 'timeline', 'Kael');
    expect(result).not.toContain('pivotal moment');
  });
});

// F-3a024f07: within timeline mode specifically (the one mode that claims to
// be neutral/factual), canonical events rendered bracket-prefixed at a single
// indent ('  [Tick N] ...') while era-summary top-events rendered
// hyphen-bulleted at a DOUBLE indent ('    - ...') -- two different visual
// treatments for what is conceptually the same "a chronicle entry happened"
// fact. Era topEvents now sit at the same single-indent column as canonical
// events; the hyphen bullet (vs. canonical's bracket-tick) is kept because it
// reflects a real data difference -- EraSummary.topEvents carries no tick
// number to show. bardic's/director's own distinct per-mode voices for the
// same field (bare quotes / '>' prefix) are unchanged -- the file's own v0.8
// header comment already documents timeline/bardic/director as three
// deliberate voices (neutral/dramatic/forensic).
describe('renderChronicle timeline era-events indent (F-3a024f07)', () => {
  it('renders era topEvents at the same single-indent column as canonical events', () => {
    const chronicle = makeChronicle(
      [makeRecord({ description: 'defeated a bandit' })],
      [makeEra({ topEvents: ['found the old map'] })],
    );
    const result = renderChronicle(chronicle, 'timeline', 'Kael');
    expect(result).toContain('  - found the old map');
    expect(result).not.toContain('    - found the old map');
  });
});

// F-dd7a85ca: none of this file's three render modes wrapped long content to
// terminal width before this fix -- renderRecordTimeline/renderRecordBardic/
// renderDirectorChronicle each pushed one unwrapped string per record, worst
// case being renderDirectorChronicle's data line, which appended
// JSON.stringify(record.data) with no length bound at all. All three now
// route through a local wrapContentLine helper that reuses prompts.ts's
// wrapMenuLine (word-wrap + hanging indent), the same helper this domain's
// promptMenu/promptMultiSelect/promptGroupedMenu already use. Mirrors
// wrapMenuLine's own test shape (fits-on-one-line unchanged /
// wraps-with-hanging-indent-and-preserves-every-word when long).
describe('renderChronicle content wrapping (F-dd7a85ca)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('timeline: a short record description is not wrapped at a comfortable width (unchanged)', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 120, writable: true });
    const chronicle = makeChronicle([makeRecord({ tick: 5, category: 'kill', description: 'defeated a bandit' })]);
    const result = renderChronicle(chronicle, 'timeline', 'Kael');
    expect(result).toContain('  [Tick 5] defeated a bandit (kill)');
  });

  it('timeline: a long record description wraps at a narrow width, hanging-indented, with every word preserved', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const longDesc = 'discovered a hidden passage beneath the old chapel leading to a forgotten shrine untouched for a hundred years';
    const chronicle = makeChronicle([makeRecord({ tick: 5, category: 'kill', description: longDesc, significance: 0.3 })]);
    const result = renderChronicle(chronicle, 'timeline', 'Kael');

    // No longer one raw unwrapped line...
    expect(result.split('\n')).not.toContain(`  [Tick 5] ${longDesc} (kill)`);
    // ...but every word survives intact once the wrapped lines are rejoined.
    const reassembled = result.split('\n').map((l) => l.trim()).join(' ').replace(/\s+/g, ' ');
    expect(reassembled).toContain(`[Tick 5] ${longDesc} (kill)`);
    // Continuation lines hang-indent deeper than a plain single-indent row.
    expect(result).toContain('\n    ');
    for (const line of result.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it('bardic: a short record description is not wrapped at a comfortable width (unchanged)', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 120, writable: true });
    const chronicle = makeChronicle([makeRecord({ tick: 5, category: 'kill', description: 'defeated a bandit' })]);
    const result = renderChronicle(chronicle, 'bardic', 'Kael');
    // tick 5 % 3 openers.length(3) -> index 2 -> "fate demanded blood, and
    // {name} answered — defeating"
    expect(result).toContain('  Fate demanded blood, and Kael answered — defeating defeated a bandit.');
  });

  it('bardic: a long record description wraps at a narrow width with every word preserved', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const longDesc = 'stumbled upon a hidden passage beneath the old chapel leading to a forgotten shrine untouched for a hundred years';
    const chronicle = makeChronicle([makeRecord({ tick: 5, category: 'discovery', description: longDesc, significance: 0.3 })]);
    const result = renderChronicle(chronicle, 'bardic', 'Kael');

    const reassembled = result.split('\n').map((l) => l.trim()).join(' ').replace(/\s+/g, ' ');
    expect(reassembled).toContain(longDesc);
    for (const line of result.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });

  it('director: short id/sig lines are not wrapped at a comfortable width (unchanged)', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 120, writable: true });
    const chronicle = makeChronicle([makeRecord()]);
    const result = renderChronicle(chronicle, 'director');
    expect(result).toContain('  rec-1 | tick:5 | kill | actor:player');
    expect(result).toContain('    sig:0.50 | "defeated a bandit"');
  });

  it('director: a large data payload no longer renders as one unbounded JSON line -- the worst case this finding names', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const bigData = {
      itemsFound: ['ancient coin', 'rusted key', 'tattered map', 'silver locket'],
      location: 'the old cistern beneath the abandoned mill',
    };
    const rawJsonLine = `    data:${JSON.stringify(bigData)}`;
    const chronicle = makeChronicle([makeRecord({ data: bigData })]);
    const result = renderChronicle(chronicle, 'director');

    // Before this fix this was rendered as ONE raw line well over 100 chars.
    expect(rawJsonLine.length).toBeGreaterThan(100);
    expect(result.split('\n')).not.toContain(rawJsonLine);
    // Word-wrap only ever breaks BETWEEN space-separated tokens, never mid-
    // token, but a two-word phrase like "ancient coin" could still land split
    // across a line break -- reassemble before checking content survived, the
    // same technique wrapMenuLine's own test suite uses, rather than
    // asserting on the raw (possibly line-broken) result directly.
    const reassembled = result.split('\n').map((l) => l.trim()).join(' ').replace(/\s+/g, ' ');
    expect(reassembled).toContain('ancient coin');
    expect(reassembled).toContain('cistern');

    for (const line of result.split('\n')) {
      expect(line.length).toBeLessThan(rawJsonLine.length);
    }
  });
});
