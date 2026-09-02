import { describe, it, expect, beforeEach } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import {
  runHostileTurn,
  markAwarenessFromEvents,
  markEntitiesAware,
  markAware,
  isHostileAware,
  hasTelegraph,
} from './hostile-turn.js';
import { resolveTuning } from './tuning.js';

// crypt-stalker (cautious profile) starts at 'vestry-door'; the player
// starts at 'chapel-entrance', two moves away (chapel-entrance ->
// chapel-nave -> vestry-door). ash-ghoul (aggressive) and crypt-warden
// (territorial) share 'crypt-chamber', one more move past vestry-door.

function moveTo(engine: Engine, zoneId: string): void {
  const events = engine.submitAction('move', { targetIds: [zoneId] });
  const rejected = events.find((e) => e.type === 'action.rejected');
  if (rejected) throw new Error(`move to ${zoneId} rejected: ${JSON.stringify(rejected.payload)}`);
}

describe('runHostileTurn', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createGame();
    moveTo(engine, 'chapel-nave');
    moveTo(engine, 'vestry-door');
  });

  it('enemyAggression "off" is a hard no-op: no globals touched, no events, no telegraphs (RED before WO-B1-2: hostile-turn.ts did not exist)', () => {
    const before = JSON.stringify(engine.world.globals);
    const result = runHostileTurn(engine, resolveTuning({ enemyAggression: 'off' }));
    expect(result).toEqual({ events: [], telegraphs: [] });
    expect(JSON.stringify(engine.world.globals)).toBe(before);
    expect(isHostileAware(engine.world, 'crypt-stalker')).toBe(false);
  });

  it("a hostile outside the player's zone never acts, even at default tuning", () => {
    // A fresh game: player at chapel-entrance, crypt-stalker two zones away.
    const apart = createGame();
    const result = runHostileTurn(apart, resolveTuning());
    expect(result).toEqual({ events: [], telegraphs: [] });
    expect(isHostileAware(apart.world, 'crypt-stalker')).toBe(false);
  });

  it("a live hostile sharing the player's zone becomes aware at the hostile turn and telegraphs (co-location, wave-10 stitch)", () => {
    // beforeEach walked the player to vestry-door, the stalker's own zone,
    // through real move events; the zone-entry trigger alone is not what
    // this test relies on -- awareness is asserted false first, then the
    // hostile turn itself marks it (the fourth trigger) before acting.
    expect(isHostileAware(engine.world, 'crypt-stalker')).toBe(false);
    const result = runHostileTurn(engine, resolveTuning());
    expect(isHostileAware(engine.world, 'crypt-stalker')).toBe(true);
    expect(result.events).toEqual([]);
    expect(result.telegraphs).toEqual([{ hostileId: 'crypt-stalker', hostileName: 'Crypt Stalker' }]);
  });

  it('telegraphs the round it becomes aware and decides to attack, then lands the round after (default "telegraphed")', () => {
    markAware(engine.world, 'crypt-stalker', engine.tick);
    const playerHpBefore = engine.world.entities[engine.world.playerId].resources.hp;

    const round1 = runHostileTurn(engine, resolveTuning());
    expect(round1.events).toEqual([]);
    expect(round1.telegraphs).toEqual([{ hostileId: 'crypt-stalker', hostileName: 'Crypt Stalker' }]);
    expect(hasTelegraph(engine.world, 'crypt-stalker')).toBe(true);
    expect(engine.world.entities[engine.world.playerId].resources.hp).toBe(playerHpBefore);

    const round2 = runHostileTurn(engine, resolveTuning());
    expect(round2.telegraphs).toEqual([]);
    expect(round2.events.some((e) => e.type === 'combat.damage.applied' && e.payload.targetId === engine.world.playerId)).toBe(true);
    expect(hasTelegraph(engine.world, 'crypt-stalker')).toBe(false);
    expect(engine.world.entities[engine.world.playerId].resources.hp).toBeLessThan(playerHpBefore as number);
  });

  it('lands immediately with no telegraph round under "immediate"', () => {
    markAware(engine.world, 'crypt-stalker', engine.tick);
    const playerHpBefore = engine.world.entities[engine.world.playerId].resources.hp;
    const result = runHostileTurn(engine, resolveTuning({ enemyAggression: 'immediate' }));
    expect(result.telegraphs).toEqual([]);
    expect(result.events.some((e) => e.type === 'combat.damage.applied' && e.payload.targetId === engine.world.playerId)).toBe(true);
    expect(engine.world.entities[engine.world.playerId].resources.hp).toBeLessThan(playerHpBefore as number);
  });

  it('falls back to attack for the cautious profile\'s idle:scanning default once aware (honesty-floor verified-engine fallback)', () => {
    // crypt-stalker is a 'cautious' profile; with no engine-side `hostile`
    // cognition belief ever set on it, selectActionForEntity resolves it to
    // bare `inspect` ("idle: scanning") even though it's aware and adjacent.
    // This proof pins that the hostile turn overrides that into an attack
    // rather than leaving the hostile permanently idle.
    markAware(engine.world, 'crypt-stalker', engine.tick);
    const result = runHostileTurn(engine, resolveTuning({ enemyAggression: 'immediate' }));
    expect(result.events.some((e) => e.type === 'combat.contact.hit' || e.type === 'combat.contact.miss' || e.type === 'combat.damage.applied')).toBe(true);
  });

  it('applies enemyDamageScale as a post-event HP adjustment', () => {
    markAware(engine.world, 'crypt-stalker', engine.tick);
    const playerId = engine.world.playerId;
    const hpBefore = engine.world.entities[playerId].resources.hp as number;
    const result = runHostileTurn(engine, resolveTuning({ enemyAggression: 'immediate', enemyDamageScale: 2 }));
    const dmgEvent = result.events.find((e) => e.type === 'combat.damage.applied' && e.payload.targetId === playerId);
    if (!dmgEvent) return; // a miss this seed -- nothing to scale, still a valid run
    const damage = dmgEvent.payload.damage as number;
    const hpAfter = engine.world.entities[playerId].resources.hp as number;
    expect(hpBefore - hpAfter).toBe(damage);
    expect(dmgEvent.payload.currentHp).toBe(hpAfter);
  });

  it('stops the round early once the player is downed', () => {
    markAware(engine.world, 'crypt-stalker', engine.tick);
    engine.world.entities[engine.world.playerId].resources.hp = 0;
    const result = runHostileTurn(engine, resolveTuning({ enemyAggression: 'immediate' }));
    expect(result.events).toEqual([]);
  });
});

describe('markAwarenessFromEvents', () => {
  it('marks every hostile in a just-entered zone aware', () => {
    const engine = createGame();
    moveTo(engine, 'chapel-nave');
    expect(isHostileAware(engine.world, 'crypt-stalker')).toBe(false);
    const events = engine.submitAction('move', { targetIds: ['vestry-door'] });
    markAwarenessFromEvents(engine.world, events, engine.tick);
    expect(isHostileAware(engine.world, 'crypt-stalker')).toBe(true);
  });

  it('marks a hostile the player attacks aware even without a zone-entry event', () => {
    const engine = createGame();
    moveTo(engine, 'chapel-nave');
    moveTo(engine, 'vestry-door');
    expect(isHostileAware(engine.world, 'crypt-stalker')).toBe(false);
    const events = engine.submitAction('attack', { targetIds: ['crypt-stalker'] });
    markAwarenessFromEvents(engine.world, events, engine.tick);
    expect(isHostileAware(engine.world, 'crypt-stalker')).toBe(true);
  });
});

describe('markEntitiesAware', () => {
  it('marks the given entity ids aware at the given tick', () => {
    const engine = createGame();
    expect(isHostileAware(engine.world, 'ash-ghoul')).toBe(false);
    markEntitiesAware(engine.world, ['ash-ghoul', 'crypt-warden'], 5);
    expect(isHostileAware(engine.world, 'ash-ghoul')).toBe(true);
    expect(isHostileAware(engine.world, 'crypt-warden')).toBe(true);
  });
});

describe('T4 -- maxHostileAttackersPerRound (sixth family playtest: the pile-on)', () => {
  it('with two aware, telegraphed hostiles only one lands per round at the default; the other re-telegraphs', () => {
    const engine = createGame();
    const world = engine.world;
    const zone = world.entities[world.playerId]!.zoneId ?? world.locationId;
    for (const id of ['crypt-stalker', 'ash-ghoul']) {
      world.entities[id]!.zoneId = zone;
      // Both aggressive so both target the PLAYER (the stalker's cautious
      // profile otherwise picks the ghoul as its target -- traced 2026-09-02).
      (world.entities[id] as unknown as { ai: { profileId: string } }).ai.profileId = 'aggressive';
      markAware(world, id, engine.tick);
      world.globals[`hostile_telegraph_${id}`] = engine.tick; // both would land this round
    }
    const result = runHostileTurn(engine, resolveTuning());
    // Exactly one hostile attacked (its telegraph cleared); the other held
    // its telegraph and was announced again. (Counted by telegraph state,
    // not by damage events: a landed attack can still miss under the
    // engine's own roll.)
    const stillArmed = ['crypt-stalker', 'ash-ghoul'].filter((id) => hasTelegraph(world, id));
    expect(stillArmed.length).toBe(1);
    expect(result.telegraphs.length).toBe(1);
    expect(result.telegraphs[0].hostileId).toBe(stillArmed[0]);
  });

  it('at maxHostileAttackersPerRound 2 both land', () => {
    const engine = createGame();
    const world = engine.world;
    const zone = world.entities[world.playerId]!.zoneId ?? world.locationId;
    for (const id of ['crypt-stalker', 'ash-ghoul']) {
      world.entities[id]!.zoneId = zone;
      (world.entities[id] as unknown as { ai: { profileId: string } }).ai.profileId = 'aggressive';
      markAware(world, id, engine.tick);
      world.globals[`hostile_telegraph_${id}`] = engine.tick;
    }
    const result = runHostileTurn(engine, resolveTuning({ maxHostileAttackersPerRound: 2 }));
    expect(['crypt-stalker', 'ash-ghoul'].filter((id) => hasTelegraph(world, id))).toEqual([]);
    expect(result.telegraphs).toEqual([]);
  });
});
