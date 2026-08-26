// Presentation state machine — tracks game presentation context

import type { ResolvedEvent, WorldState } from '@ai-rpg-engine/core';
import type { PresentationState } from '@ai-rpg-engine/presentation';
import { isPlayerDefeatEvent, isPlayerAtZeroHp } from './hooks.js';

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
   *
   * `world` (pass `engine.world`) is optional and, when supplied, additionally
   * catches a death that reached hp <= 0 without any matching event at all — e.g.
   * world-gen.ts's environment-hazard effect (F-e57d6a60). Omitting it falls back to
   * the pure event-based check only, so existing callers that don't have a world
   * handle keep their prior behavior exactly.
   *
   * F-5a0021c9: PresentationState (@ai-rpg-engine/presentation) defines 8 values, but
   * this method only ever returns 6 of them — 'menu', 'aftermath', 'combat',
   * 'dialogue', 'exploration', 'director' — plus whatever `this._state` already holds
   * when no branch below applies. 'tension' and 'dream' are intentionally unreached
   * today: nothing in the engine emits a signal this method could key off of for
   * either, and nothing calls `.transition('tension' | 'dream', ...)` elsewhere either.
   * Reserved for future content (tension-building / dream-sequence), not an oversight.
   * Safe to leave unreachable unless that content lands, at which point this method
   * needs a branch producing the relevant value.
   */
  inferFromEvents(
    events: ResolvedEvent[],
    verb?: string,
    tick?: number,
    playerId?: string,
    world?: WorldState,
  ): PresentationState {
    // Player death — check first so it isn't masked by general combat/aftermath.
    // F-277b5eca: delegates to hooks.ts's isPlayerDefeatEvent so this predicate can't
    // diverge from deathHook's again — this copy previously compared against a
    // '__player__' sentinel that is never assigned anywhere in production (the real
    // player id is 'player', set at world-gen.ts:378), so hasDeath was always false.
    // Guarded on playerId being supplied so callers that omit it can't accidentally
    // match a defeat event whose payload also omits entityId.
    // F-e57d6a60: OR in isPlayerAtZeroHp (when world is supplied) so a hazard death
    // that emits no event at all still resolves to 'menu' — see its doc comment in
    // hooks.ts for why the event side of this can't be fixed at the source instead.
    const hasDeath =
      playerId != null &&
      (isPlayerDefeatEvent(events, playerId) ||
        (world != null && isPlayerAtZeroHp(world, playerId)));
    if (hasDeath) {
      // F-eb2f7496: reset the aftermath countdown guard so a death that lands
      // mid-countdown (an earlier kill's aftermathTurns still ticking down) can't
      // leave stale state for whatever presentation computation runs next, if
      // gameplay ever continues through this same instance after 'menu'.
      this.aftermathTurns = 0;
      this.lastDecrementTick = -1;
      return 'menu';
    }

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
