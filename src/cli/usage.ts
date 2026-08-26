// usage.ts — the top-level `claude-rpg` CLI usage text (bare invocation,
// `--help`/`-h`, and the fallback for any unrecognized command).
//
// Extracted from bin.ts (F-d36903d0) so this can be exercised directly in a
// test instead of only reachable through a hand-copied fork: bin.ts is a
// bare CLI entry point with no exports and runs main() unconditionally at
// module load, so it cannot itself be imported from a test — mirrors
// save-listing.ts's / save-selection.ts's own extraction for the identical
// reason (see those files' doc comments).

import { bold, dim } from './colors.js';
import { getTerminalWidth } from '../display/play-renderer.js';

/**
 * F-d36903d0: USAGE — shown on bare `claude-rpg`, `--help`/`-h`, and any
 * unrecognized command, almost certainly the first screen a new player
 * sees — used to be a plain, undecorated template literal: section labels
 * sat flush at column 0 with no divider rule and no bold/color treatment,
 * unlike every other reference-style screen in this domain (renderWelcome,
 * renderPlayHelp, renderLeverageHelp, renderArcHelp, renderConcludeHelp,
 * renderDirectorHelp, renderCompactStatus), which all box their header
 * between rules with a bold or colored title. Boxed the same way here,
 * matching renderDirectorHelp's "bold name + dim tagline on one line"
 * convention (director-renderer.ts) since USAGE is effectively the
 * pre-session welcome screen.
 *
 * Also fixes a 1-column wrap drift: the wrapped continuation of the `play`
 * command's description ("from 10 worlds interactively)") used to start one
 * column right of where its own first line ("Play a starter world (choose")
 * starts — the same off-by-one hand-typed-spacing pattern this wave's
 * help-system.ts and director-renderer.ts findings hit in two other files.
 */
export function renderUsage(): string {
  const rule = dim('─'.repeat(getTerminalWidth()));
  return `
${rule}
  ${bold('claude-rpg')} ${dim('— simulation-grounded narrative RPG')}
${rule}

Usage:
  claude-rpg play [--fast]                      Play a starter world (choose
                                                from 10 worlds interactively)
                  [--debug]                     Show structured error details
  claude-rpg load                               Load a saved game
  claude-rpg new "<prompt>"                     Generate a world from a prompt
  claude-rpg archive                            Browse completed campaigns
  claude-rpg --version                          Show version
  claude-rpg --help                             Show this help

Commands in-game:
  save           Save the current game
  /sheet         View character sheet (/character is an alias)
  /status        Compact strategic snapshot
  /map           Strategic map overview
  /leverage      View political capital
  /jobs          View available opportunities
  /arcs          View campaign arc trajectory
  /conclude      Trigger campaign finale
  /recruit       Recruit an NPC into your party (ids via /status or /map)
  /dismiss       Remove a companion from your party
  /archive       Browse completed campaigns
  /export        Export chronicle (md/json/finale)
  /director      Inspect hidden truth
  /cost          View this session's estimated API cost
  /help          In-game help system
  quit           Exit the game

Environment:
  ANTHROPIC_API_KEY   Required. Your Claude API key.
`;
}
