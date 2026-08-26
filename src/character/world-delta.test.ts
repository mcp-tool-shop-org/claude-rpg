import { describe, it, expect, afterEach } from 'vitest';
import {
  captureWorldSnapshot,
  computeWorldDelta,
  renderWorldDelta,
  type WorldSnapshot,
} from './world-delta.js';
import type { WorldPressure, PressureFallout, PlayerRumor } from '@ai-rpg-engine/modules';

// F-8d11d865: world-delta.ts had zero test coverage prior to this file.

function makePressure(overrides: Partial<WorldPressure> = {}): WorldPressure {
  return {
    id: 'p1',
    kind: 'bounty-issued',
    sourceFactionId: 'guild',
    description: 'A bounty has been placed',
    triggeredBy: 'rumor-1',
    urgency: 0.5,
    visibility: 'known',
    turnsRemaining: 10,
    potentialOutcomes: [],
    tags: [],
    ...overrides,
  } as unknown as WorldPressure;
}

function makeFallout(overrides: Partial<PressureFallout> = {}): PressureFallout {
  return {
    resolution: { resolvedBy: 'player-action', resolvedAtTick: 5, resolutionVisibility: 'known' },
    effects: [],
    summary: 'The bounty was resolved',
    ...overrides,
  } as unknown as PressureFallout;
}

describe('captureWorldSnapshot', () => {
  it('should count pressures, rumors, and resolved history', () => {
    const pressures = [makePressure(), makePressure({ id: 'p2', kind: 'faction-summons' })];
    const rumors = [{ id: 'r1' } as unknown as PlayerRumor];
    const resolvedHistory = [makeFallout()];

    const snapshot = captureWorldSnapshot(pressures, rumors, resolvedHistory);

    expect(snapshot.activePressureCount).toBe(2);
    expect(snapshot.activePressureKinds).toEqual(['bounty-issued', 'faction-summons']);
    expect(snapshot.resolvedCount).toBe(1);
    expect(snapshot.rumorCount).toBe(1);
  });

  it('should handle empty inputs', () => {
    const snapshot = captureWorldSnapshot([], [], []);
    expect(snapshot).toEqual({
      activePressureCount: 0,
      activePressureKinds: [],
      resolvedCount: 0,
      rumorCount: 0,
    });
  });
});

describe('computeWorldDelta', () => {
  const zeroSnapshot: WorldSnapshot = {
    activePressureCount: 0,
    activePressureKinds: [],
    resolvedCount: 0,
    rumorCount: 0,
  };

  it('should return zeroes when nothing changed', () => {
    const delta = computeWorldDelta(zeroSnapshot, zeroSnapshot, []);
    expect(delta.pressuresSpawned).toBe(0);
    expect(delta.pressuresResolved).toBe(0);
    expect(delta.chainReactions).toBe(0);
    expect(delta.rumorsDelta).toBe(0);
  });

  it('should count new fallout entries as resolved and derive summaries', () => {
    const after: WorldSnapshot = { ...zeroSnapshot, resolvedCount: 2 };
    const falloutHistory = [makeFallout({ summary: 'first' }), makeFallout({ summary: 'second' })];

    const delta = computeWorldDelta(zeroSnapshot, after, falloutHistory);

    expect(delta.pressuresResolved).toBe(2);
    expect(delta.resolutionSummaries).toEqual(['first', 'second']);
  });

  it('should count spawn-pressure fallout effects as chain reactions', () => {
    const after: WorldSnapshot = { ...zeroSnapshot, resolvedCount: 1 };
    const falloutHistory = [
      makeFallout({
        effects: [
          { type: 'spawn-pressure', kind: 'investigation-opened', sourceFactionId: 'guild', description: 'x', urgency: 0.3, tags: [] },
        ] as any,
      }),
    ];

    const delta = computeWorldDelta(zeroSnapshot, after, falloutHistory);
    expect(delta.chainReactions).toBe(1);
  });

  it('should compute rumorsDelta as the difference between snapshots', () => {
    const before: WorldSnapshot = { ...zeroSnapshot, rumorCount: 3 };
    const after: WorldSnapshot = { ...zeroSnapshot, rumorCount: 7 };
    const delta = computeWorldDelta(before, after, []);
    expect(delta.rumorsDelta).toBe(4);
  });
});

describe('renderWorldDelta', () => {
  it('should return empty string when nothing changed', () => {
    const result = renderWorldDelta({
      pressuresSpawned: 0,
      pressuresResolved: 0,
      resolutionSummaries: [],
      chainReactions: 0,
      rumorsDelta: 0,
    });
    expect(result).toBe('');
  });

  it('should render spawned/resolved pressures and rumor deltas', () => {
    const result = renderWorldDelta({
      pressuresSpawned: 2,
      pressuresResolved: 1,
      resolutionSummaries: ['The bounty was resolved'],
      chainReactions: 1,
      rumorsDelta: 3,
    });

    expect(result).toContain('WORLD CHANGES');
    expect(result).toContain('Pressures spawned: 2');
    expect(result).toContain('Pressures resolved: 1');
    expect(result).toContain('The bounty was resolved');
    expect(result).toContain('Chain reactions: 1');
    expect(result).toContain('New rumors: 3');
  });
});

// F-e475c46d: DIVIDER was a hardcoded '─'.repeat(60), unlike play-renderer.ts's
// own dividers (PFE-005), which adapt to the real terminal width. Mirrors
// play-renderer-divider.test.ts's F-38eb3dec assertions -- structural
// (exact-width substring), not a full-screen snapshot.
describe('renderWorldDelta divider width (F-e475c46d)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  const nonEmptyDelta = {
    pressuresSpawned: 1,
    pressuresResolved: 0,
    resolutionSummaries: [],
    chainReactions: 0,
    rumorsDelta: 0,
  };

  it('divider matches a narrow terminal width instead of a fixed 60', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const result = renderWorldDelta(nonEmptyDelta);
    expect(result).toContain('─'.repeat(40));
    expect(result).not.toContain('─'.repeat(60));
  });

  it('divider matches a wide terminal width, clamped to 120', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 200, writable: true });
    const result = renderWorldDelta(nonEmptyDelta);
    expect(result).toContain('─'.repeat(120));
    expect(result).not.toContain('─'.repeat(121));
  });
});
