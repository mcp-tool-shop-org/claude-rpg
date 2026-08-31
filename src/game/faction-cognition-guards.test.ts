// PB-003: Tests for safe faction cognition access pattern.
// Verifies that typeof guards prevent crashes when cognition data is
// missing, null, or has unexpected types.
//
// F-faf37249: this file used to re-declare its own local copy of the guard
// (safeFactionState) instead of importing anything -- meaning it protected a
// hand-maintained mirror, not production code, and any of game.ts's/
// game-state.ts's real inline copies could drift from it with zero signal.
// It now imports and exercises the real exported
// readFactionCognitionScalars() (game-state.ts) that every real call site
// (game.ts:1661, 2388, 3054; game-state.ts's buildPressureInputs,
// buildArcInputs, buildFinaleFromState) was consolidated onto this same
// wave. Test bodies are unchanged -- this is a refactor-extract with
// byte-identical guard logic, not a behavior change.

import { describe, it, expect } from 'vitest';
import { readFactionCognitionScalars as safeFactionState } from './game-state.js';

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
