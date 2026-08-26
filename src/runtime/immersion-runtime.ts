// Immersion Runtime — wires presentation state, hooks, audio director, and voice caster

import type { Engine, ResolvedEvent } from '@ai-rpg-engine/core';
import type { NarrationPlan } from '@ai-rpg-engine/presentation';
import { AudioDirector } from '@ai-rpg-engine/audio-director';
import { SoundRegistry, CORE_SOUND_PACK } from '@ai-rpg-engine/soundpack-core';
import {
  PresentationStateMachine,
  type StateTransition,
} from './presentation-state.js';
import {
  HookManager,
  registerBuiltinHooks,
  isPlayerDefeatEvent,
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
      this.stateMachine.transition('combat', 'session-restore');
    }
  }

  /** Whether debug logging is enabled. Set externally if needed. */
  debugMode = false;

  /** Process events through the presentation pipeline, returning MCP tool calls. */
  async processPresentation(
    engine: Engine,
    events: ResolvedEvent[],
    verb: string,
    narrationPlan?: NarrationPlan,
  ): Promise<McpToolCall[]> {
    // 1. Infer and transition presentation state
    const priorState = this.stateMachine.current;
    // F-277b5eca / F-ed267860: pass the real playerId (so player death resolves to
    // 'menu' instead of the dead '__player__' sentinel) and the real engine tick (so the
    // aftermath countdown guard's tick ?? -2 fallback doesn't wedge at a constant value
    // forever). These two args were both silently missing from the sole production call
    // site.
    const inferredState = this.stateMachine.inferFromEvents(
      events,
      verb,
      engine.tick,
      engine.world.playerId,
    );
    if (inferredState !== priorState) {
      this.stateMachine.transition(inferredState, verb);
    }
    // F-0acb03fe: whether combat was JUST entered this call, mirroring
    // PresentationStateMachine.transition()'s own `to === 'combat' && from !== 'combat'`
    // guard. Combat.* events recur every turn of an ongoing fight, so gating combat-start
    // dispatch on the raw event shape (as fireEventHooks used to) fired it every turn
    // instead of once per fight.
    const justEnteredCombat = inferredState === 'combat' && priorState !== 'combat';

    // PFE-008: Wrap audio/hook pipeline in try/catch so failures degrade to silence
    // rather than killing the turn. The player should never lose gameplay to an audio glitch.
    let preResults: HookResult[] = [];
    let specificCalls: McpToolCall[] = [];
    let audioCalls: McpToolCall[] = [];

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
    } catch (err) {
      if (this.debugMode) {
        console.error('[immersion] Pre-narration hook error (degrading to silence):', err);
      }
    }

    try {
      // 3. Fire specific hooks based on events
      specificCalls = await this.fireEventHooks(engine, events, justEnteredCombat);
    } catch (err) {
      if (this.debugMode) {
        console.error('[immersion] Hook error (degrading to silence):', err);
      }
    }

    try {
      // 4. If we have a narration plan, schedule through audio director
      if (narrationPlan) {
        // Merge hook cues into the plan
        const mergedPlan = this.mergeHookResults(narrationPlan, preResults);

        // Schedule through audio director
        const commands = this.audioDirector.schedule(mergedPlan);

        // Execute through bridge
        audioCalls = await this.bridge.executeCommands(commands);
      }
    } catch (err) {
      if (this.debugMode) {
        console.error('[immersion] Audio pipeline error (degrading to silence):', err);
      }
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
      this.hookManager.fire(postContext);
    } catch (err) {
      if (this.debugMode) {
        console.error('[immersion] Post-narration hook error:', err);
      }
    }

    return [...specificCalls, ...audioCalls];
  }

  /** Get voice cast for an NPC. */
  getVoiceCast(entityId: string): VoiceCast {
    return this.voiceCaster.getVoice(entityId);
  }

  /** Get the narrator voice. */
  getNarratorVoice(): VoiceCast {
    return this.voiceCaster.getNarratorVoice();
  }

  private async fireEventHooks(
    engine: Engine,
    events: ResolvedEvent[],
    justEnteredCombat: boolean,
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

    // Combat end
    if (events.some((e) => e.type === 'combat.entity.defeated')) {
      const endCtx: HookContext = {
        hookPoint: 'combat-end',
        world: engine.world,
        events,
        presentationState: state,
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

    // Death — entity-aware: only the PLAYER's defeat triggers the death presentation
    // (F-adc0d512; shares isPlayerDefeatEvent with hooks.ts's deathHook).
    if (isPlayerDefeatEvent(events, engine.world.playerId)) {
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
      for (const ambient of merged.ambientCues) {
        await this.bridge.setAmbient(ambient);
      }
    }
    if (merged.musicCue) {
      await this.bridge.setMusic(merged.musicCue);
    }
    return this.bridge.flush();
  }

  private mergeHookResults(
    plan: NarrationPlan,
    hookResults: HookResult[],
  ): NarrationPlan {
    const merged = HookManager.mergeResults(hookResults);
    return {
      ...plan,
      sfx: [...plan.sfx, ...(merged.sfxCues ?? [])],
      ambientLayers: [...plan.ambientLayers, ...(merged.ambientCues ?? [])],
      uiEffects: [...plan.uiEffects, ...(merged.uiEffects ?? [])],
      musicCue: merged.musicCue ?? plan.musicCue,
    };
  }
}
