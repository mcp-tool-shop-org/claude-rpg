import { describe, it, expect, vi, afterEach } from 'vitest';
import { presentError } from './error-presenter.js';

/**
 * Tests for the unhandled rejection safety net added to bin.ts.
 *
 * The actual process.on('unhandledRejection') handler lives in main() (bin.ts).
 * Here we verify:
 *   1. presentError handles arbitrary rejection reasons without throwing
 *   2. The output is structured (no raw stack traces leak to users)
 *   3. The handler pattern works for the common rejection types seen in
 *      fire-and-forget rl.question callback chains
 */
describe('unhandled rejection safety net', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('presentError handles a plain Error rejection without throwing', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const err = new Error('rl.question callback exploded');

    const exitCode = presentError(err, 'startup', false);

    // startup + unknown error => exitCode null (reprompt semantics)
    expect(exitCode).toBeNull();
    expect(writeSpy).toHaveBeenCalled();
    const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    // Structured output has the "Unexpected error" headline, not a raw stack
    expect(output).toContain('Unexpected error');
    expect(output).not.toMatch(/^\s*Error:/m);
  });

  it('presentError handles a string rejection reason', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const exitCode = presentError('unexpected string rejection', 'startup', false);

    expect(exitCode).toBeNull();
    expect(writeSpy).toHaveBeenCalled();
    const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Unexpected error');
    expect(output).not.toMatch(/^\s*Error:/m);
  });

  it('presentError handles null/undefined rejection reason', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    // Should not throw for null
    expect(() => presentError(null, 'startup', false)).not.toThrow();
    // Should not throw for undefined
    expect(() => presentError(undefined, 'startup', false)).not.toThrow();

    expect(writeSpy).toHaveBeenCalled();
  });

  it('debug mode includes extra detail in structured format', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const err = new Error('callback chain failure');

    presentError(err, 'startup', true);

    const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    // Debug mode adds [debug] section with type/message
    expect(output).toContain('Unexpected error');
    expect(output).toContain('[debug]');
    expect(output).toContain('callback chain failure');
  });

  it('simulates the exact handler pattern from bin.ts', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // This mirrors the handler in bin.ts main():
    //   process.on('unhandledRejection', (reason) => {
    //     presentError(reason, 'startup', debugMode);
    //     process.exit(1);
    //   });
    const debugMode = false;
    const handler = (reason: unknown) => {
      presentError(reason, 'startup', debugMode);
      process.exit(1);
    };

    handler(new Error('fire-and-forget rejection'));

    expect(writeSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    // User sees structured output, not a raw stack trace
    expect(output).toContain('Unexpected error');
    expect(output).not.toMatch(/^\s*Error:/m);
  });
});
