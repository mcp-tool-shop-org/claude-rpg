import { describe, it, expect, afterEach } from 'vitest';
import { SessionTokenTracker, withTokenTracking } from './token-tracker.js';
import type { ClaudeClient } from '../claude-client.js';
import { getTerminalWidth } from '../display/play-renderer.js';

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

  describe('divider convention (F-3453d747)', () => {
    afterEach(() => {
      Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
    });

    it('frames the summary with the app-wide solid divider instead of a bare "---" markdown divider', () => {
      Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });
      const tracker = new SessionTokenTracker();
      tracker.record('narration', 100, 50);

      const summary = tracker.formatCostSummary();
      const lines = summary.split('\n');

      // The old bare '---'-wrapped header/mid-divider is gone entirely...
      expect(summary).not.toContain('--- Session Token Usage ---');
      expect(lines).not.toContain('---');
      // ...replaced by the same solid heavy-rule convention every other
      // rendered screen in the app uses (sheet.ts's DIVIDER,
      // play-renderer.ts's makeDivider), sized to the terminal.
      const width = getTerminalWidth();
      const dividerLines = lines.filter((l) => l === '─'.repeat(width));
      expect(dividerLines.length).toBeGreaterThanOrEqual(2);
    });
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

describe('withTokenTracking (F-b4b16d0a)', () => {
  function makeClient(overrides: Partial<ClaudeClient> = {}): ClaudeClient {
    return {
      model: 'mock',
      async generate() {
        return { ok: true, text: 'narrated', inputTokens: 120, outputTokens: 60 };
      },
      // F-39b958e7 pattern: a concrete non-null `data` shape can't satisfy
      // the generic ClaudeClient.generateStructured<T>() without this cast.
      async generateStructured<T>() {
        return { ok: true, data: { verb: 'look' } as unknown as T, raw: '' };
      },
      ...overrides,
    };
  }

  it('records generate() calls under the given call type and returns the real result unchanged', async () => {
    const tracker = new SessionTokenTracker();
    const client = makeClient();
    const wrapped = withTokenTracking(client, tracker, 'narration');

    const result = await wrapped.generate({ system: 's', prompt: 'p' });

    expect(result).toEqual({ ok: true, text: 'narrated', inputTokens: 120, outputTokens: 60 });
    const record = tracker.getRecord('narration');
    expect(record.inputTokens).toBe(120);
    expect(record.outputTokens).toBe(60);
    expect(record.callCount).toBe(1);
  });

  it('tags separately-wrapped call types independently on a shared tracker', async () => {
    const tracker = new SessionTokenTracker();
    const client = makeClient();
    const narrationClient = withTokenTracking(client, tracker, 'narration');
    const dialogueClient = withTokenTracking(client, tracker, 'dialogue');

    await narrationClient.generate({ system: 's', prompt: 'p' });
    await dialogueClient.generate({ system: 's', prompt: 'p' });

    expect(tracker.getRecord('narration').callCount).toBe(1);
    expect(tracker.getRecord('dialogue').callCount).toBe(1);
    expect(tracker.getTotals().callCount).toBe(2);
  });

  it('does not record generateStructured() calls (StructuredResult carries no token counts) but still delegates the call', async () => {
    const tracker = new SessionTokenTracker();
    let called = false;
    const client = makeClient({
      async generateStructured<T>() {
        called = true;
        return { ok: true, data: { verb: 'look' } as unknown as T, raw: '' };
      },
    });
    const wrapped = withTokenTracking(client, tracker, 'interpretation');

    const result = await wrapped.generateStructured({ system: 's', prompt: 'p' });

    expect(called).toBe(true);
    expect(result.ok).toBe(true);
    expect(tracker.getRecord('interpretation').callCount).toBe(0);
  });

  it('omits generateStream on the wrapper when the underlying client has none', () => {
    const tracker = new SessionTokenTracker();
    const client = makeClient();
    expect(client.generateStream).toBeUndefined();

    const wrapped = withTokenTracking(client, tracker, 'narration');

    expect(wrapped.generateStream).toBeUndefined();
  });

  it('records generateStream() calls under the given call type when the underlying client supports streaming', async () => {
    const tracker = new SessionTokenTracker();
    const client = makeClient({
      generateStream: async (opts) => {
        opts.onChunk('chunk');
        return { ok: true, text: 'chunk', inputTokens: 40, outputTokens: 20 };
      },
    });
    const wrapped = withTokenTracking(client, tracker, 'narration');

    expect(wrapped.generateStream).toBeDefined();
    const chunks: string[] = [];
    const result = await wrapped.generateStream!({ system: 's', prompt: 'p', onChunk: (c) => chunks.push(c) });

    expect(result.text).toBe('chunk');
    expect(chunks).toEqual(['chunk']);
    expect(tracker.getRecord('narration').inputTokens).toBe(40);
    expect(tracker.getRecord('narration').callCount).toBe(1);
  });
});
