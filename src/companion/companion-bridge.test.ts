// Tests for companion-bridge.ts (F-39140845: this file previously had zero coverage).

import { describe, it, expect } from 'vitest';
import type { Engine, EntityState } from '@ai-rpg-engine/core';
import {
  createPartyState,
  addCompanion,
  resolveEntityFaction,
  deriveNpcRelationship,
  deriveLoyaltyBreakpoint,
  type CompanionState,
} from '@ai-rpg-engine/modules';
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

function makeEngine(
  entities: Record<string, EntityState>,
  zones: Record<string, { id: string; name: string }> = {},
): Engine {
  return {
    world: {
      playerId: 'player',
      entities,
      zones,
      // F-7994dfff: setPartyState does an unguarded `world.modules[id] = party`
      // (companion-core.ts:550, no defensive init) -- the real Engine
      // constructor always initializes world.modules = {} unconditionally, so
      // this mirrors production. Every recruit-success/dismiss-success/
      // syncCompanionMorale test now reaches setPartyState and would throw a
      // TypeError without this.
      modules: {},
    },
  } as unknown as Engine;
}

// F-444ac034 / F-761ad9eb: the descriptive pins below read engine-side
// npc-agency/faction-cognition functions directly (not just companion-bridge
// exports), which touch more of WorldState than makeEngine() above provides:
// deriveNpcRelationship reads world.meta.tick (via getRecentMemories), and
// one pin seeds a faction-cognition membership registry directly, mirroring
// the existing precedent in src/game/game-state.test.ts's own
// extractProfileHints suite (`modules: { 'faction-cognition': { membership,
// factionCognition: {}, factionMembers } }`).
function makeAgencyEngine(
  entities: Record<string, EntityState>,
  factionCognition?: { membership?: Record<string, string>; factionMembers?: Record<string, string[]> },
): Engine {
  return {
    world: {
      playerId: 'player',
      entities,
      zones: {},
      meta: { tick: 0 },
      modules: factionCognition
        ? {
            'faction-cognition': {
              membership: factionCognition.membership ?? {},
              factionCognition: {},
              factionMembers: factionCognition.factionMembers ?? {},
            },
          }
        : {},
    },
  } as unknown as Engine;
}

describe('recruitCompanion', () => {
  it('fails when the entity does not exist', () => {
    const engine = makeEngine({ player: makeEntity({ id: 'player', zoneId: 'zone1' }) });
    const party = createPartyState();

    const result = recruitCompanion(engine, party, 'ghost', 'fighter', 1);

    expect(result.ok).toBe(false);
    // F-bdfa6640: appends a concrete next step instead of a bare reason.
    // Coordinator stitch (wave 8): text unified with game.ts handleRecruit's
    // copy — pin follows the shared sentence.
    if (!result.ok) {
      expect(result.error).toContain('is here to recruit');
      expect(result.error).toContain('look');
    }
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
    if (!result.ok) {
      expect(result.error).toContain('not alive');
      expect(result.error).toContain('Find another ally');
    }
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
    // F-bdfa6640: reuses companion-core.ts's recruitHandler's own not-recruitable
    // hint verbatim ("They aren't looking for a traveling companion.").
    if (!result.ok) {
      expect(result.error).toContain('cannot be recruited');
      expect(result.error).toContain("aren't looking for a traveling companion");
    }
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
    if (!result.ok) {
      expect(result.error).toContain('same zone');
      // F-bdfa6640: falls back to the raw zoneId when no zone record exists
      // to name it (no `zones` map passed to makeEngine here).
      expect(result.error).toContain('zone2');
      expect(result.error).toContain('stand with them first');
    }
  });

  // F-bdfa6640: the zone-mismatch message previously never named which zone
  // the target was actually in -- with a real zone record available, the
  // friendly `.name` must be used instead of the raw id.
  it('names the target\'s actual zone (not just the raw zoneId) when a zone record exists', () => {
    const npc = makeEntity({ zoneId: 'zone2' });
    const engine = makeEngine(
      {
        player: makeEntity({ id: 'player', zoneId: 'zone1' }),
        'npc-1': npc,
      },
      {
        zone1: { id: 'zone1', name: 'Town Square' },
        zone2: { id: 'zone2', name: 'The Old Mill' },
      },
    );
    const party = createPartyState();

    const result = recruitCompanion(engine, party, 'npc-1', 'fighter', 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('The Old Mill');
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
    if (!result.ok) {
      expect(result.error).toContain('full');
      // F-bdfa6640: names the concrete next keystroke to make room.
      expect(result.error).toContain('/dismiss');
    }
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
    // F-bdfa6640: reworded to reuse companion-core.ts's own established
    // "already traveling with you" phrasing (the same text the addCompanion
    // -rejection branch below already used before this fix).
    if (!result.ok) expect(result.error).toContain('already traveling with you');
  });

  it('succeeds, tags the entity, and sets custom companion fields', () => {
    const npc = makeEntity();
    const player = makeEntity({ id: 'player', zoneId: 'zone1' });
    const engine = makeEngine({
      player,
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
      // F-7994dfff: Group C dual-write (a) -- party state reaches
      // world.modules['companion-core'], the namespace getPartyState reads.
      expect(engine.world.modules['companion-core']).toBe(result.party);
    }
    expect(npc.tags).toContain('companion');
    // F-7994dfff: Group C dual-write (b) -- the namespaced role tag
    // combat-core's INTERCEPT_ROLE_BONUS keys off, separate from the bare tag.
    expect(npc.tags).toContain('companion:healer');
    expect(npc.custom?.companionMorale).toBe(60);
    expect(npc.custom?.companionRole).toBe('healer');
    // F-7994dfff: Group C dual-write (c) -- actor + target share a truthy
    // faction so targeting.ts's affiliationOf resolves them as allies instead
    // of falling back to the type heuristic ('npc' vs 'player', never equal).
    expect(npc.faction).toBeTruthy();
    expect(npc.faction).toBe(player.faction);
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

// F-444ac034: descriptive pins for the recruit-visibility delta introduced by
// the 3.10 engine bump. The coordinator's landed default is accept-and-pin
// (these pins document what the INSTALLED 3.10 engine actually does today via
// resolveEntityFaction's registry-or-entity.faction fallback); this is NOT an
// endorsement and is explicitly reversible at the Director's pending Group-B
// architecture gate (see ADDENDUM-COMMON.md). recruitCompanion's dual-write
// itself (companion-bridge.ts:140-143) is untouched by this wave.
describe('recruitCompanion — 3.10 resolveEntityFaction descriptive pins (F-444ac034)', () => {
  it('an unaffiliated recruit (no faction-cognition membership entry) resolves to the party faction post-recruit', () => {
    const npc = makeEntity();
    const player = makeEntity({ id: 'player', zoneId: 'zone1' });
    const engine = makeAgencyEngine({ player, 'npc-1': npc });
    const party = createPartyState();

    const result = recruitCompanion(engine, party, 'npc-1', 'fighter', 1);

    expect(result.ok).toBe(true);
    // No 'faction-cognition' registry entry exists for npc-1 -- descriptive
    // pin of 3.10 behavior, reversible at the Group-B gate ruling (F-444ac034).
    expect(resolveEntityFaction(engine.world, 'npc-1')).toBe('party');
  });

  it('the npc-agency read-through classifies an unaffiliated recruit as allied via the auto-vivified 0.8-cohesion party record', () => {
    const npc = makeEntity({
      // High player-trust set independently of this bug so the loyalty change
      // alone decides the allied/favorable boundary: at pre-3.10 loyalty (0,
      // no faction), trust=70/fear=0/greed=30 classifies 'favorable'
      // (trust>=30 && fear<40 && greed<50) -- the resolveEntityFaction switch
      // is what flips it to 'allied'.
      relations: { 'player-trust': 70 },
    });
    const player = makeEntity({ id: 'player', zoneId: 'zone1' });
    const engine = makeAgencyEngine({ player, 'npc-1': npc });
    const party = createPartyState();

    recruitCompanion(engine, party, 'npc-1', 'fighter', 1);

    const rel = deriveNpcRelationship(engine.world, 'npc-1', 'player');
    // floor(0.8 * 80 + 20) -- getFactionCognition auto-creates the 'party'
    // cognition record at the default 0.8 cohesion the first time anything
    // asks for it; nothing in this world ever configured a 'party' faction.
    // Descriptive pin of 3.10 behavior, reversible at the Group-B gate ruling
    // (F-444ac034).
    expect(rel.loyalty).toBe(84);
    expect(deriveLoyaltyBreakpoint(rel, undefined, 'player')).toBe('allied');
  });

  it('a companion already in the faction-cognition membership registry keeps resolving to their ORIGIN faction after recruit -- registry wins over the dual-write', () => {
    const npc = makeEntity();
    const player = makeEntity({ id: 'player', zoneId: 'zone1' });
    const engine = makeAgencyEngine(
      { player, 'npc-1': npc },
      { membership: { 'npc-1': 'wardens' }, factionMembers: { wardens: ['npc-1'] } },
    );
    const party = createPartyState();

    const result = recruitCompanion(engine, party, 'npc-1', 'fighter', 1);

    expect(result.ok).toBe(true);
    // recruitCompanion's dual-write still overwrites entity.faction to
    // 'party' (companion-bridge.ts:140-143) but never touches the membership
    // map -- resolveEntityFaction's `membership[entityId] ?? entity.faction`
    // reads the registry entry first. Descriptive pin of 3.10 behavior,
    // reversible at the Group-B gate ruling (F-444ac034).
    expect(npc.faction).toBe('party');
    expect(resolveEntityFaction(engine.world, 'npc-1')).toBe('wardens');
  });
});

describe('dismissCompanion', () => {
  it('removes the companion tag and custom fields when the companion is found', () => {
    const npc = makeEntity({
      // F-7994dfff: includes the namespaced role tag a real recruitCompanion
      // call now pushes, so this test actually exercises its removal rather
      // than trivially passing on a fixture that never had it.
      tags: ['recruitable', 'companion', 'companion:scout'],
      custom: { companionMorale: 70, companionRole: 'scout' },
    });
    const engine = makeEngine({ player: makeEntity({ id: 'player' }), 'npc-1': npc });
    let party = createPartyState();
    party = addCompanion(party, makeCompanion({ npcId: 'npc-1', role: 'scout', morale: 70 })).party;

    const result = dismissCompanion(engine, party, 'npc-1');

    expect(result.removed?.npcId).toBe('npc-1');
    expect(result.party.companions).toHaveLength(0);
    expect(npc.tags).not.toContain('companion');
    // F-7994dfff: the namespaced role tag is stripped alongside the bare tag.
    expect(npc.tags).not.toContain('companion:scout');
    expect(npc.custom?.companionMorale).toBeUndefined();
    expect(npc.custom?.companionRole).toBeUndefined();
    // F-7994dfff: party state reaches world.modules['companion-core'],
    // reflecting the post-removal (empty) party.
    expect(engine.world.modules['companion-core']).toBe(result.party);
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

// F-761ad9eb: the engine's own suite independently documents this exact
// lossiness as a known, roadmap-deferred limitation of the recruit
// dual-write pattern: ai-rpg-engine packages/modules/src/faction-fallback
// .test.ts:200-209 (F-cf1ddc9f) -- "the companion's ORIGIN faction is
// destroyed at recruit ... originFaction preserved on CompanionState
// (roadmap design note)". This pin documents current (3.10) behavior; it is
// not an endorsement, and origin-faction restoration remains a Director-
// gated design decision.
describe('dismissCompanion — the origin-faction dismiss-lossiness pin (F-761ad9eb)', () => {
  it('does not restore (or clear) entity.faction on dismiss -- the party faction from recruit is permanent', () => {
    const npc = makeEntity({ faction: 'wardens' }); // pre-recruit origin faction
    const player = makeEntity({ id: 'player', zoneId: 'zone1' });
    const engine = makeEngine({ player, 'npc-1': npc });
    let party = createPartyState();

    const recruitResult = recruitCompanion(engine, party, 'npc-1', 'fighter', 1);
    expect(recruitResult.ok).toBe(true);
    if (recruitResult.ok) party = recruitResult.party;
    // F-444ac034: recruit's dual-write already overwrote the origin faction.
    expect(npc.faction).toBe('party');

    const dismissResult = dismissCompanion(engine, party, 'npc-1');

    expect(dismissResult.removed?.npcId).toBe('npc-1');
    // dismissCompanion strips tags + custom.companionMorale/companionRole
    // (companion-bridge.ts:154-181) but never touches entity.faction -- the
    // origin faction ('wardens') is unrecoverably lost, not merely stale.
    // Descriptive pin of 3.10 behavior (F-761ad9eb).
    expect(npc.faction).toBe('party');
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

  // F-35aef8dd: a stale/foreign save (an old campaign recruited under a
  // since-renamed or removed CompanionRole value) or any other writer of
  // entity.custom.companionRole must not be trusted blind -- falls through to the
  // tag-inference chain exactly as if custom.companionRole had been absent.
  it('falls back to tag inference when custom.companionRole is not a known CompanionRole value', () => {
    expect(inferCompanionRole({ tags: ['healer'], custom: { companionRole: 'necromancer' } })).toBe('healer');
    expect(inferCompanionRole({ tags: [], custom: { companionRole: 'necromancer' } })).toBe('fighter');
  });

  it('falls back to tag inference when custom.companionRole is a non-string value', () => {
    expect(inferCompanionRole({ tags: ['scout'], custom: { companionRole: 42 } })).toBe('scout');
    expect(inferCompanionRole({ tags: ['diplomat'], custom: { companionRole: {} } })).toBe('diplomat');
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
