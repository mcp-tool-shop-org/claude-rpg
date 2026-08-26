import { describe, it, expect } from 'vitest';
import { HookManager, registerBuiltinHooks, type HookContext } from './hooks.js';

const makeContext = (overrides: Partial<HookContext> = {}): HookContext => ({
  hookPoint: 'pre-narration',
  world: { zones: {}, entities: {}, playerId: 'player', locationId: 'zone1' } as any,
  events: [],
  presentationState: 'exploration',
  ...overrides,
});

describe('HookManager', () => {
  it('should register and fire hooks', () => {
    const manager = new HookManager();
    const results: string[] = [];
    manager.register('pre-narration', () => {
      results.push('fired');
      return null;
    });

    manager.fire(makeContext());
    expect(results).toEqual(['fired']);
  });

  it('should collect non-null results', () => {
    const manager = new HookManager();
    manager.register('combat-start', () => ({
      sfxCues: [{ effectId: 'alert_warning', timing: 'immediate', intensity: 0.8 }],
    }));

    const results = manager.fire(makeContext({ hookPoint: 'combat-start' }));
    expect(results).toHaveLength(1);
    expect(results[0].sfxCues).toHaveLength(1);
  });

  it('should merge multiple hook results', () => {
    const results = HookManager.mergeResults([
      { sfxCues: [{ effectId: 'a', timing: 'immediate', intensity: 0.5 }] },
      { sfxCues: [{ effectId: 'b', timing: 'immediate', intensity: 0.3 }] },
      { musicCue: { action: 'intensify', fadeMs: 300 } },
    ]);

    expect(results.sfxCues).toHaveLength(2);
    expect(results.musicCue?.action).toBe('intensify');
  });

  it('should fire nothing for unregistered hooks', () => {
    const manager = new HookManager();
    const results = manager.fire(makeContext({ hookPoint: 'idle' }));
    expect(results).toHaveLength(0);
  });
});

describe('enter-room edge cases', () => {
  it('should return null gracefully when zone is missing from world (T-013)', () => {
    const manager = new HookManager();
    registerBuiltinHooks(manager);

    // locationId points to a zone that doesn't exist in the zones map
    const ctx = makeContext({
      hookPoint: 'enter-room',
      world: {
        zones: {},
        entities: {},
        playerId: 'player',
        locationId: 'nonexistent-zone',
      } as any,
      events: [{ type: 'world.zone.entered', tick: 1, payload: {} }] as any,
    });

    const results = manager.fire(ctx);
    // Hook should return null (no matching zone), so results should be empty
    expect(results).toHaveLength(0);
  });
});

describe('Built-in hooks', () => {
  it('should register all built-in hooks without error and return expected results (T-012)', () => {
    const manager = new HookManager();
    registerBuiltinHooks(manager);

    // enter-room: no zone change events → should return empty results (hook returns null)
    const enterRoomResults = manager.fire(makeContext({ hookPoint: 'enter-room' }));
    expect(enterRoomResults).toHaveLength(0);

    // combat-start: presentationState is 'exploration' (default) → hook returns null
    const combatStartDefault = manager.fire(makeContext({ hookPoint: 'combat-start' }));
    expect(combatStartDefault).toHaveLength(0);

    // combat-start: presentationState is 'combat' → hook returns SFX
    const combatStartCombat = manager.fire(makeContext({
      hookPoint: 'combat-start',
      presentationState: 'combat',
    }));
    expect(combatStartCombat).toHaveLength(1);
    expect(combatStartCombat[0].sfxCues).toBeDefined();
    expect(combatStartCombat[0].sfxCues![0].effectId).toBe('alert_warning');

    // combat-end: no defeat events → empty
    const combatEndNoDefeat = manager.fire(makeContext({ hookPoint: 'combat-end' }));
    expect(combatEndNoDefeat).toHaveLength(0);

    // combat-end: with defeat event → returns SFX
    const combatEndWithDefeat = manager.fire(makeContext({
      hookPoint: 'combat-end',
      events: [{ type: 'combat.entity.defeated', tick: 1, payload: {} }] as any,
    }));
    expect(combatEndWithDefeat).toHaveLength(1);
    expect(combatEndWithDefeat[0].sfxCues![0].effectId).toBe('ui_success');

    // npc-speaking: not in dialogue → null
    const npcResults = manager.fire(makeContext({ hookPoint: 'npc-speaking' }));
    expect(npcResults).toHaveLength(0);

    // death: no hp-zero event → null
    const deathNoEvent = manager.fire(makeContext({ hookPoint: 'death' }));
    expect(deathNoEvent).toHaveLength(0);

    // death (F-adc0d512): a bare hp<=0 resource.changed event with no entityId must NOT
    // fire — this is the old buggy predicate shape that fired for ANY entity's hp hitting 0.
    const deathBareHpEvent = manager.fire(makeContext({
      hookPoint: 'death',
      events: [{ type: 'resource.changed', tick: 1, payload: { resourceId: 'hp', newValue: 0 } }] as any,
    }));
    expect(deathBareHpEvent).toHaveLength(0);

    // death: the PLAYER's combat.entity.defeated event → returns SFX + ambient + UI effects.
    // makeContext's default world.playerId is 'player'.
    const deathWithEvent = manager.fire(makeContext({
      hookPoint: 'death',
      events: [{ type: 'combat.entity.defeated', tick: 1, payload: { entityId: 'player' } }] as any,
    }));
    expect(deathWithEvent).toHaveLength(1);
    expect(deathWithEvent[0].sfxCues![0].effectId).toBe('alert_critical');
    expect(deathWithEvent[0].ambientCues!.length).toBe(2);
    expect(deathWithEvent[0].uiEffects!.length).toBe(1);

    // death (F-adc0d512 regression): a NON-player entity's combat.entity.defeated (e.g. a
    // defeated monster during combat) must NOT trigger the player-death SFX/fade-out.
    const deathNonPlayerKill = manager.fire(makeContext({
      hookPoint: 'death',
      events: [{ type: 'combat.entity.defeated', tick: 1, payload: { entityId: 'goblin-1' } }] as any,
    }));
    expect(deathNonPlayerKill).toHaveLength(0);
  });

  it('should emit ambient cues on enter-room with zone change', () => {
    const manager = new HookManager();
    registerBuiltinHooks(manager);

    const ctx = makeContext({
      hookPoint: 'enter-room',
      world: {
        zones: { zone1: { name: 'Dark Crypt', tags: ['dark', 'cursed'] } },
        entities: {},
        playerId: 'player',
        locationId: 'zone1',
      } as any,
      events: [{ type: 'world.zone.entered', tick: 1, payload: {} }] as any,
    });

    const results = manager.fire(ctx);
    const merged = HookManager.mergeResults(results);
    expect(merged.ambientCues!.length).toBeGreaterThan(0);
    expect(merged.ambientCues![0].layerId).toBe('ambient_drone');
  });

  it('should emit SFX on combat-start', () => {
    const manager = new HookManager();
    registerBuiltinHooks(manager);

    const ctx = makeContext({
      hookPoint: 'combat-start',
      presentationState: 'combat',
    });

    const results = manager.fire(ctx);
    const merged = HookManager.mergeResults(results);
    expect(merged.sfxCues!.length).toBeGreaterThan(0);
    expect(merged.sfxCues![0].effectId).toBe('alert_warning');
  });
});

// ─── F-e57d6a60: deathHook must also catch a hazard-style death that mutates hp
// directly and emits no event at all (world-gen.ts's environment-hazard effect) ───

describe('deathHook hp-based detection (F-e57d6a60)', () => {
  it('fires the death presentation when hp reaches zero with no defeat event at all', () => {
    const manager = new HookManager();
    registerBuiltinHooks(manager);

    // Mirrors world-gen.ts's environment-hazard effect: hp mutated directly to 0 via
    // entity.resources.hp = Math.max(0, ...), with the triggering event being
    // world.zone.entered (not any hp/defeat-shaped event).
    const ctx = makeContext({
      hookPoint: 'death',
      world: {
        zones: {},
        entities: { player: { resources: { hp: 0 } } },
        playerId: 'player',
        locationId: 'zone1',
      } as any,
      events: [{ type: 'world.zone.entered', tick: 1, payload: {} }] as any,
    });

    const results = manager.fire(ctx);
    expect(results).toHaveLength(1);
    expect(results[0].sfxCues![0].effectId).toBe('alert_critical');
    expect(results[0].uiEffects!.length).toBe(1);
  });

  it('does not fire when hp is above zero and no defeat event exists', () => {
    const manager = new HookManager();
    registerBuiltinHooks(manager);

    const ctx = makeContext({
      hookPoint: 'death',
      world: {
        zones: {},
        entities: { player: { resources: { hp: 5 } } },
        playerId: 'player',
        locationId: 'zone1',
      } as any,
      events: [],
    });

    const results = manager.fire(ctx);
    expect(results).toHaveLength(0);
  });
});

// ─── F-91f803b2: combat-end's victory cue must not fire alongside a player death ───

describe('combatEndHook player-death suppression (F-91f803b2)', () => {
  it('does not fire the victory cue when the defeated entity is the player', () => {
    const manager = new HookManager();
    registerBuiltinHooks(manager);

    const ctx = makeContext({
      hookPoint: 'combat-end',
      events: [{ type: 'combat.entity.defeated', tick: 1, payload: { entityId: 'player' } }] as any,
    });

    const results = manager.fire(ctx);
    expect(results).toHaveLength(0);
  });

  it('still fires the victory cue when a non-player entity is defeated', () => {
    const manager = new HookManager();
    registerBuiltinHooks(manager);

    const ctx = makeContext({
      hookPoint: 'combat-end',
      events: [{ type: 'combat.entity.defeated', tick: 1, payload: { entityId: 'goblin-1' } }] as any,
    });

    const results = manager.fire(ctx);
    expect(results).toHaveLength(1);
    expect(results[0].sfxCues![0].effectId).toBe('ui_success');
  });
});
