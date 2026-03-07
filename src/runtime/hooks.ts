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
  const playerDeath = ctx.events.some(
    (e) => e.type === 'resource.changed' && e.payload.resourceId === 'hp' && (e.payload.newValue as number) <= 0,
  );
  if (!playerDeath) return null;
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
