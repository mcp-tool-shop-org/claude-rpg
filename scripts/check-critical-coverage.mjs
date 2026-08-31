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
// Per-path Thresholds (matching vitest.config.ts and check-coverage-utils.mjs):
//   src/llm/: 82% statements (LLM integration — highest risk)
//   src/session/: 58% statements (session management)
//   src/game.ts: 30% statements (game.ts specific file floor)
//   src/game/: 55% statements (game directory floor)
//   src/display/: 55% statements (display directory floor)

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  statementsPercent,
  branchesPercent,
  getPerPathThresholds,
  getApplicableThreshold,
  getGlobalBranchThreshold,
  normalizePath,
  coverageReportLine,
  failsCoverageGate,
} from './check-coverage-utils.mjs';

// Respect NO_COLOR environment variable and terminal capability
// See https://no-color.org/
const useColor = !process.env.NO_COLOR && process.stdout.isTTY;
const bold = (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s);

// Single source of the per-path floors, shared with the test suite.
const THRESHOLDS = getPerPathThresholds();

// Derive CRITICAL_PATHS dynamically from THRESHOLDS to ensure they stay in sync
const CRITICAL_PATHS = Object.keys(THRESHOLDS);

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

console.log(`${bold('── Runtime-Critical Changed Files ──')}\n`);

// Global branch coverage floor — extracted to check-coverage-utils.mjs to ensure
// scripts and vitest.config.ts stay in sync. See getGlobalBranchThreshold().
const BRANCH_THRESHOLD = getGlobalBranchThreshold();

const failingFiles = [];
for (const file of criticalChanged) {
  const absPath = resolve(file);
  const normalizedPath = normalizePath(absPath);

  // Lookup in coverage data using normalized path
  const entry = coverage[normalizedPath];
  if (!entry) {
    // Design intent: missing coverage data is treated as "unknown" (?) rather than failure.
    // This graceful degradation allows the check to complete even when coverage collection
    // had gaps (e.g., a file was added but tests weren't run yet). The assumption is that
    // developers will re-run coverage if they see '?' — and a truly untested critical file
    // will fail the threshold check on subsequent runs. For strict validation, run with
    // npm run test:coverage before submitting the PR.
    console.log(`  ? ${file} — not in coverage report`);
    continue;
  }

  const stmtsPct = statementsPercent(entry);
  const branchPct = branchesPercent(entry);
  const threshold = getApplicableThreshold(file, THRESHOLDS);

  // Use coverageReportLine to format the output
  const reportLine = coverageReportLine(file, stmtsPct, branchPct, threshold);
  console.log(reportLine);

  // F-5c3345ff: a single gate check per file rather than one increment per
  // axis — a file failing both statements AND branches still counts once.
  if (failsCoverageGate(stmtsPct, branchPct, threshold, BRANCH_THRESHOLD)) {
    failingFiles.push(file);
  }
}

const failures = failingFiles.length;

console.log('');
if (failures > 0) {
  console.log(`✗ Critical-path coverage check failed: ${failures} file(s) below threshold or not instrumented.`);
  // Print unique failing files to reduce cognitive load for developers debugging CI failures
  const uniqueFailingFiles = [...new Set(failingFiles)];
  if (uniqueFailingFiles.length > 0) {
    console.log('  Failed files:');
    for (const file of uniqueFailingFiles) {
      console.log(`    - ${file}`);
    }
  }
  process.exit(1);
} else {
  console.log('✓ All touched critical files above thresholds.');
}
