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

  it('starts with a blank line for visual buffering', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });
    const result = makeTurnDivider(3);
    expect(result.startsWith('\n')).toBe(true);
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
