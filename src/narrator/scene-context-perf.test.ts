import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { WorldState } from '@ai-rpg-engine/core';

// F-3d2d5767: the old BR-004 regression test read scene-context.ts's own source
// text (readFileSync) and checked that 'getPerceptionLog(' appeared textually
// before 'zoneEntities.map(' — it never called buildSceneContext or counted how
// many times getPerceptionLog actually ran. A harmless refactor (e.g. extracting
// the lookup into a differently-named helper that still calls getPerceptionLog
// exactly once) would fail it on entirely correct code, while a real O(n)
// regression added *after* the map block would still pass it. Replaced with a
// behavioral test: spy on getPerceptionLog and assert it is called exactly once
// regardless of zone entity count — the actual O(1)-vs-O(n) property BR-004 fixed.
vi.mock('@ai-rpg-engine/modules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ai-rpg-engine/modules')>();
  return {
    ...actual,
    getPerceptionLog: vi.fn(actual.getPerceptionLog),
  };
});

import { getPerceptionLog } from '@ai-rpg-engine/modules';
import { buildSceneContext } from './scene-context.js';

const mockedGetPerceptionLog = vi.mocked(getPerceptionLog);

beforeEach(() => {
  mockedGetPerceptionLog.mockClear();
});

function makeWorld(zoneEntityCount: number): WorldState {
  const entities: Record<string, unknown> = {
    player: { id: 'player', zoneId: 'zone-1', resources: { hp: 10 }, custom: {} },
  };
  for (let i = 0; i < zoneEntityCount; i++) {
    entities[`npc-${i}`] = { id: `npc-${i}`, name: `NPC ${i}`, type: 'npc', zoneId: 'zone-1' };
  }
  return {
    zones: {
      'zone-1': { name: 'Town Square', tags: [], neighbors: [], light: 5, noise: 3, stability: 8 },
    },
    entities,
    locationId: 'zone-1',
    playerId: 'player',
    modules: {},
  } as unknown as WorldState;
}

describe('buildSceneContext BR-004: getPerceptionLog call count', () => {
  it('should call getPerceptionLog exactly once with several zone entities', () => {
    const world = makeWorld(25);
    buildSceneContext(world, [], 'dark fantasy', []);
    expect(mockedGetPerceptionLog).toHaveBeenCalledTimes(1);
  });

  it('should call getPerceptionLog exactly once with zero zone entities', () => {
    const world = makeWorld(0);
    buildSceneContext(world, [], 'dark fantasy', []);
    expect(mockedGetPerceptionLog).toHaveBeenCalledTimes(1);
  });

  it('should call getPerceptionLog exactly once even with a large N — locks in O(1), not O(n)', () => {
    const world = makeWorld(500);
    buildSceneContext(world, [], 'dark fantasy', []);
    expect(mockedGetPerceptionLog).toHaveBeenCalledTimes(1);
  });

  it('should call getPerceptionLog with the world and playerId', () => {
    const world = makeWorld(3);
    buildSceneContext(world, [], 'dark fantasy', []);
    expect(mockedGetPerceptionLog).toHaveBeenCalledWith(world, 'player');
  });
});
