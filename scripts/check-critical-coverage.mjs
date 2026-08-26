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
import {
  statementsPercent,
  branchesPercent,
  getPerPathThresholds,
  getApplicableThreshold,
  normalizePath,
  coverageReportLine,
} from './check-coverage-utils.mjs';

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
let failures = 0;

console.log('── Runtime-Critical Changed Files ──\n');

// Global branch coverage floor from vitest.config.ts
const BRANCH_THRESHOLD = 45;

for (const file of criticalChanged) {
  const absPath = resolve(file);
  const normalizedPath = normalizePath(absPath);

  // Lookup in coverage data using normalized path
  const entry = coverage[normalizedPath];
  if (!entry) {
    console.log(`  ? ${file} — not in coverage report`);
    continue;
  }

  const stmtsPct = statementsPercent(entry);
  const branchPct = branchesPercent(entry);
  const threshold = getApplicableThreshold(file, THRESHOLDS);

  // Use coverageReportLine to format the output
  const reportLine = coverageReportLine(file, stmtsPct, branchPct, threshold);
  console.log(reportLine);

  // Check if statements pass threshold
  let passStmts = false;
  if (stmtsPct === undefined) {
    // Treat as failure: if not instrumented, it's not covered
    failures++;
  } else {
    passStmts = stmtsPct >= threshold;
    if (!passStmts) failures++;
  }

  // Check if branches pass the global 45% floor (only if branches were instrumented)
  if (branchPct !== undefined) {
    const passBranches = branchPct >= BRANCH_THRESHOLD;
    if (!passBranches) {
      failures++;
    }
  }
}

console.log('');
if (failures > 0) {
  console.log(`✗ ${failures} critical file(s) below threshold or not instrumented.`);
  process.exit(1);
} else {
  console.log('✓ All touched critical files above thresholds.');
}
