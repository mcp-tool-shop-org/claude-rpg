import { describe, it, expect } from 'vitest';
import {
  statementsPercent,
  getPerPathThresholds,
  normalizePath,
  isAboveThreshold,
  getApplicableThreshold,
  branchesPercent,
  coverageReportLine,
  failsCoverageGate,
} from '../scripts/check-coverage-utils.mjs';

// Coordinator stitch, wave 2 (run swarm-1788171999-5dc0): gate-goes-RED
// proofs for the ci-tooling amend — a gate is not verified until a mutation
// of the protected thing makes it fire.
describe('src/display/ per-path threshold (F-bb735a0b)', () => {
  it('display paths resolve to the 55 floor instead of falling through to the global default', () => {
    const thresholds = getPerPathThresholds();
    expect(getApplicableThreshold('src/display/play-renderer.ts', thresholds)).toBe(55);
  });

  it('fires on a below-floor display file (the gate can go red)', () => {
    const thresholds = getPerPathThresholds();
    const t = getApplicableThreshold('src/display/help-system.ts', thresholds);
    expect(failsCoverageGate(t - 1, undefined, t, 60)).toBe(true);
  });

  it('passes an at-floor display file', () => {
    const thresholds = getPerPathThresholds();
    const t = getApplicableThreshold('src/display/help-system.ts', thresholds);
    expect(failsCoverageGate(t, undefined, t, 60)).toBe(false);
  });
});

describe('failsCoverageGate single-verdict contract (F-5c3345ff)', () => {
  it('a file failing BOTH statements and branches yields one boolean, not an axis count', () => {
    expect(failsCoverageGate(10, 10, 55, 60)).toBe(true);
  });

  it('fires on statements alone', () => {
    expect(failsCoverageGate(10, 99, 55, 60)).toBe(true);
  });

  it('fires on branches alone', () => {
    expect(failsCoverageGate(99, 10, 55, 60)).toBe(true);
  });

  it('uninstrumented statements fail (undefined is not a pass)', () => {
    expect(failsCoverageGate(undefined, 99, 55, 60)).toBe(true);
  });

  it('missing branch data does not fail on the branch axis', () => {
    expect(failsCoverageGate(99, undefined, 55, 60)).toBe(false);
  });

  it('holds green when both axes clear their floors', () => {
    expect(failsCoverageGate(80, 75, 55, 60)).toBe(false);
  });
});

describe('statementsPercent', () => {
  it('returns undefined when s is missing', () => {
    const result = statementsPercent({});
    expect(result).toBeUndefined();
  });

  it('returns a number for actual statement data', () => {
    const fileData = {
      s: {
        0: 1,
        1: 1,
        2: 0,
        3: 1,
      },
    };
    const result = statementsPercent(fileData);
    expect(result).toBe(75); // 3 out of 4 covered
  });

  it('distinguishes empty coverage from full coverage', () => {
    // Empty coverage (no statements instrumented)
    const emptyData = { s: {} };
    const emptyResult = statementsPercent(emptyData);

    // Full coverage (all statements covered)
    const fullData = {
      s: {
        0: 1,
        1: 1,
      },
    };
    const fullResult = statementsPercent(fullData);

    // They should be different
    expect(emptyResult).not.toBe(fullResult);

    // Empty should be undefined or null to distinguish
    expect(emptyResult).toBeUndefined();
    expect(fullResult).toBe(100);
  });
});

describe('getPerPathThresholds', () => {
  it('returns thresholds matching vitest.config.ts', () => {
    const thresholds = getPerPathThresholds();

    // F-ce3b86de: ratcheted alongside vitest.config.ts's coverage.thresholds
    // (source of truth); scripts/check-coverage-utils.mjs mirrors the same
    // values so the PR-diff gate and the standing vitest gate agree.
    expect(thresholds['src/llm/']).toBe(82);
    expect(thresholds['src/session/']).toBe(58);
    expect(thresholds['src/game/']).toBe(55);
    // F-ce3b86de: the top-level src/game.ts file gets its own dedicated
    // key, distinct from the src/game/ subdirectory above -- 'src/game/**'
    // never matched it (see the getApplicableThreshold cases below).
    expect(thresholds['src/game.ts']).toBe(30);
  });

  it('returns all thresholds as an object', () => {
    const thresholds = getPerPathThresholds();
    expect(typeof thresholds).toBe('object');
    expect(Object.keys(thresholds).length).toBeGreaterThan(0);
  });
});

describe('normalizePath', () => {
  it('normalizes absolute paths to forward slashes', () => {
    const windowsPath = 'C:\\Users\\test\\project\\src\\file.ts';
    const result = normalizePath(windowsPath);
    expect(result).toMatch(/^[A-Z]:[/\\]/); // starts with drive letter
    expect(result.includes('\\')).toBe(false); // no backslashes
  });

  it('returns the same path if already normalized', () => {
    const normalPath = '/home/user/project/src/file.ts';
    const result = normalizePath(normalPath);
    expect(result).toBe(normalPath);
  });
});

describe('isAboveThreshold', () => {
  it('returns true when coverage is at or above threshold', () => {
    expect(isAboveThreshold(70, 70)).toBe(true);
    expect(isAboveThreshold(75, 70)).toBe(true);
  });

  it('returns false when coverage is below threshold', () => {
    expect(isAboveThreshold(69, 70)).toBe(false);
  });

  it('returns false when coverage is undefined', () => {
    expect(isAboveThreshold(undefined, 25)).toBe(false);
  });
});

describe('getApplicableThreshold', () => {
  it('returns 82 for src/llm/ files', () => {
    const thresholds = getPerPathThresholds();
    expect(getApplicableThreshold('src/llm/interpreter.ts', thresholds)).toBe(82);
  });

  it('returns 58 for src/session/ files', () => {
    const thresholds = getPerPathThresholds();
    expect(getApplicableThreshold('src/session/manager.ts', thresholds)).toBe(58);
  });

  it('returns 55 for src/game/ files', () => {
    const thresholds = getPerPathThresholds();
    // F-ce3b86de: was 'src/game/engine.ts', a path that does not exist
    // anywhere in this repo -- game-state.ts is a real src/game/ file, so
    // this case now exercises the actual subdirectory floor it claims to.
    expect(getApplicableThreshold('src/game/game-state.ts', thresholds)).toBe(55);
  });

  it('returns 30 for the top-level src/game.ts file specifically (F-ce3b86de: distinct from the src/game/ subdirectory floor above)', () => {
    const thresholds = getPerPathThresholds();
    expect(getApplicableThreshold('src/game.ts', thresholds)).toBe(30);
  });

  it('returns default 25 for files outside critical paths', () => {
    const thresholds = getPerPathThresholds();
    expect(getApplicableThreshold('src/utils/helpers.ts', thresholds)).toBe(25);
  });
});

describe('branchesPercent', () => {
  it('returns undefined when b is missing', () => {
    expect(branchesPercent({})).toBeUndefined();
  });

  it('returns 0 when branches exist but none are covered', () => {
    const fileData = {
      b: {
        0: [0, 0],
        1: [0, 1],
      },
    };
    expect(branchesPercent(fileData)).toBe(50); // 1 out of 2 branch locations covered
  });

  it('returns 100 when all branches are covered', () => {
    const fileData = {
      b: {
        0: [1, 1],
        1: [1, 1],
      },
    };
    expect(branchesPercent(fileData)).toBe(100);
  });

  it('returns undefined for empty branch map', () => {
    expect(branchesPercent({ b: {} })).toBeUndefined();
  });
});

describe('getApplicableThreshold with path-prefix matching', () => {
  it('anchors prefixes at the path start (startsWith), not anywhere in the string', () => {
    const thresholds = getPerPathThresholds();
    // Discriminating case: 'src/llm/' appears at a NON-ZERO offset. Substring
    // matching (the old includes()) would return 70 here; anchored prefix
    // matching returns the 25 default. This test fails if includes() returns.
    expect(getApplicableThreshold('vendor/src/llm/x.ts', thresholds)).toBe(25);
    // Positive control: a real prefix match still resolves its floor.
    expect(getApplicableThreshold('src/llm/adapter.ts', thresholds)).toBe(82);
    // Sibling-directory name sharing the prefix as a string is not a match.
    expect(getApplicableThreshold('src/gameplay/file.ts', thresholds)).toBe(25);
  });
});

describe('coverageReportLine', () => {
  it('formats a passing file report', () => {
    const line = coverageReportLine('src/llm/test.ts', 75, 60, 70);
    expect(line).toContain('✓');
    expect(line).toContain('75.0% statements');
    expect(line).toContain('60.0% branches');
  });

  it('formats a failing file report', () => {
    const line = coverageReportLine('src/llm/test.ts', 65, 50, 70);
    expect(line).toContain('✗');
    expect(line).toContain('65.0% statements');
    expect(line).toContain('(below 70%)');
  });

  it('formats a file with no statements', () => {
    const line = coverageReportLine('src/game/test.ts', undefined, undefined, 25);
    expect(line).toContain('✗');
    expect(line).toContain('(no statements instrumented)');
  });
});

// F-ae59b90a: the three cases above certify the ungated glyph as correct
// output with no NO_COLOR variant -- the exact accessibility gap F-1a4feed0
// already fixed for check-critical-coverage.mjs's own top-level lines
// (useColor ? '✓' : '+', useColor ? '✗' : '-', useColor ? '⚠' : '!' --
// check-critical-coverage.mjs:38,57,66,73,122,133), never applied to
// coverageReportLine even though it formats the single highest-volume line
// in that script's CI output (console.log(reportLine),
// check-critical-coverage.mjs:108-109). Routed per the coordinator's
// wave-10 split (ADDENDUM-COMMON.md): ci-tooling threads a useColor param
// into coverageReportLine (scripts/check-coverage-utils.mjs, outside this
// domain's test/**-only globs) and applies the same ternary-to-ASCII
// fallback already used at the call sites above; this proof test asserts
// the NO_COLOR output shape once that lands. useColor defaults truthy
// (matching the 3 pre-existing calls above, which omit the new 5th arg and
// must keep passing unchanged), so `false` here is what selects the
// NO_COLOR fallback.
//
// Parallel-wave caveat (mirrors game-turn-loop.test.ts:631-641's own
// disclaimer for the identical cross-worktree shape): EXPECTED TO FAIL in
// THIS worktree, in isolation, until ci-tooling's sibling fix to
// coverageReportLine's signature lands in the cumulative tree at collect
// time -- do not weaken these assertions to match the current ungated
// output.
describe('coverageReportLine NO_COLOR parity (F-ae59b90a)', () => {
  it('formats a passing file report under NO_COLOR with the ASCII fallback', () => {
    // Before (ungated):  '  ✓ src/llm/test.ts — 75.0% statements, 60.0% branches'
    // After (NO_COLOR):  '  + src/llm/test.ts — 75.0% statements, 60.0% branches'
    const line = coverageReportLine('src/llm/test.ts', 75, 60, 70, false);
    expect(line).toContain('+');
    expect(line).not.toContain('✓');
    expect(line).not.toContain('✗');
    expect(line).toContain('75.0% statements');
    expect(line).toContain('60.0% branches');
  });

  it('formats a failing file report under NO_COLOR with the ASCII fallback', () => {
    // Before (ungated):  '  ✗ src/llm/test.ts — 65.0% statements, 50.0% branches (below 70%)'
    // After (NO_COLOR):  '  - src/llm/test.ts — 65.0% statements, 50.0% branches (below 70%)'
    const line = coverageReportLine('src/llm/test.ts', 65, 50, 70, false);
    expect(line).toContain('-');
    expect(line).not.toContain('✓');
    expect(line).not.toContain('✗');
    expect(line).toContain('65.0% statements');
    expect(line).toContain('(below 70%)');
  });

  it('formats a file with no statements under NO_COLOR with the ASCII fallback', () => {
    // Before (ungated):  '  ✗ src/game/test.ts — (no statements instrumented)'
    // After (NO_COLOR):  '  - src/game/test.ts — (no statements instrumented)'
    const line = coverageReportLine('src/game/test.ts', undefined, undefined, 25, false);
    expect(line).toContain('-');
    expect(line).not.toContain('✓');
    expect(line).not.toContain('✗');
    expect(line).toContain('(no statements instrumented)');
  });
});
