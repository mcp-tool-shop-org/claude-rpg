import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { HookManager, registerBuiltinHooks, type HookContext } from './hooks.js';

// F-0ad073b8: a real @ai-rpg-engine Engine (createGame(), the same starter-fantasy
// pack test/helpers/game-harness.ts and every test/integration/*.test.ts file already
// use), rebuilt fresh before every test. makeContext()'s default `world` below reads
// this live engine's own WorldState instead of a second, independently hand-typed
// WorldState fragment -- so hook dispatch (immersion-runtime.ts, which passes a real
// engine.world into HookContext) and these hook unit tests now share one real fixture
// instead of two fixtures that could silently drift apart.
let engine: Engine;

beforeEach(() => {
  engine = createGame();
});

const makeContext = (overrides: Partial<HookContext> = {}): HookContext => ({
  hookPoint: 'pre-narration',
  world: engine.world,
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

  // F-8968741e: a single throwing hook must not abort the OTHER hooks registered
  // at the same hookPoint -- mirrors the engine's own per-module
  // ModuleManager.runRound() isolation (one module's throw does not skip the
  // others). Before this fix, fire()'s bare for-loop had no per-hook try/catch, so
  // the first throw aborted the loop entirely.
  it('isolates a throwing hook so sibling hooks at the same hookPoint still run', () => {
    const manager = new HookManager();
    const order: string[] = [];
    manager.register('pre-narration', () => {
      order.push('first');
      throw new Error('first hook exploded');
    });
    manager.register('pre-narration', () => {
      order.push('second');
      return { sfxCues: [{ effectId: 'survived', timing: 'immediate', intensity: 0.5 }] };
    });

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const results = manager.fire(makeContext());
    stderrSpy.mockRestore();

    expect(order).toEqual(['first', 'second']);
    expect(results).toHaveLength(1);
    expect(results[0].sfxCues![0].effectId).toBe('survived');
  });

  it('does not throw out of fire() when a registered hook throws', () => {
    const manager = new HookManager();
    manager.register('pre-narration', () => {
      throw new Error('boom');
    });

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => manager.fire(makeContext())).not.toThrow();
    stderrSpy.mockRestore();
  });

  it('logs which hook and hookPoint failed so a debug session can identify the culprit (when debugMode is enabled)', () => {
    const manager = new HookManager();
    // F-9ba5f482: fire()'s hook-threw diagnostic is now gated on debugMode
    // (previously unconditional) — opt in explicitly so this test still
    // exercises the log line itself; see the sibling test below for the
    // now-default (debugMode: false) silent path.
    manager.debugMode = true;
    // Coordinator stitch (wave 6): `never` return, not the inferred `void` —
    // a function that only throws doesn't satisfy Hook's
    // `HookResult | null` return under tsc, and vitest runs alone don't
    // typecheck, which is how this slipped the worktree's green run.
    function myBrokenHook(): never {
      throw new Error('boom');
    }
    manager.register('combat-start', myBrokenHook);

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    manager.fire(makeContext({ hookPoint: 'combat-start' }));

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('myBrokenHook'),
      expect.any(Error),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('combat-start'),
      expect.any(Error),
    );
    stderrSpy.mockRestore();
  });

  // F-9ba5f482: HookManager.fire() previously printed a raw hook name,
  // hookPoint string, and full Error/stack to a NON-debug player's terminal
  // unconditionally -- the one diagnostic call site in this domain with no
  // gate of any kind (contrast every other diagnostic in this domain, which
  // was already gated behind ImmersionRuntime's debugMode). debugMode now
  // defaults to false (mirroring ImmersionRuntime's own field), so a default
  // HookManager must stay silent on a hook throw.
  it('does not log a hook failure when debugMode is disabled (the default)', () => {
    const manager = new HookManager();
    function myBrokenHook(): never {
      throw new Error('boom');
    }
    manager.register('combat-start', myBrokenHook);

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const results = manager.fire(makeContext({ hookPoint: 'combat-start' }));
    stderrSpy.mockRestore();

    expect(stderrSpy).not.toHaveBeenCalled();
    // The isolation contract (F-8968741e) still holds — the throw is still
    // caught and skipped, just silently now.
    expect(results).toHaveLength(0);
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

    // locationId points to a zone that doesn't exist in the zones map. Spreads the
    // real engine's own world (F-0ad073b8) rather than hand-typing a whole WorldState
    // fragment -- only the one field this test deliberately breaks is overridden.
    const ctx = makeContext({
      hookPoint: 'enter-room',
      world: { ...engine.world, locationId: 'nonexistent-zone-xyz' },
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

    // F-0ad073b8: uses the real engine's own 'crypt-chamber' zone (tags: interior,
    // cursed, dark -- packages/starter-fantasy's actual content) instead of a
    // hand-typed 'Dark Crypt' zone fragment.
    const ctx = makeContext({
      hookPoint: 'enter-room',
      world: { ...engine.world, locationId: 'crypt-chamber' },
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
    // world.zone.entered (not any hp/defeat-shaped event). F-0ad073b8: mutates the
    // real engine's own player entity rather than hand-typing a WorldState fragment.
    engine.world.entities[engine.world.playerId].resources.hp = 0;
    const ctx = makeContext({
      hookPoint: 'death',
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

    // Real engine's player already starts at hp 20 > 0 (F-0ad073b8) -- no mutation needed.
    const ctx = makeContext({
      hookPoint: 'death',
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

// ─── F-f1e475f0: combatEndHook must also suppress the victory cue when the player's hp
// is independently zeroed (e.g. by a hazard reapplication) the same turn a *different*,
// non-player entity's combat.entity.defeated satisfies hasDefeat/isPlayerDefeatEvent's
// entity check. Without this, a non-player kill sharing a turn with a hazard-zeroed
// player hp plays the victory chime + soften cue immediately alongside deathHook's
// alarm — the exact composition F-91f803b2 closed, reopened through the one dispatch
// path (combatEndHook) that only checked isPlayerDefeatEvent, never isPlayerAtZeroHp. ───

describe('combatEndHook hazard-zeroed-hp suppression (F-f1e475f0)', () => {
  it('does not fire the victory cue when a non-player defeat coincides with the player already at zero hp', () => {
    const manager = new HookManager();
    registerBuiltinHooks(manager);

    // F-0ad073b8: mutates the real engine's own player entity rather than hand-typing
    // a WorldState fragment.
    engine.world.entities[engine.world.playerId].resources.hp = 0;
    const ctx = makeContext({
      hookPoint: 'combat-end',
      events: [{ type: 'combat.entity.defeated', tick: 1, payload: { entityId: 'goblin-1' } }] as any,
    });

    const results = manager.fire(ctx);
    expect(results).toHaveLength(0);
  });

  it('still fires the victory cue when a non-player entity is defeated and the player has positive hp', () => {
    const manager = new HookManager();
    registerBuiltinHooks(manager);

    // Real engine's player already starts at hp 20 > 0 (F-0ad073b8) -- no mutation needed.
    const ctx = makeContext({
      hookPoint: 'combat-end',
      events: [{ type: 'combat.entity.defeated', tick: 1, payload: { entityId: 'goblin-1' } }] as any,
    });

    const results = manager.fire(ctx);
    expect(results).toHaveLength(1);
    expect(results[0].sfxCues![0].effectId).toBe('ui_success');
  });
});

// ─── F-d9fc231c: combatEndHook must wait for the WHOLE encounter to end, not fire
// after every individual kill in a multi-hostile fight ───

describe('combatEndHook waits for the whole encounter (F-d9fc231c)', () => {
  // F-0ad073b8: adds a hostile entity into the real engine via its own
  // store.addEntity() (the same API world-gen.ts's NPC-add path uses) instead of
  // hand-typing a WorldState.entities bag.
  const addHostile = (id: string, hp: number, zoneId = engine.world.locationId): void => {
    engine.store.addEntity({
      id,
      blueprintId: id,
      type: 'enemy',
      name: 'Goblin',
      tags: ['hostile'],
      stats: {},
      resources: { hp },
      statuses: [],
      zoneId,
    });
  };

  it('does not fire the victory cue while another hostile is still alive in the same zone', () => {
    const manager = new HookManager();
    registerBuiltinHooks(manager);

    addHostile('goblin-1', 5);
    addHostile('goblin-2', 0);

    const ctx = makeContext({
      hookPoint: 'combat-end',
      events: [{ type: 'combat.entity.defeated', tick: 1, payload: { entityId: 'goblin-2' } }] as any,
    });

    const results = manager.fire(ctx);
    expect(results).toHaveLength(0);
  });

  it('fires the victory cue once the last hostile in the zone is defeated', () => {
    const manager = new HookManager();
    registerBuiltinHooks(manager);

    addHostile('goblin-1', 0);

    const ctx = makeContext({
      hookPoint: 'combat-end',
      events: [{ type: 'combat.entity.defeated', tick: 1, payload: { entityId: 'goblin-1' } }] as any,
    });

    const results = manager.fire(ctx);
    expect(results).toHaveLength(1);
    expect(results[0].sfxCues![0].effectId).toBe('ui_success');
  });

  it('ignores a hostile entity in a different zone when checking for survivors', () => {
    const manager = new HookManager();
    registerBuiltinHooks(manager);

    addHostile('goblin-1', 0);
    addHostile('bandit-1', 20, 'zone-far-away');

    const ctx = makeContext({
      hookPoint: 'combat-end',
      events: [{ type: 'combat.entity.defeated', tick: 1, payload: { entityId: 'goblin-1' } }] as any,
    });

    const results = manager.fire(ctx);
    expect(results).toHaveLength(1);
    expect(results[0].sfxCues![0].effectId).toBe('ui_success');
  });
});
