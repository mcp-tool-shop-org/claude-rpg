// Slash command tab completion for readline (FT-FE-003)

import type { CompleterResult } from 'node:readline';

/** Slash commands available in-game for tab completion. */
export const SLASH_COMMANDS = [
  '/status', '/sheet', '/character', '/help', '/save', '/director',
  '/cost', '/export', '/map', '/leverage', '/jobs', '/arcs',
  '/conclude', '/archive',
];

/** Readline completer for slash commands. */
export function slashCompleter(line: string): CompleterResult {
  if (!line.startsWith('/')) return [[], line];
  const hits = SLASH_COMMANDS.filter((cmd) => cmd.startsWith(line.toLowerCase()));
  return [hits.length > 0 ? hits : SLASH_COMMANDS, line];
}
