import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderRecap } from './recap.js';
import { TurnHistory, type TurnRecord } from '../session/history.js';
import { FALLBACK_NARRATION, FATAL_NARRATION_FALLBACK } from '../narrator/narrator.js';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';

// F-4b8a3a39: minimal BuildCatalog fixture, same shape as sheet.test.ts's /
// presence.test.ts's makeBuildCatalog — only .archetypes is exercised here.
function makeBuildCatalog(overrides: Partial<BuildCatalog> = {}): BuildCatalog {
  return {
    packId: 'test-pack',
    statBudget: 0,
    maxTraits: 0,
    requiredFlaws: 0,
    archetypes: [{ id: 'warden', name: 'Warden' }] as any,
    backgrounds: [],
    traits: [],
    disciplines: [],
    crossTitles: [],
    entanglements: [],
    ...overrides,
  } as unknown as BuildCatalog;
}

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

  // F-4b8a3a39: recap.ts:53 printed the raw archetypeId catalog slug, the
  // same shape already fixed for presence.ts (F-3c282b18) and sheet.ts
  // (F-9c94c4b5). renderRecap now accepts an optional trailing BuildCatalog
  // and resolves through catalog-names.ts, falling back to the raw id when
  // omitted (backward compatible with every pre-existing call site).
  it('should resolve archetypeId to its catalog display name when a catalog is supplied', () => {
    const result = renderRecap(makeProfile(), makeHistory([]), makeBuildCatalog());
    expect(result).toContain('Warden');
    expect(result).not.toContain('warden');
  });

  it('should keep printing the raw archetypeId when no catalog is supplied (unchanged default)', () => {
    const result = renderRecap(makeProfile(), makeHistory([]));
    expect(result).toContain('warden');
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

  // F-08c1896e: omitting the section entirely (the assertion above) reads
  // identically to a fresh character with no turns played yet -- a player
  // resuming right after an outage got no re-orientation at all. There must
  // be SOME honest placeholder line instead of silence, distinguishable from
  // both a real quoted narration line and from the fresh-character case.
  it('should show an honest placeholder (not silence) when every one of the last 3 turns is a fallback', () => {
    const history = makeHistory([FALLBACK_NARRATION, FALLBACK_NARRATION, FALLBACK_NARRATION]);
    const result = renderRecap(null, history);
    expect(result).toMatch(/recent events are unclear/i);
  });

  it('should NOT show the fallback placeholder when there is no history at all (fresh character)', () => {
    const result = renderRecap(null, makeHistory([]));
    expect(result).not.toMatch(/recent events are unclear/i);
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

// F-e475c46d: DIVIDER was a hardcoded '═'.repeat(60), unlike play-renderer.ts's
// own dividers (PFE-005), which adapt to the real terminal width. Mirrors
// play-renderer-divider.test.ts / help-system.test.ts's F-38eb3dec assertions
// -- structural (exact-width substring), not a full-screen snapshot. recap.ts
// renders on every save-load ("LAST TIME ON CLAUDE RPG..."), immediately
// followed by play-renderer.ts's opening-narration screen, whose divider
// already adapts -- this closes the visible width mismatch between the two.
describe('renderRecap divider width (F-e475c46d)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('divider matches a narrow terminal width instead of a fixed 60', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const result = renderRecap(null, makeHistory([]));
    expect(result).toContain('═'.repeat(40));
    expect(result).not.toContain('═'.repeat(60));
  });

  it('divider matches a wide terminal width, clamped to 120', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 200, writable: true });
    const result = renderRecap(null, makeHistory([]));
    expect(result).toContain('═'.repeat(120));
    expect(result).not.toContain('═'.repeat(121));
  });
});

// F-8e8ac939: divider() now wraps its rule in dim(), matching this same
// wave's chronicle-renderer.ts precedent and the play-renderer.ts reference
// pattern both already claimed to follow. colors.ts's `enabled` gate is
// computed once at module-load time from process.stdout.isTTY, so dim() is a
// no-op in this file's normal (non-TTY) test run -- proving the wrap
// actually happens needs a fresh module import with isTTY forced true first,
// mirroring director-renderer.test.ts's established pattern for the same
// color-enabled scenario.
describe('renderRecap divider color (F-8e8ac939)', () => {
  it('wraps the divider in dim() when color is enabled', async () => {
    const originalIsTTY = process.stdout.isTTY;
    const originalNoColor = process.env.NO_COLOR;
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    try {
      const mod = await import('./recap.js');
      const result = mod.renderRecap(null, makeHistory([]));
      expect(result).toContain('\x1b[2m'); // dim's SGR code
    } finally {
      (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
      if (originalNoColor === undefined) delete process.env.NO_COLOR;
      else process.env.NO_COLOR = originalNoColor;
      vi.resetModules();
    }
  });
});
