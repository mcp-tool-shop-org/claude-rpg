/**
 * check-coverage-utils.mjs
 * Shared utilities for coverage validation — the single implementation used by
 * BOTH scripts/check-critical-coverage.mjs and test/check-critical-coverage.test.ts,
 * so the tests exercise the real logic rather than a copy.
 *
 * Coverage entry shape (Istanbul v8, coverage/coverage-final.json values):
 *   s: { statement_index: hit_count, ... }
 *   b: { branch_index: [hit_count, ...], ... }
 *   f: { function_index: hit_count, ... }
 *   statementMap / branchMap / fnMap: location metadata
 */

/**
 * Compute statement coverage % from an Istanbul file entry.
 * Distinguishes empty coverage (no statements instrumented) from full coverage.
 * @param {{ s?: Record<string, number> }} fileData
 * @returns {number | undefined} 0-100, or undefined if no statements instrumented
 */
export function statementsPercent(fileData) {
  const s = fileData.s;
  if (!s) return undefined;
  const keys = Object.keys(s);
  if (keys.length === 0) return undefined; // Empty file — no statements
  const covered = keys.filter((k) => s[k] > 0).length;
  return (covered / keys.length) * 100;
}

/**
 * Compute branch coverage % from an Istanbul file entry.
 * @param {{ b?: Record<string, number[]> }} fileData
 * @returns {number | undefined} 0-100, or undefined if no branches instrumented
 */
export function branchesPercent(fileData) {
  const b = fileData.b;
  if (!b) return undefined;
  const keys = Object.keys(b);
  if (keys.length === 0) return undefined; // No branches instrumented
  const covered = keys.filter((k) => b[k].some((count) => count > 0)).length;
  return (covered / keys.length) * 100;
}

/**
 * Global coverage thresholds (statement lines).
 * Mirrors vitest.config.ts coverage.thresholds global layer.
 * @returns {number} minimum statements % for global coverage floor
 */
export function getGlobalStatementThreshold() {
  return 45;
}

/**
 * Global coverage thresholds (branches).
 * Mirrors vitest.config.ts coverage.thresholds global layer.
 * @returns {number} minimum branches % for global coverage floor
 */
export function getGlobalBranchThreshold() {
  return 60;
}

/**
 * Global coverage thresholds (functions).
 * Mirrors vitest.config.ts coverage.thresholds global layer.
 * @returns {number} minimum functions % for global coverage floor
 */
export function getGlobalFunctionThreshold() {
  return 65;
}

/**
 * Per-path coverage thresholds. These must match vitest.config.ts
 * coverage.thresholds — vitest is the enforcement gate on every CI run;
 * this script is the per-changed-file PR report built on the same floors.
 *
 * These thresholds are validated during CI runs via vitest.config.ts and must be kept
 * in sync to prevent gate drift. The per-path floors are:
 * - src/llm/: 82
 * - src/session/: 58
 * - src/game.ts: 30 (specific file floor, per vitest.config.ts measurement)
 * - src/game/: 55 (directory floor)
 * - src/display/: 55 (F-bb735a0b: was missing here though vitest.config.ts
 *   has carried this floor since F-26ec045e; kept this script's PR-diff
 *   gate blind to display-path regressions until now)
 *
 * Note: Keys use forward slashes without ** because getApplicableThreshold()
 * uses startsWith() matching, not glob expansion. The src/game.ts entry provides
 * a specific threshold for the game.ts file itself (floor 30), distinct from the
 * src/game/ directory pattern (floor 55).
 *
 * @returns {Record<string, number>} path prefix -> minimum statements %
 */
export function getPerPathThresholds() {
  return {
    'src/llm/': 82,
    'src/session/': 58,
    'src/game.ts': 30,
    'src/game/': 55,
    'src/display/': 55,
  };
}

/**
 * Normalize a path to forward slashes (vitest v8 keys coverage-final.json
 * by absolute forward-slash paths on all platforms).
 * @param {string} path
 * @returns {string}
 */
export function normalizePath(path) {
  return path.replace(/\\/g, '/');
}

/**
 * Determine which per-path threshold applies to a file — the most specific
 * (longest) matching prefix wins.
 * @param {string} filePath
 * @param {Record<string, number>} thresholds
 * @returns {number} applicable threshold, or 25 (default floor) if no match
 */
export function getApplicableThreshold(filePath, thresholds) {
  const normalized = normalizePath(filePath);
  for (const [prefix, threshold] of Object.entries(thresholds).sort((a, b) => b[0].length - a[0].length)) {
    if (normalized.startsWith(prefix)) {
      return threshold;
    }
  }
  return 25; // Default floor
}

/**
 * Whether coverage meets the threshold. Undefined coverage (not instrumented)
 * never passes — an uninstrumented critical file is a coverage miss, not a pass.
 * @param {number | undefined} coverage
 * @param {number} threshold
 * @returns {boolean}
 */
export function isAboveThreshold(coverage, threshold) {
  if (coverage === undefined) return false;
  return coverage >= threshold;
}

/**
 * Whether a file fails the critical-path coverage gate: its statements are
 * below the applicable per-path threshold (or not instrumented at all), OR
 * — when branch data was collected — its branches are below the global
 * branch floor. Deliberately returns one boolean rather than a count: a
 * file failing on BOTH axes still fails once. A caller accumulating a
 * failure count across files must call this exactly once per file and
 * increment on `true`, never once per axis — incrementing per axis is what
 * caused F-5c3345ff (a file failing both statements and branches was
 * counted as two failures instead of one).
 * @param {number | undefined} statements
 * @param {number | undefined} branches
 * @param {number} threshold - applicable per-path statement threshold
 * @param {number} branchThreshold - global branch threshold
 * @returns {boolean}
 */
export function failsCoverageGate(statements, branches, threshold, branchThreshold) {
  if (!isAboveThreshold(statements, threshold)) return true;
  if (branches !== undefined && branches < branchThreshold) return true;
  return false;
}

/**
 * One formatted console line describing a file's coverage state.
 * @param {string} filePath
 * @param {number | undefined} statements
 * @param {number | undefined} branches
 * @param {number} threshold
 * @param {boolean} useColor - whether to use Unicode symbols and colored output
 * @returns {string}
 */
export function coverageReportLine(filePath, statements, branches, threshold, useColor = true) {
  const pass = isAboveThreshold(statements, threshold);
  const icon = pass ? (useColor ? '✓' : '+') : (useColor ? '✗' : '-');
  const separator = useColor ? ' — ' : ' - ';

  let report = `  ${icon} ${filePath}${separator}`;
  if (statements === undefined) {
    report += '(no statements instrumented)';
  } else {
    report += `${statements.toFixed(1)}% statements`;
    if (branches !== undefined) {
      report += `, ${branches.toFixed(1)}% branches`;
    } else {
      report += ' (branch data unavailable)';
    }
  }

  if (!pass && statements !== undefined) {
    report += ` (below ${threshold}%)`;
  }
  return report;
}
