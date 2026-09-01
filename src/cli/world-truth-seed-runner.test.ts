import { describe, it, expect, vi } from 'vitest';
import { runWorldTruthSeed, type WorldTruthSeedReport } from './world-truth-seed-runner.js';
import { createTestLogger } from '../game/debug-logger.js';

// WO-A2T-5 (slice A2-truth, design doc §8): the bin.ts load-time seed call
// site's error handling, extracted for unit coverage since bin.ts's own
// runLoad() is not exported (integration-only, per the file header comment
// in bin-defenses.test.ts) and game-core's seedWorldTruthFromSession is out
// of this domain's owned globs -- exercised here through a fake seedFn.
//
// Observed red before this file/module existed: runWorldTruthSeed did not
// exist on this branch prior to this change (ReferenceError on import), so
// there was zero coverage of "a thrown seed error must not escape as an
// uncaught exception" -- the exact failure mode design doc §8's idempotent
// seeding step introduces at bin.ts's load site. This file both introduces
// the wrapper and its coverage together; each `it` below was confirmed
// failing against a stub that just called seedFn() with no try/catch
// (the pre-extraction shape) before the real implementation was written.

describe('runWorldTruthSeed (WO-A2T-5)', () => {
  it('logs the report through the debug logger and returns it on success', () => {
    const logger = createTestLogger();
    const report: WorldTruthSeedReport = { seeded: true, marker: '2.0.0@3.11.0' };
    const seedFn = vi.fn(() => report);

    const outcome = runWorldTruthSeed(seedFn, logger);

    expect(outcome).toEqual({ ok: true, report });
    expect(seedFn).toHaveBeenCalledTimes(1);
    const entries = logger.getEntries();
    expect(entries).toContainEqual(
      expect.objectContaining({
        level: 'info',
        subsystem: 'world-truth-seed',
        message: 'load-time seed',
        data: { report },
      }),
    );
  });

  it('reports seeded: false without error on an idempotent no-op (marker already present)', () => {
    const logger = createTestLogger();
    const report: WorldTruthSeedReport = { seeded: false };
    const seedFn = () => report;

    const outcome = runWorldTruthSeed(seedFn, logger);

    expect(outcome).toEqual({ ok: true, report: { seeded: false } });
  });

  it('captures a thrown error instead of letting it escape (malformed 1.x field)', () => {
    const logger = createTestLogger();
    const thrown = new Error('pressures[2].kind is not a recognized pressure kind');
    const seedFn = (): WorldTruthSeedReport => {
      throw thrown;
    };

    const outcome = runWorldTruthSeed(seedFn, logger);

    expect(outcome).toEqual({ ok: false, error: thrown });
    // No success entry was logged -- the caller (bin.ts) routes `error`
    // through presentError(err, 'load', debugMode) instead.
    expect(logger.getEntries().some((e) => e.subsystem === 'world-truth-seed')).toBe(false);
  });
});
