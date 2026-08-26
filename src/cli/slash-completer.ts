// Slash command tab completion for readline (FT-FE-003)

import type { CompleterResult } from 'node:readline';

export type PlayCommand = { cmd: string; description: string };

/**
 * Canonical play-mode slash command table — single source of truth for
 * SLASH_COMMANDS (tab completion, derived below) and help-system.ts's
 * renderPlayHelp() COMMANDS section (which imports this table directly),
 * two of the three surfaces that used to drift independently (F-1036ff43:
 * renderPlayHelp hand-listed only 5 of 12+ real commands). The third
 * surface, bin.ts's --help USAGE text, mixes in non-slash commands
 * ("save"/"quit") and lives in a bare CLI entry point with no exports, so it
 * stays hand-maintained — verified instead by the bidirectional
 * reconciliation test in slash-completer.test.ts (F-f1eb58cb/F-5cc4d0d9),
 * which fails if USAGE drifts from this table in either direction.
 *
 * F-f1eb58cb: every entry here must be documented (bin.ts's USAGE text and/
 * or help-system.ts) and handled (bin.ts's game loop, GameSession.
 * processInput, or executeDirectorCommand) somewhere in the CLI.
 *
 * '/recruit' and '/dismiss' (F-ffc12b36) and '/cost' (COST COMMAND
 * cross-domain contract, wave-14: game-core's GameSession.getCostSummary(),
 * dispatched here by bin.ts) were added this wave — all three were real,
 * working, or about-to-be-wired commands with zero prior discoverability.
 * '/save' stays excluded: the real save command is the bare word "save".
 */
export const PLAY_COMMANDS: PlayCommand[] = [
  { cmd: '/help', description: 'This reference' },
  { cmd: '/status', description: 'Compact strategic snapshot' },
  { cmd: '/map', description: 'Strategic map overview' },
  { cmd: '/leverage', description: 'View political capital' },
  { cmd: '/jobs', description: 'View available opportunities' },
  { cmd: '/arcs', description: 'View campaign arc trajectory' },
  { cmd: '/conclude', description: 'Trigger campaign finale' },
  { cmd: '/recruit', description: 'Recruit an NPC into your party (ids via /status or /map)' },
  { cmd: '/dismiss', description: 'Remove a companion from your party' },
  { cmd: '/archive', description: 'Browse completed campaigns' },
  { cmd: '/export', description: 'Export chronicle (md/json/finale)' },
  { cmd: '/director', description: 'Inspect hidden truth' },
  { cmd: '/cost', description: 'View this session\'s estimated API cost' },
  { cmd: '/sheet', description: 'View character sheet (/character is an alias)' },
  { cmd: '/character', description: 'Alias for /sheet' },
];

/** Slash commands available in-game for tab completion. Derived from
 *  PLAY_COMMANDS above — see its doc comment. */
export const SLASH_COMMANDS: string[] = PLAY_COMMANDS.map((c) => c.cmd);

/** Readline completer for slash commands. */
export function slashCompleter(line: string): CompleterResult {
  if (!line.startsWith('/')) return [[], line];
  const hits = SLASH_COMMANDS.filter((cmd) => cmd.startsWith(line.toLowerCase()));
  return [hits.length > 0 ? hits : SLASH_COMMANDS, line];
}
