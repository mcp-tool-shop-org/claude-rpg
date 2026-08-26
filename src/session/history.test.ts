import { describe, it, expect } from 'vitest';
import { TurnHistory } from './history.js';
import { FALLBACK_NARRATION, KNOWN_FALLBACK_NARRATION_SENTINELS } from '../narrator/narrator.js';
import { FATAL_NARRATION_FALLBACK } from '../turn-loop.js';

describe('TurnHistory', () => {
  it('should record and retrieve turns', () => {
    const history = new TurnHistory();
    history.record({
      tick: 1,
      playerInput: 'look around',
      verb: 'look',
      narration: 'You see a dark chapel.',
    });

    expect(history.getAll()).toHaveLength(1);
    expect(history.getRecent(1)[0].narration).toBe('You see a dark chapel.');
  });

  it('should cap at maxTurns', () => {
    const history = new TurnHistory(3);
    for (let i = 0; i < 5; i++) {
      history.record({
        tick: i,
        playerInput: `action ${i}`,
        verb: 'look',
        narration: `narration ${i}`,
      });
    }

    expect(history.getAll()).toHaveLength(3);
    expect(history.getAll()[0].tick).toBe(2);
  });

  it('should return recent narration', () => {
    const history = new TurnHistory();
    history.record({ tick: 1, playerInput: 'a', verb: 'look', narration: 'first' });
    history.record({ tick: 2, playerInput: 'b', verb: 'look', narration: 'second' });
    history.record({ tick: 3, playerInput: 'c', verb: 'look', narration: 'third' });

    const recent = history.getRecentNarration(2);
    expect(recent).toEqual(['second', 'third']);
  });

  it('should serialize and deserialize (legacy array format)', () => {
    const history = new TurnHistory();
    history.record({
      tick: 1,
      playerInput: 'test',
      verb: 'look',
      narration: 'narration',
      dialogue: { speaker: 'NPC', text: 'Hello' },
    });

    const json = history.toJSON();
    const restored = TurnHistory.fromJSON(json.turns);

    expect(restored.getAll()).toHaveLength(1);
    expect(restored.getAll()[0].dialogue?.speaker).toBe('NPC');
  });

  it('should preserve maxTurns through serialization round-trip', () => {
    // T-004: fromJSON now accepts maxTurns parameter to preserve cap
    const history = new TurnHistory(3);
    history.record({ tick: 1, playerInput: 'a', verb: 'look', narration: 'n1' });
    history.record({ tick: 2, playerInput: 'b', verb: 'look', narration: 'n2' });
    history.record({ tick: 3, playerInput: 'c', verb: 'look', narration: 'n3' });

    // Original correctly caps at 3
    expect(history.getAll()).toHaveLength(3);

    // Round-trip with explicit maxTurns
    const json = history.toJSON();
    const restored = TurnHistory.fromJSON(json, 3);

    // Data survives
    expect(restored.getAll()).toHaveLength(3);
    expect(restored.getAll()[0].tick).toBe(1);

    // Add more entries to test cap behavior
    restored.record({ tick: 4, playerInput: 'd', verb: 'look', narration: 'n4' });
    restored.record({ tick: 5, playerInput: 'e', verb: 'look', narration: 'n5' });

    // With maxTurns=3 preserved, restored history caps correctly
    expect(restored.getAll()).toHaveLength(3);
    expect(restored.getAll()[0].tick).toBe(3); // oldest kept
    expect(restored.getAll()[2].tick).toBe(5); // newest
  });

  it('should truncate oversized data during fromJSON deserialization', () => {
    // B-019: fromJSON should apply maxTurns truncation during deserialization
    const data = Array.from({ length: 10 }, (_, i) => ({
      tick: i + 1,
      playerInput: `action-${i + 1}`,
      verb: 'look',
      narration: `narration-${i + 1}`,
    }));
    const restored = TurnHistory.fromJSON(data, 5);
    expect(restored.getAll()).toHaveLength(5);
    // Should keep the most recent 5 turns (ticks 6-10)
    expect(restored.getAll()[0].tick).toBe(6);
    expect(restored.getAll()[4].tick).toBe(10);
  });

  it('should handle maxTurns=1 keeping only the last entry (T-020)', () => {
    const history = new TurnHistory(1);
    history.record({ tick: 1, playerInput: 'a', verb: 'look', narration: 'first' });
    history.record({ tick: 2, playerInput: 'b', verb: 'look', narration: 'second' });
    history.record({ tick: 3, playerInput: 'c', verb: 'look', narration: 'third' });

    expect(history.getAll()).toHaveLength(1);
    expect(history.getAll()[0].tick).toBe(3);
    expect(history.getAll()[0].narration).toBe('third');
  });

  it('should clear history', () => {
    const history = new TurnHistory();
    history.record({ tick: 1, playerInput: 'a', verb: 'look', narration: 'x' });
    history.clear();
    expect(history.getAll()).toHaveLength(0);
  });
});

describe('TurnHistory compaction (FT-B-006)', () => {
  it('should generate compacted summary when turns are evicted', () => {
    const history = new TurnHistory(2);
    history.record({ tick: 1, playerInput: 'go north', verb: 'move', narration: 'You travel north.' });
    history.record({ tick: 2, playerInput: 'look', verb: 'look', narration: 'A dark room.' });
    // This evicts tick 1
    history.record({ tick: 3, playerInput: 'attack goblin', verb: 'attack', narration: 'You fight!' });

    expect(history.compactedSummary).toContain('Traveled');
    expect(history.compactedChunks).toHaveLength(1);
    expect(history.compactedChunks[0].fromTick).toBe(1);
  });

  it('should accumulate multiple evicted turns in compacted summary', () => {
    const history = new TurnHistory(2);
    history.record({ tick: 1, playerInput: 'go north', verb: 'move', narration: 'You go north.' });
    history.record({ tick: 2, playerInput: 'talk to guard', verb: 'speak', narration: 'The guard nods.',
      dialogue: { speaker: 'Guard', text: 'Hello.' } });
    // Evicts tick 1
    history.record({ tick: 3, playerInput: 'look', verb: 'look', narration: 'A plaza.' });
    // Evicts tick 2
    history.record({ tick: 4, playerInput: 'attack', verb: 'attack', narration: 'Combat!' });

    expect(history.compactedChunks).toHaveLength(2);
    expect(history.compactedSummary).toContain('Traveled');
    expect(history.compactedSummary).toContain('Guard');
  });

  it('should provide chronicle highlights for narrator context', () => {
    const history = new TurnHistory(1);
    history.record({ tick: 1, playerInput: 'attack', verb: 'attack', narration: 'Battle!' });
    history.record({ tick: 2, playerInput: 'look', verb: 'look', narration: 'Calm.' });

    const highlights = history.getChronicleHighlights();
    expect(highlights).toBeDefined();
    expect(highlights).toContain('[Long-term memory]');
    expect(highlights).toContain('combat');
  });

  it('should return undefined highlights when no compaction has occurred', () => {
    const history = new TurnHistory(50);
    history.record({ tick: 1, playerInput: 'look', verb: 'look', narration: 'Room.' });
    expect(history.getChronicleHighlights()).toBeUndefined();
  });

  it('should batch-compact multiple turns', () => {
    const history = new TurnHistory();
    const turns = [
      { tick: 1, playerInput: 'go north', verb: 'move', narration: 'North.' },
      { tick: 2, playerInput: 'talk', verb: 'speak', narration: 'Chat.',
        dialogue: { speaker: 'Merchant', text: 'Buy something?' } },
      { tick: 3, playerInput: 'attack', verb: 'attack', narration: 'Fight!' },
    ];
    history.compactBatch(turns);

    expect(history.compactedChunks).toHaveLength(1);
    expect(history.compactedChunks[0].fromTick).toBe(1);
    expect(history.compactedChunks[0].toTick).toBe(3);
    expect(history.compactedSummary).toContain('Merchant');
    expect(history.compactedSummary).toContain('combat');
  });

  it('should serialize and deserialize compacted data', () => {
    const history = new TurnHistory(1);
    history.record({ tick: 1, playerInput: 'attack', verb: 'attack', narration: 'Fight!' });
    history.record({ tick: 2, playerInput: 'look', verb: 'look', narration: 'Calm.' });

    const json = history.toJSON();
    expect(json.compactedChunks).toBeDefined();
    expect(json.compactedSummary).toBeDefined();

    const restored = TurnHistory.fromJSON(json, 1);
    expect(restored.compactedSummary).toBe(history.compactedSummary);
    expect(restored.compactedChunks).toHaveLength(history.compactedChunks.length);
  });

  it('should clear compacted data when history is cleared', () => {
    const history = new TurnHistory(1);
    history.record({ tick: 1, playerInput: 'a', verb: 'attack', narration: 'x' });
    history.record({ tick: 2, playerInput: 'b', verb: 'look', narration: 'y' });

    expect(history.compactedSummary).not.toBe('');
    history.clear();
    expect(history.compactedSummary).toBe('');
    expect(history.compactedChunks).toHaveLength(0);
  });

  // F-dfd125bb: compactEvictedTurn() pushed one chunk per evicted turn and
  // rebuilt compactedSummary by joining every chunk ever produced, with no
  // cap — in a several-hundred-turn campaign (this studio's target
  // production scale) that inflates the string sent on every single
  // narration prompt for the rest of the playthrough. Prove it plateaus
  // instead of growing linearly with turn count.
  it('should keep compactedChunks and compactedSummary bounded across a several-hundred-turn campaign', () => {
    const history = new TurnHistory(2); // small window so eviction (and compaction) starts quickly
    for (let i = 1; i <= 200; i++) {
      history.record({ tick: i, playerInput: `action ${i}`, verb: 'attack', narration: `n${i}` });
    }
    const chunksAt200 = history.compactedChunks.length;
    const summaryLenAt200 = history.compactedSummary.length;

    for (let i = 201; i <= 400; i++) {
      history.record({ tick: i, playerInput: `action ${i}`, verb: 'attack', narration: `n${i}` });
    }
    const chunksAt400 = history.compactedChunks.length;
    const summaryLenAt400 = history.compactedSummary.length;

    // Without a cap, 200 more evicted turns would add ~200 more chunks and
    // ~200 more sentences. With the cap in place, both plateau instead.
    expect(chunksAt400).toBe(chunksAt200);
    expect(summaryLenAt400).toBe(summaryLenAt200);

    // The oldest chunks were dropped first (same eviction shape record()
    // already applies to `turns`) — the earliest surviving chunk is no
    // longer from tick 1.
    expect(history.compactedChunks[0].fromTick).toBeGreaterThan(1);
  });

  it('should cap compactedChunks on fromJSON restore too, so a pre-cap save self-heals on load', () => {
    // Simulate an old save serialized before this cap existed: far more
    // chunks than any cap should allow, all sharing the same summary text
    // (verb 'attack' never interpolates the tick), so length is easy to
    // reason about.
    const oversizedChunks = Array.from({ length: 500 }, (_, i) => ({
      fromTick: i + 1,
      toTick: i + 1,
      summary: 'Fought in combat.',
    }));
    const data = {
      turns: [{ tick: 501, playerInput: 'look', verb: 'look', narration: 'Calm.' }],
      compactedChunks: oversizedChunks,
      compactedSummary: oversizedChunks.map((c) => c.summary).join(' '),
    };

    const restored = TurnHistory.fromJSON(data, 50);

    expect(restored.compactedChunks.length).toBeLessThan(500);
    // The restored summary must actually match the (trimmed) chunks, not
    // just be shorter — i.e. it was recomputed, not merely truncated blindly.
    expect(restored.compactedSummary).toBe(
      restored.compactedChunks.map((c) => c.summary).join(' '),
    );
  });

  // F-5f703a0b: fromJSON()'s `else if (data.compactedSummary)` branch (no
  // compactedChunks breakdown — an old/opaque-format save, or the exact
  // shape toJSON() still emits whenever _compactedChunks is empty but
  // _compactedSummary isn't) assigned _compactedSummary directly and left
  // _compactedChunks empty, so it never went through trimCompactedChunks()
  // on load. Worse: the *next* eviction's compactEvictedTurn() pushes one
  // chunk onto that still-empty array, then trimCompactedChunks() rebuilds
  // _compactedSummary ENTIRELY from _compactedChunks — silently discarding
  // the whole legacy summary down to one new sentence.
  it('should bound a compactedSummary-only fromJSON restore too, and survive the next eviction', () => {
    const legacySummary = 'Fought in combat.';
    const data = {
      turns: [{ tick: 501, playerInput: 'look', verb: 'look', narration: 'Calm.' }],
      compactedSummary: legacySummary,
    };

    const restored = TurnHistory.fromJSON(data, 1);

    // Bounded (seeded into a real chunk) immediately on load, same as the
    // compactedChunks-present branch above — not left as an untracked string.
    expect(restored.compactedChunks).toHaveLength(1);
    expect(restored.compactedSummary).toBe(legacySummary);

    // Trigger the next eviction: compactEvictedTurn() pushes one more chunk,
    // then trimCompactedChunks() rebuilds compactedSummary entirely from
    // compactedChunks. Before this fix, compactedChunks started empty here,
    // so that rebuild silently discarded the whole legacy summary. With the
    // seed in place, the legacy content survives alongside the new chunk.
    restored.record({ tick: 502, playerInput: 'x', verb: 'attack', narration: 'Fight!' });
    expect(restored.compactedSummary).toContain(legacySummary);
  });

  // F-f0276ea0: fromJSON's object-format branch trusted `data.turns` was
  // already an array (TypeScript's static type says so) without any runtime
  // check. But data reaching this method already flowed through an
  // unchecked `JSON.parse(...) as SavedSession` cast upstream (session.ts's
  // validateSaveShape only checks `typeof obj.turnHistory === 'object'`,
  // which a hand-edited turnHistory.turns field of the wrong type — e.g. a
  // bare string — still satisfies at the object level). `data.turns.length`/
  // `.slice(-maxTurns)` both "succeed" on a string too (strings have both),
  // silently assigning a wrong-typed value where TurnRecord[] is expected,
  // surfacing only later wherever a TurnRecord[]-only method
  // (getRecentNarration()'s .filter(), etc.) is first called against it.
  it('falls back to an empty turn list when data.turns is present but not an array (hand-edited/schema-drifted save)', () => {
    const data = { turns: 'not-an-array' } as unknown as Parameters<typeof TurnHistory.fromJSON>[0];

    const restored = TurnHistory.fromJSON(data, 50);

    expect(restored.getAll()).toEqual([]);
  });
});

// F-8da2e6f7: turn-loop.ts defines its own fallback sentinel
// (FATAL_NARRATION_FALLBACK) distinct from narrator.ts's FALLBACK_NARRATION.
// getRecentNarration() previously returned placeholder narration
// indistinguishable from real authored text, feeding it unfiltered into the
// next narration prompt (prompts/narrate-scene.ts) and into recap.ts's
// "LAST TIME ON..." display.
describe('TurnHistory.getRecentNarration fallback filtering (F-8da2e6f7)', () => {
  it('excludes isFallback-flagged turns', () => {
    const history = new TurnHistory();
    history.record({ tick: 1, playerInput: 'a', verb: 'look', narration: 'real one' });
    history.record({ tick: 2, playerInput: 'b', verb: 'look', narration: 'placeholder text', isFallback: true });
    history.record({ tick: 3, playerInput: 'c', verb: 'look', narration: 'real two' });

    expect(history.getRecentNarration(3)).toEqual(['real one', 'real two']);
  });

  it('includes turns explicitly flagged isFallback: false', () => {
    const history = new TurnHistory();
    history.record({ tick: 1, playerInput: 'a', verb: 'look', narration: 'real one', isFallback: false });

    expect(history.getRecentNarration(1)).toEqual(['real one']);
  });

  it('falls back to comparing known sentinel strings for turns restored without the isFallback flag (legacy saves)', () => {
    // A save written before this field existed has no isFallback key at all
    // on its turn records — fromJSON restores those turns with isFallback
    // left undefined, so the exclusion must still catch known placeholder
    // text by value in that case.
    const restored = TurnHistory.fromJSON({
      turns: [
        { tick: 1, playerInput: 'a', verb: 'look', narration: 'real one' },
        { tick: 2, playerInput: 'b', verb: 'look', narration: FALLBACK_NARRATION },
        { tick: 3, playerInput: 'c', verb: 'attack', narration: FATAL_NARRATION_FALLBACK },
        { tick: 4, playerInput: 'd', verb: 'look', narration: 'real two' },
      ],
    });

    expect(restored.getRecentNarration(4)).toEqual(['real one', 'real two']);
  });
});

// F-223de079: isFallbackTurn() independently hardcoded `t.narration ===
// FALLBACK_NARRATION || t.narration === FATAL_NARRATION_FALLBACK` instead of
// checking KNOWN_FALLBACK_NARRATION_SENTINELS.includes(t.narration) the way
// recap.ts already does. Harmless today (only two sentinels exist and both
// are named in the OR-chain), but narrator.ts's own doc comment on the
// shared array says consumers should "compare against this list rather than
// FALLBACK_NARRATION alone" specifically so a third sentinel is picked up
// automatically. This is the mechanism check — the F-8da2e6f7 suite above
// already covers the *value* check for the current two sentinels, which
// passes under either implementation and can't tell them apart.
describe('TurnHistory.isFallbackTurn recognizes the shared sentinel list, not just the two named constants (F-223de079)', () => {
  it('excludes a narration string added to KNOWN_FALLBACK_NARRATION_SENTINELS after the fact, not just FALLBACK_NARRATION/FATAL_NARRATION_FALLBACK', () => {
    const extraSentinel = 'a hypothetical third fallback sentinel';
    // KNOWN_FALLBACK_NARRATION_SENTINELS is typed `readonly string[]` but not
    // frozen at runtime — simulate a future third sentinel being appended,
    // exactly the scenario the finding warns a hardcoded OR-chain would miss.
    (KNOWN_FALLBACK_NARRATION_SENTINELS as string[]).push(extraSentinel);
    try {
      const history = new TurnHistory();
      history.record({ tick: 1, playerInput: 'a', verb: 'look', narration: 'real one' });
      history.record({ tick: 2, playerInput: 'b', verb: 'look', narration: extraSentinel });
      history.record({ tick: 3, playerInput: 'c', verb: 'look', narration: 'real two' });

      expect(history.getRecentNarration(3)).toEqual(['real one', 'real two']);
    } finally {
      (KNOWN_FALLBACK_NARRATION_SENTINELS as string[]).pop();
    }
  });
});
