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

/**
 * Whether any hostile-tagged entity in the player's current zone still has hp above
 * zero. Used to gate the encounter's TRUE end (combatEndHook's victory chime + music
 * soften, and its dispatch in immersion-runtime.ts's fireEventHooks) on "no hostiles
 * remain" rather than "a combat.entity.defeated event exists" (F-d9fc231c) -- this
 * game supports multi-combatant fights as a first-class concept (companion/party
 * interception is this domain's own companion-bridge.ts; world-gen.ts's faction
 * generation routinely places multiple hostile-tagged NPCs together), and that event
 * fires once per kill, well before the last enemy falls. Uses the same
 * `tags.includes('hostile') || tags.includes('enemy')` convention already
 * established for hostility elsewhere in this codebase (runtime/voice-caster.ts).
 * Scoped to entities whose zoneId matches world.locationId (the player's current
 * zone) rather than the whole world, so a hostile NPC elsewhere on the map (an
 * unrelated, not-yet-encountered faction) can't permanently suppress this hook for
 * the rest of the session.
 */
export function hasLivingHostiles(world: WorldState): boolean {
  return Object.values(world.entities).some(
    (e) =>
      e.zoneId === world.locationId &&
      (e.tags?.includes('hostile') || e.tags?.includes('enemy')) &&
      (e.resources?.hp ?? 0) > 0,
  );
}

/** Manages hook registration and firing. */
export class HookManager {
  private hooks = new Map<HookPoint, Hook[]>();

  /**
   * F-9ba5f482/F-06fffa64: gates fire()'s hook-threw diagnostic below.
   * Mirrors ImmersionRuntime's own public `debugMode` field/convention --
   * the gate every OTHER diagnostic in this domain already uses -- instead
   * of this being the one call site with no gate of any kind. Before this,
   * a non-debug player's terminal got a raw hook name, hookPoint string,
   * and full Error/stack dumped the instant any hook threw, with no way to
   * suppress it and no relation to whether --debug was passed.
   * ImmersionRuntime (the sole production instantiator of HookManager)
   * keeps this in sync with its own debugMode via the setter on its
   * `debugMode` accessor (immersion-runtime.ts), so `runtime.debugMode`
   * remains the one flag that gates every diagnostic in this domain,
   * HookManager's included.
   */
  debugMode = false;

  register(point: HookPoint, hook: Hook): void {
    const existing = this.hooks.get(point) ?? [];
    existing.push(hook);
    this.hooks.set(point, existing);
  }

  /**
   * F-8968741e: each hook call is isolated in its own try/catch, mirroring the
   * engine's own per-module ModuleManager.runRound() isolation (one module's throw
   * does not skip the others). Before this, a single throwing hook aborted the
   * whole loop, so any OTHER hook registered at the same hookPoint never ran that
   * call -- and because ImmersionRuntime.fireEventHooks dispatches fire() up to 4
   * times per turn in one uninterrupted synchronous sequence before its own single
   * outer try/catch, a throw from the first of those also silently skipped the
   * remaining, unrelated checks for that same turn. register() is a general-purpose
   * extension point (this file's own header comment), so this isolation must hold
   * for any future hook landing here, not just today's 5 well-behaved built-ins.
   */
  fire(context: HookContext): HookResult[] {
    const hooks = this.hooks.get(context.hookPoint) ?? [];
    const results: HookResult[] = [];
    for (const hook of hooks) {
      try {
        const result = hook(context);
        if (result) results.push(result);
      } catch (err) {
        // F-9ba5f482: gated on debugMode -- previously unconditional (see
        // the `debugMode` field's doc comment above for why).
        if (this.debugMode) {
          console.error(
            `[hooks] Hook "${hook.name || '<anonymous>'}" at hookPoint "${context.hookPoint}" threw and was skipped:`,
            err,
          );
        }
      }
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
  // F-d9fc231c: the entity named in THIS event is already confirmed dead (that's why
  // hasDefeat is true above) -- but a multi-hostile fight fires combat.entity.defeated
  // once per kill, not once per encounter. If another hostile in the same zone is
  // still standing, the fight itself isn't over yet, so suppress the victory chime +
  // music soften until the actual last kill.
  if (hasLivingHostiles(ctx.world)) return null;
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
