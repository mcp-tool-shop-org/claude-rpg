import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImmersionRuntime } from './immersion-runtime.js';

// ─── PFE-008: Audio/hook errors degrade to silence ─────────

describe('immersion-runtime: error resilience', () => {
  let runtime: ImmersionRuntime;

  // Minimal stubs
  const minimalWorld = {
    playerId: 'p1',
    locationId: 'z1',
    entities: { p1: { name: 'Hero', resources: { hp: 10 }, statuses: [] } },
    zones: { z1: { name: 'Town', neighbors: [] } },
    factions: {},
  } as any;

  const minimalEngine = {
    world: minimalWorld,
    store: { state: {} },
  } as any;

  beforeEach(() => {
    runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
  });

  it('processPresentation survives hook errors without throwing', async () => {
    // Inject a hook that throws
    runtime.hookManager.register({
      hookPoint: 'pre-narration',
      id: 'crash-hook',
      priority: 0,
      handler: () => { throw new Error('Hook exploded'); },
    });

    // Should not throw — degrades to silence
    const calls = await runtime.processPresentation(
      minimalEngine,
      [{ type: 'world.zone.entered', payload: {} } as any],
      'look',
    );
    expect(Array.isArray(calls)).toBe(true);
  });

  it('processPresentation survives audio pipeline errors', async () => {
    // Make the bridge throw during command execution
    vi.spyOn(runtime.bridge, 'executeCommands').mockRejectedValue(new Error('Audio crash'));

    const narrationPlan = {
      segments: [],
      sfx: [],
      ambientLayers: [],
      uiEffects: [],
      musicCue: undefined,
    } as any;

    const calls = await runtime.processPresentation(
      minimalEngine,
      [],
      'look',
      narrationPlan,
    );
    expect(Array.isArray(calls)).toBe(true);
  });

  it('debug mode logs audio errors to stderr', async () => {
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.spyOn(runtime.bridge, 'executeCommands').mockRejectedValue(new Error('Audio crash'));

    const narrationPlan = {
      segments: [],
      sfx: [],
      ambientLayers: [],
      uiEffects: [],
      musicCue: undefined,
    } as any;

    await runtime.processPresentation(minimalEngine, [], 'look', narrationPlan);
    expect(stderrSpy).toHaveBeenCalledWith(
      '[immersion] Audio pipeline error (degrading to silence):',
      expect.any(Error),
    );

    stderrSpy.mockRestore();
  });

  it('non-debug mode does not log audio errors', async () => {
    runtime.debugMode = false;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.spyOn(runtime.bridge, 'executeCommands').mockRejectedValue(new Error('Audio crash'));

    const narrationPlan = {
      segments: [],
      sfx: [],
      ambientLayers: [],
      uiEffects: [],
      musicCue: undefined,
    } as any;

    await runtime.processPresentation(minimalEngine, [], 'look', narrationPlan);
    expect(stderrSpy).not.toHaveBeenCalled();

    stderrSpy.mockRestore();
  });
});
