import { describe, it, expect } from 'vitest';
import { renderSessionDelta, type SessionDelta } from './recap-delta.js';

// --- renderSessionDelta (F-579e70a8: same incomplete-gate pattern as session-recap.ts) ---

describe('renderSessionDelta', () => {
  const zeroDelta: SessionDelta = {
    xpGained: 0,
    levelBefore: 1,
    levelAfter: 1,
    reputationChanges: [],
    newMilestones: 0,
    newInjuries: 0,
    turnsPlayed: 0,
  };

  it('returns empty string when truly nothing happened', () => {
    expect(renderSessionDelta(zeroDelta)).toBe('');
  });

  it('renders a non-empty summary when only reputationChanges is populated (turnsPlayed/xpGained stay zero)', () => {
    const delta: SessionDelta = {
      ...zeroDelta,
      reputationChanges: [{ factionId: 'guild', before: 10, after: 15 }],
    };

    const result = renderSessionDelta(delta);

    expect(result).not.toBe('');
    expect(result).toContain('guild');
  });

  it('renders a non-empty summary when only newMilestones is populated', () => {
    const delta: SessionDelta = { ...zeroDelta, newMilestones: 1 };

    const result = renderSessionDelta(delta);

    expect(result).not.toBe('');
    expect(result).toContain('new milestone');
  });

  it('renders a non-empty summary when only newInjuries is populated', () => {
    const delta: SessionDelta = { ...zeroDelta, newInjuries: 2 };

    const result = renderSessionDelta(delta);

    expect(result).not.toBe('');
    expect(result).toContain('new injuries');
  });

  it('renders a non-empty summary when only titleAfter changed', () => {
    const delta: SessionDelta = { ...zeroDelta, titleBefore: undefined, titleAfter: 'the Bold' };

    const result = renderSessionDelta(delta);

    expect(result).not.toBe('');
    expect(result).toContain('the Bold');
  });
});
