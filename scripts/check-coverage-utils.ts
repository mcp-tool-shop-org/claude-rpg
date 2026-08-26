/**
 * check-coverage-utils.ts
 * Shared utilities for coverage validation.
 * Extracted for testability while keeping scripts dependency-free.
 */

/**
 * Coverage entry shape for a single file (Istanbul v8 format).
 * From vitest coverage provider output, coverage-final.json keys are absolute paths.
 * Each value contains:
 *   s: { statement_index: hit_count, ... }
 *   b: { branch_index: [hit_count, ...], ... }
 *   f: { function_index: hit_count, ... }
 *   fnMap: { function_index: FunctionInfo, ... }
 *   statementMap: { statement_index: LocationInfo, ... }
 *   branchMap: { branch_index: BranchInfo, ... }
 */
export interface CoverageEntry {
  s?: Record<string, number>;
  b?: Record<string, number[]>;
  f?: Record<string, number>;
  [key: string]: any;
}

/**
 * Compute statement coverage % from Istanbul file entry.
 * Distinguishes empty coverage (no statements instrumented) from full coverage.
 *
 * @param fileData - Coverage data for a single file
 * @returns Coverage percentage (0-100), or undefined if no statements instrumented
 */
export function statementsPercent(fileData: CoverageEntry): number | undefined {
  const s = fileData.s;
  if (!s) return undefined;
  const keys = Object.keys(s);
  if (keys.length === 0) return undefined; // Empty file — no statements
  const covered = keys.filter((k) => s[k] > 0).length;
  return (covered / keys.length) * 100;
}

/**
 * Compute branch coverage % from Istanbul file entry.
 * For files without branch instrumentation, returns undefined.
 *
 * @param fileData - Coverage data for a single file
 * @returns Coverage percentage (0-100), or undefined if no branches instrumented
 */
export function branchesPercent(fileData: CoverageEntry): number | undefined {
  const b = fileData.b;
  if (!b) return undefined;
  const keys = Object.keys(b);
  if (keys.length === 0) return undefined; // No branches instrumented
  const covered = keys.filter((k) => b[k].some((count) => count > 0)).length;
  return (covered / keys.length) * 100;
}

/**
 * Per-path coverage thresholds from vitest.config.ts.
 * These are the enforcement floors for runtime-critical paths.
 * Format: path prefix -> minimum statements % required
 */
export interface PerPathThresholds {
  [path: string]: number;
}

/**
 * Get per-path coverage thresholds.
 * These must match the thresholds in vitest.config.ts.
 *
 * Thresholds from vitest.config.ts thresholds object:
 *   src/llm/**: statements 70%
 *   src/session/**: statements 40%
 *   src/game/**: statements 25%
 *
 * @returns Object mapping path prefixes to minimum statement coverage %
 */
export function getPerPathThresholds(): PerPathThresholds {
  return {
    'src/llm/': 70,
    'src/session/': 40,
    'src/game/': 25,
  };
}

/**
 * Normalize an absolute path to use forward slashes consistently.
 * Handles Windows and Unix paths transparently.
 *
 * @param path - Absolute file path (may use backslashes on Windows)
 * @returns Normalized path using forward slashes
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Determine which per-path threshold applies to a file.
 * Returns the highest (most strict) threshold that matches the file path.
 *
 * @param filePath - Relative or absolute file path
 * @param thresholds - Per-path threshold map
 * @returns Applicable threshold, or 25 (default) if no path matches
 */
export function getApplicableThreshold(filePath: string, thresholds: PerPathThresholds): number {
  const normalized = normalizePath(filePath);
  for (const [prefix, threshold] of Object.entries(thresholds).sort((a, b) => b[0].length - a[0].length)) {
    if (normalized.includes(prefix)) {
      return threshold;
    }
  }
  return 25; // Default floor
}

/**
 * Check if coverage is at or above the threshold.
 *
 * @param coverage - Coverage percentage, or undefined if not instrumented
 * @param threshold - Minimum required percentage
 * @returns true if coverage >= threshold, false if coverage < threshold
 *          Returns false if coverage is undefined (not instrumented)
 */
export function isAboveThreshold(coverage: number | undefined, threshold: number): boolean {
  if (coverage === undefined) return false;
  return coverage >= threshold;
}

/**
 * Generate a short description of coverage state for logging.
 *
 * @param filePath - File path to report
 * @param statements - Statement coverage %, or undefined
 * @param branches - Branch coverage %, or undefined
 * @param threshold - Applicable threshold for statements
 * @returns Formatted string for console output
 */
export function coverageReportLine(
  filePath: string,
  statements: number | undefined,
  branches: number | undefined,
  threshold: number,
): string {
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
