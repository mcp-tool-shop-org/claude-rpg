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

  it('should clear history', () => {
    const history = new TurnHistory();
    history.record({ tick: 1, playerInput: 'a', verb: 'look', narration: 'x' });
    history.clear();
    expect(history.getAll()).toHaveLength(0);
  });
});
