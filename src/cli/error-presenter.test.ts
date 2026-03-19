import { describe, it, expect } from 'vitest';
import { classifyForPresentation, renderError, type ErrorPresentation } from './error-presenter.js';
import { NarrationError } from '../llm/claude-errors.js';
import { SaveValidationError } from '../session/session.js';

// ─── Helper ─────────────────────────────────────────────────

function rendered(p: ErrorPresentation, debug: boolean, err?: unknown): string {
  return renderError(p, debug, err);
}

// ─── Narration Error Rendering ──────────────────────────────

describe('error-presenter: narration errors', () => {
  it('timeout renders player-safe output', () => {
    const err = new NarrationError({ kind: 'timeout', message: 'timed out' });
    const p = classifyForPresentation(err, 'turn');
    expect(p.headline).toBe('Connection timed out');
    expect(p.preserved).toContain('intact');
    expect(p.exitCode).toBeNull(); // reprompt, don't exit
  });

  it('auth failure tells user to check API key', () => {
    const err = new NarrationError({ kind: 'auth', message: 'invalid key' });
    const p = classifyForPresentation(err, 'turn');
    expect(p.headline).toBe('API key error');
    expect(p.nextAction).toContain('ANTHROPIC_API_KEY');
    expect(p.exitCode).toBeNull(); // during play: reprompt
  });

  it('rate limit suggests retry without implying save loss', () => {
    const err = new NarrationError({ kind: 'rate-limit', message: 'rate limited' });
    const p = classifyForPresentation(err, 'turn');
    expect(p.headline).toBe('Rate limit reached');
    expect(p.preserved).toContain('intact');
    expect(p.nextAction).toContain('save');
    expect(p.exitCode).toBeNull();
  });

  it('transport error suggests checking connection', () => {
    const err = new NarrationError({ kind: 'transport', message: 'ECONNRESET' });
    const p = classifyForPresentation(err, 'turn');
    expect(p.headline).toBe('Connection interrupted');
    expect(p.nextAction).toContain('connection');
  });

  it('bad-request flags as bug', () => {
    const err = new NarrationError({ kind: 'bad-request', message: 'invalid params' });
    const p = classifyForPresentation(err, 'turn');
    expect(p.headline).toBe('Internal error');
    expect(p.nextAction).toContain('bug');
  });

  it('unexpected error stays controlled', () => {
    const err = new NarrationError({ kind: 'unexpected', message: 'unknown' });
    const p = classifyForPresentation(err, 'turn');
    expect(p.headline).toBe('Unexpected error');
    expect(p.preserved).toContain('intact');
  });
});

// ─── Opening Narration (Fatal) ──────────────────────────────

describe('error-presenter: opening narration', () => {
  it('opening narration failure is fatal (exit 1)', () => {
    const err = new NarrationError({ kind: 'timeout', message: 'timed out' });
    const p = classifyForPresentation(err, 'opening');
    expect(p.exitCode).toBe(1); // opening is fatal
  });

  it('opening auth failure is also fatal', () => {
    const err = new NarrationError({ kind: 'auth', message: 'invalid key' });
    const p = classifyForPresentation(err, 'opening');
    expect(p.exitCode).toBe(1);
  });
});

// ─── Save Errors ────────────────────────────────────────────

describe('error-presenter: save errors', () => {
  it('save failure reports recovery path', () => {
    const err = new Error('ENOSPC: no space left');
    const p = classifyForPresentation(err, 'save');
    expect(p.headline).toBe('Save failed');
    expect(p.preserved).toContain('in-memory');
    expect(p.nextAction).toContain('disk space');
    expect(p.exitCode).toBeNull(); // reprompt
  });
});

// ─── Load Errors ────────────────────────────────────────────

describe('error-presenter: load errors', () => {
  it('malformed save reports recovery and backup path', () => {
    const err = new SaveValidationError('Save file is not valid JSON');
    const p = classifyForPresentation(err, 'load');
    expect(p.headline).toBe('Could not load save');
    expect(p.explanation).toContain('invalid');
    expect(p.nextAction).toContain('.bak');
    expect(p.exitCode).toBe(1);
  });

  it('generic load error also reports backup path', () => {
    const err = new Error('ENOENT: file not found');
    const p = classifyForPresentation(err, 'load');
    expect(p.headline).toBe('Could not load save');
    expect(p.nextAction).toContain('.bak');
    expect(p.exitCode).toBe(1);
  });
});

// ─── Normal Mode Output Shape ───────────────────────────────

describe('error-presenter: output format', () => {
  it('normal mode has 4-line format with no stack traces', () => {
    const err = new NarrationError({ kind: 'timeout', message: 'timed out' });
    const p = classifyForPresentation(err, 'turn');
    const output = rendered(p, false, err);

    expect(output).toContain('\u26A0'); // warning symbol
    expect(output).toContain('\u2192'); // arrow
    expect(output).not.toContain('[debug]');
    expect(output).not.toContain('stack');
    expect(output).not.toContain('at ');
  });

  it('non-debug mode excludes internal noise', () => {
    const err = new NarrationError({
      kind: 'transport',
      message: 'ECONNRESET',
      requestId: 'req_abc123',
    });
    const p = classifyForPresentation(err, 'turn');
    const output = rendered(p, false, err);

    expect(output).not.toContain('req_abc123');
    expect(output).not.toContain('ECONNRESET');
    expect(output).not.toContain('[debug]');
  });
});

// ─── Debug Mode ─────────────────────────────────────────────

describe('error-presenter: debug mode', () => {
  it('--debug includes structured detail', () => {
    const err = new NarrationError({
      kind: 'rate-limit',
      message: 'rate limited',
      requestId: 'req_xyz789',
    });
    const p = classifyForPresentation(err, 'turn');
    const output = rendered(p, true, err);

    expect(output).toContain('[debug]');
    expect(output).toContain('kind: rate-limit');
    expect(output).toContain('request_id: req_xyz789');
    expect(output).toContain('retryable: true');
  });

  it('debug mode still includes normal output', () => {
    const err = new NarrationError({ kind: 'auth', message: 'invalid key' });
    const p = classifyForPresentation(err, 'turn');
    const output = rendered(p, true, err);

    expect(output).toContain('API key error');
    expect(output).toContain('ANTHROPIC_API_KEY');
    expect(output).toContain('[debug]');
  });

  it('debug with cause shows cause summary', () => {
    const cause = new Error('Connection refused');
    const err = new NarrationError({
      kind: 'transport',
      message: 'transport error',
      cause,
    });
    const p = classifyForPresentation(err, 'turn');
    const output = rendered(p, true, err);

    expect(output).toContain('cause: Connection refused');
  });

  it('debug for non-NarrationError shows type and message', () => {
    const err = new TypeError('Cannot read property');
    const p = classifyForPresentation(err, 'turn');
    const output = rendered(p, true, err);

    expect(output).toContain('[debug]');
    expect(output).toContain('type: TypeError');
    expect(output).toContain('message: Cannot read property');
  });
});

// ─── Exit Code Semantics ────────────────────────────────────

describe('error-presenter: exit codes', () => {
  it('turn errors return null (reprompt)', () => {
    const err = new NarrationError({ kind: 'timeout', message: 'timeout' });
    expect(classifyForPresentation(err, 'turn').exitCode).toBeNull();
  });

  it('save errors return null (reprompt)', () => {
    const err = new Error('disk full');
    expect(classifyForPresentation(err, 'save').exitCode).toBeNull();
  });

  it('load errors return 1 (fatal)', () => {
    const err = new Error('file not found');
    expect(classifyForPresentation(err, 'load').exitCode).toBe(1);
  });

  it('opening errors return 1 (fatal)', () => {
    const err = new NarrationError({ kind: 'unexpected', message: 'oops' });
    expect(classifyForPresentation(err, 'opening').exitCode).toBe(1);
  });
});
