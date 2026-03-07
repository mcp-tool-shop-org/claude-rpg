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

describe('Built-in hooks', () => {
  it('should register all built-in hooks without error', () => {
    const manager = new HookManager();
    registerBuiltinHooks(manager);
    // Should have hooks for enter-room, combat-start, combat-end, npc-speaking, death
    // Fire them all to confirm no crashes
    manager.fire(makeContext({ hookPoint: 'enter-room' }));
    manager.fire(makeContext({ hookPoint: 'combat-start' }));
    manager.fire(makeContext({ hookPoint: 'combat-end' }));
    manager.fire(makeContext({ hookPoint: 'npc-speaking' }));
    manager.fire(makeContext({ hookPoint: 'death' }));
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
