// WO-B1-6 (slice B1 §3, design lock 6, ADDENDUM-COMMON): the hint ledger --
// caps a hint at 2 firings per cause per session, a 20-round cooldown
// between firings, and re-arms only on a state change (a new district, a
// new opportunity, first combat). Applied to cli-display's own
// `ContextualSuggestion[]` (src/display/contextual-suggestions.ts) before
// it reaches the render call -- each suggestion's own `trigger` field
// (already "why this was suggested", per that type's doc comment) is the
// cause key, so this needs no new taxonomy of its own.
//
// Research grounding (dispatch-b1.md): finding 19 (attention to a repeated
// warning drops after two or three exposures) is why the cap is 2; finding
// 18 (polymorphic/varied warnings resist habituation) is cli-display's own
// job (rotating 2-3 phrasing variants per hint) once this ledger says a
// hint may fire at all; finding 20 (high-volume, low-specificity alerting
// produces 46-96% override rates) is why a cooldown AND a budget both
// apply, not just one.

import type { WorldState } from '@ai-rpg-engine/core';

export type HintLedgerEntry = {
  fires: number;
  lastTick: number;
  /** The state token this entry's fire count was last armed under (see `filterHints`). */
  armedBy: string;
};

export type HintLedger = Record<string, HintLedgerEntry>;

const HINT_LEDGER_GLOBAL_KEY = 'claude_rpg.hint_ledger';
const MAX_FIRES_PER_CAUSE = 2;
const COOLDOWN_TICKS = 20;

export function readHintLedger(world: WorldState): HintLedger {
  const raw = world.globals[HINT_LEDGER_GLOBAL_KEY];
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as HintLedger) : {};
  } catch {
    return {};
  }
}

export function writeHintLedger(world: WorldState, ledger: HintLedger): void {
  world.globals[HINT_LEDGER_GLOBAL_KEY] = JSON.stringify(ledger);
}

/** One suggestion this ledger can gate -- structurally compatible with cli-display's `ContextualSuggestion`. */
export type Hintable = { text: string; trigger: string };

/**
 * Filter a suggestion list down to the causes still allowed to fire, and
 * return the updated ledger (record it back onto world truth via
 * `writeHintLedger` -- this function itself does not mutate `world`).
 *
 * Per cause: allowed if it has never fired, OR `stateToken` differs from
 * the token it was last armed under (a state change re-arms it, resetting
 * its count to zero), OR (fires < 2 AND at least `COOLDOWN_TICKS` have
 * passed since it last fired).
 */
export function filterHints<T extends Hintable>(
  suggestions: T[],
  ledger: HintLedger,
  tick: number,
  stateToken: string,
): { kept: T[]; ledger: HintLedger } {
  const next: HintLedger = { ...ledger };
  const kept: T[] = [];

  for (const suggestion of suggestions) {
    const entry = next[suggestion.trigger];
    const rearmed = entry !== undefined && entry.armedBy !== stateToken;
    const effectiveFires = rearmed ? 0 : (entry?.fires ?? 0);
    const underCap = effectiveFires < MAX_FIRES_PER_CAUSE;
    const offCooldown = rearmed || !entry || tick - entry.lastTick >= COOLDOWN_TICKS;

    // Note: `rearmed` always implies both `underCap` (fires reset to 0)
    // and `offCooldown` (its own `||` clause), so this branch is the only
    // reachable outcome whenever a state change just re-armed a cause.
    if (underCap && offCooldown) {
      kept.push(suggestion);
      next[suggestion.trigger] = { fires: effectiveFires + 1, lastTick: tick, armedBy: stateToken };
    }
    // else: still retired (cap reached) or still cooling down -- leave the
    // ledger entry exactly as it was (already carried into `next` above).
  }

  return { kept, ledger: next };
}
