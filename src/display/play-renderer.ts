// Play mode terminal renderer
// v0.2: enhanced status bar with profile data
// v1.1: leverage status line + contextual suggestions
// v1.2: semantic terminal coloring

import type { WorldState } from '@ai-rpg-engine/core';
import type { DialogueResult } from '../dialogue/dialogue-mind.js';
import type { StatusData } from '../character/presence.js';
import type { ContextualSuggestion } from './contextual-suggestions.js';
import { bold, dim, secondary, speaker, hint, cyan, yellow, red, critical, danger } from '../cli/colors.js';

// PFE-005: Adapt divider width to terminal, clamped to 40-120, fallback 60.
function getTerminalWidth(): number {
  const cols = process.stdout.columns ?? 60;
  return Math.max(40, Math.min(120, cols));
}

function makeDivider(): string {
  return dim('─'.repeat(getTerminalWidth()));
}

/**
 * Build a turn-numbered divider using double-line box characters.
 *
 * F-a2a609b6: used to open with its own hardcoded '\n' on top of the blank
 * line renderPlayScreen's own `parts.push('')` already supplies right
 * before calling this -- giving every numbered turn one more blank line
 * above its rule than the non-numbered makeDivider() fallback gets. The
 * caller already supplies that blank line, so this must not add a second
 * one.
 */
export function makeTurnDivider(turnNumber: number): string {
  const label = ` Turn ${turnNumber} `;
  const width = getTerminalWidth();
  const remaining = Math.max(0, width - label.length);
  const left = Math.floor(remaining / 2);
  const right = remaining - left;
  return dim('═'.repeat(left)) + cyan(bold(label)) + dim('═'.repeat(right));
}

function makeThinDivider(): string {
  return dim('·'.repeat(getTerminalWidth()));
}

/**
 * F-ce17a470: colors.ts's `critical` composite (bold red, doc'd "Critical
 * danger / death") had zero production call sites -- HP, the single most
 * important number in the game, rendered as plain uncolored text at every
 * severity in both this file's full status bar and status-compact.ts's
 * snapshot. Shared here (and imported by status-compact.ts) so both screens
 * agree on one threshold instead of two independently-tuned ones. 25% of
 * max is a conventional "low health" cutoff, wide enough to warn a player
 * before HP hits 0. Only applies when maxHp is known -- without it there's
 * no scale to measure "low" against, so callers leave the number plain
 * rather than guessing an absolute, scale-inappropriate cutoff.
 */
const CRITICAL_HP_RATIO = 0.25;

export function isCriticalHp(hp: number, maxHp?: number): boolean {
  return maxHp !== undefined && maxHp > 0 && hp / maxHp <= CRITICAL_HP_RATIO;
}

/**
 * WO-B1-15 (slice B1 §1, lock 1): formats one hostile's status-line entry
 * from game-core's `describeHostiles(world, zoneId)` (`{ id, name, rung,
 * aware }`) -- the SAME `conditionRung` vocabulary the design doc requires
 * every surface (status line, outcome lines, inspect, narration) to share,
 * never a second threshold table. An aware hostile is marked with a
 * trailing `!` on its name (DRAFT -- coordinator ratifies the exact glyph
 * vs. the doc's alternative `aware` word-marker).
 */
function formatHostileEntry(h: { name: string; rung: string; aware: boolean }): string {
  return `${h.name}${h.aware ? '!' : ''}: ${h.rung}`;
}

/**
 * WO-B1-16 (slice B1 §1-2, lock 2): classifies one `TurnResult.combatLines`
 * entry so the reserved combat channel can style kills and landed enemy hits
 * in this domain's existing critical/warning registers while leaving plain
 * outcome and telegraph lines unstyled, per the design doc's own rule ("in
 * the existing critical/warning register for kills and landed hits, plain
 * for outcomes and telegraphs"). The contract (ADDENDUM-COMMON lock 2) pins
 * the SHAPE of each line kind, not a type tag alongside the string, so this
 * classifies by the shape itself: a kill line's shape is "<subject> falls."
 * (`The Crypt Stalker falls.`); a landed-hit line's shape ends in "N
 * damage." (`... — 4 damage.`). Anything else (the player's own outcome
 * line, a telegraph) renders plain.
 */
function classifyCombatLine(line: string): 'kill' | 'hit' | 'plain' {
  if (/ falls\.$/.test(line)) return 'kill';
  if (/\d+ damage\.$/.test(line)) return 'hit';
  return 'plain';
}

// Exported for testing.
export { formatHostileEntry, classifyCombatLine };

/**
 * F-7eff9b3a: wrap a " | "-joined status line at segment boundaries once it
 * exceeds getTerminalWidth(), instead of raw string concatenation that the
 * terminal then hard-wraps wherever it falls, mid-word, with no hanging
 * indent -- the same overflow bug class this domain's reference tables
 * (help-system.ts's renderNameDescriptionRow) already got dedicated
 * treatment for (three prior fixes: F-a17315ac/F-d36903d0/F-1367afd9).
 * Segments are treated as atomic units (never split mid-segment) -- this
 * matters specifically here because a segment may already carry an ANSI
 * color wrapper (bold()/critical()/red()); splitting inside one would
 * corrupt the escape sequence. Segment width is measured via plain
 * `.length`, which over-counts when a segment is colored (the escape codes
 * inflate it) -- that only wraps a little earlier than the true visual
 * width strictly requires, never later (the safe failure direction); with
 * color disabled (NO_COLOR, non-TTY -- this file's default test env)
 * `.length` is exact. Behavior-preserving when every segment fits on one
 * line: the output is byte-identical to the old
 * `${leadIndent}${segments.join(' | ')}` template it replaces. Exported for
 * testing and for status-compact.ts's identical-shaped character line.
 */
export function wrapStatusLine(leadIndent: string, segments: string[]): string {
  const width = getTerminalWidth();
  const contIndent = '    '; // hanging indent, matching renderNameDescriptionRow's convention
  const lines: string[] = [];
  let current = '';
  for (const seg of segments) {
    if (current === '') {
      current = `${leadIndent}${seg}`;
      continue;
    }
    const candidate = `${current} | ${seg}`;
    if (candidate.length > width) {
      lines.push(current);
      current = `${contIndent}${seg}`;
    } else {
      current = candidate;
    }
  }
  if (current !== '') lines.push(current);
  return lines.join('\n');
}

/**
 * F-61e67d85: src/npc/ambient-dialogue.ts's generateZoneAmbience can return
 * up to 3 lines for a busy multi-NPC zone -- showing all 3 every single turn
 * would compete with and drown out the status footer below. A defensive
 * display-layer ceiling, independent of whatever cadence/throttle game-core
 * designs upstream for how often ambience fires at all.
 */
const MAX_AMBIENT_LINES_SHOWN = 1;

// Exported for testing
export { getTerminalWidth };

/** Render the full play mode screen. */
export function renderPlayScreen(opts: {
  narration: string;
  dialogue?: DialogueResult | null;
  world: WorldState;
  /**
   * F-fa6524ec: this function body never reads opts.availableActions --
   * every caller (in this domain and out of it) had to compute the full
   * available-actions list purely to satisfy what was a REQUIRED field, for
   * a value unconditionally discarded here. Engine 3.9 widens what that
   * computation returns (~24 player-leverage verbs plus the new
   * salvage/craft/repair/modify and quest/equip verbs), so callers were
   * paying more to produce a value nothing here reads. Made optional rather
   * than deleted so no caller in another domain needs an edit this wave.
   * Wiring this into an actual rendered hint line (e.g. an "Available:
   * ..." line) is a feature-pass candidate gated on a Director ruling, not
   * decided here.
   */
  availableActions?: string[];
  profileStatus?: StatusData;
  leverageStatus?: string;
  partyStatusLine?: string;
  suggestions?: ContextualSuggestion[];
  hasEndgameTriggers?: boolean;
  turnNumber?: number;
  /**
   * F-61e67d85: template-generated ambient NPC flavor lines (see
   * src/npc/ambient-dialogue.ts's generateZoneAmbience -- zero-API-cost,
   * fully unit-tested, but had no rendering surface anywhere in cli-display
   * until now). Optional so every existing caller that doesn't pass one
   * keeps rendering unchanged. Capped at MAX_AMBIENT_LINES_SHOWN regardless
   * of how many the channel supplies.
   */
  ambientLines?: string[];
  /**
   * WO-A5-15 (slice A5 §5, lock 5): the round's `encounter.spawned`
   * describeEvent line ("Ambush: {name} in {zone}" -- scene-context.ts's
   * existing case), surfaced as this screen's own banner register (matching
   * the endgame banner just below) instead of only appearing buried inside
   * the narration paragraph beneath it. Optional -- absent is
   * byte-identical to every existing caller, none of which pass this yet.
   */
  ambushHeadline?: string;
  /**
   * WO-B1-15 (slice B1 §1, lock 1): game-core's `describeHostiles(world,
   * zoneId)` -- hostiles sharing the player's zone. Rendered as one line
   * under the location line (`Crypt Stalker: bloodied · Ash Ghoul:
   * unhurt`); absent or empty renders nothing (byte-identical to every
   * existing caller, none of which pass this yet).
   */
  hostiles?: Array<{ id: string; name: string; rung: string; aware: boolean }>;
  /**
   * WO-B1-16 (slice B1 §1-2, lock 2): `TurnResult.combatLines` -- the
   * turn's deterministic combat lines (player outcome, kills, landed enemy
   * hits, next-round telegraphs), in that order, from game-core's
   * `runHostileTurn`/combat events (not yet on this branch -- "green
   * expected at merge"). Rendered in a reserved block ABOVE the narration,
   * below the ambush headline / endgame banner. Optional so every existing
   * caller renders unchanged.
   */
  combatLines?: string[];
  /**
   * Stitch (wave 10, slice B1 §5, lock 8): game-core's acknowledgment line
   * for a genuine ask helped this turn. Rendered directly under the combat
   * channel; absent renders nothing.
   */
  recognitionLine?: string;
  /**
   * WO-B1-18 (slice B1 §3, lock 5): the per-context command strip
   * (contextual-suggestions.ts's `generateCommandStrip`) -- state-derived,
   * always-true affordances (`talk to <npc>`, `go <exit>`, `attack
   * <hostile>`, `flee`, `accept <title>`). Rendered as one "You can: ..."
   * line, capped at 5 entries by the generator itself. Optional/absent
   * renders nothing.
   */
  commandStrip?: string[];
  /**
   * WO-B1F-9 (slice B1 follow-ups §4, design lock 4): one line naming the
   * player's district's market, when it has one -- game-core fills this
   * from the district's first buyable stock item and `quoteBuyPrice`'s
   * number; the note is the existing standing/markup phrase the quote
   * already carries. Rendered directly under the location/exits line, above
   * the hostiles line when both are present. Optional/absent renders
   * nothing (byte-identical for every existing caller, none of which pass
   * this yet).
   */
  marketQuote?: { item: string; price: number; note: string };
}): string {
  const parts: string[] = [];

  parts.push('');
  if (opts.turnNumber != null && opts.turnNumber > 0) {
    parts.push(makeTurnDivider(opts.turnNumber));
  } else {
    parts.push(makeDivider());
  }

  // Ambush headline (WO-A5-15) -- the round's headline when present,
  // above the narration block per the work order.
  if (opts.ambushHeadline) {
    parts.push(critical(`  ── ${opts.ambushHeadline} ──`));
  }

  // Endgame approach banner (v2.1)
  if (opts.hasEndgameTriggers) {
    parts.push(yellow('  ── approaching conclusion ──'));
  }

  // WO-B1-16 (slice B1 §1-2, lock 2): the reserved combat channel -- one
  // line per combatLines entry, ABOVE the narration, below the ambush
  // headline / endgame banner per the work order.
  if (opts.combatLines && opts.combatLines.length > 0) {
    for (const line of opts.combatLines) {
      const kind = classifyCombatLine(line);
      const styled = kind === 'kill' ? critical(`  ${line}`) : kind === 'hit' ? danger(`  ${line}`) : `  ${line}`;
      parts.push(styled);
    }
  }
  if (opts.recognitionLine) {
    parts.push(yellow(`  ${opts.recognitionLine}`));
  }

  // Narration
  parts.push('');
  parts.push(opts.narration);
  parts.push('');

  // Dialogue
  if (opts.dialogue) {
    parts.push(makeThinDivider());
    parts.push(`  ${speaker(opts.dialogue.speakerName)}: "${opts.dialogue.text}"`);
    parts.push('');
  }

  // Ambient NPC flavor lines (F-61e67d85) -- peripheral, non-primary
  // texture, subordinate to both plain narration (unstyled) and direct
  // dialogue (speaker()+bold) above. Styled dim() with the same '  · '
  // bullet convention presentation-renderer.ts's cue lines already use, for
  // one visual language across every "peripheral, non-primary" text block
  // in the app. Capped at MAX_AMBIENT_LINES_SHOWN regardless of how many the
  // channel supplies -- see that const's own doc comment.
  if (opts.ambientLines && opts.ambientLines.length > 0) {
    for (const line of opts.ambientLines.slice(0, MAX_AMBIENT_LINES_SHOWN)) {
      parts.push(dim(`  · ${line}`));
    }
    parts.push('');
  }

  parts.push(makeThinDivider());

  // Player status bar — enhanced when profile available
  if (opts.profileStatus) {
    const ps = opts.profileStatus;
    const titlePart = ps.title ? ` "${ps.title}"` : '';
    const nameLine = `${ps.name}${titlePart} (Lv${ps.level} ${ps.archetypeName})`;

    const statParts: string[] = [];
    // F-d386d9df: interpolate maxHp when known, mirroring status-compact.ts's
    // own hpText (`s.maxHp ? 'HP: x/max' : 'HP: x'`) -- this used to read
    // 'HP: 5' identically whether HP was critical or full; the ONLY signal a
    // critical player got was the critical() color wrap around that same
    // bare number, a total loss of the warning under NO_COLOR, piped/
    // non-TTY output, or for a colorblind player. ps.maxHp is already read
    // on the very next line (isCriticalHp), so this costs nothing new.
    const hpText = ps.maxHp ? `HP: ${ps.hp}/${ps.maxHp}` : `HP: ${ps.hp}`;
    statParts.push(isCriticalHp(ps.hp, ps.maxHp) ? critical(hpText) : hpText);
    if (ps.weaponName) statParts.push(ps.weaponName);
    if (ps.armorName) statParts.push(ps.armorName);
    if (ps.injuryTags.length > 0) {
      statParts.push(red(`[${ps.injuryTags.join(', ')}]`));
    }

    parts.push(wrapStatusLine('  ', [bold(nameLine), ...statParts]));
  } else {
    // Legacy status bar
    const player = opts.world.entities[opts.world.playerId];
    if (player) {
      const statParts: string[] = [];
      for (const [key, val] of Object.entries(player.resources)) {
        statParts.push(`${key}: ${val}`);
      }
      const statuses = (player.statuses ?? []).map((s) => s.statusId);
      if (statuses.length > 0) {
        statParts.push(`[${statuses.join(', ')}]`);
      }
      parts.push(`  ${player.name} | ${statParts.join(' | ')}`);
    }
  }

  // Leverage status line
  if (opts.leverageStatus && opts.leverageStatus !== 'No leverage') {
    parts.push(`  ${opts.leverageStatus}`);
  }

  // Party status line
  if (opts.partyStatusLine) {
    parts.push(opts.partyStatusLine);
  }

  // Zone info
  const zone = opts.world.zones[opts.world.locationId];
  if (zone) {
    const exits = zone.neighbors
      .map((id) => opts.world.zones[id]?.name ?? id)
      .join(', ');
    parts.push(`  Location: ${zone.name}${exits ? ` | Exits: ${exits}` : ''}`);
  }

  // WO-B1F-9 (slice B1 follow-ups §4, design lock 4): the quoted price line
  // -- one line directly under the location/exits line, absent when the
  // district has no market (byte-identical to every existing caller, none
  // of which pass this yet).
  if (opts.marketQuote) {
    const { item, price, note } = opts.marketQuote;
    parts.push(`  Market: ${item} ${price} (${note})`);
  }

  // WO-B1-15 (slice B1 §1, lock 1): the status hostile line -- one line
  // under the location line, absent when the zone has no hostile.
  if (opts.hostiles && opts.hostiles.length > 0) {
    parts.push(`  Hostiles: ${opts.hostiles.map(formatHostileEntry).join(' · ')}`);
  }

  parts.push(makeDivider());

  // WO-B1-18 (slice B1 §3, lock 5): the per-context command strip --
  // REPLACES the generic TRY list (see generateCommandStrip's doc comment
  // for what "replaces" means against the current tree).
  if (opts.commandStrip && opts.commandStrip.length > 0) {
    parts.push(`  You can: ${opts.commandStrip.join(' · ')}`);
  }

  // Contextual suggestions
  if (opts.suggestions && opts.suggestions.length > 0) {
    for (const s of opts.suggestions) {
      parts.push(hint(`  hint: ${s.text}`));
    }
  }

  // Prompt
  parts.push('');
  parts.push(bold('  What do you do?'));
  parts.push('');

  return parts.join('\n');
}

/** Render a simple status line for between turns (non-TTY fallback). */
export function renderThinking(): string {
  return dim('\n  ...\n');
}

/** Render the welcome screen. */
export function renderWelcome(title: string, tone?: string): string {
  const parts: string[] = [];
  parts.push('');
  parts.push(makeDivider());
  parts.push(`  ${bold(title)}`);
  if (tone) {
    parts.push(`  ${secondary(tone)}`);
  }
  parts.push(makeDivider());
  parts.push('');
  parts.push(hint('  Type actions in plain English. Type "quit" to exit, "save" to save.'));
  parts.push(hint('  Type "/director" to inspect hidden truth, "/sheet" to view character.'));
  // F-55401320: this was the only hint line on the very first screen a
  // player sees, and it pointed at a niche diagnostic mode plus the
  // character sheet -- never at the one command that surfaces everything
  // else the game supports.
  parts.push(hint('  Type "/help" for the full command reference.'));
  parts.push('');
  return parts.join('\n');
}

/**
 * F-7484bd2e (SLATE-6): nothing rendered a distinct on-screen consequence
 * when the presentation state machine reached 'menu' (player death) -- the
 * screen fell straight back to the ordinary "What do you do?" prompt as if
 * nothing happened, even though the fade-to-black cue itself already
 * rendered correctly (presentation-renderer.ts's renderScreenPause).
 *
 * Colocated with the other full-screen composers (renderPlayScreen/
 * renderWelcome above), not with presentation-renderer.ts's narrower
 * cue-line-mapping concern. Layout deliberately matches renderScreenPause's
 * critical()+'═' signature (NOT game-presenter.ts's renderConcludeOutput,
 * which uses bare uncolored dividers -- campaign conclusion is a neutral/
 * celebratory closure across many possible endings; death is a narrower,
 * always-dramatic beat that keeps its own signature).
 *
 * Director ruling R3 (wave-18/cli-display.md coordinator brief): death is a
 * SETBACK, not an ending. The headline may still read '<name> HAS FALLEN',
 * but the affordance line is continue-first ("rise"), not a farewell --
 * save/quit are noted as still available, not offered as the primary next
 * step. Whether "continue" needs special turn-loop dispatch, or gating so
 * an ordinary verb doesn't silently resume play, is game-core's/
 * turn-loop.ts's decision (F-961f14aa's territory) -- outside what a
 * screen-rendering function can enforce.
 *
 * Deliberately drops everything renderPlayScreen normally carries (status
 * bar, zone/exits, leverage/party lines, suggestions), mirroring
 * renderConcludeOutput's own minimalism -- this is a full-screen interrupt,
 * not a variant of the ordinary turn screen.
 *
 * All copy below is DRAFT, pending coordinator/director review.
 */
export function renderDeathScreen(opts: { narration: string; characterName?: string }): string {
  const rule = critical('═'.repeat(getTerminalWidth()));
  const headline = opts.characterName ? `${opts.characterName} HAS FALLEN` : 'YOU HAVE FALLEN';

  const parts: string[] = [];
  parts.push('');
  parts.push(rule);
  parts.push(`  ${critical(headline)}`);
  parts.push(rule);
  parts.push('');
  parts.push(opts.narration);
  parts.push('');
  parts.push(dim('─'.repeat(getTerminalWidth())));
  parts.push(hint('  Type "continue" when you are ready to rise.'));
  // F-7d57bf98 (superseded by F-c6da7ad9): this line used to promise '"quit"
  // will save and exit.' when nothing on the quit path actually saved --
  // game.ts's processInput() returned the __QUIT__ sentinel with no save
  // call, and bin.ts's __QUIT__ handler only printed the recap and exited.
  // F-7d57bf98 flipped the copy to the honest '"quit" exits without saving'.
  // F-c6da7ad9 (this wave) wires bin.ts's __QUIT__ handler through the same
  // guarded attemptExitAutosave contract the SIGINT and stdin-closed/EOF
  // paths already use, making the original promise true again -- flipped
  // back to match the new reality. attemptExitAutosave can still return
  // 'rejected'/'failed' (path-guard rejection, write error), so this states
  // the common case without over-promising a guarantee.
  parts.push(hint('  "quit" auto-saves before exiting.'));
  parts.push('');
  return parts.join('\n');
}
