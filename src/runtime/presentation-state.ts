// Presentation state machine — tracks game presentation context

import type { ResolvedEvent } from '@ai-rpg-engine/core';
import type { PresentationState, AmbientCue, MusicCue } from '@ai-rpg-engine/presentation';

export type { PresentationState } from '@ai-rpg-engine/presentation';

export type StateTransition = {
  from: PresentationState;
  to: PresentationState;
  trigger: string;
  ambientShift?: AmbientCue[];
  musicShift?: MusicCue;
};

type TransitionListener = (t: StateTransition) => void;

/** Tracks the game's presentation context and drives audio layer selection. */
export class PresentationStateMachine {
  private _state: PresentationState = 'exploration';
  private listeners: TransitionListener[] = [];
  private aftermathTurns = 0;
  /** Tracks the last tick at which inferFromEvents decremented aftermathTurns to prevent double-decrement in the same turn. */
  private lastDecrementTick = -1;

  get current(): PresentationState {
    return this._state;
  }

  /** Transition to a new state, emitting audio shift cues. */
  transition(to: PresentationState, trigger: string): StateTransition {
    const from = this._state;
    const t: StateTransition = { from, to, trigger };

    // Add ambient/music shifts based on transition
    if (to === 'combat' && from !== 'combat') {
      t.ambientShift = [
        { layerId: 'ambient_drone', action: 'start', volume: 0.4, fadeMs: 500 },
      ];
      t.musicShift = { action: 'intensify', fadeMs: 300 };
    } else if (to === 'aftermath') {
      t.ambientShift = [
        { layerId: 'ambient_drone', action: 'stop', volume: 0, fadeMs: 1000 },
      ];
      t.musicShift = { action: 'soften', fadeMs: 1000 };
    } else if (to === 'dialogue' && from !== 'dialogue') {
      t.musicShift = { action: 'soften', fadeMs: 500 };
    } else if (to === 'exploration' && from === 'dialogue') {
      t.musicShift = { action: 'intensify', fadeMs: 500 };
    }

    this._state = to;
    for (const cb of this.listeners) cb(t);
    return t;
  }

  /**
   * Infer state from engine events and verb.
   *
   * **Side effects:** mutates `aftermathTurns` countdown. Must only be called
   * once per turn. A tick guard prevents double-decrement if accidentally
   * called twice in the same turn.
   */
  inferFromEvents(events: ResolvedEvent[], verb?: string, tick?: number): PresentationState {
    // Player death — check first so it isn't masked by general combat/aftermath
    const hasDeath = events.some(
      (e) => e.type === 'combat.entity.defeated' && e.payload.entityId === '__player__',
    );
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

  /** Listen for state changes. */
  onTransition(cb: TransitionListener): void {
    this.listeners.push(cb);
  }
}
