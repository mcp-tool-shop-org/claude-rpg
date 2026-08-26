import { describe, it, expect } from 'vitest';
import { renderRecap } from './recap.js';
import { TurnHistory } from '../session/history.js';
import { FALLBACK_NARRATION } from '../narrator/narrator.js';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';

function makeHistory(narrations: string[]): TurnHistory {
  const history = new TurnHistory();
  narrations.forEach((narration, i) => {
    history.record({ tick: i, playerInput: 'look', verb: 'look', narration });
  });
  return history;
}

function makeProfile(overrides: Partial<CharacterProfile> = {}): CharacterProfile {
  return {
    build: { name: 'Kael', archetypeId: 'warden', disciplineId: undefined as any },
    progression: { xp: 0 },
    resources: { hp: 50 },
    loadout: { equipped: {} },
    custom: {},
    reputation: [],
    injuries: [],
    milestones: [],
    itemChronicle: {},
    totalTurns: 12,
    ...overrides,
  } as CharacterProfile;
}

describe('renderRecap basic structure', () => {
  it('should render the "LAST TIME ON CLAUDE RPG..." header', () => {
    const result = renderRecap(null, makeHistory([]));
    expect(result).toContain('LAST TIME ON CLAUDE RPG...');
  });

  it('should render profile name/level/turns when a profile is present', () => {
    const result = renderRecap(makeProfile(), makeHistory([]));
    expect(result).toContain('Kael');
    expect(result).toContain('12 turns played');
  });

  it('should quote real narration verbatim when no fallback turns are present', () => {
    const history = makeHistory([
      'You step into the tavern.',
      'The bartender nods.',
      'You order a drink.',
    ]);
    const result = renderRecap(null, history);
    expect(result).toContain('"You step into the tavern."');
    expect(result).toContain('"The bartender nods."');
    expect(result).toContain('"You order a drink."');
  });
});

// F-b6915850: renderRecap quotes history.getRecentNarration(3) verbatim with no
// way to tell narrator.ts's FALLBACK_NARRATION sentinel apart from real LLM
// prose. A non-fatal NarrationError on one of the last 3 turns before saving
// would previously get quoted as if it were authored narrative on the next
// "LAST TIME ON CLAUDE RPG..." load screen. TurnRecord has no isFallback flag
// (that would need threading NarrationResult.isFallback through
// session/history.ts, cross-domain — not owned by this domain), so this is the
// narrower in-domain mitigation: filter lines that exactly equal the known
// FALLBACK_NARRATION sentinel before quoting.
describe('renderRecap F-b6915850: fallback sentinel is never quoted as real narrative', () => {
  it('should not quote a turn whose narration is exactly FALLBACK_NARRATION', () => {
    const history = makeHistory([
      'A real narrated turn.',
      FALLBACK_NARRATION,
      'Another real turn.',
    ]);
    const result = renderRecap(null, history);
    expect(result).not.toContain(`"${FALLBACK_NARRATION}"`);
    expect(result).toContain('A real narrated turn.');
    expect(result).toContain('Another real turn.');
  });

  it('should cleanly omit the recent-narration section when every one of the last 3 turns is a fallback', () => {
    const history = makeHistory([FALLBACK_NARRATION, FALLBACK_NARRATION, FALLBACK_NARRATION]);
    const result = renderRecap(null, history);
    expect(result).not.toContain(FALLBACK_NARRATION);
  });
});
