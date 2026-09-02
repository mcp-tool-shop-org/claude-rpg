// WO-B1-1 (slice B1 §1, design lock 1, ADDENDUM-COMMON): the ONE condition-
// rung vocabulary every surface (status line, the combat channel's outcome
// lines, `inspect`, the narration prompt) reads from -- never a second
// threshold table anywhere else in this product. Five named rungs derived
// from hp/maxHp, thresholds per the design doc: 100% unhurt, >=67% hurt,
// >=34% bloodied, >0 reeling, 0 down.
//
// Research grounding (dispatch-b1.md): finding 4 (D&D 4e's single named
// "bloodied" threshold communicates fight progress without a bar) and
// finding 1 (a discrete HUD token outperforms prose alternatives for health
// monitoring) are why this is a small ordered token set, not a percentage or
// a bar.

import type { WorldState, EntityState } from '@ai-rpg-engine/core';

export type ConditionRung = 'unhurt' | 'hurt' | 'bloodied' | 'reeling' | 'down';

/**
 * Derive the condition rung from current/max HP. `maxHp` of 0 or less is
 * treated as `down` (a degenerate entity, never divide-by-zero into NaN
 * comparisons) rather than throwing -- callers already guard for missing
 * entities/resources upstream (e.g. describeHostiles' hp/maxHp fallbacks
 * below), so this stays total over its declared domain.
 */
export function conditionRung(hp: number, maxHp: number): ConditionRung {
  if (hp <= 0 || maxHp <= 0) return 'down';
  const pct = hp / maxHp;
  if (pct >= 1) return 'unhurt';
  if (pct >= 0.67) return 'hurt';
  if (pct >= 0.34) return 'bloodied';
  return 'reeling';
}

export type HostileDescriptor = {
  id: string;
  name: string;
  rung: ConditionRung;
  /** True once `hostile_aware_<id>` (game/hostile-turn.ts) is set for this entity. */
  aware: boolean;
};

/**
 * Design lock 1: every surface that lists the hostiles in a zone (the status
 * line, the play-screen opts, the command strip's `attack <aware hostile>`
 * derivation) reads from this ONE function. A downed entity (rung === 'down')
 * is EXCLUDED -- design doc §1 "enemy corpses leave the target list" and §2's
 * hostile-turn both key off "live hostile", so a single shared filter here
 * keeps every consumer's target list and every consumer's status line in
 * agreement without each reimplementing the hp>0 + tag check.
 */
export function describeHostiles(world: WorldState, zoneId: string): HostileDescriptor[] {
  return Object.values(world.entities)
    .filter(
      (e): e is EntityState =>
        e.id !== world.playerId &&
        (e.zoneId ?? world.locationId) === zoneId &&
        (e.tags.includes('enemy') || e.tags.includes('hostile')) &&
        (e.resources.hp ?? 0) > 0,
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((e) => ({
      id: e.id,
      name: e.name,
      rung: conditionRung(e.resources.hp ?? 0, e.resources.maxHp ?? 1),
      aware: isHostileAware(world, e.id),
    }));
}

/** `hostile_aware_<id>` global set by game/hostile-turn.ts's markAware(). */
export function isHostileAware(world: WorldState, entityId: string): boolean {
  return world.globals[`hostile_aware_${entityId}`] !== undefined;
}
