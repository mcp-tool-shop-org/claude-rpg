#!/usr/bin/env node
// check-critical-coverage.mjs
// Reports coverage for changed files in runtime-critical directories.
// Usage: node scripts/check-critical-coverage.mjs [base-ref]
//
// Coverage Schema (vitest v8 output, coverage/coverage-final.json):
//   Keys: absolute file paths (normalized to forward slashes)
//   Values: {
//     s: { statement_index: hit_count, ... },  // statement coverage
//     b: { branch_index: [hit_count, ...], ... }, // branch coverage (optional)
//     f: { function_index: hit_count, ... },   // function coverage (optional)
//     statementMap, branchMap, fnMap: location metadata
//   }
//
// Per-path Thresholds (matching vitest.config.ts):
//   src/llm/**: 70% statements (LLM integration — highest risk)
//   src/session/**: 40% statements (session management)
//   src/game/**: 25% statements (game logic)

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const CRITICAL_PATHS = ['src/llm/', 'src/session/', 'src/game/'];

/**
 * Per-path coverage thresholds.
 * These must match thresholds in vitest.config.ts coverage.thresholds.
 */
const THRESHOLDS = {
  'src/llm/': 70,
  'src/session/': 40,
  'src/game/': 25,
};

const baseRef = process.argv[2] || 'HEAD~1';

// Get changed files relative to base
let changedFiles;
try {
  changedFiles = execSync(`git diff --name-only ${baseRef}`, { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
} catch {
  console.log('⚠ Could not determine changed files — skipping critical-path check.');
  process.exit(0);
}

const criticalChanged = changedFiles.filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && CRITICAL_PATHS.some((p) => f.startsWith(p)),
);

if (criticalChanged.length === 0) {
  console.log('✓ No runtime-critical source files changed.');
  process.exit(0);
}

// Read coverage-final.json (keyed by absolute path, contains per-file istanbul data)
const coveragePath = 'coverage/coverage-final.json';
if (!existsSync(coveragePath)) {
  console.log('⚠ No coverage data found — run npm run test:coverage first.');
  process.exit(0);
}

const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
let failures = 0;

/**
 * Compute statement coverage % from istanbul file entry.
 * Returns undefined if no statements are instrumented (indicates coverage miss).
 */
function statementsPercent(fileData) {
  const s = fileData.s;
  if (!s) return undefined;
  const keys = Object.keys(s);
  if (keys.length === 0) return undefined; // Empty file — warn about instrumentation
  const covered = keys.filter((k) => s[k] > 0).length;
  return (covered / keys.length) * 100;
}

/**
 * Get the applicable threshold for a file path.
 * Returns the threshold for the most specific (longest) matching prefix.
 */
function getApplicableThreshold(filePath) {
  // Sort by length descending to match most-specific prefix first
  for (const prefix of Object.keys(THRESHOLDS).sort((a, b) => b.length - a.length)) {
    if (filePath.includes(prefix)) {
      return THRESHOLDS[prefix];
    }
  }
  return 25; // Default floor (should not happen for critical paths)
}

/**
 * Normalize path for coverage lookup.
 * coverage-final.json uses absolute paths with forward slashes (vitest v8 behavior).
 */
function normalizeCoveragePath(path) {
  return path.replace(/\\/g, '/');
}

console.log('── Runtime-Critical Changed Files ──\n');

for (const file of criticalChanged) {
  const absPath = resolve(file);
  const normalizedPath = normalizeCoveragePath(absPath);

  // Lookup in coverage data using normalized path
  const entry = coverage[normalizedPath];
  if (!entry) {
    console.log(`  ? ${file} — not in coverage report`);
    continue;
  }

  const stmtsPct = statementsPercent(entry);
  const threshold = getApplicableThreshold(file);

  let passStmts = false;
  if (stmtsPct === undefined) {
    console.log(`  ⚠ ${file} — (no statements instrumented — coverage instrumentation issue)`);
    // Treat as failure: if not instrumented, it's not covered
    failures++;
  } else {
    passStmts = stmtsPct >= threshold;
    const icon = passStmts ? '✓' : '✗';
    console.log(
      `  ${icon} ${file} — ${stmtsPct.toFixed(1)}% statements${passStmts ? '' : ` (below ${threshold}%)`}`,
    );
    if (!passStmts) failures++;
  }
}

console.log('');
if (failures > 0) {
  console.log(`✗ ${failures} critical file(s) below threshold or not instrumented.`);
  process.exit(1);
} else {
  console.log('✓ All touched critical files above thresholds.');
}
