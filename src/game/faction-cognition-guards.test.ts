// PB-003: Tests for safe faction cognition access pattern.
// Verifies that typeof guards prevent crashes when cognition data is
// missing, null, or has unexpected types.

import { describe, it, expect } from 'vitest';

/**
 * Extracted guard pattern used across game.ts for faction cognition access.
 * This mirrors the pattern applied in PB-003 to validate without unsafe casts.
 */
function safeFactionState(fcog: unknown): { alertLevel: number; cohesion: number } {
  if (fcog && typeof fcog === 'object') {
    const state = fcog as Record<string, unknown>;
    const rawAlert = state.alertLevel;
    const rawCohesion = state.cohesion;
    return {
      alertLevel: typeof rawAlert === 'number' ? rawAlert : 0,
      cohesion: typeof rawCohesion === 'number' ? rawCohesion : 1,
    };
  }
  return { alertLevel: 0, cohesion: 1 };
}

describe('faction cognition typeof guards (PB-003)', () => {
  it('handles valid cognition object', () => {
    const result = safeFactionState({ alertLevel: 50, cohesion: 0.8 });
    expect(result.alertLevel).toBe(50);
    expect(result.cohesion).toBe(0.8);
  });

  it('handles null cognition', () => {
    const result = safeFactionState(null);
    expect(result.alertLevel).toBe(0);
    expect(result.cohesion).toBe(1);
  });

  it('handles undefined cognition', () => {
    const result = safeFactionState(undefined);
    expect(result.alertLevel).toBe(0);
    expect(result.cohesion).toBe(1);
  });

  it('handles cognition with wrong field types', () => {
    const result = safeFactionState({ alertLevel: 'high', cohesion: 'solid' });
    expect(result.alertLevel).toBe(0);
    expect(result.cohesion).toBe(1);
  });

  it('handles cognition with missing fields', () => {
    const result = safeFactionState({ unrelatedField: 42 });
    expect(result.alertLevel).toBe(0);
    expect(result.cohesion).toBe(1);
  });

  it('handles cognition with partial fields', () => {
    const result = safeFactionState({ alertLevel: 30 });
    expect(result.alertLevel).toBe(30);
    expect(result.cohesion).toBe(1);
  });

  it('handles primitive value (not object)', () => {
    expect(safeFactionState(42)).toEqual({ alertLevel: 0, cohesion: 1 });
    expect(safeFactionState('string')).toEqual({ alertLevel: 0, cohesion: 1 });
    expect(safeFactionState(true)).toEqual({ alertLevel: 0, cohesion: 1 });
  });
});
