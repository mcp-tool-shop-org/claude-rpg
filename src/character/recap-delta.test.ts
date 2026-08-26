import { describe, it, expect, afterEach } from 'vitest';
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

// F-e475c46d: DIVIDER was a hardcoded '─'.repeat(60), unlike play-renderer.ts's
// own dividers (PFE-005), which adapt to the real terminal width. Mirrors
// play-renderer-divider.test.ts's F-38eb3dec assertions -- structural
// (exact-width substring), not a full-screen snapshot.
describe('renderSessionDelta divider width (F-e475c46d)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  const nonEmptyDelta: SessionDelta = {
    xpGained: 0,
    levelBefore: 1,
    levelAfter: 1,
    reputationChanges: [],
    newMilestones: 1,
    newInjuries: 0,
    turnsPlayed: 0,
  };

  it('divider matches a narrow terminal width instead of a fixed 60', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const result = renderSessionDelta(nonEmptyDelta);
    expect(result).toContain('─'.repeat(40));
    expect(result).not.toContain('─'.repeat(60));
  });

  it('divider matches a wide terminal width, clamped to 120', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 200, writable: true });
    const result = renderSessionDelta(nonEmptyDelta);
    expect(result).toContain('─'.repeat(120));
    expect(result).not.toContain('─'.repeat(121));
  });
});
