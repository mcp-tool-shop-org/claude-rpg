import { describe, it, expect } from 'vitest';
import { TurnHistory } from './history.js';

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

  it('should serialize and deserialize', () => {
    const history = new TurnHistory();
    history.record({
      tick: 1,
      playerInput: 'test',
      verb: 'look',
      narration: 'narration',
      dialogue: { speaker: 'NPC', text: 'Hello' },
    });

    const json = history.toJSON();
    const restored = TurnHistory.fromJSON(json);

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
