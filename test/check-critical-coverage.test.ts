import { describe, it, expect } from 'vitest';
import {
  statementsPercent,
  getPerPathThresholds,
  normalizePath,
  isAboveThreshold,
  getApplicableThreshold,
  branchesPercent,
  coverageReportLine,
} from '../scripts/check-coverage-utils.mjs';

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

    expect(thresholds['src/llm/']).toBe(70);
    expect(thresholds['src/session/']).toBe(40);
    expect(thresholds['src/game/']).toBe(25);
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
  it('returns 70 for src/llm/ files', () => {
    const thresholds = getPerPathThresholds();
    expect(getApplicableThreshold('src/llm/interpreter.ts', thresholds)).toBe(70);
  });

  it('returns 40 for src/session/ files', () => {
    const thresholds = getPerPathThresholds();
    expect(getApplicableThreshold('src/session/manager.ts', thresholds)).toBe(40);
  });

  it('returns 25 for src/game/ files', () => {
    const thresholds = getPerPathThresholds();
    expect(getApplicableThreshold('src/game/engine.ts', thresholds)).toBe(25);
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
