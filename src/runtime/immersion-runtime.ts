// Immersion Runtime — wires presentation state, hooks, audio director, and voice caster

import type { Engine, ResolvedEvent } from '@ai-rpg-engine/core';
import type { NarrationPlan, AmbientCue, MusicCue, PresentationState } from '@ai-rpg-engine/presentation';
import { AudioDirector } from '@ai-rpg-engine/audio-director';
import { SoundRegistry, CORE_SOUND_PACK, districtToneToSoundMood, hashRoll } from '@ai-rpg-engine/soundpack-core';
import { getDistrictForZone, getWorldTickState } from '@ai-rpg-engine/modules';
import {
  PresentationStateMachine,
  type StateTransition,
} from './presentation-state.js';
import {
  HookManager,
  registerBuiltinHooks,
  hasLivingHostiles,
  type HookContext,
  type HookResult,
} from './hooks.js';
import { VoiceCaster, type VoiceCast } from './voice-caster.js';
import { VoiceSoundboardBridge, type McpToolCall } from './audio-bridge.js';

export type ImmersionConfig = {
  audioEnabled?: boolean;
  voiceEnabled?: boolean;
};

/** Orchestrates the full immersion pipeline: state → hooks → audio → voice. */
export class ImmersionRuntime {
  readonly stateMachine: PresentationStateMachine;
  readonly hookManager: HookManager;
  readonly audioDirector: AudioDirector;
  readonly voiceCaster: VoiceCaster;
  readonly soundRegistry: SoundRegistry;
  readonly bridge: VoiceSoundboardBridge;

  constructor(config?: ImmersionConfig) {
    this.stateMachine = new PresentationStateMachine();
    this.hookManager = new HookManager();
    this.audioDirector = new AudioDirector();
    this.voiceCaster = new VoiceCaster();
    this.soundRegistry = new SoundRegistry();

    // Load core sound pack
    this.soundRegistry.load(CORE_SOUND_PACK);

    // Create bridge
    this.bridge = new VoiceSoundboardBridge(
      this.soundRegistry,
      config?.audioEnabled ?? true,
    );

    // Register built-in hooks
    registerBuiltinHooks(this.hookManager);
  }

  /**
   * Initialize voice casting for all entities in the world, and seed presentation state
   * from any persisted combat-core module state (F-f13b58f3).
   *
   * ImmersionRuntime — and therefore its PresentationStateMachine — is constructed fresh
   * exactly once per session (Game's constructor) with no restore path of its own, so
   * loading a save made mid-combat would otherwise start back at 'exploration'. The
   * player's next action would then re-derive 'combat' from that turn's fresh events,
   * making justEnteredCombat true again and replaying combatStartHook's one-time SFX/music
   * cues for a fight that was already in progress before the save.
   */
  initialize(engine: Engine): void {
    this.voiceCaster.autoCast(engine.world);

    const combatCore = engine.world.modules['combat-core'] as
      | { inCombat?: boolean }
      | undefined;
    if (combatCore?.inCombat) {
      this.logTransition(this.stateMachine.transition('combat', 'session-restore'));
    }
  }

  /**
   * Whether debug logging is enabled. Set externally if needed (e.g.
   * game.ts's `this.immersion.debugMode = this.debugLog.enabled`).
   *
   * F-06fffa64: the setter also propagates to `hookManager.debugMode` below,
   * so this one flag gates BOTH this file's own `[immersion] ...`
   * diagnostics AND HookManager.fire()'s hook-threw diagnostic (F-9ba5f482)
   * -- before this, HookManager had no debugMode/gate of its own at all, so
   * flipping ImmersionRuntime's debugMode had no way to reach the sibling
   * gate one layer down and hooks.ts's diagnostic stayed unconditional
   * regardless. Read/write behavior for existing callers is unchanged --
   * `runtime.debugMode = x` and `if (runtime.debugMode)` both still work
   * exactly as they did when this was a plain field.
   */
  private _debugMode = false;

  get debugMode(): boolean {
    return this._debugMode;
  }

  set debugMode(value: boolean) {
    this._debugMode = value;
    this.hookManager.debugMode = value;
  }

  /**
   * F-4ec3609b / F-961f14aa: memoizes the from/to of the last inferAndTransition() call,
   * keyed by engine.tick, so a same-turn processPresentation() call can detect that
   * this turn's inference+transition already ran and reuse the result instead of
   * re-inferring/re-transitioning. Keyed on tick (not just "the last call") so a stale
   * value from a turn whose caller never followed up with processPresentation() can't
   * be mistaken for the current turn's -- mirrors PresentationStateMachine.
   * inferFromEvents's own lastDecrementTick guard, which solves the identical class of
   * same-turn-vs-stale-call problem one layer down. Consumed (reset to undefined) the
   * moment processPresentation() reads it, so it never survives past the turn it was
   * computed for.
   */
  private pendingTurnInference?: { tick: number; from: PresentationState; to: PresentationState };

  /**
   * F-d8d1f51d: ImmersionRuntime's own ambient/music de-dup, independent of
   * AudioDirector.schedule()'s cooldown map. That cooldown (verified against the
   * installed @ai-rpg-engine/audio-director package, dist/director.js's schedule())
   * only ever gates commands whose action is literally 'play' -- ambient cues always
   * carry crossfade/start/stop (never 'play') and music cues carry
   * intensify/soften/crossfade/play, so ambient cues and non-play music cues bypass
   * it entirely, every time. Hook-sourced cues (executeMergedHookResult below) also
   * bypass AudioDirector entirely and call the bridge directly, so they need the same
   * protection. Tracked per-instance (across calls to processPresentation, not per
   * call) and shared by BOTH dispatch paths, so a sustained scene mood -- the LLM
   * narrator re-proposing the identical ambient/music cue turn after turn per
   * prompts/narrate-scene.ts's "use sfx/ambient based on scene mood" guidance, or a
   * hook cue followed by the narrator independently proposing the same cue -- stops
   * repeating the moment the layer/channel is already in that state, rather than
   * printing the same dim cue line every turn for as long as the mood persists.
   */
  private lastAmbientAction = new Map<string, AmbientCue['action']>();
  private lastMusicState: { action: MusicCue['action']; trackId?: string } | undefined;

  /**
   * WO-A5-10 (slice A5 §2, design lock 2): last district-mood `tone` this
   * instance has observed per district id, backing
   * `deriveDistrictMoodMusicCue` below. game-core's own `runWorldRound`
   * compares `getWorldTickState(world).districtTones[districtId]`
   * before/after the tick for its `moodTransition` narration param (a
   * different call site, not reachable from processPresentation's
   * (engine, events, verb, narrationPlan) inputs) -- this is this domain's
   * OWN independent before/after comparison, per ADDENDUM-runtime-foundry's
   * fallback instruction. One instance per session (mirrors
   * lastAmbientAction/lastMusicState immediately above), so "before" is
   * simply "what this method returned the last time it ran", not a value
   * threaded in from outside.
   */
  private lastDistrictTones = new Map<string, string>();

  /**
   * F-251bd7d7: consecutive-failure streak per processPresentation pipeline stage
   * ('pre-narration' | 'event-hooks' | 'audio' | 'post-narration'), backing
   * noteStageFailure()/noteStageSuccess() below. All four stages already degrade to
   * silence on their own exception (PFE-008) with a diagnostic ONLY behind
   * `if (this.debugMode) console.error(...)` -- a non-debug (default) session had no
   * way to ever learn a stage was silently degrading, turn after turn, for the rest
   * of the session. This streak drives an UNCONDITIONAL (non-debug-gated) log on a
   * stage's first failure and again every STAGE_ESCALATION_INTERVAL consecutive
   * turns it keeps failing, so a recurring problem stays visible without a line
   * every single turn.
   */
  private stageFailureStreak = new Map<string, number>();
  private static readonly STAGE_ESCALATION_INTERVAL = 20;

  /** F-251bd7d7: unconditional first-occurrence + escalating failure log for a stage. */
  private noteStageFailure(stage: string, err: unknown): void {
    const streak = (this.stageFailureStreak.get(stage) ?? 0) + 1;
    this.stageFailureStreak.set(stage, streak);
    if (streak === 1) {
      console.error(`[immersion] presentation stage "${stage}" degraded to silence:`, err);
    } else if (streak % ImmersionRuntime.STAGE_ESCALATION_INTERVAL === 0) {
      console.error(
        `[immersion] presentation stage "${stage}" still degrading to silence ` +
        `(${streak} consecutive turns):`,
        err,
      );
    }
  }

  /** F-251bd7d7: resets a stage's consecutive-failure streak once it succeeds again. */
  private noteStageSuccess(stage: string): void {
    this.stageFailureStreak.set(stage, 0);
  }

  /** Drop ambient cues that just repeat a layer's already-active action (F-d8d1f51d). */
  private dedupeAmbientCues(cues: AmbientCue[]): AmbientCue[] {
    const kept: AmbientCue[] = [];
    for (const cue of cues) {
      if (this.lastAmbientAction.get(cue.layerId) === cue.action) continue;
      this.lastAmbientAction.set(cue.layerId, cue.action);
      kept.push(cue);
    }
    this.capLastAmbientAction();
    return kept;
  }

  /** F-8986d316: whether capLastAmbientAction's one-time debug warning has already fired. */
  private hasWarnedAmbientActionCapDrop = false;

  /**
   * F-8986d316: lastAmbientAction is keyed on narrator-proposed AmbientCue.layerId, a
   * bare string (not a closed enum -- verified against @ai-rpg-engine/presentation's
   * types.ts) populated by free-text LLM scene generation every turn
   * (prompts/narrate-scene.ts, out of this domain). A narrator that is not perfectly
   * consistent in naming ambient layers across a long campaign session would
   * otherwise add one Map entry per distinct layerId it ever proposes, with no
   * eviction, for the lifetime of the ImmersionRuntime instance (one per session).
   * Evict-oldest (Map preserves insertion order) once the bound is exceeded --
   * matches this file's other per-turn LLM-input caps (MAX_SFX_PER_PLAN /
   * MAX_AMBIENT_PER_PLAN in mergeHookResults, MAX_UI_EFFECTS_PER_PLAN in
   * processPresentation) rather than introducing a differently-shaped cap.
   */
  private capLastAmbientAction(): void {
    const MAX_AMBIENT_ACTION_LAYERS = 32;
    while (this.lastAmbientAction.size > MAX_AMBIENT_ACTION_LAYERS) {
      const oldestKey = this.lastAmbientAction.keys().next().value;
      if (oldestKey === undefined) break;
      this.lastAmbientAction.delete(oldestKey);
      if (this.debugMode && !this.hasWarnedAmbientActionCapDrop) {
        this.hasWarnedAmbientActionCapDrop = true;
        console.error(
          `[immersion] lastAmbientAction exceeded ${MAX_AMBIENT_ACTION_LAYERS} distinct ambient ` +
          `layer ids -- evicting oldest entries (the narrator is naming ambient layers ` +
          `inconsistently). Logged once per session.`,
        );
      }
    }
  }

  /**
   * Drop a music cue that just repeats the channel's already-active action/track
   * (F-d8d1f51d). Returns undefined when the cue is a redundant repeat, so callers
   * can treat "nothing to do" the same way they already treat an absent musicCue.
   */
  private dedupeMusicCue(cue: MusicCue | undefined): MusicCue | undefined {
    if (!cue) return undefined;
    if (
      this.lastMusicState &&
      this.lastMusicState.action === cue.action &&
      this.lastMusicState.trackId === cue.trackId
    ) {
      return undefined;
    }
    this.lastMusicState = { action: cue.action, trackId: cue.trackId };
    return cue;
  }

  /**
   * WO-A5-10 (slice A5 §2, design lock 2): when the player's CURRENT
   * district's mood `tone` differs from the tone this instance last
   * observed for that same district, re-derive the zone music bed through
   * the engine's `districtToneToSoundMood(tone)` composed with this
   * runtime's own loaded `soundRegistry` (the exact composition
   * `districtToneToSoundMood`'s own doc comment in soundpack-core
   * describes -- "composed with a loaded SoundRegistry's
   * pickMusicStem/pickAmbientBed"). Returns undefined (no cue) when:
   *   - the player's zone doesn't resolve to a district at all;
   *   - the tick hasn't computed a tone for this district yet;
   *   - this is the FIRST time this instance has observed a tone for this
   *     district (nothing to compare against -- first-arrival scene-setting
   *     is enterRoomHook's/the narrator's own job, not this method's);
   *   - the tone is unchanged from last observation (byte-identical when no
   *     transition, per the WO);
   *   - the tone is one `districtToneToSoundMood` doesn't recognize, or no
   *     loaded music stem matches the resulting mood query.
   * `hashRoll(districtId)` keeps the pick deterministic across runs (same
   * district, same stem) without a hidden RNG, matching every other
   * roll-consuming call in this codebase.
   */
  private deriveDistrictMoodMusicCue(engine: Engine): MusicCue | undefined {
    const districtId = getDistrictForZone(engine.world, engine.world.locationId);
    if (!districtId) return undefined;

    const tone = getWorldTickState(engine.world).districtTones?.[districtId];
    if (!tone) return undefined;

    const previousTone = this.lastDistrictTones.get(districtId);
    this.lastDistrictTones.set(districtId, tone);
    if (previousTone === undefined || previousTone === tone) return undefined;

    const moods = districtToneToSoundMood(tone);
    if (!moods || moods.length === 0) return undefined;

    const stem = this.soundRegistry.pickMusicStem({ mood: moods }, hashRoll(districtId));
    if (!stem) return undefined;

    return { action: 'crossfade', trackId: stem.id, fadeMs: 2000 };
  }

  /**
   * Run this turn's presentation-state inference and, if it changed, the transition —
   * shared by inferAndTransition() and processPresentation()'s own fallback (used when
   * nothing called inferAndTransition() first this turn). Factoring this out keeps
   * stateMachine.transition() reachable from exactly one place, so "at most once per
   * turn" is trivially true regardless of which caller ends up running it.
   */
  private runInference(
    engine: Engine,
    events: ResolvedEvent[],
    verb: string,
  ): { from: PresentationState; to: PresentationState } {
    const from = this.stateMachine.current;
    // F-277b5eca / F-ed267860: pass the real playerId (so player death resolves to
    // 'menu' instead of the dead '__player__' sentinel) and the real engine tick (so the
    // aftermath countdown guard's tick ?? -2 fallback doesn't wedge at a constant value
    // forever). These two args were both silently missing from the original sole
    // production call site.
    const to = this.stateMachine.inferFromEvents(
      events,
      verb,
      engine.tick,
      engine.world.playerId,
      engine.world,
    );
    if (to !== from) {
      // F-aaaf50d9: transition() itself never logged anything, and this call site used
      // to discard the returned StateTransition entirely, so no code path -- not even
      // --debug -- could ever surface which state a turn transitioned to/from and why.
      this.logTransition(this.stateMachine.transition(to, verb));
    }
    return { from, to };
  }

  /**
   * F-4ec3609b / F-961f14aa (runtime-foundry's half of the cross-domain presentation-
   * state ordering contract; game-core lands the caller half): run this turn's
   * presentation-state inference + transition in isolation, so a caller building
   * narration context (turn-loop.ts's executeTurn) can read the CURRENT, post-transition
   * state for THIS turn instead of the previous turn's stale one. Before this method
   * existed, the only way to read presentation state ahead of narration was a bare
   * `stateMachine.current` get performed BEFORE processPresentation() ran its own
   * inference later in the same pipeline -- so a combat-entry turn's narration prompt
   * saw 'exploration' (the prior turn's state) instead of 'combat'.
   *
   * Idempotent-safe with processPresentation(): this call's result is cached
   * (pendingTurnInference) and reused by processPresentation()'s own step 1 below
   * instead of it re-transitioning, so stateMachine.transition() still runs at most
   * once per turn and justEnteredCombat-gated hooks (combat-start) still fire exactly
   * once per fight, not twice, even though two methods can now touch presentation
   * state in the same turn.
   *
   * Signature note for the coordinator stitching this against game-core's caller half:
   * takes `engine` as its first argument, matching processPresentation()'s own
   * convention. inferFromEvents() needs engine.tick and engine.world.playerId/world
   * (see runInference() above and F-277b5eca/F-ed267860) to reproduce
   * processPresentation's existing inference exactly, so a bare (events, verb) form
   * cannot do this without either losing those two fixes or this class caching its own
   * `engine` reference (which it deliberately doesn't do — every other method takes
   * `engine` fresh per call rather than assuming session-lifetime affinity).
   *
   * F-f3781f2a/SLATE-6: broadened to return the full {from, to, trigger}
   * StateTransition (presentation-state.ts) rather than the bare `to` state. `.to` is
   * exactly what callers previously got back directly (no behavior change for them);
   * `.from` is new, and lets a death-framing consumer derive
   * `justDied = to === 'menu' && from !== 'menu'` from the SAME state-machine read
   * this method's caller already performs for narration, instead of a second
   * independent signal. Two alternatives were considered and rejected: a one-shot
   * transition listener/event (this exact shape existed in this file before
   * F-81abb66a deleted it — see PresentationStateMachine.transition()'s doc comment
   * above for why "wire a listener nobody currently subscribes to" was rejected once
   * already); and a HookResult-shaped death signal threaded back through
   * fireEventHooks' return type, which would be a THIRD independent computation of a
   * fact inferFromEvents's hasDeath check already establishes (the first is
   * inferFromEvents itself; the second is deathHook's own internal recheck in
   * hooks.ts) — seeing fireEventHooks' justEnteredMenu gate below reuse the one
   * from/to pair already in hand avoids adding a fourth.
   */
  inferAndTransition(engine: Engine, events: ResolvedEvent[], verb: string): StateTransition {
    const { from, to } = this.runInference(engine, events, verb);
    this.pendingTurnInference = { tick: engine.tick, from, to };
    return { from, to, trigger: verb };
  }

  /** Process events through the presentation pipeline, returning MCP tool calls. */
  async processPresentation(
    engine: Engine,
    events: ResolvedEvent[],
    verb: string,
    narrationPlan?: NarrationPlan,
  ): Promise<McpToolCall[]> {
    // 1. Infer and transition presentation state -- unless inferAndTransition() already
    // did this for the current turn (F-4ec3609b/F-961f14aa contract), in which case
    // reuse its from/to instead of re-inferring. Re-running inferFromEvents here would
    // be safe in isolation (it's idempotent within a tick — see its own
    // lastDecrementTick guard), but reading priorState fresh from `stateMachine.current`
    // at THIS point would return the state inferAndTransition() already transitioned it
    // to, not the state the turn actually started in — silently breaking
    // justEnteredCombat below every time a caller uses the new two-call ordering.
    const pending = this.pendingTurnInference;
    this.pendingTurnInference = undefined; // one-shot: never reused past this call
    const { from: priorState, to: inferredState } =
      pending && pending.tick === engine.tick ? pending : this.runInference(engine, events, verb);
    // F-0acb03fe: whether combat was JUST entered this call, mirroring
    // PresentationStateMachine.transition()'s own `to === 'combat' && from !== 'combat'`
    // guard. Combat.* events recur every turn of an ongoing fight, so gating combat-start
    // dispatch on the raw event shape (as fireEventHooks used to) fired it every turn
    // instead of once per fight.
    const justEnteredCombat = inferredState === 'combat' && priorState !== 'combat';
    // F-f3781f2a/SLATE-6: whether death was JUST entered this call, mirroring
    // justEnteredCombat immediately above -- both derive an edge from the same
    // {priorState, inferredState} pair runInference() already produced this turn.
    // Replaces fireEventHooks' own death gate's previous raw
    // isPlayerDefeatEvent(...) || isPlayerAtZeroHp(...) OR-check, which was
    // LEVEL-triggered off current world state: it silently re-fired the death
    // hookPoint every subsequent turn the player's hp remained at/below zero instead
    // of once per death episode. Coverage is unchanged: inferredState === 'menu' is
    // exclusively reached via inferFromEvents's hasDeath check (presentation-state.ts),
    // which already ORs both isPlayerDefeatEvent and isPlayerAtZeroHp, so both death
    // paths (a combat defeat event and a hazard death with no matching event at all,
    // F-e57d6a60) still resolve to this gate.
    const justEnteredMenu = inferredState === 'menu' && priorState !== 'menu';

    // PFE-008: Wrap audio/hook pipeline in try/catch so failures degrade to silence
    // rather than killing the turn. The player should never lose gameplay to an audio glitch.
    let preResults: HookResult[] = [];
    let specificCalls: McpToolCall[] = [];
    let audioCalls: McpToolCall[] = [];
    // F-3fce4373: a dedicated, append-only channel for "this stage of the pipeline
    // threw and degraded to silence" markers, separate from specificCalls/audioCalls
    // -- both of those get REASSIGNED (not appended to) by later stages, so pushing a
    // marker into either one risks a subsequent stage silently discarding it before
    // the function returns.
    const degradedStages: McpToolCall[] = [];

    // 2. Fire pre-narration hooks (guarded — F-e2f0cd27: this was previously unwrapped,
    // so a throwing pre-narration hook rejected the whole call instead of degrading
    // gracefully like every other stage of this pipeline).
    try {
      const preContext: HookContext = {
        hookPoint: 'pre-narration',
        world: engine.world,
        events,
        presentationState: this.stateMachine.current,
      };
      preResults = this.hookManager.fire(preContext);
      this.noteStageSuccess('pre-narration');
    } catch (err) {
      if (this.debugMode) {
        console.error('[immersion] Pre-narration hook error (degrading to silence):', err);
      }
      this.noteStageFailure('pre-narration', err);
      // F-3fce4373: a non-debug player previously saw nothing distinguishing "no cue
      // this turn" from "a cue was computed and then silently dropped" -- push a
      // low-key marker through the same McpToolCall channel game.ts's onPresentation
      // sink already carries end-to-end to cli-display's presentation renderer
      // (mirrors the __music_intent__/__ui_effect_intent__ convention audio-bridge.ts
      // already uses for other renderer-owned intents). An unrecognized tool name is
      // a no-op in today's renderer, so this degrades harmlessly until a future
      // cli-display change adds a case for it -- matching the same subsystem-hiccup
      // tone game.ts's post-turn tick block and its own emitPresentation wrapper
      // already give the player for their adjacent failure modes.
      degradedStages.push({ tool: '__presentation_degraded__', params: { stage: 'pre-narration' } });
    }

    try {
      // 3. Fire specific hooks based on events
      specificCalls = await this.fireEventHooks(engine, events, justEnteredCombat, justEnteredMenu);
      this.noteStageSuccess('event-hooks');
    } catch (err) {
      if (this.debugMode) {
        console.error('[immersion] Hook error (degrading to silence):', err);
      }
      this.noteStageFailure('event-hooks', err);
      degradedStages.push({ tool: '__presentation_degraded__', params: { stage: 'event-hooks' } });
    }

    try {
      // 4. If we have a narration plan, schedule through audio director
      if (narrationPlan) {
        // Merge hook cues into the plan
        const mergedPlan = this.mergeHookResults(narrationPlan, preResults);

        // Schedule through audio director. Engine 2.9.x: schedule() takes the
        // caller's clock for cooldown bookkeeping — wall time is the right
        // semantic here (audio cue cooldowns pace the live session, not the
        // deterministic world state).
        const commands = this.audioDirector.schedule(mergedPlan, Date.now());

        // Execute through bridge
        audioCalls = await this.bridge.executeCommands(commands);

        // F-4ece453e: mergedPlan.uiEffects (narrator-authored flash/shake/fade-in/
        // fade-out/border-pulse cues from NarrationPlan.uiEffects, plus any
        // pre-narration-hook uiEffects mergeHookResults folded in above) never
        // reach the player through audioDirector.schedule()/executeCommands():
        // @ai-rpg-engine/audio-director's AudioDomain type has no 'ui' member and
        // scheduleAll() never reads plan.uiEffects at all (verified against
        // dist/scheduler.js), so they were computed correctly and then silently
        // dropped. Dispatch them straight to the bridge instead, the same way
        // executeMergedHookResult already does for hook-sourced uiEffects below.
        // Capped defensively — uiEffects is populated by the LLM narrator every
        // turn (prompts/narrate-scene.ts), so a malformed plan must not be able
        // to flood the terminal with effect intents in a single turn.
        const MAX_UI_EFFECTS_PER_PLAN = 3;
        for (const effect of mergedPlan.uiEffects.slice(0, MAX_UI_EFFECTS_PER_PLAN)) {
          await this.bridge.applyUiEffect(effect);
        }
        audioCalls = [...audioCalls, ...this.bridge.flush()];
      }

      // WO-A5-10 (slice A5 §2): re-derive the zone music bed on a
      // district-mood transition, independent of whether this turn carries
      // a narrationPlan at all. Skipped on the very turn combat is entered
      // (justEnteredCombat) so a same-round ambush's own combatStartHook
      // 'intensify' sting (fireEventHooks, above) isn't immediately
      // clobbered by a mood-bed crossfade landing right after it --
      // dedupeMusicCue's shared lastMusicState only suppresses a REPEATED
      // action/trackId pair, not a different cue arriving the same turn.
      // deriveDistrictMoodMusicCue still runs every turn regardless (not
      // skipped) so its own before/after bookkeeping stays current even on
      // a turn whose cue is suppressed here.
      const moodMusicCue = this.deriveDistrictMoodMusicCue(engine);
      if (moodMusicCue && !justEnteredCombat) {
        const dedupedMoodCue = this.dedupeMusicCue(moodMusicCue);
        if (dedupedMoodCue) {
          await this.bridge.setMusic(dedupedMoodCue);
          audioCalls = [...audioCalls, ...this.bridge.flush()];
        }
      }
      this.noteStageSuccess('audio');
    } catch (err) {
      if (this.debugMode) {
        console.error('[immersion] Audio pipeline error (degrading to silence):', err);
      }
      this.noteStageFailure('audio', err);
      degradedStages.push({ tool: '__presentation_degraded__', params: { stage: 'audio' } });
    }

    // 5. Fire post-narration hooks (also guarded)
    try {
      const postContext: HookContext = {
        hookPoint: 'post-narration',
        world: engine.world,
        events,
        presentationState: this.stateMachine.current,
        narrationPlan,
      };
      // F-23bce472: capture the result the same way pre-narration's is captured into
      // `preResults` above -- unlike pre-narration, nothing consumes post-narration
      // results yet (registerBuiltinHooks never registers this point either), so there
      // is genuinely nothing to do with it beyond surfacing that it exists. Without
      // this, a future contributor who registers the first post-narration hook would
      // have its return value silently discarded with no error or warning.
      const postResults = this.hookManager.fire(postContext);
      if (this.debugMode && postResults.length > 0) {
        console.error(
          '[immersion] post-narration hook produced results that nothing consumes yet:',
          postResults,
        );
      }
      this.noteStageSuccess('post-narration');
    } catch (err) {
      if (this.debugMode) {
        console.error('[immersion] Post-narration hook error:', err);
      }
      this.noteStageFailure('post-narration', err);
      degradedStages.push({ tool: '__presentation_degraded__', params: { stage: 'post-narration' } });
    }

    return [...specificCalls, ...audioCalls, ...degradedStages];
  }

  /**
   * F-aaaf50d9: log a presentation-state transition under debugMode. Shared by both
   * production call sites (processPresentation's per-turn inference and initialize()'s
   * session-restore seed) so a player-reported "state seems stuck" bug has something to
   * trace via the existing --debug mechanism instead of nothing at all.
   */
  private logTransition(t: StateTransition): void {
    if (this.debugMode) {
      console.error(`[immersion] state: ${t.from} -> ${t.to} (${t.trigger})`);
    }
  }

  /**
   * Get voice cast for an NPC.
   *
   * F-7e171dea: optional `engine` lets a caller that has it in hand (e.g.
   * turn-loop.ts's executeTurn) opt into VoiceCaster.getVoice's infer-and-cache-on-
   * first-miss path for an entity that was added to the world after the one-time
   * autoCast() call in initialize() -- see that method's doc comment. Omitting
   * `engine` preserves the exact prior behavior (fall back to the narrator voice).
   */
  getVoiceCast(entityId: string, engine?: Engine): VoiceCast {
    const entity = engine?.world.entities[entityId];
    return this.voiceCaster.getVoice(entityId, entity);
  }

  /** Get the narrator voice. */
  getNarratorVoice(): VoiceCast {
    return this.voiceCaster.getNarratorVoice();
  }

  private async fireEventHooks(
    engine: Engine,
    events: ResolvedEvent[],
    justEnteredCombat: boolean,
    justEnteredMenu: boolean,
  ): Promise<McpToolCall[]> {
    const calls: McpToolCall[] = [];
    const state = this.stateMachine.current;

    // Combat hooks — fire only on the turn combat is entered (F-0acb03fe), not on every
    // turn combat.* events keep appearing (they recur for the whole fight).
    if (justEnteredCombat) {
      const combatCtx: HookContext = {
        hookPoint: 'combat-start',
        world: engine.world,
        events,
        presentationState: state,
      };
      const results = this.hookManager.fire(combatCtx);
      const merged = HookManager.mergeResults(results);
      calls.push(...(await this.executeMergedHookResult(merged)));
    }

    // Combat end — gated on the encounter actually being over. Two independent
    // signals both stay live this wave (ADDENDUM-runtime-foundry):
    //  1. F-2126ffd0/F-99563c70: the engine's own authoritative `combat.encounter.cleared`
    //     event (3.11+), fired for EITHER outcome — 'victory' or 'retreat'. Before this,
    //     a retreat clear (which never carries a combat.entity.defeated at all — engine
    //     engagement-core.ts's flee branch) never reached this dispatch gate, so a
    //     successful escape got no combat-end cue of any kind.
    //  2. F-d9fc231c: the legacy derivation (a combat.entity.defeated event and no
    //     hostile remaining in zone) — not just on "a combat.entity.defeated event
    //     exists": a multi-hostile fight fires that event once per kill, well before
    //     the last enemy falls. Kept for fixture/test event streams and any
    //     3.10-shaped consumer that never emits combat.encounter.cleared at all.
    // Mirrors the gate now inside combatEndHook itself (hooks.ts) so no OTHER hook
    // that might ever get registered at 'combat-end' has to remember this check
    // independently.
    const clearedEvent = events.find((e) => e.type === 'combat.encounter.cleared');
    const legacyEncounterOver =
      events.some((e) => e.type === 'combat.entity.defeated') &&
      !hasLivingHostiles(engine.world);
    if (clearedEvent || legacyEncounterOver) {
      // F-2126ffd0: resolve the outcome once here and pass it through HookContext
      // (additive optional field — see hooks.ts) so combatEndHook doesn't have to
      // re-parse the event payload; absent outcome (legacy-only dispatch, no cleared
      // event) leaves the field unset and combatEndHook's own fallback treats that
      // as 'victory', matching a 3.10-shaped bare combat.entity.defeated stream.
      const outcome: 'victory' | 'retreat' | undefined = clearedEvent
        ? (clearedEvent.payload as { outcome?: string }).outcome === 'retreat'
          ? 'retreat'
          : 'victory'
        : undefined;
      const endCtx: HookContext = {
        hookPoint: 'combat-end',
        world: engine.world,
        events,
        presentationState: state,
        ...(outcome ? { outcome } : {}),
      };
      const results = this.hookManager.fire(endCtx);
      const merged = HookManager.mergeResults(results);
      calls.push(...(await this.executeMergedHookResult(merged)));
    }

    // Room entry
    if (events.some((e) => e.type === 'world.zone.entered')) {
      const roomCtx: HookContext = {
        hookPoint: 'enter-room',
        world: engine.world,
        events,
        presentationState: state,
      };
      const results = this.hookManager.fire(roomCtx);
      const merged = HookManager.mergeResults(results);
      calls.push(...(await this.executeMergedHookResult(merged)));
    }

    // Death — edge-triggered (F-f3781f2a/SLATE-6): gated on justEnteredMenu, computed
    // once in processPresentation from the state machine's own from/to transition
    // (mirrors the justEnteredCombat gate immediately above, F-0acb03fe). Previously
    // gated on a raw isPlayerDefeatEvent(...) || isPlayerAtZeroHp(...) OR-check
    // (F-adc0d512; F-e57d6a60 for the hazard-death OR-arm), which is LEVEL-triggered
    // off current world state rather than an edge, so it silently re-fired this
    // hookPoint every subsequent turn the player's hp stayed at/below zero instead of
    // once per death episode. Coverage is unchanged, not narrowed: inferredState ===
    // 'menu' is exclusively reached via inferFromEvents's hasDeath check
    // (presentation-state.ts), which already ORs both isPlayerDefeatEvent and
    // isPlayerAtZeroHp, so both death paths (a combat defeat event and a hazard death
    // with no matching event at all) still reach this gate. deathHook itself
    // (hooks.ts) still independently re-checks the same condition to decide what to
    // render, not whether to fire — that duplication is pre-existing and intentionally
    // left alone (see inferAndTransition's doc comment above for why a third
    // computation of this fact was rejected instead of reused).
    if (justEnteredMenu) {
      const deathCtx: HookContext = {
        hookPoint: 'death',
        world: engine.world,
        events,
        presentationState: state,
      };
      const results = this.hookManager.fire(deathCtx);
      const merged = HookManager.mergeResults(results);
      calls.push(...(await this.executeMergedHookResult(merged)));
    }

    return calls;
  }

  private async executeMergedHookResult(merged: HookResult): Promise<McpToolCall[]> {
    if (merged.sfxCues) {
      for (const sfx of merged.sfxCues) {
        await this.bridge.playSfx(sfx);
      }
    }
    if (merged.ambientCues) {
      // F-d8d1f51d: hook-sourced ambient cues bypass AudioDirector entirely, so they
      // need this domain's own de-dup applied here directly (mergeHookResults below
      // applies the same de-dup to the narrator-plan path).
      for (const ambient of this.dedupeAmbientCues(merged.ambientCues)) {
        await this.bridge.setAmbient(ambient);
      }
    }
    if (merged.musicCue) {
      // F-d8d1f51d: same de-dup, shared state -- a hook-sourced music cue (e.g.
      // combatStartHook's one-time 'intensify') and a later narrator-authored cue
      // proposing the identical action recognize each other as redundant.
      const musicCue = this.dedupeMusicCue(merged.musicCue);
      if (musicCue) {
        await this.bridge.setMusic(musicCue);
      }
    }
    // F-6ef6e5a0: uiEffects (e.g. deathHook's fade-to-black) were accumulated by
    // HookManager.mergeResults but never dispatched here, so the only built-in hook
    // that populates uiEffects had its cue silently discarded on every player death
    // — VoiceSoundboardBridge.applyUiEffect had zero callers anywhere in the codebase.
    if (merged.uiEffects) {
      for (const effect of merged.uiEffects) {
        await this.bridge.applyUiEffect(effect);
      }
    }
    return this.bridge.flush();
  }

  private mergeHookResults(
    plan: NarrationPlan,
    hookResults: HookResult[],
  ): NarrationPlan {
    const merged = HookManager.mergeResults(hookResults);
    // F-52475879: sfx/ambientLayers are populated by the LLM narrator every turn
    // (prompts/narrate-scene.ts's "choose sfx/ambient based on the scene mood ... use
    // sparingly" guidance is prose, not a schema-enforced limit) -- the same per-turn
    // trust boundary that motivated capping the sibling uiEffects field on this same
    // NarrationPlan (MAX_UI_EFFECTS_PER_PLAN, F-4ece453e/F-6ef6e5a0, in
    // processPresentation above). AudioDirector's per-resource cooldown only suppresses
    // repeats of the *same* effectId, not a plan carrying many *distinct* cues, so a
    // malformed narrator response must be capped here before it reaches
    // audioDirector.schedule()/bridge.executeCommands().
    const MAX_SFX_PER_PLAN = 5;
    const MAX_AMBIENT_PER_PLAN = 3;
    // F-d8d1f51d: de-dup AFTER capping, same order the cap itself already ran in --
    // this only ever REMOVES entries relative to the uncapped behavior, so it can't
    // let more cues through than MAX_AMBIENT_PER_PLAN allowed before. Independent of
    // AudioDirector.schedule()'s cooldown (see the field doc comment above), which
    // never covered ambient/music cross-turn spacing in the first place.
    const ambientLayers = this.dedupeAmbientCues(
      [...plan.ambientLayers, ...(merged.ambientCues ?? [])].slice(0, MAX_AMBIENT_PER_PLAN),
    );
    const musicCue = this.dedupeMusicCue(merged.musicCue ?? plan.musicCue);
    return {
      ...plan,
      sfx: [...plan.sfx, ...(merged.sfxCues ?? [])].slice(0, MAX_SFX_PER_PLAN),
      ambientLayers,
      uiEffects: [...plan.uiEffects, ...(merged.uiEffects ?? [])],
      musicCue,
    };
  }
}
