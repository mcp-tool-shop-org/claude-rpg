// Hook lifecycle — fires at key moments in the turn loop

import type { WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import type {
  PresentationState,
  NarrationPlan,
  SfxCue,
  AmbientCue,
  MusicCue,
  UiEffect,
} from '@ai-rpg-engine/presentation';

export type HookPoint =
  | 'pre-narration'
  | 'post-narration'
  | 'combat-start'
  | 'combat-end'
  | 'enter-room'
  | 'npc-speaking'
  | 'idle'
  | 'death'
  | 'dream'
  | 'save'
  | 'load';

export type HookContext = {
  hookPoint: HookPoint;
  world: WorldState;
  events: ResolvedEvent[];
  presentationState: PresentationState;
  narrationPlan?: NarrationPlan;
};

export type HookResult = {
  sfxCues?: SfxCue[];
  ambientCues?: AmbientCue[];
  musicCue?: MusicCue;
  uiEffects?: UiEffect[];
};

export type Hook = (context: HookContext) => HookResult | null;

/**
 * Whether `events` contains a defeat event for the PLAYER specifically, not any entity.
 * Mirrors PresentationStateMachine.inferFromEvents's entity-aware death check. Shared by
 * deathHook and ImmersionRuntime's death dispatch gate so the two predicates can't drift
 * apart again (F-adc0d512 — both previously matched on any entity's hp reaching 0).
 */
export function isPlayerDefeatEvent(events: ResolvedEvent[], playerId: string): boolean {
  return events.some(
    (e) => e.type === 'combat.entity.defeated' && e.payload.entityId === playerId,
  );
}

/**
 * Whether the PLAYER's hp has reached zero directly in world state, independent of
 * any event. Some death paths mutate hp without emitting a matching event at all —
 * e.g. world-gen.ts's environment-hazard effect (F-e57d6a60), which does
 * `entity.resources.hp = Math.max(0, ...)` and `return []`. That empty return is not
 * a loose end this function tries to route around by matching some other event
 * shape: the installed engine's environment-core module discards whatever a
 * hazard's effect callback returns — checkHazard() in
 * node_modules/@ai-rpg-engine/modules/dist/environment-core.js calls
 * `hazard.effect(zone, entity, world, event.tick)` for its side effect only and
 * never reads the return value (verified by reading that dist file directly, not
 * assumed from the .d.ts's `=> ResolvedEvent[]` signature). The effect closure also
 * has no event-bus handle to push a new event through some other way — `world`
 * there is the plain WorldState data bag, not the WorldStore/EventBus. Reading hp
 * straight off world state is therefore the only mechanism that actually reaches
 * this domain's death presentation for a hazard death. Call sites that have `world`
 * in hand should OR this in alongside isPlayerDefeatEvent so combat deaths and
 * hazard deaths both reach the same death presentation.
 */
export function isPlayerAtZeroHp(world: WorldState, playerId: string): boolean {
  const hp = world.entities[playerId]?.resources.hp;
  return hp !== undefined && hp <= 0;
}

/** Manages hook registration and firing. */
export class HookManager {
  private hooks = new Map<HookPoint, Hook[]>();

  register(point: HookPoint, hook: Hook): void {
    const existing = this.hooks.get(point) ?? [];
    existing.push(hook);
    this.hooks.set(point, existing);
  }

  fire(context: HookContext): HookResult[] {
    const hooks = this.hooks.get(context.hookPoint) ?? [];
    const results: HookResult[] = [];
    for (const hook of hooks) {
      const result = hook(context);
      if (result) results.push(result);
    }
    return results;
  }

  /** Merge multiple hook results into accumulated cue arrays. */
  static mergeResults(results: HookResult[]): HookResult {
    const merged: HookResult = {
      sfxCues: [],
      ambientCues: [],
      uiEffects: [],
    };
    for (const r of results) {
      if (r.sfxCues) merged.sfxCues!.push(...r.sfxCues);
      if (r.ambientCues) merged.ambientCues!.push(...r.ambientCues);
      if (r.uiEffects) merged.uiEffects!.push(...r.uiEffects);
      if (r.musicCue) merged.musicCue = r.musicCue; // Last one wins
    }
    return merged;
  }
}

// ── Built-in hooks ──

/** Play ambient based on zone tags when entering a room. */
export const enterRoomHook: Hook = (ctx) => {
  const hasZoneChange = ctx.events.some((e) => e.type === 'world.zone.entered');
  if (!hasZoneChange) return null;

  const zone = ctx.world.zones[ctx.world.locationId];
  if (!zone) return null;

  const ambientCues: AmbientCue[] = [];
  const tags = zone.tags ?? [];

  if (tags.includes('dark') || tags.includes('cursed')) {
    ambientCues.push({ layerId: 'ambient_drone', action: 'crossfade', volume: 0.3, fadeMs: 1500 });
  } else if (tags.includes('rain') || tags.includes('outdoor')) {
    ambientCues.push({ layerId: 'ambient_rain', action: 'crossfade', volume: 0.4, fadeMs: 2000 });
  } else {
    // Default: fade out existing ambient
    ambientCues.push({ layerId: 'ambient_drone', action: 'stop', volume: 0, fadeMs: 1000 });
    ambientCues.push({ layerId: 'ambient_rain', action: 'stop', volume: 0, fadeMs: 1000 });
  }

  return { ambientCues };
};

/** Play warning SFX and transition music on combat start. */
export const combatStartHook: Hook = (ctx) => {
  if (ctx.presentationState !== 'combat') return null;
  return {
    sfxCues: [{ effectId: 'alert_warning', timing: 'immediate', intensity: 0.8 }],
    musicCue: { action: 'intensify', fadeMs: 300 },
  };
};

/** Play success SFX on combat end. */
export const combatEndHook: Hook = (ctx) => {
  const hasDefeat = ctx.events.some((e) => e.type === 'combat.entity.defeated');
  if (!hasDefeat) return null;
  // F-91f803b2: skip when the PLAYER is the defeated entity — deathHook already
  // owns that presentation (critical alarm + fade-out). combat-end and death are
  // dispatched independently and unconditionally off the same combat.entity.defeated
  // event in ImmersionRuntime.fireEventHooks, so without this gate a player death
  // via combat played a victory chime and a "soften" music cue immediately alongside
  // the death alarm.
  if (isPlayerDefeatEvent(ctx.events, ctx.world.playerId)) return null;
  // F-f1e475f0: also skip when the player's hp is independently at zero (e.g. a
  // hazard reapplication zeroed it the same turn a *different*, non-player entity's
  // combat.entity.defeated satisfies hasDefeat above). deathHook,
  // ImmersionRuntime.fireEventHooks' death dispatch gate, and
  // PresentationStateMachine.inferFromEvents all OR isPlayerAtZeroHp in alongside
  // isPlayerDefeatEvent per its doc comment's call-sites-with-world contract; this
  // was the one sibling call site with ctx.world in hand that didn't, so a
  // multi-enemy hazard-arena turn (player hazard-zeroed to 0, a separate enemy
  // defeated in combat that same turn) could still fire the victory chime + soften
  // cue immediately alongside deathHook's alarm — the exact composition F-91f803b2
  // closed, reopened through this one path.
  if (isPlayerAtZeroHp(ctx.world, ctx.world.playerId)) return null;
  return {
    sfxCues: [{ effectId: 'ui_success', timing: 'immediate', intensity: 0.7 }],
    musicCue: { action: 'soften', fadeMs: 1000 },
  };
};

/** Duck audio when NPC is speaking. */
export const npcSpeakingHook: Hook = (ctx) => {
  if (ctx.presentationState !== 'dialogue') return null;
  // Ducking is handled by the audio director's ducking rules
  return null;
};

/** Play critical alert on death. */
export const deathHook: Hook = (ctx) => {
  // F-e57d6a60: also match a hazard-style death that mutates hp to 0 without ever
  // emitting a combat.entity.defeated (or any) event — see isPlayerAtZeroHp's doc
  // comment for why the event can't be made to appear here instead.
  const playerDefeated =
    isPlayerDefeatEvent(ctx.events, ctx.world.playerId) ||
    isPlayerAtZeroHp(ctx.world, ctx.world.playerId);
  if (!playerDefeated) return null;
  return {
    sfxCues: [{ effectId: 'alert_critical', timing: 'immediate', intensity: 1.0 }],
    ambientCues: [
      { layerId: 'ambient_drone', action: 'stop', volume: 0, fadeMs: 2000 },
      { layerId: 'ambient_rain', action: 'stop', volume: 0, fadeMs: 2000 },
    ],
    uiEffects: [{ type: 'fade-out', durationMs: 2000, color: '#000' }],
  };
};

/** Register all built-in hooks. */
export function registerBuiltinHooks(manager: HookManager): void {
  manager.register('enter-room', enterRoomHook);
  manager.register('combat-start', combatStartHook);
  manager.register('combat-end', combatEndHook);
  manager.register('npc-speaking', npcSpeakingHook);
  manager.register('death', deathHook);
}
