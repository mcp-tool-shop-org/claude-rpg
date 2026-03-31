import { describe, it, expect } from 'vitest';
import { SessionTokenTracker } from './token-tracker.js';

describe('SessionTokenTracker (FT-B-004)', () => {
  it('should record and retrieve tokens by call type', () => {
    const tracker = new SessionTokenTracker();
    tracker.record('interpretation', 100, 50);

    const record = tracker.getRecord('interpretation');
    expect(record.inputTokens).toBe(100);
    expect(record.outputTokens).toBe(50);
    expect(record.callCount).toBe(1);
  });

  it('should accumulate multiple calls of the same type', () => {
    const tracker = new SessionTokenTracker();
    tracker.record('narration', 200, 100);
    tracker.record('narration', 300, 150);

    const record = tracker.getRecord('narration');
    expect(record.inputTokens).toBe(500);
    expect(record.outputTokens).toBe(250);
    expect(record.callCount).toBe(2);
  });

  it('should return zeroed record for untracked call type', () => {
    const tracker = new SessionTokenTracker();
    const record = tracker.getRecord('dialogue');
    expect(record.inputTokens).toBe(0);
    expect(record.outputTokens).toBe(0);
    expect(record.callCount).toBe(0);
  });

  it('should compute totals across all call types', () => {
    const tracker = new SessionTokenTracker();
    tracker.record('interpretation', 100, 50);
    tracker.record('narration', 200, 100);
    tracker.record('dialogue', 150, 75);

    const totals = tracker.getTotals();
    expect(totals.inputTokens).toBe(450);
    expect(totals.outputTokens).toBe(225);
    expect(totals.callCount).toBe(3);
  });

  it('should estimate cost using Sonnet pricing ($3/MTok in, $15/MTok out)', () => {
    const tracker = new SessionTokenTracker();
    tracker.record('narration', 1_000_000, 100_000);

    const cost = tracker.estimateCost();
    // 1M input tokens * $3/MTok = $3.00
    // 100K output tokens * $15/MTok = $1.50
    expect(cost.inputCostUsd).toBeCloseTo(3.0, 2);
    expect(cost.outputCostUsd).toBeCloseTo(1.5, 2);
    expect(cost.totalCostUsd).toBeCloseTo(4.5, 2);
  });

  it('should format a human-readable cost summary', () => {
    const tracker = new SessionTokenTracker();
    tracker.record('interpretation', 500, 100);
    tracker.record('narration', 1000, 500);

    const summary = tracker.formatCostSummary();
    expect(summary).toContain('Session Token Usage');
    expect(summary).toContain('interpretation');
    expect(summary).toContain('narration');
    expect(summary).toContain('Total:');
    expect(summary).toContain('Estimated cost:');
    // Should not include dialogue since no calls were made
    expect(summary).not.toContain('dialogue');
  });

  it('should reset all tracked data', () => {
    const tracker = new SessionTokenTracker();
    tracker.record('interpretation', 100, 50);
    tracker.record('narration', 200, 100);

    tracker.reset();
    const totals = tracker.getTotals();
    expect(totals.inputTokens).toBe(0);
    expect(totals.callCount).toBe(0);
  });
});
