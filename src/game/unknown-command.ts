import type { WorldState } from '@ai-rpg-engine/core';
import { isNamedNpc, type OpportunityState } from '@ai-rpg-engine/modules';
import { DIRECTOR_COMMANDS } from '../display/director-renderer.js';
// WO-B1F-8 (design lock 8, ADDENDUM-COMMON): the SAME formatter the command
// strip itself uses (generateCommandStrip's own doc comment names this exact
// pair of consumers: "the command strip's own state-derived inputs"). This
// is a cross-domain IMPORT (reading a cli-display export), not an edit to
// src/display/**.
import { generateCommandStrip } from '../display/contextual-suggestions.js';
import { describeHostiles } from './condition.js';
// WO-B1-7 (slice B1 §3, design lock 4, ADDENDUM-COMMON): the parser-layer
// reply for an unknown play-mode `/word` -- costs no turn and never reaches
// the interpreter. Computes `{ nearest, family, validNow }`
// (action-interpreter.ts's contract with cli-display's `renderUnknownCommand`,
// which this domain's worktree does not have yet -- see this WO's own
// skipped[] entry for the render-call-site wiring status).
//
// Research grounding (dispatch-b1.md): finding 17 (a chunk of developer
// task time goes to reading compiler error messages; message difficulty
// relates to task performance) is why the reply carries the correction
// AND the commands valid now, not just "unknown command"; finding 22
// (the Bill of Player's Rights: reasonable synonyms, never "exactly the
// right verb", no unclear hints) is why this is a near-miss suggestion,
// not a bare rejection.

/** Bare command names (no leading slash, no arguments) valid in PLAY mode -- mirrors game.ts's own playCmd dispatch. */
/** The commands a lost player needs first, in this order (see computeUnknownCommandInfo). */
export const PLAY_VALID_NOW: readonly string[] = ['help', 'status', 'leverage'];
export const DIRECTOR_VALID_NOW: readonly string[] = ['world', 'people', 'back'];

export const PLAY_COMMAND_NAMES: readonly string[] = [
  'help', 'status', 'map', 'leverage', 'jobs', 'contracts', 'arcs',
  'conclude', 'recruit', 'dismiss', 'archive', 'export',
  // Mode switches, checked before the play-mode dispatch but valid from play mode.
  'director', 'd',
  // WO-B1F-2 (design lock 2): the move-verb slash aliases and the play-mode
  // `/rumors` reader -- so the near-miss logic (below) recognizes these as
  // KNOWN names (never suggests "Did you mean /go?" for literal /go) and so
  // a genuine typo near one of them (e.g. "/gp") still gets corrected here.
  'go', 'move', 'zone', 'rumors',
];

/**
 * Bare command names valid in DIRECTOR mode -- mirrors
 * src/display/director-renderer.ts's own (module-private) DIRECTOR_COMMANDS
 * list, arguments stripped (e.g. '/inspect <entity-id>' -> 'inspect').
 * Duplicated here rather than imported because that list is unexported and
 * lives outside this domain's owned globs (src/display/**) -- if it drifts,
 * this list drifts with it; a cross-domain export would be the correct
 * long-term fix (noted in this domain's skipped[]).
 */
export const DIRECTOR_COMMAND_NAMES: readonly string[] = [
  // Stitch (wave 10): derived from cli-display's exported DIRECTOR_COMMANDS
  // (the cross-domain export this domain's skipped[] asked for) so the two
  // lists cannot drift; `back`/`b` are handled outside that table.
  ...DIRECTOR_COMMANDS.map((c) => c.cmd.slice(1).split(' ')[0]),
  'back', 'b',
];

/** Levenshtein edit distance -- classic DP, O(m*n), fine for short command names. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

export type UnknownCommandInfo = {
  input: string;
  /** The nearest known command name (WITH leading slash), or `undefined` if nothing is remotely close. */
  nearest: string | undefined;
  /** Which family the nearest match belongs to; `null` when nothing matched closely enough to attribute one. */
  family: 'play' | 'director' | null;
  /**
   * The 2-5 things valid right now. Curated fallback entries carry a
   * leading slash (`/help`); WO-B1F-8's state-derived entries (design lock
   * 8) are plain typeable actions with no slash (`talk to Aldric`, `go
   * Chapel Nave`) -- the reply's own render call site (cli-display's
   * renderUnknownCommand) prints these verbatim either way.
   */
  validNow: string[];
};

/** A near-miss is anything within half the typed word's own length (min 1, max 3) -- generous enough to catch typos, tight enough not to "correct" an unrelated word into a command. */
function isNearMiss(distance: number, wordLength: number): boolean {
  const threshold = Math.max(1, Math.min(3, Math.ceil(wordLength / 2)));
  return distance <= threshold;
}

/**
 * WO-B1F-8 (design lock 8, ADDENDUM-COMMON): the ONE state-derived function
 * that feeds both the command strip (game.ts's own renderPlayOutput call
 * site threads this SAME array through as `commandStrip`) and this file's
 * `computeUnknownCommandInfo` -- three family playtests observed "the
 * unknown-command reply's valid-now list is fixed; the command strip
 * already knows the state," so both surfaces now read from one derivation
 * instead of the reply staying frozen at the curated PLAY_VALID_NOW list.
 *
 * Derives generateCommandStrip's own raw inputs (named NPCs co-located with
 * the player, the zone's exits, live hostiles via describeHostiles -- the
 * SAME shared hostile-list function design lock 1 already requires every
 * hostile-listing surface to use, condition.ts's own doc comment) directly
 * from `world`, since none of that is GameSession-only state; `activeOpportunities`
 * is passed in separately because this app tracks opportunities as a
 * GameSession field, never written into `world.modules` (see
 * buildNPCDialogueContext's own doc comment on the identical gap for the
 * opportunity context string). "Most relevant first" for co-located named
 * NPCs is this domain's own deterministic choice (sorted by entity id, same
 * tie-break describeHostiles already uses) -- generateCommandStrip only
 * ever reads its own `namedNpcsHere[0]`, so this is provisional until a real
 * relevance ranking (e.g. "has an open ask") is asked for.
 */
export function deriveValidNowFromWorld(
  world: WorldState,
  activeOpportunities: OpportunityState[],
): string[] {
  const zoneId = world.locationId;
  const namedNpcsHere = Object.values(world.entities)
    .filter((e) => e.zoneId === zoneId && isNamedNpc(e, world.playerId))
    .map((e) => e.id)
    .sort()
    .map((id) => world.entities[id]?.name)
    .filter((n): n is string => !!n);
  const exits = (world.zones[zoneId]?.neighbors ?? [])
    .map((id) => world.zones[id]?.name)
    .filter((n): n is string => !!n);
  const hostiles = describeHostiles(world, zoneId);
  const openOpportunityTitle = activeOpportunities.find((o) => o.status === 'available')?.title;

  return generateCommandStrip({
    namedNpcsHere,
    exits,
    hostiles,
    openOpportunityTitle,
  });
}

/**
 * Resolve an unknown play-mode `/word` into the reply data cli-display's
 * `renderUnknownCommand` renders. `mode` is the session's CURRENT mode
 * (always 'play' per this WO's own call site -- director-mode unknown
 * commands are a design lock 4 case this wave doesn't cover, since
 * design doc §3 scopes the parser-layer reply to play mode specifically).
 *
 * `stateStrip` (WO-B1F-8, design lock 8): deriveValidNowFromWorld()'s own
 * output, when the caller has one -- used for `validNow` in place of the
 * curated PLAY_VALID_NOW/DIRECTOR_VALID_NOW list whenever it is non-empty
 * (falls back to the curated list otherwise, e.g. a zone with no NPCs, no
 * exits, no hostiles, and no opportunity, which the curated list still
 * covers). Omitted entirely, this function behaves exactly as before this
 * WO -- every existing caller/test that doesn't pass one is unaffected.
 */
export function computeUnknownCommandInfo(
  input: string,
  mode: 'play' | 'director',
  stateStrip?: string[],
): UnknownCommandInfo {
  const word = input.trim().replace(/^\//, '').split(/\s+/)[0]?.toLowerCase() ?? '';

  let nearest: string | undefined;
  let nearestDistance = Infinity;
  let nearestFamily: 'play' | 'director' | null = null;

  for (const name of PLAY_COMMAND_NAMES) {
    const d = levenshtein(word, name);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = name;
      nearestFamily = 'play';
    }
  }
  for (const name of DIRECTOR_COMMAND_NAMES) {
    const d = levenshtein(word, name);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = name;
      nearestFamily = 'director';
    }
  }

  const matched = nearest !== undefined && isNearMiss(nearestDistance, word.length);

  // The 2-3 most broadly useful commands for the CURRENT mode -- a curated,
  // deterministic (alphabetical) default; design doc §3 names no specific
  // set, only "the two or three commands valid right now."
  // Stitch ruling (second family playtest, b1-2026-09-02): the alphabetical
  // default surfaced `/archive · /arcs · /conclude` in play mode -- one seat
  // followed it into /conclude and ended its own game at turn 15. The
  // "two or three commands valid right now" are the ones a lost player
  // needs, in a fixed order, not the first three by letter.
  // WO-B1F-8 (design lock 8): in play mode, the state-derived strip (when
  // non-empty) replaces the curated list -- these are real, currently-typeable
  // action inputs ("talk to X", "go Y"), not `/word` meta-commands, so this
  // only ever applies in play mode (DIRECTOR_VALID_NOW's `/world`/`/people`/
  // `/back` have no state-derived equivalent and are unaffected).
  const validNow = mode === 'play' && stateStrip && stateStrip.length > 0
    ? stateStrip
    : (mode === 'play' ? PLAY_VALID_NOW : DIRECTOR_VALID_NOW).map((n) => `/${n}`);

  return {
    input,
    nearest: matched ? `/${nearest}` : undefined,
    family: matched ? nearestFamily : null,
    validNow,
  };
}
