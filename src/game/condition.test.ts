import { describe, it, expect } from 'vitest';
import type { WorldState, EntityState } from '@ai-rpg-engine/core';
import { conditionRung, describeHostiles, isHostileAware } from './condition.js';

function makeEntity(overrides: Partial<EntityState> & { id: string }): EntityState {
  return {
    id: overrides.id,
    blueprintId: overrides.id,
    type: 'npc',
    name: overrides.name ?? overrides.id,
    tags: overrides.tags ?? ['enemy'],
    stats: {},
    resources: { hp: 10, maxHp: 10, ...(overrides.resources ?? {}) },
    statuses: [],
    zoneId: overrides.zoneId ?? 'zone-1',
  } as EntityState;
}

function makeWorld(entities: EntityState[], globals: Record<string, unknown> = {}): WorldState {
  const entityMap: Record<string, EntityState> = {};
  for (const e of entities) entityMap[e.id] = e;
  return {
    playerId: 'player',
    locationId: 'zone-1',
    entities: entityMap,
    zones: {},
    factions: {},
    globals,
    eventLog: [],
    modules: {},
    meta: { worldId: 'w', gameId: 'g', saveVersion: '1', tick: 0, seed: 1, activeRuleset: 'r', activeModules: [], idCounter: 0 },
  } as unknown as WorldState;
}

describe('conditionRung', () => {
  it('is unhurt at full hp', () => {
    expect(conditionRung(10, 10)).toBe('unhurt');
  });
  it('is hurt at >= 67%', () => {
    expect(conditionRung(7, 10)).toBe('hurt');
  });
  it('is bloodied at >= 34%', () => {
    expect(conditionRung(4, 10)).toBe('bloodied');
    expect(conditionRung(3.5, 10)).toBe('bloodied');
  });
  it('is reeling below 34% but above 0', () => {
    expect(conditionRung(3, 10)).toBe('reeling');
    expect(conditionRung(2, 10)).toBe('reeling');
    expect(conditionRung(1, 10)).toBe('reeling');
  });
  it('is down at 0 hp', () => {
    expect(conditionRung(0, 10)).toBe('down');
  });
  it('is down for degenerate maxHp', () => {
    expect(conditionRung(5, 0)).toBe('down');
  });
});

describe('describeHostiles', () => {
  it('lists live hostiles in the zone, sorted by id, excluding downed and non-hostile entities', () => {
    const world = makeWorld([
      makeEntity({ id: 'b-stalker', name: 'Crypt Stalker', resources: { hp: 5, maxHp: 12 } }),
      makeEntity({ id: 'a-ghoul', name: 'Ash Ghoul', resources: { hp: 12, maxHp: 12 } }),
      makeEntity({ id: 'c-corpse', name: 'Downed Thing', resources: { hp: 0, maxHp: 10 } }),
      makeEntity({ id: 'd-shopkeep', name: 'Shopkeeper', tags: ['friendly'], resources: { hp: 10, maxHp: 10 } }),
    ]);
    const out = describeHostiles(world, 'zone-1');
    expect(out.map((h) => h.id)).toEqual(['a-ghoul', 'b-stalker']);
    expect(out[0]).toMatchObject({ name: 'Ash Ghoul', rung: 'unhurt', aware: false });
    expect(out[1]).toMatchObject({ name: 'Crypt Stalker', rung: 'bloodied', aware: false });
  });

  it('reports aware=true once hostile_aware_<id> is set', () => {
    const world = makeWorld(
      [makeEntity({ id: 'a-ghoul', resources: { hp: 12, maxHp: 12 } })],
      { hostile_aware_a_ghoul_wrong: 1, [`hostile_aware_a-ghoul`]: 3 },
    );
    expect(isHostileAware(world, 'a-ghoul')).toBe(true);
    expect(isHostileAware(world, 'missing')).toBe(false);
    const out = describeHostiles(world, 'zone-1');
    expect(out[0].aware).toBe(true);
  });
});
