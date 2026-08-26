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
        isFallback: false,
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

  // F-55401320: the welcome screen (first thing printed after character
  // creation or a save load, before the opening narration) taught /director
  // and /sheet but never mentioned /help -- the one command that unlocks the
  // full reference. A new player's first-ever CLI hint set pointed at a
  // niche diagnostic mode and the character sheet, not at "how do I see
  // everything this game supports."
  it('should hint at /help alongside /director and /sheet', () => {
    const output = renderWelcome('The Chapel Threshold', 'dark fantasy');
    expect(output).toContain('/help');
  });
});
