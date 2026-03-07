import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { renderPlayScreen, renderWelcome } from './play-renderer.js';

describe('play-renderer', () => {
  it('should render a play screen with narration', () => {
    const engine = createGame();
    const output = renderPlayScreen({
      narration: 'You stand before a crumbling chapel.',
      world: engine.world,
      availableActions: engine.getAvailableActions(),
    });

    expect(output).toContain('You stand before a crumbling chapel.');
    expect(output).toContain('What do you do?');
  });

  it('should include player status', () => {
    const engine = createGame();
    const output = renderPlayScreen({
      narration: 'Test narration.',
      world: engine.world,
      availableActions: [],
    });

    expect(output).toContain('hp:');
  });

  it('should include dialogue when present', () => {
    const engine = createGame();
    const output = renderPlayScreen({
      narration: 'Test narration.',
      dialogue: {
        speakerId: 'pilgrim',
        speakerName: 'Suspicious Pilgrim',
        text: 'Turn back, traveler.',
        grounding: {
          beliefCount: 2,
          memoryCount: 1,
          morale: 50,
          suspicion: 60,
        },
      },
      world: engine.world,
      availableActions: [],
    });

    expect(output).toContain('Suspicious Pilgrim');
    expect(output).toContain('Turn back, traveler.');
  });

  it('should render welcome screen', () => {
    const output = renderWelcome('The Chapel Threshold', 'dark fantasy');
    expect(output).toContain('The Chapel Threshold');
    expect(output).toContain('dark fantasy');
    expect(output).toContain('/director');
  });
});
