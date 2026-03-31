import { describe, it, expect, afterEach } from 'vitest';
import { makeTurnDivider, renderPlayScreen } from './play-renderer.js';

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
