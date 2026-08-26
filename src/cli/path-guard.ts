// path-guard.ts — F-682af46c: directory-traversal boundary check.
//
// Extracted from bin.ts, which had this check inlined at three call sites
// (SIGINT autosave, stdin-closed autosave, and the in-game "save" command),
// all using a bare string-prefix `startsWith`.

import { resolve, relative, isAbsolute } from 'node:path';

/**
 * True when `candidate` resolves to a path inside (or equal to) `dir`.
 *
 * A bare `resolve(candidate).startsWith(resolve(dir))` check has no
 * path-separator boundary: a sibling directory that merely shares `dir`'s
 * name as a string prefix (e.g. `${dir}-archive`) would be misclassified
 * as "inside". Comparing via `relative()` instead avoids that class of bug.
 */
export function isPathInside(candidate: string, dir: string): boolean {
  const rel = relative(resolve(dir), resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
