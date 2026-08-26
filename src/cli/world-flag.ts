// world-flag.ts — parses the `--world <name>` CLI flag for `claude-rpg play`.
//
// F-7862c05d: bin.ts imported resolveWorldFlag from character/packs.ts but
// never called it -- runPlay(args) only ever checked args.includes('--fast');
// a real `--world <name>` flag had never been implemented, only ever
// promised and then removed as a false claim (F-575952b0, closed in an
// earlier wave). This module is the real thing.
//
// Extracted to its own testable file matching this codebase's established
// bin.ts-extraction convention (F-6506450c/F-bd2fef5a/F-d36903d0): bin.ts is
// a bare CLI entry point with no exports and runs main() unconditionally at
// module load, so it cannot itself be imported from a test.
//
// Director ruling R1 (wave-18/cli-display.md coordinator brief): an unknown
// --world is a structured error + exit 1, resolved fully pre-interactive
// (before buildCharacter/readline start) -- the degrade-to-interactive-menu
// alternative is overruled. bin.ts owns the reject-and-exit decision and the
// structured-error rendering; this module only classifies the input.
//
// resolveWorldFlag + getPackById (character/packs.ts) are the sole
// resolution path -- this module adds no parallel name->pack mapping of its
// own. This codebase has hit the "two independently maintained copies of one
// list" bug shape repeatedly (F-223de079, F-8da2e6f7, F-f1eb58cb,
// F-5cc4d0d9, F-623e763f, F-c5ff2a5c, F-aaaa105f all closed on exactly this
// pattern) -- WORLD_FLAG_MAP (packs.ts) is the one source both
// resolveWorldFlag and formatValidWorlds below derive from.

import { getPackById, resolveWorldFlag, WORLD_FLAG_MAP } from '../character/packs.js';
import type { PackInfo } from '../character/packs.js';

/** The `--world <name>` flag's valid values, in WORLD_FLAG_MAP's own order. */
export function formatValidWorlds(): string {
  return Object.keys(WORLD_FLAG_MAP).join(', ');
}

/**
 * Parse `--world <name>` out of `claude-rpg play`'s argv.
 *
 * Returns `{}` when `--world` isn't present at all (the existing
 * interactive-picker flow is unaffected). Otherwise returns either the
 * resolved `packInfo` on success, or a human-readable `errorMessage` on
 * failure -- the two failure shapes get distinct wording so a player can
 * tell "you forgot the value" apart from "you typed something that isn't a
 * world":
 *
 * - Missing or flag-shaped value (e.g. `--world` at the end of argv, or
 *   immediately followed by another `--flag`): "--world requires a value".
 * - A value that doesn't resolve via resolveWorldFlag+getPackById: "Unknown
 *   world" with the valid-worlds list embedded.
 */
export function parseWorldFlag(args: string[]): { packInfo?: PackInfo; errorMessage?: string } {
  const idx = args.indexOf('--world');
  if (idx === -1) return {};

  const value = args[idx + 1];
  if (!value || value.startsWith('--')) {
    return { errorMessage: '--world requires a value, e.g. --world fantasy' };
  }

  const packId = resolveWorldFlag(value);
  const packInfo = packId ? getPackById(packId) : undefined;
  if (!packInfo) {
    return { errorMessage: `Unknown world "${value}". Valid worlds: ${formatValidWorlds()}` };
  }

  return { packInfo };
}
