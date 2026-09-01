import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { ImmersionRuntime } from './immersion-runtime.js';

// F-0ad073b8: this file's suites build a real @ai-rpg-engine Engine via createGame()
// (the same starter-fantasy pack test/helpers/game-harness.ts and every
// test/integration/*.test.ts file already use) instead of a hand-typed `as any`
// WorldState/Engine stand-in. The real engine's playerId ('player') and starting zone
// (engine.world.locationId) replace the old fixture's hardcoded 'p1'/'z1' ids, so a
// future @ai-rpg-engine shape change to WorldState/EntityState would actually be
// caught here instead of silently passing against an unbacked fake shape.

// ─── PFE-008: Audio/hook errors degrade to silence ─────────

describe('immersion-runtime: error resilience', () => {
  let runtime: ImmersionRuntime;
  let engine: Engine;

  beforeEach(() => {
    runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    engine = createGame();
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
      engine,
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
      engine,
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

    await runtime.processPresentation(engine, [], 'look', narrationPlan);
    expect(stderrSpy).toHaveBeenCalledWith(
      '[immersion] Audio pipeline error (degrading to silence):',
      expect.any(Error),
    );

    stderrSpy.mockRestore();
  });

  it('non-debug mode does not log the debug-only audio error line, but still logs the F-251bd7d7 first-occurrence marker', async () => {
    // F-251bd7d7: a non-debug session previously had NO signal at all that a
    // pipeline stage was silently degrading -- the debug-gated line below stays
    // debug-only, but the new unconditional first-occurrence log (immersion-runtime.ts's
    // noteStageFailure) must fire regardless of debugMode, or a recurring degrade is
    // once again undiagnosable outside --debug.
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

    await runtime.processPresentation(engine, [], 'look', narrationPlan);

    expect(stderrSpy).not.toHaveBeenCalledWith(
      '[immersion] Audio pipeline error (degrading to silence):',
      expect.any(Error),
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('presentation stage "audio" degraded to silence'),
      expect.any(Error),
    );

    stderrSpy.mockRestore();
  });
});

// ─── F-251bd7d7: a recurring (not one-off) stage degradation must escalate its
// visibility beyond the single first-occurrence line, and a stage that recovers
// must not carry a stale streak into a later, unrelated failure run. ───

describe('immersion-runtime: degraded-stage escalation logging (F-251bd7d7)', () => {
  let runtime: ImmersionRuntime;
  let engine: Engine;

  beforeEach(() => {
    runtime = new ImmersionRuntime({ audioEnabled: true, voiceEnabled: false });
    engine = createGame();
  });

  // Triggers the 'audio' stage specifically (via a rejecting bridge.executeCommands),
  // not a throwing hook -- F-8968741e isolates hook exceptions INSIDE
  // HookManager.fire() now, so a hook throw no longer reaches processPresentation's
  // pre-narration/event-hooks/post-narration outer catches at all (see the
  // F-8968741e-vs-F-3fce4373 note in the "non-debug degradation markers" describe
  // block below). The audio stage's try/catch wraps bridge calls directly, so it
  // remains a genuine, reachable trigger for this streak/escalation machinery.
  const makeFailingNarrationPlan = () =>
    ({ segments: [], sfx: [], ambientLayers: [], uiEffects: [], musicCue: undefined }) as any;

  it('logs the first occurrence unconditionally but not the 2nd-19th consecutive failure', async () => {
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(runtime.bridge, 'executeCommands').mockRejectedValue(new Error('boom'));

    await runtime.processPresentation(engine, [], 'look', makeFailingNarrationPlan());
    const firstOccurrenceCalls = stderrSpy.mock.calls.filter(([msg]) =>
      typeof msg === 'string' && msg.includes('presentation stage "audio" degraded to silence'),
    );
    expect(firstOccurrenceCalls).toHaveLength(1);
    stderrSpy.mockClear();

    // Turns 2 through 19: still failing every turn, but the escalation line (every
    // STAGE_ESCALATION_INTERVAL = 20 consecutive turns) has not been reached yet.
    for (let i = 0; i < 18; i++) {
      await runtime.processPresentation(engine, [], 'look', makeFailingNarrationPlan());
    }
    const midStreakCalls = stderrSpy.mock.calls.filter(([msg]) =>
      typeof msg === 'string' && msg.includes('presentation stage "audio"'),
    );
    expect(midStreakCalls).toHaveLength(0);
  });

  it('escalates again on the 20th consecutive failure of the same stage', async () => {
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(runtime.bridge, 'executeCommands').mockRejectedValue(new Error('boom'));

    for (let i = 0; i < 20; i++) {
      await runtime.processPresentation(engine, [], 'look', makeFailingNarrationPlan());
    }

    const escalationCalls = stderrSpy.mock.calls.filter(([msg]) =>
      typeof msg === 'string' && msg.includes('still degrading to silence (20 consecutive turns)'),
    );
    expect(escalationCalls).toHaveLength(1);
  });

  it('resets the streak once the stage recovers, so a later fresh failure logs as a first occurrence again', async () => {
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const executeCommandsSpy = vi.spyOn(runtime.bridge, 'executeCommands');
    executeCommandsSpy.mockRejectedValueOnce(new Error('boom')); // turn 1: fails -> streak 1, logs
    executeCommandsSpy.mockResolvedValueOnce([]); // turn 2: succeeds -> streak reset to 0

    await runtime.processPresentation(engine, [], 'look', makeFailingNarrationPlan());
    await runtime.processPresentation(engine, [], 'look', makeFailingNarrationPlan());
    stderrSpy.mockClear();

    executeCommandsSpy.mockRejectedValueOnce(new Error('boom again')); // turn 3: fails again
    await runtime.processPresentation(engine, [], 'look', makeFailingNarrationPlan());
    const firstOccurrenceCalls = stderrSpy.mock.calls.filter(([msg]) =>
      typeof msg === 'string' && msg.includes('presentation stage "audio" degraded to silence'),
    );
    expect(firstOccurrenceCalls).toHaveLength(1);
  });

  it('tracks each stage independently -- a failing audio stage does not log anything for the other, unaffected stages', async () => {
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(runtime.bridge, 'executeCommands').mockRejectedValue(new Error('audio boom'));

    await runtime.processPresentation(engine, [], 'look', makeFailingNarrationPlan());

    const audioFirstOccurrence = stderrSpy.mock.calls.filter(([msg]) =>
      typeof msg === 'string' && msg.includes('presentation stage "audio" degraded to silence'),
    );
    const otherStageCalls = stderrSpy.mock.calls.filter(
      ([msg]) =>
        typeof msg === 'string' &&
        msg.includes('presentation stage') &&
        !msg.includes('"audio"'),
    );
    expect(audioFirstOccurrence).toHaveLength(1);
    expect(otherStageCalls).toHaveLength(0);
  });
});

// ─── F-06fffa64: ImmersionRuntime.debugMode and HookManager.debugMode share one
// gating mechanism. Before this, HookManager had no debugMode/gate concept at all
// (F-9ba5f482), so it was impossible to reach that sibling gate from the flag every
// production caller and test in this domain already sets. ───

describe('immersion-runtime: debugMode propagates to hookManager (F-06fffa64)', () => {
  it('setting runtime.debugMode also sets hookManager.debugMode', () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    expect(runtime.hookManager.debugMode).toBe(false);

    runtime.debugMode = true;
    expect(runtime.debugMode).toBe(true);
    expect(runtime.hookManager.debugMode).toBe(true);

    runtime.debugMode = false;
    expect(runtime.hookManager.debugMode).toBe(false);
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
  let engine: Engine;

  beforeEach(() => {
    engine = createGame();
  });

  // F-8968741e superseded these two: HookManager.fire() now isolates each hook's
  // own exception INSIDE the loop (per-hook try/catch, logged via hooks.ts's own
  // "[hooks] Hook ... threw and was skipped" line -- F-9ba5f482, this wave: that
  // line is now gated on debugMode instead of unconditional, mirroring every
  // other diagnostic in this domain, so these tests opt into debugMode to keep
  // exercising it) so it never reaches processPresentation's
  // pre-narration/event-hooks outer catch at all.
  // Per F-8968741e's own routed fix text, this is intentional: a debug session now
  // identifies the SPECIFIC culprit hook "instead of seeing only a generic
  // event-hooks degraded-stage marker". These two tests now assert that new
  // contract -- no stage-level marker for a hook-level throw, turn completes
  // cleanly, hook-level log fires instead -- rather than the superseded behavior.
  it('does not push a stage-level marker when a pre-narration hook throws -- F-8968741e isolates and logs it at the hook level instead', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    // F-9ba5f482: the hooks.ts log this test asserts below is now debugMode-gated.
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    runtime.hookManager.register('pre-narration', () => {
      throw new Error('Hook exploded');
    });

    const calls = await runtime.processPresentation(
      engine,
      [{ type: 'world.zone.entered', payload: {} } as any],
      'look',
    );

    const markers = calls.filter((c) => c.tool === '__presentation_degraded__');
    expect(markers).toHaveLength(0);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('hookPoint "pre-narration" threw and was skipped'),
      expect.any(Error),
    );
    stderrSpy.mockRestore();
  });

  it('does not push a stage-level marker when an event hook throws -- F-8968741e isolates and logs it at the hook level instead', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    // F-9ba5f482: the hooks.ts log this test asserts below is now debugMode-gated.
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    runtime.hookManager.register('enter-room', () => {
      throw new Error('enter-room exploded');
    });

    const calls = await runtime.processPresentation(
      engine,
      [{ type: 'world.zone.entered', payload: {} } as any],
      'move',
    );

    const markers = calls.filter((c) => c.tool === '__presentation_degraded__');
    expect(markers).toHaveLength(0);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('hookPoint "enter-room" threw and was skipped'),
      expect.any(Error),
    );
    stderrSpy.mockRestore();
  });

  it('still pushes the event-hooks marker for a genuine non-hook failure in that stage (e.g. the bridge itself throwing)', async () => {
    // Unlike a HOOK throwing (isolated by F-8968741e, see the two tests above),
    // executeMergedHookResult's own bridge dispatch calls are OUTSIDE HookManager.
    // fire()'s per-hook try/catch, so a bridge-level failure still reaches
    // processPresentation's 'event-hooks' outer catch exactly as before.
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = false;
    vi.spyOn(runtime.bridge, 'playSfx').mockRejectedValue(new Error('bridge crash'));

    const calls = await runtime.processPresentation(
      engine,
      [{ type: 'combat.contact.hit', payload: {} }] as any,
      'attack',
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

    const calls = await runtime.processPresentation(engine, [], 'look', narrationPlan);

    const markers = calls.filter((c) => c.tool === '__presentation_degraded__');
    expect(markers).toHaveLength(1);
    expect(markers[0].params).toMatchObject({ stage: 'audio' });
  });

  it('does not push a stage-level marker when a post-narration hook throws -- F-8968741e isolates and logs it at the hook level instead', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    // F-9ba5f482: the hooks.ts log this test asserts below is now debugMode-gated.
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    runtime.hookManager.register('post-narration', () => {
      throw new Error('post-narration exploded');
    });

    const calls = await runtime.processPresentation(engine, [], 'look');

    const markers = calls.filter((c) => c.tool === '__presentation_degraded__');
    expect(markers).toHaveLength(0);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('hookPoint "post-narration" threw and was skipped'),
      expect.any(Error),
    );
    stderrSpy.mockRestore();
  });

  // F-9ba5f482/F-06fffa64: a non-debug turn must not print the raw hook name,
  // hookPoint, and Error/stack to the player's terminal at all -- this was
  // previously unconditional (see the block comment above). Exercises the real
  // production path (runtime.debugMode propagating into hookManager.debugMode,
  // immersion-runtime.ts's accessor) rather than HookManager in isolation
  // (hooks.test.ts already covers HookManager directly).
  it('does not log the hook-threw diagnostic at all when debugMode is disabled (F-9ba5f482)', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = false;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    runtime.hookManager.register('pre-narration', () => {
      throw new Error('Hook exploded');
    });

    await runtime.processPresentation(
      engine,
      [{ type: 'world.zone.entered', payload: {} } as any],
      'look',
    );

    expect(stderrSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('threw and was skipped'),
      expect.any(Error),
    );
    stderrSpy.mockRestore();
  });

  it('does not push a marker on a clean turn with no errors', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = false;

    const calls = await runtime.processPresentation(engine, [], 'look');

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

    const calls = await runtime.processPresentation(engine, [], 'look', narrationPlan);

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
  let engine: Engine;

  beforeEach(() => {
    engine = createGame();
  });

  // F-8968741e superseded these three: a hook's own exception is now caught INSIDE
  // HookManager.fire()'s per-hook loop (hooks.ts) and logged there
  // ("[hooks] Hook ... threw and was skipped"), so it never reaches
  // processPresentation's own debugMode-gated per-stage lines below anymore -- per
  // F-8968741e's own routed fix text, a debug session now identifies the SPECIFIC
  // culprit hook "instead of seeing only a generic event-hooks degraded-stage
  // marker". This domain's Contract B coverage still holds (debugMode wiring
  // produces SOME diagnostic for a hook failure); the exact message + call site
  // moved from immersion-runtime.ts to hooks.ts. F-9ba5f482 (this wave): that
  // hooks.ts log is now itself gated on debugMode (previously unconditional,
  // the one diagnostic in this domain with no gate) -- these three tests already
  // set `runtime.debugMode = true` below, so they keep exercising the log; see
  // the F-9ba5f482 describe block above for the now-default (false) silent case.
  it('a pre-narration hook error is diagnosable via hooks.ts\'s own debugMode-gated log', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    runtime.hookManager.register('pre-narration', () => {
      throw new Error('pre-narration exploded');
    });

    await runtime.processPresentation(
      engine,
      [{ type: 'world.zone.entered', payload: {} } as any],
      'look',
    );

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('hookPoint "pre-narration" threw and was skipped'),
      expect.any(Error),
    );
    stderrSpy.mockRestore();
  });

  it('an event-hook error (e.g. enter-room) is diagnosable via hooks.ts\'s own debugMode-gated log', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    runtime.hookManager.register('enter-room', () => {
      throw new Error('enter-room exploded');
    });

    await runtime.processPresentation(
      engine,
      [{ type: 'world.zone.entered', payload: {} } as any],
      'move',
    );

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('hookPoint "enter-room" threw and was skipped'),
      expect.any(Error),
    );
    stderrSpy.mockRestore();
  });

  it('a post-narration hook error is diagnosable via hooks.ts\'s own debugMode-gated log', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    runtime.hookManager.register('post-narration', () => {
      throw new Error('post-narration exploded');
    });

    await runtime.processPresentation(engine, [], 'look');

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('hookPoint "post-narration" threw and was skipped'),
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
  let engine: Engine;

  beforeEach(() => {
    engine = createGame();
  });

  it('logs the state transition to stderr when debugMode is enabled and the state actually changes', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // exploration -> dialogue via the 'speak' verb (no events needed).
    await runtime.processPresentation(engine, [], 'speak');

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('exploration -> dialogue'));
    stderrSpy.mockRestore();
  });

  it('does not log a transition when debugMode is disabled', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = false;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runtime.processPresentation(engine, [], 'speak');

    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it('does not log anything when the inferred state is unchanged from the prior state', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Starts in 'exploration'; 'look' with no events also infers 'exploration' -> no
    // transition, so nothing should be logged.
    await runtime.processPresentation(engine, [], 'look');

    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it('also logs the sibling transition() call site in initialize() (session-restore)', () => {
    // Family-of-call-sites: initialize() has its own `this.stateMachine.transition(...)`
    // that discarded its result the same way processPresentation's did, so a save
    // restored mid-combat was equally undiagnosable under --debug. F-0ad073b8: mutates
    // the real engine's own combat-core module namespace (verified shape: { inCombat,
    // combatants }) instead of hand-typing a modules bag.
    const engine = createGame();
    const combatCore = engine.world.modules['combat-core'] as { inCombat: boolean; combatants: string[] };
    combatCore.inCombat = true;
    combatCore.combatants = ['goblin-1'];

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
  let engine: Engine;

  beforeEach(() => {
    engine = createGame();
  });

  it('debug mode surfaces a post-narration hook result that has nothing consuming it yet', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    runtime.debugMode = true;
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    runtime.hookManager.register('post-narration', () => ({
      sfxCues: [{ effectId: 'future-cue', timing: 'immediate' as const, intensity: 0.5 }],
    }));

    await runtime.processPresentation(engine, [], 'look');

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

    await runtime.processPresentation(engine, [], 'look');

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

    await runtime.processPresentation(engine, [], 'look');

    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});

// ─── F-0acb03fe: combat-start hookpoint fires once per fight, not every turn ───

describe('immersion-runtime: combat-start dispatch (F-0acb03fe)', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createGame();
  });

  it('fires combat-start only on the turn combat begins, not on every ongoing-combat turn', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const fireSpy = vi.spyOn(runtime.hookManager, 'fire');
    // Combat events recur every turn a fight is ongoing (e.g. a contact/hit event each
    // round) — this is what previously made `events.some(startsWith('combat.'))` true
    // on every turn, not just the turn combat was entered.
    const combatEvents = [{ type: 'combat.contact.hit', payload: {} }] as any;

    // Turn 1: entering combat for the first time this fight
    await runtime.processPresentation(engine, combatEvents, 'attack');
    const turn1CombatStarts = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'combat-start');
    expect(turn1CombatStarts).toHaveLength(1);

    fireSpy.mockClear();

    // Turn 2: still mid-fight. combat-start must NOT re-fire — it's meant to play a
    // one-time warning SFX and intensify music on combat start, not every turn.
    await runtime.processPresentation(engine, combatEvents, 'attack');
    const turn2CombatStarts = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'combat-start');
    expect(turn2CombatStarts).toHaveLength(0);
  });
});

// ─── F-ed267860: aftermath countdown must actually decrement via the real engine tick ───

describe('immersion-runtime: aftermath countdown wedge (F-ed267860)', () => {
  it('drains aftermathTurns to exploration across consecutive no-combat turns via processPresentation, not a hand-fed tick', async () => {
    // Unlike presentation-state.test.ts's T-010 (which calls inferFromEvents directly
    // with hand-incremented tick args), this drives the actual production call path —
    // processPresentation — through a REAL @ai-rpg-engine Engine (F-0ad073b8) whose
    // `tick` getter genuinely advances via store.advanceTick(), rather than a hand-rolled
    // getter simulating one. Before the fix, the call site never read engine.tick at
    // all, so the guard's `tick ?? -2` sentinel was the same constant on every call and
    // the countdown wedged after its first decrement.
    const engine = createGame();

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
    engine.store.advanceTick();
    await runtime.processPresentation(engine, [], 'wait');
    expect(runtime.stateMachine.current).toBe('aftermath'); // 2 -> 1

    engine.store.advanceTick();
    await runtime.processPresentation(engine, [], 'wait');
    expect(runtime.stateMachine.current).toBe('exploration'); // 1 -> 0
  });
});

// ─── F-f13b58f3: presentation state seeded from persisted combat-core state on load ───

describe('immersion-runtime: presentation state seeded on initialize (F-f13b58f3)', () => {
  // F-0ad073b8: builds a real createGame() Engine and overwrites its own combat-core
  // module namespace (verified real shape: { inCombat, combatants } — packages/
  // modules/src/combat-core.ts) instead of hand-typing a whole WorldState around a
  // `modules` bag.
  const makeEngine = (combatCore: { inCombat: boolean; combatants: string[] }): Engine => {
    const engine = createGame();
    engine.world.modules['combat-core'] = combatCore;
    return engine;
  };

  it('does not replay the combat-start hook after loading a save that was mid-combat', async () => {
    // Simulates a session restored from a save made mid-fight: the engine's own
    // combat-core module namespace (registered via ctx.persistence.registerNamespace in
    // node_modules/@ai-rpg-engine/modules/dist/combat-core.js) still shows inCombat: true,
    // even though this freshly-constructed ImmersionRuntime has never seen a combat event.
    const engine = makeEngine({ inCombat: true, combatants: ['goblin-1'] });

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
    const engine = makeEngine({ inCombat: false, combatants: [] });

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
  // F-0ad073b8: real createGame() Engine, not a hand-typed `as any` WorldState/Engine.
  // No test in this describe block asserts a specific absolute tick value (only that
  // state transitions/hook dispatch behave correctly), so the real engine's own
  // starting tick (0) stands in for the old fixture's hardcoded `tick: 1` unchanged.
  let engine: Engine;

  beforeEach(() => {
    engine = createGame();
  });

  it('returns the NEW state immediately on a combat-entry turn, before processPresentation runs', () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    expect(runtime.stateMachine.current).toBe('exploration');

    const combatEvents = [{ type: 'combat.contact.hit', payload: {} }] as any;
    const result = runtime.inferAndTransition(engine, combatEvents, 'attack');

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
    const inferred = runtime.inferAndTransition(engine, combatEvents, 'attack');
    expect(inferred).toEqual({ from: 'exploration', to: 'combat', trigger: 'attack' });

    await runtime.processPresentation(engine, combatEvents, 'attack');

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
    runtime.inferAndTransition(engine, combatEvents, 'attack');
    await runtime.processPresentation(engine, combatEvents, 'attack');
    fireSpy.mockClear();

    // Turn 2: still mid-fight, same ordered pair of calls as turn 1.
    runtime.inferAndTransition(engine, combatEvents, 'attack');
    await runtime.processPresentation(engine, combatEvents, 'attack');

    const combatStarts = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'combat-start');
    expect(combatStarts).toHaveLength(0);
  });

  it('calls stateMachine.transition at most once per turn when inferAndTransition precedes processPresentation', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const transitionSpy = vi.spyOn(runtime.stateMachine, 'transition');
    const combatEvents = [{ type: 'combat.contact.hit', payload: {} }] as any;

    runtime.inferAndTransition(engine, combatEvents, 'attack');
    await runtime.processPresentation(engine, combatEvents, 'attack');

    expect(transitionSpy).toHaveBeenCalledTimes(1);
  });

  it('preserves the mid-combat restore skip when inferAndTransition precedes processPresentation (F-f13b58f3 non-regression)', async () => {
    // Mutate the real engine's own combat-core module namespace (verified shape:
    // { inCombat, combatants }) instead of hand-typing a modules bag.
    const combatCore = engine.world.modules['combat-core'] as { inCombat: boolean; combatants: string[] };
    combatCore.inCombat = true;
    combatCore.combatants = ['goblin-1'];

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

    await runtime.processPresentation(engine, combatEvents, 'attack');

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
  // F-0ad073b8: real createGame() Engine with the player's own hp mutated directly
  // (the same direct-mutation convention companion-bridge.ts already documents as
  // intentional for this codebase), instead of a hand-typed WorldState/Engine pair.
  const makeEngine = (hp: number): Engine => {
    const engine = createGame();
    engine.world.entities[engine.world.playerId].resources.hp = hp;
    return engine;
  };

  it('inferAndTransition returns a {from, to, trigger} StateTransition on a death turn', () => {
    const engine = makeEngine(10);
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });

    // Get into 'combat' first so `from` is observably not the initial 'exploration'
    // default -- matches the routed finding's test sketch shape
    // {from:'combat',to:'menu',trigger:'attack'}.
    runtime.inferAndTransition(engine, [{ type: 'combat.contact.hit', payload: {} }] as any, 'attack');
    expect(runtime.stateMachine.current).toBe('combat');

    engine.store.advanceTick();
    const result = runtime.inferAndTransition(
      engine,
      [{ type: 'combat.entity.defeated', payload: { entityId: engine.world.playerId } }] as any,
      'attack',
    );

    expect(result).toEqual({ from: 'combat', to: 'menu', trigger: 'attack' });
    expect(runtime.stateMachine.current).toBe('menu');
  });

  it('fires the death hookPoint exactly once on the turn death is entered', async () => {
    const engine = makeEngine(10);
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const fireSpy = vi.spyOn(runtime.hookManager, 'fire');

    await runtime.processPresentation(
      engine,
      [{ type: 'combat.entity.defeated', payload: { entityId: engine.world.playerId } }] as any,
      'attack',
    );

    expect(runtime.stateMachine.current).toBe('menu');
    const deathFires = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'death');
    expect(deathFires).toHaveLength(1);
  });

  it('does NOT re-fire the death hookPoint on a second consecutive turn with hp still 0 and no new defeat event (repeat-fire regression)', async () => {
    const engine = makeEngine(0); // player already at 0 hp -- hazard-style death, no event needed (F-e57d6a60)
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
    engine.store.advanceTick();
    await runtime.processPresentation(engine, [], 'wait');
    expect(runtime.stateMachine.current).toBe('menu');
    deathFires = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'death');
    expect(deathFires).toHaveLength(0);
  });

  it('fires the death hookPoint again on a fresh death after an intervening non-menu turn', async () => {
    const engine = makeEngine(0);
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const fireSpy = vi.spyOn(runtime.hookManager, 'fire');

    // Turn 1: initial death.
    await runtime.processPresentation(engine, [], 'wait');
    expect(runtime.stateMachine.current).toBe('menu');
    fireSpy.mockClear();

    // Intervening turn: the player is revived (hp restored above 0) and no death
    // signal fires, so the state machine leaves 'menu'.
    engine.world.entities[engine.world.playerId].resources.hp = 10;
    engine.store.advanceTick();
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
    engine.store.advanceTick();
    await runtime.processPresentation(
      engine,
      [{ type: 'combat.entity.defeated', payload: { entityId: engine.world.playerId } }] as any,
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
  let engine: Engine;

  beforeEach(() => {
    engine = createGame();
  });

  it('dispatches the death fade-out through bridge.applyUiEffect on a player death', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const applyUiEffectSpy = vi.spyOn(runtime.bridge, 'applyUiEffect');

    await runtime.processPresentation(
      engine,
      [{ type: 'combat.entity.defeated', payload: { entityId: engine.world.playerId } }] as any,
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
  let engine: Engine;

  beforeEach(() => {
    engine = createGame();
  });

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

    const calls = await runtime.processPresentation(engine, [], 'look', narrationPlan);

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

    const calls = await runtime.processPresentation(engine, [], 'look', narrationPlan);

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
  let engine: Engine;

  beforeEach(() => {
    engine = createGame();
  });

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

    await runtime.processPresentation(engine, [], 'look', narrationPlan);

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

    await runtime.processPresentation(engine, [], 'look', narrationPlan);

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

    await runtime.processPresentation(engine, [], 'look', narrationPlan);

    const scheduledPlan = scheduleSpy.mock.calls[0][0];
    expect(scheduledPlan.sfx.length).toBeLessThan(11);
  });
});

// ─── F-91f803b2: combat-end's victory cue must not fire on a player-death turn ───

describe('immersion-runtime: combat-end suppressed on player death (F-91f803b2)', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createGame();
  });

  it('does not play the ui_success victory chime when the player is the defeated entity', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const playSfxSpy = vi.spyOn(runtime.bridge, 'playSfx');

    await runtime.processPresentation(
      engine,
      [{ type: 'combat.entity.defeated', payload: { entityId: engine.world.playerId } }] as any,
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
      engine,
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
  // F-0ad073b8: adds a hostile entity into the real engine's player zone via the real
  // Engine's own store.addEntity() (the same API world-gen.ts's NPC-add path uses,
  // src/foundry/world-gen.ts) instead of hand-typing a WorldState.entities bag.
  const addHostile = (engine: Engine, id: string, hp: number): void => {
    engine.store.addEntity({
      id,
      blueprintId: id,
      type: 'enemy',
      name: 'Goblin',
      tags: ['hostile'],
      stats: {},
      resources: { hp },
      statuses: [],
      zoneId: engine.world.locationId,
    });
  };

  it('does not play the victory chime / soften music when other hostiles are still alive', async () => {
    const engine = createGame();
    addHostile(engine, 'goblin-1', 5);
    addHostile(engine, 'goblin-2', 0);

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
    const engine = createGame();
    addHostile(engine, 'goblin-1', 0);

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
    const engine = createGame();
    addHostile(engine, 'goblin-1', 5);
    addHostile(engine, 'goblin-2', 0);

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
    const engine = createGame();
    addHostile(engine, 'goblin-1', 0);

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

// ─── F-2126ffd0: the 'combat-end' hookPoint dispatch gate never fired for a 3.11
// retreat-outcome combat.encounter.cleared (no combat.entity.defeated present at all),
// so a successful escape got no audio acknowledgment in this domain -- the encounter
// just fell back to 'exploration' the FOLLOWING turn with no transition cue. The gate
// now also fires on the engine's own authoritative combat.encounter.cleared event
// (any outcome), independent of the legacy combat.entity.defeated + !hasLivingHostiles
// derivation, which stays live this wave to guard fixtures/3.10-shaped streams. ───

describe('immersion-runtime: combat-end fires on a retreat-outcome combat.encounter.cleared (F-2126ffd0)', () => {
  it('fires the combat-end hookPoint on a retreat clear with no accompanying combat.entity.defeated', async () => {
    const engine = createGame();
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const fireSpy = vi.spyOn(runtime.hookManager, 'fire');

    await runtime.processPresentation(
      engine,
      [{ type: 'combat.encounter.cleared', payload: { outcome: 'retreat' } }] as any,
      'flee',
    );

    const combatEndFires = fireSpy.mock.calls.filter(([ctx]) => ctx.hookPoint === 'combat-end');
    expect(combatEndFires).toHaveLength(1);
  });

  it('softens the music but does not play the victory chime on a retreat clear', async () => {
    const engine = createGame();
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const playSfxSpy = vi.spyOn(runtime.bridge, 'playSfx');
    const setMusicSpy = vi.spyOn(runtime.bridge, 'setMusic');

    await runtime.processPresentation(
      engine,
      [{ type: 'combat.encounter.cleared', payload: { outcome: 'retreat' } }] as any,
      'flee',
    );

    const effectIds = playSfxSpy.mock.calls.map(([cue]) => cue.effectId);
    expect(effectIds).not.toContain('ui_success');
    expect(setMusicSpy).toHaveBeenCalledWith(expect.objectContaining({ action: 'soften' }));
  });

  it('still plays the victory chime on a victory-outcome combat.encounter.cleared with no combat.entity.defeated', async () => {
    const engine = createGame();
    const runtime = new ImmersionRuntime({ audioEnabled: false, voiceEnabled: false });
    const playSfxSpy = vi.spyOn(runtime.bridge, 'playSfx');

    await runtime.processPresentation(
      engine,
      [{ type: 'combat.encounter.cleared', payload: { outcome: 'victory' } }] as any,
      'attack',
    );

    const effectIds = playSfxSpy.mock.calls.map(([cue]) => cue.effectId);
    expect(effectIds).toContain('ui_success');
  });
});

// ─── F-d8d1f51d: a sustained scene mood must not repeat the identical ambient/music
// cue every turn. AudioDirector.schedule()'s cooldown only ever gates commands whose
// action is literally 'play' (verified against dist/director.js's isOnCooldown gate)
// -- ambient cues carry crossfade/start/stop and music cues carry
// intensify/soften/crossfade/play, so both bypass that cooldown entirely, every time.
// ImmersionRuntime needs its own de-dup, independent of AudioDirector. ───

describe('immersion-runtime: ambient/music cue de-dup across turns (F-d8d1f51d)', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createGame();
  });

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

    await runtime.processPresentation(engine, [], 'look', makePlan());
    expect(setAmbientSpy).toHaveBeenCalledTimes(1);

    // Turn 2: the LLM narrator proposes the SAME cue again (sustained rainstorm mood)
    // -- must be suppressed instead of printing a second identical cue line.
    await runtime.processPresentation(engine, [], 'look', makePlan());
    expect(setAmbientSpy).toHaveBeenCalledTimes(1);
  });

  it('still emits an ambient cue for the same layer when its action actually changes', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: true, voiceEnabled: false });
    const setAmbientSpy = vi.spyOn(runtime.bridge, 'setAmbient');

    await runtime.processPresentation(engine, [], 'look', {
      ...basePlan, musicCue: undefined,
      ambientLayers: [{ layerId: 'ambient_rain', action: 'crossfade', volume: 0.4, fadeMs: 2000 }],
    } as any);
    expect(setAmbientSpy).toHaveBeenCalledTimes(1);

    await runtime.processPresentation(engine, [], 'look', {
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

    await runtime.processPresentation(engine, [], 'look', makePlan());
    expect(setMusicSpy).toHaveBeenCalledTimes(1);

    await runtime.processPresentation(engine, [], 'look', makePlan());
    expect(setMusicSpy).toHaveBeenCalledTimes(1);
  });

  it('emits a music cue again once the action actually changes', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: true, voiceEnabled: false });
    const setMusicSpy = vi.spyOn(runtime.bridge, 'setMusic');

    await runtime.processPresentation(engine, [], 'look', {
      ...basePlan, ambientLayers: [],
      musicCue: { action: 'soften', fadeMs: 1000 },
    } as any);
    expect(setMusicSpy).toHaveBeenCalledTimes(1);

    await runtime.processPresentation(engine, [], 'look', {
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
      engine,
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
      engine,
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

    await runtime.processPresentation(engine, [], 'look', narrationPlan);

    const scheduledPlan = scheduleSpy.mock.calls[0][0];
    expect(scheduledPlan.ambientLayers.length).toBeLessThan(10);
    expect(scheduledPlan.ambientLayers.length).toBeGreaterThan(0);
  });
});

// ─── F-8986d316: lastAmbientAction is keyed on narrator-proposed AmbientCue.layerId,
// a bare (not closed-enum) string populated by free-text LLM scene generation every
// turn, with no eviction -- over a long session a narrator inconsistent in naming
// ambient layers would grow the tracking Map by one entry per distinct layerId it
// ever proposes, unbounded for the ImmersionRuntime instance's lifetime. ───

describe('immersion-runtime: lastAmbientAction is capped (F-8986d316)', () => {
  const basePlan = {
    sceneText: 'The scene continues.',
    tone: 'calm' as const,
    urgency: 'normal' as const,
    interruptibility: 'free' as const,
    sfx: [],
    uiEffects: [],
  };

  it('evicts the oldest tracked layer once distinct ambient layer ids exceed the cap, so a since-evicted layer re-emits its cue instead of staying deduped forever', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: true, voiceEnabled: false });
    const engine = createGame();
    const setAmbientSpy = vi.spyOn(runtime.bridge, 'setAmbient');

    // Feed 33 DISTINCT layer ids across 33 turns (one per turn, well under the
    // per-plan MAX_AMBIENT_PER_PLAN=3 cap) -- one more than the 32-layer bound, so
    // the very first layer ('layer-0') must be evicted as the oldest entry.
    for (let i = 0; i < 33; i++) {
      await runtime.processPresentation(engine, [], 'look', {
        ...basePlan,
        musicCue: undefined,
        ambientLayers: [{ layerId: `layer-${i}`, action: 'crossfade' as const, volume: 0.4, fadeMs: 1000 }],
      } as any);
    }
    setAmbientSpy.mockClear();

    // 'layer-0' was the FIRST entry inserted -- now evicted. Proposing the SAME
    // action it originally had must NOT be treated as a duplicate anymore (its
    // tracking entry is gone), so it re-emits instead of staying silently deduped
    // forever.
    await runtime.processPresentation(engine, [], 'look', {
      ...basePlan,
      musicCue: undefined,
      ambientLayers: [{ layerId: 'layer-0', action: 'crossfade' as const, volume: 0.4, fadeMs: 1000 }],
    } as any);
    expect(setAmbientSpy).toHaveBeenCalledTimes(1);
    setAmbientSpy.mockClear();

    // 'layer-32' (the most recently inserted, still within the cap) must still be
    // correctly deduped when its action repeats -- the cap must not over-evict.
    await runtime.processPresentation(engine, [], 'look', {
      ...basePlan,
      musicCue: undefined,
      ambientLayers: [{ layerId: 'layer-32', action: 'crossfade' as const, volume: 0.4, fadeMs: 1000 }],
    } as any);
    expect(setAmbientSpy).not.toHaveBeenCalled();
  });

  it('logs a one-time debug warning when the cap first evicts an entry, not once per eviction', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: true, voiceEnabled: false });
    runtime.debugMode = true;
    const engine = createGame();
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    for (let i = 0; i < 40; i++) {
      await runtime.processPresentation(engine, [], 'look', {
        ...basePlan,
        musicCue: undefined,
        ambientLayers: [{ layerId: `layer-${i}`, action: 'crossfade' as const, volume: 0.4, fadeMs: 1000 }],
      } as any);
    }

    const capWarnings = stderrSpy.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('lastAmbientAction exceeded'),
    );
    expect(capWarnings).toHaveLength(1);
    stderrSpy.mockRestore();
  });

  it('does not log the cap warning when debugMode is disabled', async () => {
    const runtime = new ImmersionRuntime({ audioEnabled: true, voiceEnabled: false });
    runtime.debugMode = false;
    const engine = createGame();
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    for (let i = 0; i < 40; i++) {
      await runtime.processPresentation(engine, [], 'look', {
        ...basePlan,
        musicCue: undefined,
        ambientLayers: [{ layerId: `layer-${i}`, action: 'crossfade' as const, volume: 0.4, fadeMs: 1000 }],
      } as any);
    }

    const capWarnings = stderrSpy.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('lastAmbientAction exceeded'),
    );
    expect(capWarnings).toHaveLength(0);
    stderrSpy.mockRestore();
  });
});

describe('immersion-runtime: hazard death with no defeat event (F-e57d6a60)', () => {
  it('engages death presentation (state -> menu, critical alarm dispatched) when hp reaches zero with no defeat event', async () => {
    // F-0ad073b8: real createGame() Engine with the player's hp zeroed directly, not a
    // hand-typed WorldState/Engine pair.
    const engine = createGame();
    engine.world.entities[engine.world.playerId].resources.hp = 0;

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
