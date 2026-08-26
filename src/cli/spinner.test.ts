import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSpinner, formatRetryLabel } from './spinner.js';

// Mock writable stream for testing
function mockStream(isTTY: boolean): NodeJS.WriteStream & { output: string[] } {
  const chunks: string[] = [];
  return {
    isTTY,
    write(data: string) {
      chunks.push(data);
      return true;
    },
    // Expose captured output for assertions
    get output() {
      return chunks;
    },
  } as unknown as NodeJS.WriteStream & { output: string[] };
}

describe('spinner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a spinner that is initially inactive', () => {
    const spinner = createSpinner();
    expect(spinner.active).toBe(false);
  });

  it('start() sets active to true', () => {
    const stream = mockStream(true);
    const spinner = createSpinner('', stream);
    spinner.start();
    expect(spinner.active).toBe(true);
    spinner.stop();
  });

  it('stop() sets active to false', () => {
    const stream = mockStream(true);
    const spinner = createSpinner('', stream);
    spinner.start();
    spinner.stop();
    expect(spinner.active).toBe(false);
  });

  it('writes braille spinner frames to TTY stream', () => {
    const stream = mockStream(true);
    const spinner = createSpinner('', stream);
    spinner.start();
    // Initial frame should be written
    expect(stream.output.length).toBeGreaterThan(0);
    expect(stream.output[0]).toContain('⠋');

    // Advance timer to see next frame
    vi.advanceTimersByTime(80);
    expect(stream.output.length).toBeGreaterThan(1);
    expect(stream.output[1]).toContain('⠙');

    spinner.stop();
  });

  it('writes label alongside spinner frame', () => {
    const stream = mockStream(true);
    const spinner = createSpinner('thinking', stream);
    spinner.start();
    expect(stream.output[0]).toContain('thinking');
    spinner.stop();
  });

  it('clears line on stop for TTY', () => {
    const stream = mockStream(true);
    const spinner = createSpinner('', stream);
    spinner.start();
    spinner.stop();
    // Last write should be a line clear
    const lastWrite = stream.output[stream.output.length - 1];
    expect(lastWrite).toContain('\r');
    expect(lastWrite).toContain('\x1b[K');
  });

  it('writes static fallback for non-TTY stream', () => {
    const stream = mockStream(false);
    const spinner = createSpinner('thinking', stream);
    spinner.start();
    expect(stream.output[0]).toContain('...');
    expect(stream.output[0]).toContain('thinking');
    spinner.stop();
  });

  it('stop() is safe to call when not active', () => {
    const stream = mockStream(true);
    const spinner = createSpinner('', stream);
    // Should not throw
    spinner.stop();
    expect(spinner.active).toBe(false);
  });

  it('start() is idempotent when already active', () => {
    const stream = mockStream(true);
    const spinner = createSpinner('', stream);
    spinner.start();
    const countAfterStart = stream.output.length;
    spinner.start(); // second call should be no-op
    expect(stream.output.length).toBe(countAfterStart);
    spinner.stop();
  });

  it('can be restarted after stop', () => {
    const stream = mockStream(true);
    const spinner = createSpinner('', stream);
    spinner.start();
    spinner.stop();
    expect(spinner.active).toBe(false);
    spinner.start();
    expect(spinner.active).toBe(true);
    spinner.stop();
  });

  it('cycles through multiple frames over time', () => {
    const stream = mockStream(true);
    const spinner = createSpinner('', stream);
    spinner.start();
    // Advance through several frames
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(80);
    }
    // Should have initial write + 5 interval writes
    expect(stream.output.length).toBeGreaterThanOrEqual(6);
    spinner.stop();
  });

  /**
   * F-d890d23d: withRetry (llm/claude-adapter.ts) already fires
   * onRetry({attempt, maxAttempts, kind, delayMs}) once per retry, but
   * nothing consumed it -- Spinner only exposed start()/stop(), so a player
   * on a degraded connection watched an unchanging "thinking" spinner for up
   * to ~93s with zero indication a retry was even happening.
   */
  describe('setLabel', () => {
    it('updates the rendered frame immediately when active on a TTY stream, without waiting for the next interval tick', () => {
      const stream = mockStream(true);
      const spinner = createSpinner('thinking', stream);
      spinner.start();
      const countBeforeSetLabel = stream.output.length;
      spinner.setLabel('still thinking (retry 1/2 -- rate limit reached)');
      expect(stream.output.length).toBe(countBeforeSetLabel + 1);
      expect(stream.output[stream.output.length - 1]).toContain(
        'still thinking (retry 1/2 -- rate limit reached)',
      );
      spinner.stop();
    });

    it('is a safe no-op before start() -- updates the remembered label but writes nothing', () => {
      const stream = mockStream(true);
      const spinner = createSpinner('thinking', stream);
      spinner.setLabel('a new label');
      expect(stream.output.length).toBe(0);
      expect(spinner.active).toBe(false);
      // The remembered label takes effect on the next start().
      spinner.start();
      expect(stream.output[0]).toContain('a new label');
      spinner.stop();
    });

    it('does not write immediately for a non-TTY stream (no mid-line render to interleave with)', () => {
      const stream = mockStream(false);
      const spinner = createSpinner('thinking', stream);
      spinner.start();
      const countAfterStart = stream.output.length;
      spinner.setLabel('still thinking (retry 1/2 -- rate limit reached)');
      expect(stream.output.length).toBe(countAfterStart);
      spinner.stop();
    });

    it('continues rendering the updated label on subsequent interval ticks', () => {
      const stream = mockStream(true);
      const spinner = createSpinner('thinking', stream);
      spinner.start();
      spinner.setLabel('still thinking (retry 1/2 -- rate limit reached)');
      vi.advanceTimersByTime(80);
      expect(stream.output[stream.output.length - 1]).toContain(
        'still thinking (retry 1/2 -- rate limit reached)',
      );
      spinner.stop();
    });
  });
});

/**
 * F-d890d23d: formatRetryLabel maps withRetry's onRetry info to the
 * spinner label text, covering exactly the 3 structurally-reachable
 * retryable kinds (claude-errors.ts: retryable is true only for
 * 'rate-limit'|'timeout'|'transport' -- auth/bad-request are fatal and
 * never retried), with wording mirrored from error-presenter.ts's headline
 * text for the same 3 kinds so a player who later sees a final-failure box
 * recognizes the same words the spinner already showed.
 */
describe('formatRetryLabel (F-d890d23d)', () => {
  it.each([
    ['rate-limit' as const, 'rate limit reached'],
    ['timeout' as const, 'connection timed out'],
    ['transport' as const, 'connection interrupted'],
  ])('formats the %s kind with error-presenter\'s matching wording', (kind, expectedText) => {
    const label = formatRetryLabel('thinking', { attempt: 1, maxAttempts: 3, kind, delayMs: 2000 });
    expect(label).toBe(`still thinking (retry 1/2 -- ${expectedText})`);
  });

  it('computes attempt/maxAttempts math for a later retry', () => {
    const label = formatRetryLabel('thinking', { attempt: 2, maxAttempts: 3, kind: 'timeout', delayMs: 4000 });
    expect(label).toBe('still thinking (retry 2/2 -- connection timed out)');
  });

  it('substitutes the caller-supplied base label', () => {
    const label = formatRetryLabel('generating world', { attempt: 1, maxAttempts: 2, kind: 'transport', delayMs: 1000 });
    expect(label).toBe('still generating world (retry 1/1 -- connection interrupted)');
  });
});
