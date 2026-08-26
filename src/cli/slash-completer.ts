// Slash command tab completion for readline (FT-FE-003)

import type { CompleterResult } from 'node:readline';

/**
 * Slash commands available in-game for tab completion.
 * F-f1eb58cb: every entry here must be documented (bin.ts's USAGE text or
 * help-system.ts) and handled (bin.ts's game loop, GameSession.processInput,
 * or executeDirectorCommand) somewhere in the CLI — see the reconciliation
 * test in slash-completer.test.ts. /save and /cost were removed as stale:
 * neither was ever wired to a real command.
 */
export const SLASH_COMMANDS = [
  '/status', '/sheet', '/character', '/help', '/director',
  '/export', '/map', '/leverage', '/jobs', '/arcs',
  '/conclude', '/archive',
];

/** Readline completer for slash commands. */
export function slashCompleter(line: string): CompleterResult {
  if (!line.startsWith('/')) return [[], line];
  const hits = SLASH_COMMANDS.filter((cmd) => cmd.startsWith(line.toLowerCase()));
  return [hits.length > 0 ? hits : SLASH_COMMANDS, line];
}
