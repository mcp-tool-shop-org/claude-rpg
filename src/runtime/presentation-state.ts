// Presentation state machine — tracks game presentation context

import type { ResolvedEvent } from '@ai-rpg-engine/core';
import type { PresentationState } from '@ai-rpg-engine/presentation';
import { isPlayerDefeatEvent } from './hooks.js';

export type { PresentationState } from '@ai-rpg-engine/presentation';

export type StateTransition = {
  from: PresentationState;
  to: PresentationState;
  trigger: string;
};

/** Tracks the game's presentation context and drives audio layer selection. */
export class PresentationStateMachine {
  private _state: PresentationState = 'exploration';
  private aftermathTurns = 0;
  /** Tracks the last tick at which inferFromEvents decremented aftermathTurns to prevent double-decrement in the same turn. */
  private lastDecrementTick = -1;

  get current(): PresentationState {
    return this._state;
  }

  /**
   * Transition to a new state.
   *
   * F-81abb66a: this previously also computed ambientShift/musicShift cues per-transition
   * and delivered them through an onTransition listener mechanism, but nothing in this
   * domain ever wired that listener up — the hook system (combatStartHook, combatEndHook,
   * deathHook, enterRoomHook in hooks.ts) is the actual, sole source of audio cues that
   * reach players. Removed the dead computation and the onTransition machinery rather than
   * wiring a second, currently-inert cue path that could double-fire cues alongside the
   * hooks if someone activated it later.
   */
  transition(to: PresentationState, trigger: string): StateTransition {
    const from = this._state;
    this._state = to;
    return { from, to, trigger };
  }

  /**
   * Infer state from engine events and verb.
   *
   * **Side effects:** mutates `aftermathTurns` countdown. Must only be called
   * once per turn. A tick guard prevents double-decrement if accidentally
   * called twice in the same turn.
   *
   * `playerId` (pass `world.playerId`) gates the player-death check — see below.
   */
  inferFromEvents(
    events: ResolvedEvent[],
    verb?: string,
    tick?: number,
    playerId?: string,
  ): PresentationState {
    // Player death — check first so it isn't masked by general combat/aftermath.
    // F-277b5eca: delegates to hooks.ts's isPlayerDefeatEvent so this predicate can't
    // diverge from deathHook's again — this copy previously compared against a
    // '__player__' sentinel that is never assigned anywhere in production (the real
    // player id is 'player', set at world-gen.ts:378), so hasDeath was always false.
    // Guarded on playerId being supplied so callers that omit it can't accidentally
    // match a defeat event whose payload also omits entityId.
    const hasDeath = playerId != null && isPlayerDefeatEvent(events, playerId);
    if (hasDeath) return 'menu';

    // Check for combat events
    const hasCombat = events.some((e) =>
      e.type.startsWith('combat.'),
    );
    if (hasCombat) {
      const hasDefeat = events.some((e) => e.type === 'combat.entity.defeated');
      if (hasDefeat) {
        this.aftermathTurns = 2;
        return 'aftermath';
      }
      return 'combat';
    }

    // Dialogue
    if (verb === 'speak') return 'dialogue';

    // Aftermath countdown — guard prevents double-decrement in the same turn
    if (this.aftermathTurns > 0) {
      const currentTick = tick ?? -2;
      if (currentTick !== this.lastDecrementTick) {
        this.lastDecrementTick = currentTick;
        this.aftermathTurns--;
      }
      return this.aftermathTurns > 0 ? 'aftermath' : 'exploration';
    }

    // Zone change = exploration
    const hasZoneChange = events.some((e) => e.type === 'world.zone.entered');
    if (hasZoneChange) return 'exploration';

    return this._state === 'director' ? 'director' : 'exploration';
  }
}
