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
 * Per-path coverage thresholds. These must match vitest.config.ts
 * coverage.thresholds — vitest is the enforcement gate on every CI run;
 * this script is the per-changed-file PR report built on the same floors.
 * @returns {Record<string, number>} path prefix -> minimum statements %
 */
export function getPerPathThresholds() {
  return {
    'src/llm/': 70,
    'src/session/': 40,
    'src/game/': 25,
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
 * One formatted console line describing a file's coverage state.
 * @param {string} filePath
 * @param {number | undefined} statements
 * @param {number | undefined} branches
 * @param {number} threshold
 * @returns {string}
 */
export function coverageReportLine(filePath, statements, branches, threshold) {
  const pass = isAboveThreshold(statements, threshold);
  const icon = pass ? '✓' : '✗';

  let report = `  ${icon} ${filePath} — `;
  if (statements === undefined) {
    report += '(no statements instrumented)';
  } else {
    report += `${statements.toFixed(1)}% statements`;
    if (branches !== undefined) {
      report += `, ${branches.toFixed(1)}% branches`;
    }
  }

  if (!pass && statements !== undefined) {
    report += ` (below ${threshold}%)`;
  }
  return report;
}
