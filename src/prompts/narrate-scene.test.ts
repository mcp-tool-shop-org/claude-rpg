import { describe, it, expect } from 'vitest';
import { buildNarratePrompt, type SceneNarrationInput } from './narrate-scene.js';

function makeInput(overrides: Partial<SceneNarrationInput> = {}): SceneNarrationInput {
  return {
    zoneName: 'Market Square',
    zoneTags: ['urban'],
    atmosphere: { light: 'normal', noise: 'moderate', stability: 'stable' },
    visibleEntities: [],
    recentEvents: [],
    playerState: { hp: 10, statuses: [] },
    exits: [],
    tone: 'dark fantasy',
    recentNarration: [],
    isNewZone: false,
    ...overrides,
  };
}

describe('buildNarratePrompt', () => {
  it('should render the zone, atmosphere, and tone', () => {
    const prompt = buildNarratePrompt(makeInput());
    expect(prompt).toContain('Market Square');
    expect(prompt).toContain('dark fantasy');
  });

  it('should not include a chronicle section when chronicleContext is absent', () => {
    const prompt = buildNarratePrompt(makeInput());
    expect(prompt).not.toContain('Chronicle');
  });

  // F-7815df9e (game-core seam contract): chronicleContext folds into the prompt
  // as a compact long-term-memory section when present, so game-core can pass
  // condensed campaign-chronicle context into scene narration.
  it('should fold chronicleContext into the prompt as a compact long-term-memory section when present', () => {
    const prompt = buildNarratePrompt(
      makeInput({ chronicleContext: 'The player once spared the bandit chief.' }),
    );
    expect(prompt).toContain('Chronicle');
    expect(prompt).toContain('long-term memory');
    expect(prompt).toContain('The player once spared the bandit chief.');
  });
});
