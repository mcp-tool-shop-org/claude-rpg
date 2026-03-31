import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSpinner } from './spinner.js';

// Mock writable stream for testing
function mockStream(isTTY: boolean): NodeJS.WriteStream {
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
});
