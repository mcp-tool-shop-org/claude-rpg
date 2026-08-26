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
    // Inject a hook that throws. HookManager.register's real signature is
    // register(point: HookPoint, hook: Hook) — two positional args (hooks.ts).
    // (F-e2f0cd27: this previously passed a single settings object, which silently
    // stored the hook under a bogus key and never actually invoked it, so this test
    // exercised no crash path at all.)
    runtime.hookManager.register('pre-narration', () => {
      throw new Error('Hook exploded');
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

// ─── F-023ad9ad (Contract B, runtime-foundry half): game-core threads GameConfig's
// debug flag into `runtime.debugMode` where the runtime is constructed (game.ts,
// cross-domain — out of scope here). This domain's half is verifying the runtime side
// of that wiring actually produces diagnostic output once debugMode is set: all FOUR
// swallowed-error paths in processPresentation, not just the audio-pipeline one already
// covered above. ───

describe('immersion-runtime: debug diagnostics coverage (F-023ad9ad / Contract B)', () => {
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

  it('debug mode logs pre-narration hook errors to stderr', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    runtime.hookManager.register('pre-narration', () => {
      throw new Error('pre-narration exploded');
    });

    await runtime.processPresentation(
      minimalEngine,
      [{ type: 'world.zone.entered', payload: {} } as any],
      'look',
    );

    expect(stderrSpy).toHaveBeenCalledWith(
      '[immersion] Pre-narration hook error (degrading to silence):',
      expect.any(Error),
    );
    stderrSpy.mockRestore();
  });

  it('debug mode logs event-hook errors (e.g. enter-room) to stderr', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    runtime.hookManager.register('enter-room', () => {
      throw new Error('enter-room exploded');
    });

    await runtime.processPresentation(
      minimalEngine,
      [{ type: 'world.zone.entered', payload: {} } as any],
      'move',
    );

    expect(stderrSpy).toHaveBeenCalledWith(
      '[immersion] Hook error (degrading to silence):',
      expect.any(Error),
    );
    stderrSpy.mockRestore();
  });

  it('debug mode logs post-narration hook errors to stderr', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    runtime.hookManager.register('post-narration', () => {
      throw new Error('post-narration exploded');
    });

    await runtime.processPresentation(minimalEngine, [], 'look');

    expect(stderrSpy).toHaveBeenCalledWith(
      '[immersion] Post-narration hook error:',
      expect.any(Error),
    );
    stderrSpy.mockRestore();
  });
});

// ─── F-aaaf50d9: transition() itself performs no logging of any kind, and
// processPresentation's sole call site (`this.stateMachine.transition(...)`) discards
// the returned StateTransition entirely — so no code path anywhere in this domain, even
// under --debug, ever surfaces which state a turn transitioned to/from and why. ───

describe('immersion-runtime: state transition debug logging (F-aaaf50d9)', () => {
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

  it('logs the state transition to stderr when debugMode is enabled and the state actually changes', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // exploration -> dialogue via the 'speak' verb (no events needed).
    await runtime.processPresentation(minimalEngine, [], 'speak');

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('exploration -> dialogue'));
    stderrSpy.mockRestore();
  });

  it('does not log a transition when debugMode is disabled', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = false;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runtime.processPresentation(minimalEngine, [], 'speak');

    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it('does not log anything when the inferred state is unchanged from the prior state', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Starts in 'exploration'; 'look' with no events also infers 'exploration' -> no
    // transition, so nothing should be logged.
    await runtime.processPresentation(minimalEngine, [], 'look');

    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it('also logs the sibling transition() call site in initialize() (session-restore)', () => {
    // Family-of-call-sites: initialize() has its own `this.stateMachine.transition(...)`
    // that discarded its result the same way processPresentation's did, so a save
    // restored mid-combat was equally undiagnosable under --debug.
    const world = {
      playerId: 'p1',
      locationId: 'z1',
      entities: { p1: { name: 'Hero', resources: { hp: 10 }, statuses: [] } },
      zones: { z1: { name: 'Town', neighbors: [] } },
      factions: {},
      modules: { 'combat-core': { inCombat: true, combatants: ['goblin-1'] } },
    } as any;
    const engine = { world, store: { state: {} } } as any;

    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    runtime.initialize(engine);

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('exploration -> combat (session-restore)'),
    );
    stderrSpy.mockRestore();
  });
});

// ─── F-23bce472: processPresentation fires the 'post-narration' hookPoint every turn
// but never captured or read the returned HookResult[] -- unlike its 'pre-narration'
// sibling, which is captured into `preResults` and consumed by mergeHookResults. A
// future contributor who registers the first post-narration hook (a reasonable
// extension given pre-narration's parallel structure) would have its return value
// silently discarded with no error or warning. ───

describe('immersion-runtime: post-narration hook results are no longer silently discarded (F-23bce472)', () => {
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

  it('debug mode surfaces a post-narration hook result that has nothing consuming it yet', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    runtime.hookManager.register('post-narration', () => ({
      sfxCues: [{ effectId: 'future-cue', timing: 'immediate' as const, intensity: 0.5 }],
    }));

    await runtime.processPresentation(minimalEngine, [], 'look');

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('post-narration'),
      expect.anything(),
    );
    stderrSpy.mockRestore();
  });

  it('does not log anything for post-narration when no hook is registered (today\'s production shape)', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runtime.processPresentation(minimalEngine, [], 'look');

    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it('does not log the post-narration result when debugMode is disabled', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = false;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    runtime.hookManager.register('post-narration', () => ({
      sfxCues: [{ effectId: 'future-cue', timing: 'immediate' as const, intensity: 0.5 }],
    }));

    await runtime.processPresentation(minimalEngine, [], 'look');

    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});

// ─── F-0acb03fe: combat-start hookpoint fires once per fight, not every turn ───

describe('immersion-runtime: combat-start dispatch (F-0acb03fe)', () => {
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

  it('fires combat-start only on the turn combat begins, not on every ongoing-combat turn', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const fireSpy = vi.spyOn(runtime.hookManager, 'fire');
    // Combat events recur every turn a fight is ongoing (e.g. a contact/hit event each
    // round) — this is what previously made `events.some(startsWith('combat.'))` true
    // on every turn, not just the turn combat was entered.
    const combatEvents = [{ type: 'combat.contact.hit', payload: {} }] as any;

    // Turn 1: entering combat for the first time this fight
    await runtime.processPresentation(minimalEngine, combatEvents, 'attack');
    const turn1CombatStarts = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'combat-start');
    expect(turn1CombatStarts).toHaveLength(1);

    fireSpy.mockClear();

    // Turn 2: still mid-fight. combat-start must NOT re-fire — it's meant to play a
    // one-time warning SFX and intensify music on combat start, not every turn.
    await runtime.processPresentation(minimalEngine, combatEvents, 'attack');
    const turn2CombatStarts = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'combat-start');
    expect(turn2CombatStarts).toHaveLength(0);
  });
});

// ─── F-ed267860: aftermath countdown must actually decrement via the real engine tick ───

describe('immersion-runtime: aftermath countdown wedge (F-ed267860)', () => {
  const minimalWorld = {
    playerId: 'p1',
    locationId: 'z1',
    entities: { p1: { name: 'Hero', resources: { hp: 10 }, statuses: [] } },
    zones: { z1: { name: 'Town', neighbors: [] } },
    factions: {},
  } as any;

  it('drains aftermathTurns to exploration across consecutive no-combat turns via processPresentation, not a hand-fed tick', async () => {
    // Unlike presentation-state.test.ts's T-010 (which calls inferFromEvents directly
    // with hand-incremented tick args), this drives the actual production call path —
    // processPresentation — through an engine whose `tick` getter genuinely advances,
    // mirroring how the real Engine behaves. Before the fix, the call site never read
    // engine.tick at all, so the guard's `tick ?? -2` sentinel was the same constant on
    // every call and the countdown wedged after its first decrement.
    let currentTick = 1;
    const engine = {
      world: minimalWorld,
      store: { state: {} },
      get tick() {
        return currentTick;
      },
    } as any;

    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });

    // Turn 1: a kill ends combat -> aftermathTurns = 2, state = 'aftermath'.
    await runtime.processPresentation(
      engine,
      [{ type: 'combat.entity.defeated', payload: { entityId: 'goblin-1' } }] as any,
      'attack',
    );
    expect(runtime.stateMachine.current).toBe('aftermath');

    // Turns 2 and 3: no combat/dialogue events, and the engine's tick genuinely advances
    // each turn (as it does in production) -> the countdown must actually reach 0.
    currentTick = 2;
    await runtime.processPresentation(engine, [], 'wait');
    expect(runtime.stateMachine.current).toBe('aftermath'); // 2 -> 1

    currentTick = 3;
    await runtime.processPresentation(engine, [], 'wait');
    expect(runtime.stateMachine.current).toBe('exploration'); // 1 -> 0
  });
});

// ─── F-f13b58f3: presentation state seeded from persisted combat-core state on load ───

describe('immersion-runtime: presentation state seeded on initialize (F-f13b58f3)', () => {
  const makeWorld = (modules: Record<string, unknown>) =>
    ({
      playerId: 'p1',
      locationId: 'z1',
      entities: { p1: { name: 'Hero', resources: { hp: 10 }, statuses: [] } },
      zones: { z1: { name: 'Town', neighbors: [] } },
      factions: {},
      modules,
    }) as any;

  it('does not replay the combat-start hook after loading a save that was mid-combat', async () => {
    // Simulates a session restored from a save made mid-fight: the engine's own
    // combat-core module namespace (registered via ctx.persistence.registerNamespace in
    // node_modules/@ai-rpg-engine/modules/dist/combat-core.js) still shows inCombat: true,
    // even though this freshly-constructed ImmersionRuntime has never seen a combat event.
    const world = makeWorld({ 'combat-core': { inCombat: true, combatants: ['goblin-1'] } });
    const engine = { world, store: { state: {} } } as any;

    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.initialize(engine);

    const fireSpy = vi.spyOn(runtime.hookManager, 'fire');

    // The player's next action re-derives 'combat' from this turn's fresh events, exactly
    // like a fight that's still ongoing after the reload.
    const combatEvents = [{ type: 'combat.contact.hit', payload: {} }] as any;
    await runtime.processPresentation(engine, combatEvents, 'attack');

    const combatStarts = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'combat-start');
    expect(combatStarts).toHaveLength(0);
  });

  it('still fires combat-start once for a genuinely fresh fight with no persisted combat state (F-0acb03fe non-regression)', async () => {
    const world = makeWorld({});
    const engine = { world, store: { state: {} } } as any;

    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.initialize(engine);

    const fireSpy = vi.spyOn(runtime.hookManager, 'fire');
    const combatEvents = [{ type: 'combat.contact.hit', payload: {} }] as any;
    await runtime.processPresentation(engine, combatEvents, 'attack');

    const combatStarts = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'combat-start');
    expect(combatStarts).toHaveLength(1);
  });
});

// ─── F-6ef6e5a0: death's fade-out uiEffect must actually reach the bridge, not
// just be present on the hook's raw (unconsumed) return value ───

describe('immersion-runtime: death uiEffects dispatch (F-6ef6e5a0)', () => {
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

  it('dispatches the death fade-out through bridge.applyUiEffect on a player death', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const applyUiEffectSpy = vi.spyOn(runtime.bridge, 'applyUiEffect');

    await runtime.processPresentation(
      minimalEngine,
      [{ type: 'combat.entity.defeated', payload: { entityId: 'p1' } }] as any,
      'attack',
    );

    expect(applyUiEffectSpy).toHaveBeenCalledWith({ type: 'fade-out', durationMs: 2000, color: '#000' });
  });
});

// ─── F-4ece453e: narrator-authored uiEffects (the NarrationPlan path, not the
// hook path) must actually reach the bridge. Unlike F-6ef6e5a0's hook-sourced
// uiEffects, these are populated by the LLM narrator every turn (see the live
// NARRATE_SYSTEM prompt's uiEffects schema, prompts/narrate-scene.ts) and were
// routed exclusively through audioDirector.schedule()/executeCommands() —
// @ai-rpg-engine/audio-director's AudioDomain type has no 'ui' member and
// scheduleAll() never reads plan.uiEffects, so they were silently dropped. ───

describe('immersion-runtime: narrationPlan uiEffects dispatch (F-4ece453e)', () => {
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

  it('dispatches a narrator-authored flash effect through bridge.applyUiEffect and into the returned McpToolCall[]', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: true, voiceEnabled: false });
    const applyUiEffectSpy = vi.spyOn(runtime.bridge, 'applyUiEffect');

    const narrationPlan = {
      sceneText: '',
      sfx: [],
      ambientLayers: [],
      uiEffects: [{ type: 'flash', durationMs: 200 }],
      musicCue: undefined,
    } as any;

    const calls = await runtime.processPresentation(minimalEngine, [], 'look', narrationPlan);

    expect(applyUiEffectSpy).toHaveBeenCalledWith({ type: 'flash', durationMs: 200 });
    const uiEffectCalls = calls.filter((c) => c.tool === '__ui_effect_intent__');
    expect(uiEffectCalls).toHaveLength(1);
    expect(uiEffectCalls[0].params).toMatchObject({ type: 'flash', durationMs: 200 });
  });

  it('caps dispatched uiEffects per plan so a malformed LLM plan cannot flood the terminal', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: true, voiceEnabled: false });
    const applyUiEffectSpy = vi.spyOn(runtime.bridge, 'applyUiEffect');

    const narrationPlan = {
      sceneText: '',
      sfx: [],
      ambientLayers: [],
      uiEffects: [
        { type: 'flash', durationMs: 100 },
        { type: 'shake', durationMs: 100 },
        { type: 'border-pulse', durationMs: 100 },
        { type: 'flash', durationMs: 100 },
        { type: 'shake', durationMs: 100 },
      ],
      musicCue: undefined,
    } as any;

    const calls = await runtime.processPresentation(minimalEngine, [], 'look', narrationPlan);

    expect(applyUiEffectSpy).toHaveBeenCalledTimes(3);
    const uiEffectCalls = calls.filter((c) => c.tool === '__ui_effect_intent__');
    expect(uiEffectCalls).toHaveLength(3);
  });
});

// ─── F-52475879: mergeHookResults built sfx/ambientLayers with no size cap, unlike the
// sibling uiEffects field on the exact same NarrationPlan (capped at
// MAX_UI_EFFECTS_PER_PLAN = 3, F-4ece453e/F-6ef6e5a0, above). sfx/ambientLayers are
// populated by the same per-turn LLM narrator call as uiEffects, under the same
// prose-only "use sparingly" guidance — not a schema-enforced limit — so a malformed
// narrator response that goes wide on sfx/ambient cues must not flood the audio
// pipeline in a single turn. ───

describe('immersion-runtime: sfx/ambientLayers cap (F-52475879)', () => {
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

  it('caps the sfx array passed to audioDirector.schedule so an oversized narrator plan cannot flood the pipeline', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const scheduleSpy = vi.spyOn(runtime.audioDirector, 'schedule');

    const narrationPlan = {
      sceneText: '',
      sfx: Array.from({ length: 10 }, (_, i) => ({
        effectId: `sfx-${i}`,
        timing: 'immediate' as const,
        intensity: 0.5,
      })),
      ambientLayers: [],
      uiEffects: [],
      musicCue: undefined,
    } as any;

    await runtime.processPresentation(minimalEngine, [], 'look', narrationPlan);

    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    const scheduledPlan = scheduleSpy.mock.calls[0][0];
    expect(scheduledPlan.sfx.length).toBeLessThan(10);
    expect(scheduledPlan.sfx.length).toBeGreaterThan(0);
  });

  it('caps the ambientLayers array passed to audioDirector.schedule so an oversized narrator plan cannot flood the pipeline', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const scheduleSpy = vi.spyOn(runtime.audioDirector, 'schedule');

    const narrationPlan = {
      sceneText: '',
      sfx: [],
      ambientLayers: Array.from({ length: 10 }, (_, i) => ({
        layerId: `ambient-${i}`,
        action: 'crossfade' as const,
        volume: 0.4,
        fadeMs: 1000,
      })),
      uiEffects: [],
      musicCue: undefined,
    } as any;

    await runtime.processPresentation(minimalEngine, [], 'look', narrationPlan);

    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    const scheduledPlan = scheduleSpy.mock.calls[0][0];
    expect(scheduledPlan.ambientLayers.length).toBeLessThan(10);
    expect(scheduledPlan.ambientLayers.length).toBeGreaterThan(0);
  });

  it('still includes hook-sourced sfx cues within the cap alongside narrator-authored ones', async () => {
    // mergeHookResults folds pre-narration hook cues into plan.sfx BEFORE capping, the
    // same ordering already used for uiEffects -- so hook-sourced cues count toward the
    // cap too, not just narrator-authored ones.
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.hookManager.register('pre-narration', () => ({
      sfxCues: [{ effectId: 'hook-sfx', timing: 'immediate' as const, intensity: 0.5 }],
    }));
    const scheduleSpy = vi.spyOn(runtime.audioDirector, 'schedule');

    const narrationPlan = {
      sceneText: '',
      sfx: Array.from({ length: 10 }, (_, i) => ({
        effectId: `sfx-${i}`,
        timing: 'immediate' as const,
        intensity: 0.5,
      })),
      ambientLayers: [],
      uiEffects: [],
      musicCue: undefined,
    } as any;

    await runtime.processPresentation(minimalEngine, [], 'look', narrationPlan);

    const scheduledPlan = scheduleSpy.mock.calls[0][0];
    expect(scheduledPlan.sfx.length).toBeLessThan(11);
  });
});

// ─── F-91f803b2: combat-end's victory cue must not fire on a player-death turn ───

describe('immersion-runtime: combat-end suppressed on player death (F-91f803b2)', () => {
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

  it('does not play the ui_success victory chime when the player is the defeated entity', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const playSfxSpy = vi.spyOn(runtime.bridge, 'playSfx');

    await runtime.processPresentation(
      minimalEngine,
      [{ type: 'combat.entity.defeated', payload: { entityId: 'p1' } }] as any,
      'attack',
    );

    const effectIds = playSfxSpy.mock.calls.map(([cue]) => cue.effectId);
    expect(effectIds).not.toContain('ui_success');
    expect(effectIds).toContain('alert_critical');
  });

  it('still plays the ui_success victory chime when a non-player entity is defeated', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const playSfxSpy = vi.spyOn(runtime.bridge, 'playSfx');

    await runtime.processPresentation(
      minimalEngine,
      [{ type: 'combat.entity.defeated', payload: { entityId: 'goblin-1' } }] as any,
      'attack',
    );

    const effectIds = playSfxSpy.mock.calls.map(([cue]) => cue.effectId);
    expect(effectIds).toContain('ui_success');
    expect(effectIds).not.toContain('alert_critical');
  });
});

// ─── F-e57d6a60: a hazard death (hp -> 0, zero matching events) must still reach
// death presentation — the entire death-presentation system used to key exclusively
// on combat.entity.defeated, which world-gen.ts's environment-hazard effect never
// emits (it mutates hp by direct property assignment and returns no events). ───

describe('immersion-runtime: hazard death with no defeat event (F-e57d6a60)', () => {
  it('engages death presentation (state -> menu, critical alarm dispatched) when hp reaches zero with no defeat event', async () => {
    const world = {
      playerId: 'p1',
      locationId: 'z1',
      entities: { p1: { name: 'Hero', resources: { hp: 0 }, statuses: [] } },
      zones: { z1: { name: 'Hazard Bog', neighbors: [] } },
      factions: {},
    } as any;
    const engine = { world, store: { state: {} } } as any;

    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const playSfxSpy = vi.spyOn(runtime.bridge, 'playSfx');

    await runtime.processPresentation(
      engine,
      [{ type: 'world.zone.entered', payload: {} }] as any,
      'move',
    );

    expect(runtime.stateMachine.current).toBe('menu');
    const effectIds = playSfxSpy.mock.calls.map(([cue]) => cue.effectId);
    expect(effectIds).toContain('alert_critical');
  });
});
