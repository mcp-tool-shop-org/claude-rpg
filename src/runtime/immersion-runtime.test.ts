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
