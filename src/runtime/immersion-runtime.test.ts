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

// ─── F-3fce4373: non-debug players get a distinguishable marker instead of pure
// silence when a presentation-pipeline stage throws and degrades. All four of
// processPresentation's guarded stages (pre-narration hooks, event hooks, audio
// pipeline, post-narration hooks) previously surfaced a failure ONLY via a
// console.error gated on debugMode -- the returned McpToolCall[] just quietly had
// fewer entries, with no way for a non-debug player (the default) to tell "no cue
// this turn" from "a cue was computed and then silently dropped". ───

describe('immersion-runtime: non-debug degradation markers (F-3fce4373)', () => {
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

  it('pushes a degraded marker into the returned calls when a pre-narration hook throws, even without debugMode', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = false;
    runtime.hookManager.register('pre-narration', () => {
      throw new Error('Hook exploded');
    });

    const calls = await runtime.processPresentation(
      minimalEngine,
      [{ type: 'world.zone.entered', payload: {} } as any],
      'look',
    );

    const markers = calls.filter((c) => c.tool === '__presentation_degraded__');
    expect(markers).toHaveLength(1);
    expect(markers[0].params).toMatchObject({ stage: 'pre-narration' });
  });

  it('pushes a degraded marker when an event hook throws', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = false;
    runtime.hookManager.register('enter-room', () => {
      throw new Error('enter-room exploded');
    });

    const calls = await runtime.processPresentation(
      minimalEngine,
      [{ type: 'world.zone.entered', payload: {} } as any],
      'move',
    );

    const markers = calls.filter((c) => c.tool === '__presentation_degraded__');
    expect(markers).toHaveLength(1);
    expect(markers[0].params).toMatchObject({ stage: 'event-hooks' });
  });

  it('pushes a degraded marker when the audio pipeline throws', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = false;
    vi.spyOn(runtime.bridge, 'executeCommands').mockRejectedValue(new Error('Audio crash'));

    const narrationPlan = {
      segments: [],
      sfx: [],
      ambientLayers: [],
      uiEffects: [],
      musicCue: undefined,
    } as any;

    const calls = await runtime.processPresentation(minimalEngine, [], 'look', narrationPlan);

    const markers = calls.filter((c) => c.tool === '__presentation_degraded__');
    expect(markers).toHaveLength(1);
    expect(markers[0].params).toMatchObject({ stage: 'audio' });
  });

  it('pushes a degraded marker when a post-narration hook throws', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = false;
    runtime.hookManager.register('post-narration', () => {
      throw new Error('post-narration exploded');
    });

    const calls = await runtime.processPresentation(minimalEngine, [], 'look');

    const markers = calls.filter((c) => c.tool === '__presentation_degraded__');
    expect(markers).toHaveLength(1);
    expect(markers[0].params).toMatchObject({ stage: 'post-narration' });
  });

  it('does not push a marker on a clean turn with no errors', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = false;

    const calls = await runtime.processPresentation(minimalEngine, [], 'look');

    const markers = calls.filter((c) => c.tool === '__presentation_degraded__');
    expect(markers).toHaveLength(0);
  });

  it('still pushes the marker in debug mode too (marker is unconditional, not a debug-only feature)', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(runtime.bridge, 'executeCommands').mockRejectedValue(new Error('Audio crash'));

    const narrationPlan = {
      segments: [], sfx: [], ambientLayers: [], uiEffects: [], musicCue: undefined,
    } as any;

    const calls = await runtime.processPresentation(minimalEngine, [], 'look', narrationPlan);

    const markers = calls.filter((c) => c.tool === '__presentation_degraded__');
    expect(markers).toHaveLength(1);
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

// ─── F-4ec3609b / F-961f14aa: presentation-state ordering contract. executeTurn used
// to read stateMachine.current for narration BEFORE processPresentation() inferred and
// transitioned this turn's state, so narration saw the PREVIOUS turn's presentation
// state (e.g. still 'exploration' on the very turn combat began). ImmersionRuntime's
// half of the fix: inferAndTransition() lets a caller run this turn's inference +
// transition in isolation and read back the NEW state immediately, while
// processPresentation() must stay idempotent-safe if called afterward for the same
// turn -- reusing that already-computed transition instead of re-inferring, so
// justEnteredCombat-gated hooks (combat-start) still fire exactly once per fight. ───

describe('immersion-runtime: inferAndTransition / processPresentation ordering contract (F-4ec3609b)', () => {
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
    tick: 1,
  } as any;

  it('returns the NEW state immediately on a combat-entry turn, before processPresentation runs', () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    expect(runtime.stateMachine.current).toBe('exploration');

    const combatEvents = [{ type: 'combat.contact.hit', payload: {} }] as any;
    const result = runtime.inferAndTransition(minimalEngine, combatEvents, 'attack');

    // The caller (turn-loop.ts's executeTurn) reads this return value -- and
    // stateMachine.current, which must already agree -- to build narration context.
    // Before this method existed, a bare `stateMachine.current` read at this point in
    // the turn would still say 'exploration'.
    // F-f3781f2a/SLATE-6: broadened from a bare PresentationState to the full
    // {from, to, trigger} StateTransition -- `.to` is what callers previously got back
    // directly; `.from` is what a death-framing consumer additionally needs to derive
    // the death edge (`to === 'menu' && from !== 'menu'`) without a second mechanism.
    expect(result).toEqual({ from: 'exploration', to: 'combat', trigger: 'attack' });
    expect(runtime.stateMachine.current).toBe('combat');
  });

  it('does not double-fire combat-start when inferAndTransition runs before processPresentation for the same turn', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const fireSpy = vi.spyOn(runtime.hookManager, 'fire');
    const combatEvents = [{ type: 'combat.contact.hit', payload: {} }] as any;

    // Mirrors the fixed call order: the caller infers+transitions first (for
    // narration), THEN processPresentation runs with the same engine/events/verb.
    const inferred = runtime.inferAndTransition(minimalEngine, combatEvents, 'attack');
    expect(inferred).toEqual({ from: 'exploration', to: 'combat', trigger: 'attack' });

    await runtime.processPresentation(minimalEngine, combatEvents, 'attack');

    const combatStarts = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'combat-start');
    // Exactly one dispatch for the fight's actual start -- zero would mean
    // processPresentation lost track of the transition that already happened; two
    // would mean it re-inferred and transitioned a second time.
    expect(combatStarts).toHaveLength(1);
  });

  it('does not re-fire combat-start on a second mid-fight turn when both calls precede processPresentation each turn', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const fireSpy = vi.spyOn(runtime.hookManager, 'fire');
    const combatEvents = [{ type: 'combat.contact.hit', payload: {} }] as any;

    // Turn 1: combat begins.
    runtime.inferAndTransition(minimalEngine, combatEvents, 'attack');
    await runtime.processPresentation(minimalEngine, combatEvents, 'attack');
    fireSpy.mockClear();

    // Turn 2: still mid-fight, same ordered pair of calls as turn 1.
    runtime.inferAndTransition(minimalEngine, combatEvents, 'attack');
    await runtime.processPresentation(minimalEngine, combatEvents, 'attack');

    const combatStarts = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'combat-start');
    expect(combatStarts).toHaveLength(0);
  });

  it('calls stateMachine.transition at most once per turn when inferAndTransition precedes processPresentation', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const transitionSpy = vi.spyOn(runtime.stateMachine, 'transition');
    const combatEvents = [{ type: 'combat.contact.hit', payload: {} }] as any;

    runtime.inferAndTransition(minimalEngine, combatEvents, 'attack');
    await runtime.processPresentation(minimalEngine, combatEvents, 'attack');

    expect(transitionSpy).toHaveBeenCalledTimes(1);
  });

  it('preserves the mid-combat restore skip when inferAndTransition precedes processPresentation (F-f13b58f3 non-regression)', async () => {
    const world = {
      playerId: 'p1',
      locationId: 'z1',
      entities: { p1: { name: 'Hero', resources: { hp: 10 }, statuses: [] } },
      zones: { z1: { name: 'Town', neighbors: [] } },
      factions: {},
      modules: { 'combat-core': { inCombat: true, combatants: ['goblin-1'] } },
    } as any;
    const engine = { world, store: { state: {} }, tick: 1 } as any;

    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.initialize(engine); // seeds stateMachine.current = 'combat' via session-restore

    const fireSpy = vi.spyOn(runtime.hookManager, 'fire');
    const combatEvents = [{ type: 'combat.contact.hit', payload: {} }] as any;

    // Same ordered pair as production: the caller infers+transitions before building
    // narration context, then processPresentation runs.
    const inferred = runtime.inferAndTransition(engine, combatEvents, 'attack');
    // Already 'combat' going in (session-restore seed) and still 'combat' coming out --
    // from === to here, unlike the combat-entry case above, and the shape must still hold.
    expect(inferred).toEqual({ from: 'combat', to: 'combat', trigger: 'attack' });
    await runtime.processPresentation(engine, combatEvents, 'attack');

    const combatStarts = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'combat-start');
    expect(combatStarts).toHaveLength(0);
  });

  it('falls back to its own inference + transition when processPresentation runs without a preceding inferAndTransition (backward compatibility)', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const fireSpy = vi.spyOn(runtime.hookManager, 'fire');
    const combatEvents = [{ type: 'combat.contact.hit', payload: {} }] as any;

    await runtime.processPresentation(minimalEngine, combatEvents, 'attack');

    expect(runtime.stateMachine.current).toBe('combat');
    const combatStarts = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'combat-start');
    expect(combatStarts).toHaveLength(1);
  });
});

// ─── F-f3781f2a / SLATE-6: death dispatch must be EDGE-triggered off the state
// machine's own from/to transition, not LEVEL-triggered off a raw
// isPlayerDefeatEvent(...) || isPlayerAtZeroHp(...) OR-check -- the old gate re-fired
// the 'death' hookPoint every subsequent turn the player's hp stayed at/below zero.
// inferAndTransition() itself is broadened to return the full {from, to, trigger}
// StateTransition (not just `to`) so a death-framing consumer (game-core) can derive
// the same edge this fix uses internally: `justDied = to === 'menu' && from !== 'menu'`. ───

describe('immersion-runtime: inferAndTransition return shape + edge-triggered death gate (F-f3781f2a/SLATE-6)', () => {
  const makeWorld = (hp: number) =>
    ({
      playerId: 'p1',
      locationId: 'z1',
      entities: { p1: { name: 'Hero', resources: { hp }, statuses: [] } },
      zones: { z1: { name: 'Town', neighbors: [] } },
      factions: {},
    }) as any;

  it('inferAndTransition returns a {from, to, trigger} StateTransition on a death turn', () => {
    const world = makeWorld(10);
    const engine = { world, store: { state: {} }, tick: 1 } as any;
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });

    // Get into 'combat' first so `from` is observably not the initial 'exploration'
    // default -- matches the routed finding's test sketch shape
    // {from:'combat',to:'menu',trigger:'attack'}.
    runtime.inferAndTransition(engine, [{ type: 'combat.contact.hit', payload: {} }] as any, 'attack');
    expect(runtime.stateMachine.current).toBe('combat');

    engine.tick = 2;
    const result = runtime.inferAndTransition(
      engine,
      [{ type: 'combat.entity.defeated', payload: { entityId: 'p1' } }] as any,
      'attack',
    );

    expect(result).toEqual({ from: 'combat', to: 'menu', trigger: 'attack' });
    expect(runtime.stateMachine.current).toBe('menu');
  });

  it('fires the death hookPoint exactly once on the turn death is entered', async () => {
    const world = makeWorld(10);
    const engine = { world, store: { state: {} }, tick: 1 } as any;
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const fireSpy = vi.spyOn(runtime.hookManager, 'fire');

    await runtime.processPresentation(
      engine,
      [{ type: 'combat.entity.defeated', payload: { entityId: 'p1' } }] as any,
      'attack',
    );

    expect(runtime.stateMachine.current).toBe('menu');
    const deathFires = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'death');
    expect(deathFires).toHaveLength(1);
  });

  it('does NOT re-fire the death hookPoint on a second consecutive turn with hp still 0 and no new defeat event (repeat-fire regression)', async () => {
    const world = makeWorld(0); // player already at 0 hp -- hazard-style death, no event needed (F-e57d6a60)
    const engine = { world, store: { state: {} }, tick: 1 } as any;
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const fireSpy = vi.spyOn(runtime.hookManager, 'fire');

    // Turn 1: hp is already 0 with no defeat event at all -- isPlayerAtZeroHp alone
    // resolves hasDeath, mirroring F-e57d6a60's hazard-death path.
    await runtime.processPresentation(engine, [], 'wait');
    expect(runtime.stateMachine.current).toBe('menu');
    let deathFires = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'death');
    expect(deathFires).toHaveLength(1);
    fireSpy.mockClear();

    // Turn 2: hp is STILL 0 (nothing revived the player) and there's still no new
    // defeat event. The OLD level-triggered gate (isPlayerDefeatEvent || isPlayerAtZeroHp)
    // would re-fire here every turn indefinitely; the new edge-triggered gate must not,
    // because priorState is already 'menu' going into this turn.
    engine.tick = 2;
    await runtime.processPresentation(engine, [], 'wait');
    expect(runtime.stateMachine.current).toBe('menu');
    deathFires = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'death');
    expect(deathFires).toHaveLength(0);
  });

  it('fires the death hookPoint again on a fresh death after an intervening non-menu turn', async () => {
    const world = makeWorld(0);
    const engine = { world, store: { state: {} }, tick: 1 } as any;
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const fireSpy = vi.spyOn(runtime.hookManager, 'fire');

    // Turn 1: initial death.
    await runtime.processPresentation(engine, [], 'wait');
    expect(runtime.stateMachine.current).toBe('menu');
    fireSpy.mockClear();

    // Intervening turn: the player is revived (hp restored above 0) and no death
    // signal fires, so the state machine leaves 'menu'.
    world.entities.p1.resources.hp = 10;
    engine.tick = 2;
    await runtime.processPresentation(
      engine,
      [{ type: 'world.zone.entered', payload: {} }] as any,
      'look',
    );
    expect(runtime.stateMachine.current).not.toBe('menu');
    const deathFiresAfterRevive = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'death');
    expect(deathFiresAfterRevive).toHaveLength(0);
    fireSpy.mockClear();

    // Turn 3: a fresh, later death must fire the hookPoint again -- the edge-triggered
    // gate must not have "used up" its one firing permanently.
    engine.tick = 3;
    await runtime.processPresentation(
      engine,
      [{ type: 'combat.entity.defeated', payload: { entityId: 'p1' } }] as any,
      'attack',
    );
    expect(runtime.stateMachine.current).toBe('menu');
    const deathFiresOnFreshDeath = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'death');
    expect(deathFiresOnFreshDeath).toHaveLength(1);
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

// ─── F-d9fc231c: combat-end's victory cue must wait for the WHOLE encounter to end,
// not fire after every individual kill in a multi-enemy fight — and fireEventHooks'
// dispatch condition itself must not even fire the combat-end hookPoint while hostiles
// remain. ───

describe('immersion-runtime: combat-end waits for the whole encounter (F-d9fc231c)', () => {
  it('does not play the victory chime / soften music when other hostiles are still alive', async () => {
    const world = {
      playerId: 'p1',
      locationId: 'z1',
      entities: {
        p1: { name: 'Hero', resources: { hp: 10 }, statuses: [], tags: [] },
        'goblin-1': { name: 'Goblin', resources: { hp: 5 }, statuses: [], tags: ['hostile'], zoneId: 'z1' },
        'goblin-2': { name: 'Goblin', resources: { hp: 0 }, statuses: [], tags: ['hostile'], zoneId: 'z1' },
      },
      zones: { z1: { name: 'Town', neighbors: [] } },
      factions: {},
    } as any;
    const engine = { world, store: { state: {} } } as any;

    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const playSfxSpy = vi.spyOn(runtime.bridge, 'playSfx');
    const setMusicSpy = vi.spyOn(runtime.bridge, 'setMusic');

    await runtime.processPresentation(
      engine,
      [{ type: 'combat.entity.defeated', payload: { entityId: 'goblin-2' } }] as any,
      'attack',
    );

    const effectIds = playSfxSpy.mock.calls.map(([cue]) => cue.effectId);
    expect(effectIds).not.toContain('ui_success');
    expect(setMusicSpy).not.toHaveBeenCalled();
  });

  it('plays the victory chime once the LAST hostile falls', async () => {
    const world = {
      playerId: 'p1',
      locationId: 'z1',
      entities: {
        p1: { name: 'Hero', resources: { hp: 10 }, statuses: [], tags: [] },
        'goblin-1': { name: 'Goblin', resources: { hp: 0 }, statuses: [], tags: ['hostile'], zoneId: 'z1' },
      },
      zones: { z1: { name: 'Town', neighbors: [] } },
      factions: {},
    } as any;
    const engine = { world, store: { state: {} } } as any;

    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const playSfxSpy = vi.spyOn(runtime.bridge, 'playSfx');

    await runtime.processPresentation(
      engine,
      [{ type: 'combat.entity.defeated', payload: { entityId: 'goblin-1' } }] as any,
      'attack',
    );

    const effectIds = playSfxSpy.mock.calls.map(([cue]) => cue.effectId);
    expect(effectIds).toContain('ui_success');
  });

  it('does not fire the combat-end hookPoint at all while hostiles remain (fireEventHooks dispatch gate)', async () => {
    const world = {
      playerId: 'p1',
      locationId: 'z1',
      entities: {
        p1: { name: 'Hero', resources: { hp: 10 }, statuses: [], tags: [] },
        'goblin-1': { name: 'Goblin', resources: { hp: 5 }, statuses: [], tags: ['hostile'], zoneId: 'z1' },
        'goblin-2': { name: 'Goblin', resources: { hp: 0 }, statuses: [], tags: ['hostile'], zoneId: 'z1' },
      },
      zones: { z1: { name: 'Town', neighbors: [] } },
      factions: {},
    } as any;
    const engine = { world, store: { state: {} } } as any;

    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const fireSpy = vi.spyOn(runtime.hookManager, 'fire');

    await runtime.processPresentation(
      engine,
      [{ type: 'combat.entity.defeated', payload: { entityId: 'goblin-2' } }] as any,
      'attack',
    );

    const combatEndFires = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'combat-end');
    expect(combatEndFires).toHaveLength(0);
  });

  it('still fires the combat-end hookPoint once the encounter is genuinely over', async () => {
    const world = {
      playerId: 'p1',
      locationId: 'z1',
      entities: {
        p1: { name: 'Hero', resources: { hp: 10 }, statuses: [], tags: [] },
        'goblin-1': { name: 'Goblin', resources: { hp: 0 }, statuses: [], tags: ['hostile'], zoneId: 'z1' },
      },
      zones: { z1: { name: 'Town', neighbors: [] } },
      factions: {},
    } as any;
    const engine = { world, store: { state: {} } } as any;

    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const fireSpy = vi.spyOn(runtime.hookManager, 'fire');

    await runtime.processPresentation(
      engine,
      [{ type: 'combat.entity.defeated', payload: { entityId: 'goblin-1' } }] as any,
      'attack',
    );

    const combatEndFires = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'combat-end');
    expect(combatEndFires).toHaveLength(1);
  });
});

// ─── F-d8d1f51d: a sustained scene mood must not repeat the identical ambient/music
// cue every turn. AudioDirector.schedule()'s cooldown only ever gates commands whose
// action is literally 'play' (verified against dist/director.js's isOnCooldown gate)
// -- ambient cues carry crossfade/start/stop and music cues carry
// intensify/soften/crossfade/play, so both bypass that cooldown entirely, every time.
// ImmersionRuntime needs its own de-dup, independent of AudioDirector. ───

describe('immersion-runtime: ambient/music cue de-dup across turns (F-d8d1f51d)', () => {
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

  // Minimal but VALIDATION-PASSING NarrationPlan base — audio-director's schedule()
  // runs validateNarrationPlan() first (dist/director.js) and returns zero commands
  // for an incomplete plan (non-empty sceneText, and valid tone/urgency/
  // interruptibility are all required), so these fields can't be omitted the way
  // other tests in this file that never reach the bridge (e.g. F-52475879's cap
  // tests, which only inspect the args passed INTO schedule()) get away with.
  const basePlan = {
    sceneText: 'The rain keeps falling.',
    tone: 'calm' as const,
    urgency: 'normal' as const,
    interruptibility: 'free' as const,
    sfx: [],
    uiEffects: [],
  };

  it('does not re-emit an identical ambient cue on the turn immediately after it was first emitted', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: true, voiceEnabled: false });
    const setAmbientSpy = vi.spyOn(runtime.bridge, 'setAmbient');

    const rainCue = { layerId: 'ambient_rain', action: 'crossfade' as const, volume: 0.4, fadeMs: 2000 };
    const makePlan = () => ({
      ...basePlan, musicCue: undefined,
      ambientLayers: [{ ...rainCue }],
    } as any);

    await runtime.processPresentation(minimalEngine, [], 'look', makePlan());
    expect(setAmbientSpy).toHaveBeenCalledTimes(1);

    // Turn 2: the LLM narrator proposes the SAME cue again (sustained rainstorm mood)
    // -- must be suppressed instead of printing a second identical cue line.
    await runtime.processPresentation(minimalEngine, [], 'look', makePlan());
    expect(setAmbientSpy).toHaveBeenCalledTimes(1);
  });

  it('still emits an ambient cue for the same layer when its action actually changes', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: true, voiceEnabled: false });
    const setAmbientSpy = vi.spyOn(runtime.bridge, 'setAmbient');

    await runtime.processPresentation(minimalEngine, [], 'look', {
      ...basePlan, musicCue: undefined,
      ambientLayers: [{ layerId: 'ambient_rain', action: 'crossfade', volume: 0.4, fadeMs: 2000 }],
    } as any);
    expect(setAmbientSpy).toHaveBeenCalledTimes(1);

    await runtime.processPresentation(minimalEngine, [], 'look', {
      ...basePlan, musicCue: undefined,
      ambientLayers: [{ layerId: 'ambient_rain', action: 'stop', volume: 0, fadeMs: 1000 }],
    } as any);
    // 'stop' cues never produce a tool call (audio-bridge.ts's setAmbient returns
    // early for 'stop'), but the bridge method itself must still be INVOKED — this
    // proves the cue reached the bridge rather than being deduped away.
    expect(setAmbientSpy).toHaveBeenCalledTimes(2);
  });

  it('does not re-emit an identical music cue on consecutive turns of a sustained mood', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: true, voiceEnabled: false });
    const setMusicSpy = vi.spyOn(runtime.bridge, 'setMusic');

    const makePlan = () => ({
      ...basePlan, ambientLayers: [],
      musicCue: { action: 'soften', fadeMs: 1000 },
    } as any);

    await runtime.processPresentation(minimalEngine, [], 'look', makePlan());
    expect(setMusicSpy).toHaveBeenCalledTimes(1);

    await runtime.processPresentation(minimalEngine, [], 'look', makePlan());
    expect(setMusicSpy).toHaveBeenCalledTimes(1);
  });

  it('emits a music cue again once the action actually changes', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: true, voiceEnabled: false });
    const setMusicSpy = vi.spyOn(runtime.bridge, 'setMusic');

    await runtime.processPresentation(minimalEngine, [], 'look', {
      ...basePlan, ambientLayers: [],
      musicCue: { action: 'soften', fadeMs: 1000 },
    } as any);
    expect(setMusicSpy).toHaveBeenCalledTimes(1);

    await runtime.processPresentation(minimalEngine, [], 'look', {
      ...basePlan, ambientLayers: [],
      musicCue: { action: 'intensify', fadeMs: 300 },
    } as any);
    expect(setMusicSpy).toHaveBeenCalledTimes(2);
  });

  it('de-dups a hook-sourced music cue against a narrator-authored one proposing the same action', async () => {
    // combatStartHook fires a one-time 'intensify' music cue on entering combat
    // (hooks.ts); if the narrator's OWN plan independently proposes the same
    // 'intensify' action the very next turn (still describing the tense mood), the
    // second is redundant -- the de-dup state must be shared across both dispatch
    // paths (hook-sourced cues bypass AudioDirector entirely; see F-d8d1f51d finding).
    const runtime = new ImmersionRuntime({ audioEnabled: true, voiceEnabled: false });
    const setMusicSpy = vi.spyOn(runtime.bridge, 'setMusic');

    // Turn 1: entering combat fires combatStartHook's hook-sourced 'intensify' cue.
    await runtime.processPresentation(
      minimalEngine,
      [{ type: 'combat.contact.hit', payload: {} }] as any,
      'attack',
    );
    expect(setMusicSpy).toHaveBeenCalledTimes(1);
    expect(setMusicSpy.mock.calls[0][0]).toMatchObject({ action: 'intensify' });

    // Turn 2: still mid-fight (combat-start hook does not re-fire), but the
    // narrator's own plan proposes the identical 'intensify' action again. Uses a
    // VALIDATION-PASSING plan (see basePlan above) so this actually exercises
    // audioDirector.schedule() rather than being short-circuited by
    // validateNarrationPlan rejecting an incomplete plan before reaching the dedup
    // logic at all.
    await runtime.processPresentation(
      minimalEngine,
      [{ type: 'combat.contact.hit', payload: {} }] as any,
      'attack',
      { ...basePlan, ambientLayers: [], musicCue: { action: 'intensify', fadeMs: 300 } } as any,
    );
    expect(setMusicSpy).toHaveBeenCalledTimes(1);
  });

  it('still caps and passes through several distinct ambient layers unaffected by de-dup (F-52475879 non-regression)', async () => {
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

    const scheduledPlan = scheduleSpy.mock.calls[0][0];
    expect(scheduledPlan.ambientLayers.length).toBeLessThan(10);
    expect(scheduledPlan.ambientLayers.length).toBeGreaterThan(0);
  });
});

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
