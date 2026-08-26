import { describe, it, expect, afterEach } from 'vitest';
import { makeTurnDivider, renderPlayScreen } from './play-renderer.js';
import { renderPlayOutput } from '../game/game-presenter.js';

describe('makeTurnDivider (FT-FE-005)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('includes the turn number in the divider', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });
    const result = makeTurnDivider(7);
    expect(result).toContain('Turn 7');
  });

  it('uses double-line box characters', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });
    const result = makeTurnDivider(1);
    expect(result).toContain('═');
  });

  // F-a2a609b6: makeTurnDivider() used to open with its own hardcoded '\n'
  // on top of the blank line renderPlayScreen's own parts.push('') already
  // supplies before it -- giving every numbered turn one more blank line
  // above its rule than the non-numbered makeDivider() fallback gets, a
  // rhythm inconsistency between two branches of the same function. The
  // caller already supplies the blank line, so this must NOT add a second
  // one.
  it('does not start with its own blank line -- the caller (renderPlayScreen) already supplies one (F-a2a609b6)', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });
    const result = makeTurnDivider(3);
    expect(result.startsWith('\n')).toBe(false);
  });
});

describe('renderPlayScreen with turnNumber (FT-FE-005)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('renders turn divider when turnNumber is provided', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });
    const world = {
      playerId: 'p1',
      locationId: 'z1',
      entities: { p1: { name: 'Hero', resources: { hp: 10 }, statuses: [] } },
      zones: { z1: { name: 'Town', neighbors: [] } },
      factions: {},
    } as any;

    const output = renderPlayScreen({
      narration: 'Test.',
      world,
      availableActions: [],
      turnNumber: 5,
    });

    expect(output).toContain('Turn 5');
    expect(output).toContain('═');
  });

  it('renders standard divider when turnNumber is omitted', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });
    const world = {
      playerId: 'p1',
      locationId: 'z1',
      entities: { p1: { name: 'Hero', resources: { hp: 10 }, statuses: [] } },
      zones: { z1: { name: 'Town', neighbors: [] } },
      factions: {},
    } as any;

    const output = renderPlayScreen({
      narration: 'Test.',
      world,
      availableActions: [],
    });

    expect(output).not.toContain('Turn');
    expect(output).toContain('─'.repeat(80));
  });
});

// F-a2a609b6: renderPlayScreen always pushes one blank line (parts.push(''))
// before branching into makeTurnDivider(n) (turnNumber set) or makeDivider()
// (turnNumber absent). makeTurnDivider's own extra leading '\n' meant the
// turnNumber branch rendered TWO blank lines above its rule while the
// fallback rendered only ONE -- this locks in that both branches now
// produce the same count.
describe('renderPlayScreen blank-line rhythm before the divider is consistent across branches (F-a2a609b6)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  const world = {
    playerId: 'p1',
    locationId: 'z1',
    entities: { p1: { name: 'Hero', resources: { hp: 10 }, statuses: [] } },
    zones: { z1: { name: 'Town', neighbors: [] } },
    factions: {},
  } as any;

  function leadingBlankLineCount(text: string): number {
    let count = 0;
    for (const line of text.split('\n')) {
      if (line.trim() === '') count++;
      else break;
    }
    return count;
  }

  it('numbered-turn and fallback screens open with the same number of blank lines before the rule', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });
    const withTurn = renderPlayScreen({ narration: 'Test.', world, availableActions: [], turnNumber: 5 });
    const withoutTurn = renderPlayScreen({ narration: 'Test.', world, availableActions: [] });
    expect(leadingBlankLineCount(withTurn)).toBe(leadingBlankLineCount(withoutTurn));
  });

  it('the numbered-turn screen opens with exactly one blank line before the rule', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });
    const withTurn = renderPlayScreen({ narration: 'Test.', world, availableActions: [], turnNumber: 5 });
    expect(leadingBlankLineCount(withTurn)).toBe(1);
  });
});

/**
 * Contract A (wave 12, cli-display half): F-e8508aeb found that
 * makeTurnDivider/renderPlayScreen's opts.turnNumber branch (tested above)
 * was fully built and tested but never actually reached in real play --
 * the production caller chain (game.ts -> game-presenter.ts's
 * renderPlayOutput -> renderPlayScreen) never supplied turnNumber. The
 * game-core half of this contract (adding `turnNumber?: number` to
 * renderPlayOutput's input type in src/game/game-presenter.ts, and passing
 * it at the game.ts call site) lands in a sibling worktree this same wave;
 * game-presenter.ts is read-only from cli-display. This test locks in
 * cli-display's half of the contract at the highest boundary reachable
 * without editing that file: renderPlayOutput forwards its `input` object
 * straight into renderPlayScreen (game-presenter.ts:40) without
 * reconstructing it, so a turnNumber value already survives that passthrough
 * today, regardless of whether THIS worktree's copy of game-presenter.ts's
 * declared input type has caught up yet. `WithTurnNumber` exercises that at
 * the real call site instead of widening to `any`, and continues to type-
 * check once the sibling's edit lands (the intersection becomes a no-op).
 */
describe('renderPlayOutput forwards turnNumber (Contract A, FT-FE-005)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  const world = {
    playerId: 'p1',
    locationId: 'z1',
    entities: { p1: { name: 'Hero', resources: { hp: 10 }, statuses: [] } },
    zones: { z1: { name: 'Town', neighbors: [] } },
    factions: {},
  } as any;

  type WithTurnNumber = Parameters<typeof renderPlayOutput>[0] & { turnNumber?: number };

  it('renders the numbered turn divider once turnNumber flows through from game-core', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });
    const input: WithTurnNumber = {
      narration: 'Test.',
      world,
      availableActions: [],
      turnNumber: 9,
    };

    const output = renderPlayOutput(input);

    expect(output).toContain('Turn 9');
    expect(output).toContain('═');
  });

  it('handles turnNumber being absent gracefully (falls back to the standard divider)', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });

    const output = renderPlayOutput({
      narration: 'Test.',
      world,
      availableActions: [],
    });

    expect(output).not.toContain('Turn');
    expect(output).toContain('─'.repeat(80));
  });
});
