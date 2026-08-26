// Tests for companion-bridge.ts (F-39140845: this file previously had zero coverage).

import { describe, it, expect } from 'vitest';
import type { Engine, EntityState } from '@ai-rpg-engine/core';
import { createPartyState, addCompanion, type CompanionState } from '@ai-rpg-engine/modules';
import {
  recruitCompanion,
  dismissCompanion,
  followPlayer,
  syncCompanionMorale,
  inferCompanionRole,
} from './companion-bridge.js';

function makeEntity(overrides: Partial<EntityState> = {}): EntityState {
  return {
    id: 'npc-1',
    blueprintId: 'npc-1',
    type: 'npc',
    name: 'Test NPC',
    tags: ['recruitable'],
    stats: {},
    resources: { hp: 20 },
    statuses: [],
    zoneId: 'zone1',
    ...overrides,
  };
}

function makeCompanion(overrides: Partial<CompanionState> = {}): CompanionState {
  return {
    npcId: 'npc-1',
    role: 'fighter',
    joinedAtTick: 0,
    abilityTags: [],
    morale: 60,
    active: true,
    ...overrides,
  };
}

function makeEngine(entities: Record<string, EntityState>): Engine {
  return {
    world: {
      playerId: 'player',
      entities,
    },
  } as unknown as Engine;
}

describe('recruitCompanion', () => {
  it('fails when the entity does not exist', () => {
    const engine = makeEngine({ player: makeEntity({ id: 'player', zoneId: 'zone1' }) });
    const party = createPartyState();

    const result = recruitCompanion(engine, party, 'ghost', 'fighter', 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  it('fails when the entity has 0 hp (not alive)', () => {
    const npc = makeEntity({ resources: { hp: 0 } });
    const engine = makeEngine({
      player: makeEntity({ id: 'player', zoneId: 'zone1' }),
      'npc-1': npc,
    });
    const party = createPartyState();

    const result = recruitCompanion(engine, party, 'npc-1', 'fighter', 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not alive');
  });

  it('treats a negative "health" resource (fallback field) as not alive too', () => {
    const npc = makeEntity({ resources: {}, custom: undefined });
    (npc.resources as Record<string, number>).health = 0;
    const engine = makeEngine({
      player: makeEntity({ id: 'player', zoneId: 'zone1' }),
      'npc-1': npc,
    });
    const party = createPartyState();

    const result = recruitCompanion(engine, party, 'npc-1', 'fighter', 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not alive');
  });

  it('fails when the entity is not recruitable', () => {
    const npc = makeEntity({ tags: [] }); // no 'recruitable' or 'companion-ready' tag
    const engine = makeEngine({
      player: makeEntity({ id: 'player', zoneId: 'zone1' }),
      'npc-1': npc,
    });
    const party = createPartyState();

    const result = recruitCompanion(engine, party, 'npc-1', 'fighter', 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('cannot be recruited');
  });

  it('fails when the entity is in a different zone from the player', () => {
    const npc = makeEntity({ zoneId: 'zone2' });
    const engine = makeEngine({
      player: makeEntity({ id: 'player', zoneId: 'zone1' }),
      'npc-1': npc,
    });
    const party = createPartyState();

    const result = recruitCompanion(engine, party, 'npc-1', 'fighter', 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('same zone');
  });

  it('fails when the party is already full', () => {
    const npc = makeEntity();
    const engine = makeEngine({
      player: makeEntity({ id: 'player', zoneId: 'zone1' }),
      'npc-1': npc,
    });
    let party = createPartyState(1); // maxSize 1
    party = addCompanion(party, makeCompanion({ npcId: 'other-npc' })).party;

    const result = recruitCompanion(engine, party, 'npc-1', 'fighter', 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('full');
  });

  it('fails when the NPC is already in the party', () => {
    const npc = makeEntity();
    const engine = makeEngine({
      player: makeEntity({ id: 'player', zoneId: 'zone1' }),
      'npc-1': npc,
    });
    let party = createPartyState();
    party = addCompanion(party, makeCompanion({ npcId: 'npc-1' })).party;

    const result = recruitCompanion(engine, party, 'npc-1', 'fighter', 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('already in your party');
  });

  it('succeeds, tags the entity, and sets custom companion fields', () => {
    const npc = makeEntity();
    const engine = makeEngine({
      player: makeEntity({ id: 'player', zoneId: 'zone1' }),
      'npc-1': npc,
    });
    const party = createPartyState();

    const result = recruitCompanion(engine, party, 'npc-1', 'healer', 5);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.party.companions).toHaveLength(1);
      expect(result.companion.role).toBe('healer');
      expect(result.companion.joinedAtTick).toBe(5);
      expect(result.companion.morale).toBe(60);
    }
    expect(npc.tags).toContain('companion');
    expect(npc.custom?.companionMorale).toBe(60);
    expect(npc.custom?.companionRole).toBe('healer');
  });

  it('infers ability tags and personal goal from entity custom data when not passed explicitly', () => {
    const npc = makeEntity({
      custom: { companionAbilities: 'medical-support, witness-calming', personalGoal: 'Find my brother' },
    });
    const engine = makeEngine({
      player: makeEntity({ id: 'player', zoneId: 'zone1' }),
      'npc-1': npc,
    });
    const party = createPartyState();

    const result = recruitCompanion(engine, party, 'npc-1', 'healer', 1);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.companion.abilityTags).toEqual(['medical-support', 'witness-calming']);
      expect(result.companion.personalGoal).toBe('Find my brother');
    }
  });

  it('does not duplicate the companion tag if already tagged', () => {
    const npc = makeEntity({ tags: ['recruitable', 'companion'] });
    const engine = makeEngine({
      player: makeEntity({ id: 'player', zoneId: 'zone1' }),
      'npc-1': npc,
    });
    const party = createPartyState();

    recruitCompanion(engine, party, 'npc-1', 'fighter', 1);

    expect(npc.tags.filter((t) => t === 'companion')).toHaveLength(1);
  });
});

describe('dismissCompanion', () => {
  it('removes the companion tag and custom fields when the companion is found', () => {
    const npc = makeEntity({
      tags: ['recruitable', 'companion'],
      custom: { companionMorale: 70, companionRole: 'scout' },
    });
    const engine = makeEngine({ player: makeEntity({ id: 'player' }), 'npc-1': npc });
    let party = createPartyState();
    party = addCompanion(party, makeCompanion({ npcId: 'npc-1', role: 'scout', morale: 70 })).party;

    const result = dismissCompanion(engine, party, 'npc-1');

    expect(result.removed?.npcId).toBe('npc-1');
    expect(result.party.companions).toHaveLength(0);
    expect(npc.tags).not.toContain('companion');
    expect(npc.custom?.companionMorale).toBeUndefined();
    expect(npc.custom?.companionRole).toBeUndefined();
  });

  it('returns removed: undefined and leaves the entity untouched when the npc is not in the party', () => {
    const npc = makeEntity({ tags: ['recruitable', 'companion'], custom: { companionMorale: 70 } });
    const engine = makeEngine({ player: makeEntity({ id: 'player' }), 'npc-1': npc });
    const party = createPartyState(); // empty — npc-1 was never added

    const result = dismissCompanion(engine, party, 'npc-1');

    expect(result.removed).toBeUndefined();
    expect(npc.tags).toContain('companion');
    expect(npc.custom?.companionMorale).toBe(70);
  });

  it('does not throw when the companion entity no longer exists in world.entities', () => {
    const engine = makeEngine({ player: makeEntity({ id: 'player' }) }); // npc-1 absent
    let party = createPartyState();
    party = addCompanion(party, makeCompanion({ npcId: 'npc-1' })).party;

    let result: ReturnType<typeof dismissCompanion> | undefined;
    expect(() => {
      result = dismissCompanion(engine, party, 'npc-1');
    }).not.toThrow();
    expect(result?.removed?.npcId).toBe('npc-1');
  });
});

describe('followPlayer', () => {
  it('moves active companions into the players current zone but leaves inactive ones behind', () => {
    const comp1 = makeEntity({ id: 'comp-1', zoneId: 'zone-old' });
    const comp2 = makeEntity({ id: 'comp-2', zoneId: 'zone-old' });
    const player = makeEntity({ id: 'player', zoneId: 'zone-new' });
    const engine = makeEngine({ player, 'comp-1': comp1, 'comp-2': comp2 });
    let party = createPartyState();
    party = addCompanion(party, makeCompanion({ npcId: 'comp-1', active: true })).party;
    party = addCompanion(party, makeCompanion({ npcId: 'comp-2', active: false })).party;

    followPlayer(engine, party);

    expect(comp1.zoneId).toBe('zone-new');
    expect(comp2.zoneId).toBe('zone-old');
  });

  it('does nothing when the player entity has no zoneId', () => {
    const comp1 = makeEntity({ id: 'comp-1', zoneId: 'zone-old' });
    const player = makeEntity({ id: 'player', zoneId: undefined });
    const engine = makeEngine({ player, 'comp-1': comp1 });
    let party = createPartyState();
    party = addCompanion(party, makeCompanion({ npcId: 'comp-1' })).party;

    followPlayer(engine, party);

    expect(comp1.zoneId).toBe('zone-old');
  });

  it('skips companions whose entity no longer exists', () => {
    const player = makeEntity({ id: 'player', zoneId: 'zone-new' });
    const engine = makeEngine({ player }); // comp-1 absent
    let party = createPartyState();
    party = addCompanion(party, makeCompanion({ npcId: 'comp-1' })).party;

    expect(() => followPlayer(engine, party)).not.toThrow();
  });
});

describe('syncCompanionMorale', () => {
  it('writes each companions morale into entity.custom.companionMorale', () => {
    const comp1 = makeEntity({ id: 'comp-1' });
    const engine = makeEngine({ player: makeEntity({ id: 'player' }), 'comp-1': comp1 });
    let party = createPartyState();
    party = addCompanion(party, makeCompanion({ npcId: 'comp-1', morale: 42 })).party;

    syncCompanionMorale(engine, party);

    expect(comp1.custom?.companionMorale).toBe(42);
  });

  it('creates entity.custom when it did not previously exist', () => {
    const comp1 = makeEntity({ id: 'comp-1', custom: undefined });
    const engine = makeEngine({ player: makeEntity({ id: 'player' }), 'comp-1': comp1 });
    let party = createPartyState();
    party = addCompanion(party, makeCompanion({ npcId: 'comp-1', morale: 33 })).party;

    syncCompanionMorale(engine, party);

    expect(comp1.custom?.companionMorale).toBe(33);
  });

  it('skips companions whose entity no longer exists', () => {
    const engine = makeEngine({ player: makeEntity({ id: 'player' }) });
    let party = createPartyState();
    party = addCompanion(party, makeCompanion({ npcId: 'ghost' })).party;

    expect(() => syncCompanionMorale(engine, party)).not.toThrow();
  });
});

// F-4ca425fd: getCompanionProfiles and its test coverage (formerly here) were deleted
// as dead code — see the doc comment above the "Role Inference" section in
// companion-bridge.ts for the full call-site audit. buildNpcProfilesForDirector
// (src/npc/agency.ts) already covers companions as part of "all named NPCs".

describe('inferCompanionRole', () => {
  it('prefers an explicit custom.companionRole over tags', () => {
    expect(inferCompanionRole({ tags: ['healer'], custom: { companionRole: 'scout' } })).toBe('scout');
  });

  it('infers healer from healer/medic tags', () => {
    expect(inferCompanionRole({ tags: ['healer'] })).toBe('healer');
    expect(inferCompanionRole({ tags: ['medic'] })).toBe('healer');
  });

  it('infers diplomat from diplomat/noble tags', () => {
    expect(inferCompanionRole({ tags: ['diplomat'] })).toBe('diplomat');
    expect(inferCompanionRole({ tags: ['noble'] })).toBe('diplomat');
  });

  it('infers scout from scout/thief tags', () => {
    expect(inferCompanionRole({ tags: ['scout'] })).toBe('scout');
    expect(inferCompanionRole({ tags: ['thief'] })).toBe('scout');
  });

  it('infers smuggler from smuggler/merchant tags', () => {
    expect(inferCompanionRole({ tags: ['smuggler'] })).toBe('smuggler');
    expect(inferCompanionRole({ tags: ['merchant'] })).toBe('smuggler');
  });

  it('infers scholar from scholar/mage tags', () => {
    expect(inferCompanionRole({ tags: ['scholar'] })).toBe('scholar');
    expect(inferCompanionRole({ tags: ['mage'] })).toBe('scholar');
  });

  it('defaults to fighter when no recognized tag is present', () => {
    expect(inferCompanionRole({ tags: [] })).toBe('fighter');
    expect(inferCompanionRole({ tags: ['unrelated-tag'] })).toBe('fighter');
  });

  it('follows the tag-priority fallback chain when multiple qualifying tags are present', () => {
    // Order in inferCompanionRole is healer > diplomat > scout > smuggler > scholar > fighter.
    expect(inferCompanionRole({ tags: ['scholar', 'healer'] })).toBe('healer');
    expect(inferCompanionRole({ tags: ['merchant', 'diplomat'] })).toBe('diplomat');
    expect(inferCompanionRole({ tags: ['mage', 'scout'] })).toBe('scout');
    expect(inferCompanionRole({ tags: ['scholar', 'smuggler'] })).toBe('smuggler');
  });
});
