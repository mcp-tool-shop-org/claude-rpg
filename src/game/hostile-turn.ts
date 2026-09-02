// WO-B1-2 (slice B1 §2, design lock 3, ADDENDUM-COMMON): the hostile turn.
// After the player's action resolves and BEFORE the world tick, every live,
// AWARE hostile in the player's zone gets one action through the engine's
// own cognition-core intent selection (`selectActionForEntity`) — an
// aware hostile choosing to attack the player TELEGRAPHS its first round
// (a reserved combat-channel line, no damage) and LANDS the round after,
// per `tuning.enemyAggression`. `'off'` is a hard no-op: no awareness is
// ever read or written, so a session with that tuning value reproduces
// every pre-slice-B1 log byte-for-byte (ADDENDUM-COMMON design lock 10).
//
// Research grounding (dispatch-b1.md): finding 16 (Into the Breach telegraphs
// enemy attacks a turn ahead so every death is the player's own fault) and
// finding 14 (persistence after failure comes from legible, purposeful
// failure — every hit must name its cause and amount) are why the telegraph
// step exists at all rather than hostiles just attacking blind.
//
// Honesty-floor verification against the installed 3.11 engine
// (node_modules/@ai-rpg-engine/modules, cognition-core.ts): `aggressiveProfile`
// treats the player's `player` tag as an automatic hostile-belief substitute
// (`target.tags.includes('player')`), so it yields `attack` against an aware,
// adjacent player regardless of any cognition belief. `cautiousProfile` and
// `territorialProfile` do NOT — they gate on an actual `hostile` cognition
// belief (`believes(cognition, target.id, 'hostile', true)` /
// `hostileBelief.confidence > 0.6`) or a faction-hostile affiliation, neither
// of which this app's own `hostile_aware_<id>` flag sets. Per design lock 3's
// own instruction ("if selectActionForEntity never yields attack for an aware
// hostile with the player adjacent, say so ... and fall back to a
// deterministic app rule"): for a cautious/territorial hostile whose
// selection comes back as anything other than an attack on the player (most
// commonly `inspect`/`guard` — see cognition-core.ts:666-829), this module
// falls back to "aware + same zone -> attack the player" for the ATTACK
// decision specifically, while still routing every OTHER verb the profile
// legitimately chooses (guard, disengage) through the engine call unchanged.

import type { Engine, ResolvedEvent, WorldState } from '@ai-rpg-engine/core';
import { selectActionForEntity } from '@ai-rpg-engine/modules';
import type { LivingWorldTuning } from './tuning.js';

/** `hostile_aware_<id>` global — set once and never cleared for the entity's lifetime. */
function awarenessKey(entityId: string): string {
  return `hostile_aware_${entityId}`;
}

/** `hostile_telegraph_<id>` global — set the round the hostile decides to attack, cleared once it lands. */
function telegraphKey(entityId: string): string {
  return `hostile_telegraph_${entityId}`;
}

export function isHostileAware(world: WorldState, entityId: string): boolean {
  return world.globals[awarenessKey(entityId)] !== undefined;
}

export function markAware(world: WorldState, entityId: string, tick: number): void {
  if (world.globals[awarenessKey(entityId)] === undefined) {
    world.globals[awarenessKey(entityId)] = tick;
  }
}

export function hasTelegraph(world: WorldState, entityId: string): boolean {
  return world.globals[telegraphKey(entityId)] !== undefined;
}

/**
 * Design lock 3's two awareness triggers: a zone-entry event (the player
 * just walked in on hostiles already standing there) marks every hostile in
 * the entered zone aware; a combat event the PLAYER initiated (attacking
 * first) marks its target aware. Called from turn-loop.ts on the player's
 * own action events, before runHostileTurn runs the same round.
 */
export function markAwarenessFromEvents(world: WorldState, events: ResolvedEvent[], tick: number): void {
  const playerId = world.playerId;
  for (const event of events) {
    if (event.type === 'world.zone.entered') {
      const zoneId = event.payload.zoneId as string | undefined;
      if (!zoneId) continue;
      for (const entity of Object.values(world.entities)) {
        if (entity.id === playerId) continue;
        if (entity.zoneId !== zoneId) continue;
        if (!(entity.tags.includes('enemy') || entity.tags.includes('hostile'))) continue;
        markAware(world, entity.id, tick);
      }
      continue;
    }
    if (
      (event.type === 'combat.damage.applied' ||
        event.type === 'combat.contact.hit' ||
        event.type === 'combat.contact.miss') &&
      event.payload.attackerId === playerId
    ) {
      const targetId = event.payload.targetId as string | undefined;
      if (targetId) markAware(world, targetId, tick);
    }
  }
}

/**
 * Design lock 3's third awareness trigger: an encounter-spawn ambush reveals
 * itself to the player on arrival — called from game.ts's runWorldRound with
 * the world tick's own `SpawnedEncounterReport.entityIds` for each encounter
 * whose zone is the player's current zone.
 */
export function markEntitiesAware(world: WorldState, entityIds: string[], tick: number): void {
  for (const id of entityIds) markAware(world, id, tick);
}

/** One hostile that decided to attack this round but telegraphed instead of landing. */
export type HostileTelegraph = {
  hostileId: string;
  hostileName: string;
};

export type HostileTurnResult = {
  /** Events produced by every hostile action actually submitted this round (attacks, guards, disengages). */
  events: ResolvedEvent[];
  /** Hostiles whose attack decision this round set a telegraph instead of landing. */
  telegraphs: HostileTelegraph[];
};

const NO_ACTION: HostileTurnResult = { events: [], telegraphs: [] };

/** Live, aware hostiles in the player's zone, sorted by id for deterministic acting order. */
function liveAwareHostilesInPlayerZone(world: WorldState) {
  const player = world.entities[world.playerId];
  if (!player) return [];
  const playerZone = player.zoneId ?? world.locationId;
  return Object.values(world.entities)
    .filter(
      (e) =>
        e.id !== world.playerId &&
        (e.resources.hp ?? 0) > 0 &&
        (e.tags.includes('enemy') || e.tags.includes('hostile')) &&
        (e.zoneId ?? world.locationId) === playerZone &&
        isHostileAware(world, e.id),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Apply `tuning.enemyDamageScale` to a landed hostile attack's damage as a
 * post-event HP adjustment. Verified against the installed 3.11 engine
 * (combat-core.ts): the damage formula (`formulas.damage` /
 * `defaultDamage`) has no app-reachable scale hook — `FormulaRegistry`
 * (core) only exposes named formula overrides a PACK registers at load time,
 * not a per-call multiplier this app can thread through `submitActionAs` —
 * so scaling happens here, after the fact, directly on the already-mutated
 * player entity, and the emitted `combat.damage.applied` event's own
 * `damage`/`currentHp` fields are rewritten to match (so the combat channel
 * and every listener reads the SAME scaled number, not the pre-scale one).
 * A no-op at the default (1): every existing fixture stays byte-identical.
 */
function applyDamageScale(world: WorldState, playerId: string, events: ResolvedEvent[], scale: number): void {
  if (scale === 1) return;
  const player = world.entities[playerId];
  if (!player) return;
  for (const event of events) {
    if (event.type !== 'combat.damage.applied') continue;
    if (event.payload.targetId !== playerId) continue;
    const original = event.payload.damage as number;
    const scaledDamage = Math.max(0, Math.round(original * scale));
    const delta = scaledDamage - original;
    if (delta === 0) continue;
    const previousHp = player.resources.hp ?? 0;
    // Refund/extend relative to what the engine already applied (it already
    // subtracted `original` from hp before this function runs).
    player.resources.hp = Math.max(0, previousHp - delta);
    event.payload.damage = scaledDamage;
    event.payload.currentHp = player.resources.hp;
  }
}

/**
 * Run the hostile turn: one action per live, aware hostile in the player's
 * zone, in id order. `tuning.enemyAggression === 'off'` is a hard early
 * return (no awareness read, no globals touched, no events) so a session at
 * that value is indistinguishable from a pre-slice-B1 build.
 */
export function runHostileTurn(engine: Engine, tuning: LivingWorldTuning): HostileTurnResult {
  if (tuning.enemyAggression === 'off') return NO_ACTION;

  const world = engine.world;
  const playerId = world.playerId;
  const events: ResolvedEvent[] = [];
  const telegraphs: HostileTelegraph[] = [];
  // T4 (tuning.maxHostileAttackersPerRound): landed attacks so far this round.
  let landedThisRound = 0;

  // Stitch ruling (wave 10): co-location is the fourth awareness trigger.
  // A live hostile standing in the player's zone when the hostile turn
  // runs has noticed the player, however it got there (a walk-in the
  // zone-entry event already covers, a spawn, a fixture placing it) -- it
  // still telegraphs before it lands, so the beginner-safety promise of
  // design lock 3 holds unchanged.
  const player = world.entities[playerId];
  const playerZone = player?.zoneId ?? world.locationId;
  const colocated = Object.values(world.entities)
    .filter(
      (e) =>
        e.id !== playerId &&
        (e.resources.hp ?? 0) > 0 &&
        (e.tags.includes('enemy') || e.tags.includes('hostile')) &&
        (e.zoneId ?? world.locationId) === playerZone,
    )
    .map((e) => e.id);
  markEntitiesAware(world, colocated, engine.tick);

  for (const hostile of liveAwareHostilesInPlayerZone(world)) {
    // Player downed mid-round (an earlier hostile's landed hit) -> the
    // defeat screen owns what happens next, not a pile-on. Mirrors the
    // installed engine's own reference NPC-turn driver
    // (packages/cli/src/turns.ts's runNpcTurns) round-stop discipline.
    const player = world.entities[playerId];
    if (!player || (player.resources.hp ?? 0) <= 0) break;

    // Re-check liveness against live state -- an earlier hostile's action
    // (or a reactive effect it triggered) may have removed or downed this one.
    const entity = world.entities[hostile.id];
    if (!entity || (entity.resources.hp ?? 0) <= 0) continue;

    let selection: ReturnType<typeof selectActionForEntity> = null;
    try {
      selection = selectActionForEntity(world, entity.id);
    } catch {
      continue; // a throwing profile loses this hostile's turn, not the round
    }

    // No ai state at all (selectActionForEntity's own null contract) --
    // nothing to do, same as the installed engine's reference NPC-turn
    // driver (packages/cli/src/turns.ts's runNpcTurns: `if (!selection)
    // continue;`).
    if (!selection) continue;

    const attacksPlayer = selection.verb === 'attack' && selection.targetIds?.[0] === playerId;
    // Verified-engine fallback (this file's own top doc comment, honesty
    // floor): confirmed against the installed 3.11 engine's built-in
    // profiles (cognition-core.ts) that `cautiousProfile` returns bare
    // `{ verb: 'inspect', reason: 'idle: scanning' }` for a nearby player it
    // holds no `hostile` cognition belief about (the ONLY belief-setting
    // path is combat memory -- an aware hostile the player has not yet hit
    // never gets one), and `territorialProfile`/`aggressiveProfile` return
    // `guard` for their own "not attacking yet" branches. Design doc §2:
    // "awareness is what lets the profiles produce attack intents INSTEAD
    // OF idle: scanning" -- i.e. this exact override is the documented
    // intent, not a workaround. `disengage` (a real morale-collapse/fleeing
    // decision) is deliberately left alone: overriding a hostile the
    // profile itself decided should flee would contradict the morale
    // mechanic design lock 3 otherwise leaves untouched, and would make
    // `flee`'s own beginner-safety promise (doc §2) meaningless if the
    // enemy's own flee never actually let the player go.
    const shouldAttackPlayer = attacksPlayer || selection.verb === 'inspect' || selection.verb === 'guard';
    const verb = shouldAttackPlayer ? 'attack' : selection.verb;
    const targetIds = shouldAttackPlayer ? [playerId] : selection.targetIds;

    if (shouldAttackPlayer) {
      if (tuning.enemyAggression === 'telegraphed' && !hasTelegraph(world, entity.id)) {
        world.globals[telegraphKey(entity.id)] = engine.tick;
        telegraphs.push({ hostileId: entity.id, hostileName: entity.name });
        continue;
      }
      if (landedThisRound >= tuning.maxHostileAttackersPerRound) {
        // T4: the pile-on cap -- this hostile holds its attack (keeps its
        // telegraph) and is announced again so the threat stays legible.
        telegraphs.push({ hostileId: entity.id, hostileName: entity.name });
        continue;
      }
      delete world.globals[telegraphKey(entity.id)];
      const submitted = engine.submitActionAs(entity.id, 'attack', { targetIds: [playerId] });
      applyDamageScale(world, playerId, submitted, tuning.enemyDamageScale);
      events.push(...submitted);
      landedThisRound += 1;
      continue;
    }

    // A non-attack combat verb the profile legitimately chose (guard,
    // disengage) -- submit as-is, no telegraph/damage-scale machinery.
    const submitted = engine.submitActionAs(entity.id, verb, { targetIds });
    events.push(...submitted);
  }

  return { events, telegraphs };
}
