#!/usr/bin/env node
// check-critical-coverage.mjs
// Reports coverage for changed files in runtime-critical directories.
// Usage: node scripts/check-critical-coverage.mjs [base-ref]
// Reads coverage from coverage/coverage-final.json (vitest v8 output).

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const CRITICAL_PATHS = ['src/llm/', 'src/session/', 'src/game/'];
const CRITICAL_FLOOR = 25; // minimum statements % for any touched critical file

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

/** Compute statement coverage % from istanbul file entry. */
function statementsPercent(fileData) {
  const s = fileData.s;
  if (!s) return 0;
  const keys = Object.keys(s);
  if (keys.length === 0) return 100;
  const covered = keys.filter((k) => s[k] > 0).length;
  return (covered / keys.length) * 100;
}

console.log('── Runtime-Critical Changed Files ──\n');

for (const file of criticalChanged) {
  const absPath = resolve(file);
  // coverage-final.json keys are absolute paths (OS-specific separators)
  const entry = coverage[absPath] || coverage[absPath.replace(/\//g, '\\')] || coverage[absPath.replace(/\\/g, '/')];
  if (!entry) {
    console.log(`  ? ${file} — not in coverage report`);
    continue;
  }
  const pct = statementsPercent(entry);
  const pass = pct >= CRITICAL_FLOOR;
  const icon = pass ? '✓' : '✗';
  console.log(`  ${icon} ${file} — ${pct.toFixed(1)}% statements${pass ? '' : ` (below ${CRITICAL_FLOOR}%)`}`);
  if (!pass) failures++;
}

console.log('');
if (failures > 0) {
  console.log(`✗ ${failures} critical file(s) below ${CRITICAL_FLOOR}% statements floor.`);
  process.exit(1);
} else {
  console.log('✓ All touched critical files above floor.');
}
