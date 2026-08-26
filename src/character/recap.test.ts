import { describe, it, expect } from 'vitest';
import { renderRecap } from './recap.js';
import { TurnHistory, type TurnRecord } from '../session/history.js';
import { FALLBACK_NARRATION, FATAL_NARRATION_FALLBACK } from '../narrator/narrator.js';
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

// F-18f4dd88 (seam contract, wave 6): the fallback-sentinel filter above only
// ever checked FALLBACK_NARRATION, but a second, differently-worded sentinel
// exists on the game-core side of this wave's split worktrees —
// turn-loop.ts's FATAL_NARRATION_FALLBACK, mirrored here as
// FATAL_NARRATION_FALLBACK (see narrator.ts's
// KNOWN_FALLBACK_NARRATION_SENTINELS). A save recorded via that path used to
// get quoted verbatim on the next load. Separately, once game-core wires
// NarrationResult.isFallback through TurnRecord (this same wave, in its own
// worktree), a record can carry the flag directly instead of relying on a
// sentinel-text match at all — renderRecap must prefer that flag when present.
describe('renderRecap F-18f4dd88: seam contract — second sentinel + isFallback flag', () => {
  it('should not quote a turn whose narration matches the mirrored turn-loop.ts fallback sentinel', () => {
    const history = makeHistory([
      'A real narrated turn.',
      FATAL_NARRATION_FALLBACK,
      'Another real turn.',
    ]);
    const result = renderRecap(null, history);
    expect(result).not.toContain(`"${FATAL_NARRATION_FALLBACK}"`);
    expect(result).toContain('A real narrated turn.');
    expect(result).toContain('Another real turn.');
  });

  it('should not quote a turn whose isFallback flag is true even when its narration text is not a known sentinel', () => {
    const history = new TurnHistory();
    history.record({ tick: 0, playerInput: 'look', verb: 'look', narration: 'A real narrated turn.' });
    // Simulates a post-merge TurnRecord carrying the isFallback flag
    // game-core adds this same wave (turn-loop.ts passing
    // narrationResult.isFallback into history.record()). TurnRecord doesn't
    // declare the field in this worktree, so the literal is asserted through
    // it — see recap.ts's MaybeFallback for the read side of this contract.
    history.record({
      tick: 1,
      playerInput: 'act',
      verb: 'act',
      narration: 'This reads like normal prose but is flagged as a fallback.',
      isFallback: true,
    } as TurnRecord);
    history.record({ tick: 2, playerInput: 'look', verb: 'look', narration: 'Another real turn.' });

    const result = renderRecap(null, history);
    expect(result).not.toContain('This reads like normal prose but is flagged as a fallback.');
    expect(result).toContain('A real narrated turn.');
    expect(result).toContain('Another real turn.');
  });
});
