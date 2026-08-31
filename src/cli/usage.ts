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
import { getPackById, WORLD_FLAG_MAP } from '../character/packs.js';
import { renderNameDescriptionRow } from '../display/help-system.js';

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
/**
 * F-7862c05d: --world <name> was imported (resolveWorldFlag, character/
 * packs.ts) but never wired to a real flag -- a player had no way to
 * discover the 10 valid values short of reading source. Reuses help-
 * system.ts's already-exported, already-tested renderNameDescriptionRow (so
 * this table wraps/aligns the same way every other reference table in this
 * app does -- this exact hand-padded-column drift class has been fixed 3+
 * times already: F-a17315ac, F-d36903d0, F-1367afd9). WORLD_FLAG_MAP
 * (character/packs.ts) is the single source for the flag-name list, so this
 * can't independently drift from cli/world-flag.ts's own resolution path.
 */
function renderWorldsSection(): string {
  const rows = Object.entries(WORLD_FLAG_MAP)
    .map(([flag, packId]) => renderNameDescriptionRow(flag, getPackById(packId)?.meta.name ?? packId, 13))
    .join('\n');
  return `Worlds (claude-rpg play --world <name>):\n${rows}`;
}

/**
 * F-a5396488: `[--debug]` used to render as a second flag line nested
 * directly under `claude-rpg play [--fast]`, with no other command line
 * showing it -- reading as "these two flags belong to play." But --debug is
 * parsed globally in main() (`debugMode = args.includes('--debug')`,
 * bin.ts, before command dispatch) and affects every subcommand's error
 * rendering (load/new included), unlike --fast, which really is play-only.
 * Moved to its own "Global flags:" line below the per-command list so the
 * help text's grouping matches --debug's actual (global) scope instead of
 * implying it only applies to `play`.
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
  claude-rpg load                               Load a saved game
  claude-rpg new "<prompt>"                     Generate a world from a prompt
  claude-rpg archive                            Browse completed campaigns
  claude-rpg --version                          Show version
  claude-rpg --help                             Show this help

Global flags:
  --debug                                       Show structured error details

${renderWorldsSection()}

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
