import { describe, it, expect, vi, afterEach } from 'vitest';
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

// ─── Migration Failure Rendering ─────────────────────────────

describe('error-presenter: migration failures', () => {
  it('future version gets distinct headline and upgrade guidance', () => {
    const err = new SaveValidationError(
      'This save was created with a newer version of claude-rpg (schema v99). This version supports up to schema v2. Please upgrade.',
    );
    const p = classifyForPresentation(err, 'load');
    expect(p.headline).toBe('Save file too new');
    expect(p.explanation).toContain('newer version');
    expect(p.nextAction).toContain('Upgrade');
    expect(p.preserved).toContain('not modified');
    expect(p.exitCode).toBe(1);
  });

  it('missing version metadata gets unrecognized format headline', () => {
    const err = new SaveValidationError(
      'Save file has no recognizable version field. Cannot determine schema version.',
    );
    const p = classifyForPresentation(err, 'load');
    expect(p.headline).toBe('Unrecognized save format');
    expect(p.nextAction).toContain('Check the file path');
    expect(p.exitCode).toBe(1);
  });

  it('generic SaveValidationError still falls through to default load error', () => {
    const err = new SaveValidationError('Save file missing required field: engineState');
    const p = classifyForPresentation(err, 'load');
    expect(p.headline).toBe('Could not load save');
    expect(p.explanation).toContain('engineState');
    expect(p.exitCode).toBe(1);
  });

  it('debug mode shows SaveValidationError type and message', () => {
    const err = new SaveValidationError('This save was created with a newer version of claude-rpg (schema v99). This version supports up to schema v2. Please upgrade.');
    const p = classifyForPresentation(err, 'load');
    const output = rendered(p, true, err);
    expect(output).toContain('[debug]');
    expect(output).toContain('type: SaveValidationError');
    expect(output).toContain('newer version');
  });
});

// ─── Unknown Pack on Load ───────────────────────────────────

/**
 * F-c8dd84fe: bin.ts's runLoad() used to fall through to a bare
 * console.error('  Cannot restore engine — unknown pack.') when a save's
 * packId doesn't resolve via getPackById() — no packId in the message, and
 * bypassing classifyForPresentation/renderError entirely (so even --debug
 * surfaced no extra detail), unlike every other fatal branch in that
 * function. bin.ts now raises an Error carrying the packId and routes it
 * through presentError(err, 'load', debugMode) like the adjacent
 * engine-state-validation catch already does — these tests cover the new
 * classification branch that gives it a headline/explanation/next-action on
 * par with the isFutureVersion/isMissingVersion branches above, instead of
 * falling into the generic "Could not load save" bucket that would have
 * discarded the packId from the non-debug explanation line.
 */
describe('error-presenter: unknown pack on load', () => {
  it('gets a distinct headline and surfaces the failing pack id', () => {
    const err = new Error('Cannot restore engine — unknown pack "iron-colosseum".');
    const p = classifyForPresentation(err, 'load');
    expect(p.headline).toBe('Unknown character pack');
    expect(p.explanation).toContain('iron-colosseum');
    expect(p.exitCode).toBe(1);
  });

  it('debug mode shows the error type alongside the pack id', () => {
    const err = new Error('Cannot restore engine — unknown pack "iron-colosseum".');
    const p = classifyForPresentation(err, 'load');
    const output = rendered(p, true, err);
    expect(output).toContain('[debug]');
    expect(output).toContain('iron-colosseum');
  });

  it('does not shadow the unrelated generic load error path', () => {
    const err = new Error('ENOENT: file not found');
    const p = classifyForPresentation(err, 'load');
    expect(p.headline).toBe('Could not load save');
  });
});

// ─── Fatal vs Reprompt Visual Severity (F-643e4d55) ──────────

/**
 * F-643e4d55: renderError() used to render all NarrationError kinds plus
 * all load-error variants with an identical yellow('⚠ headline') treatment
 * regardless of presentation.exitCode -- but several are fatal (bin.ts
 * calls process.exit(exitCode ?? 1) or a hardcoded process.exit(1)
 * immediately after presentError() returns on every load/opening failure
 * path) with zero intervening visual cue. A player couldn't tell from the
 * rendered warning alone whether it meant "try again" (exitCode: null) or
 * "this process is about to terminate" (exitCode !== null). `red` was
 * imported but had zero call sites, confirming no severity-escalation path
 * existed. Fixed with both a distinct color (red instead of yellow) AND an
 * explicit "Exiting." text line, so the distinction survives NO_COLOR too
 * (never color-only signaling).
 */
describe('error-presenter: fatal vs reprompt visual severity (F-643e4d55)', () => {
  it('adds an explicit "Exiting." line for a fatal (exitCode !== null) presentation', () => {
    const err = new SaveValidationError('Save file is not valid JSON');
    const p = classifyForPresentation(err, 'load'); // exitCode: 1
    const output = renderError(p, false, err);
    expect(output).toContain('Exiting.');
  });

  it('does not add an "Exiting." line for a reprompt (exitCode: null) presentation', () => {
    const err = new NarrationError({ kind: 'timeout', message: 'timed out' });
    const p = classifyForPresentation(err, 'turn'); // exitCode: null
    const output = renderError(p, false, err);
    expect(output).not.toContain('Exiting.');
  });

  describe('with color enabled', () => {
    let originalIsTTY: boolean | undefined;

    afterEach(() => {
      (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
      delete process.env.NO_COLOR;
    });

    it('renders a fatal headline in red, distinct from a reprompt headline\'s yellow', async () => {
      originalIsTTY = process.stdout.isTTY;
      delete process.env.NO_COLOR;
      (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
      vi.resetModules();
      const mod = await import('./error-presenter.js');

      const fatal = mod.classifyForPresentation(
        new SaveValidationError('Save file is not valid JSON'),
        'load',
      ); // exitCode: 1
      const reprompt = mod.classifyForPresentation(
        new NarrationError({ kind: 'timeout', message: 'timed out' }),
        'turn',
      ); // exitCode: null

      const fatalOutput = mod.renderError(fatal, false);
      const repromptOutput = mod.renderError(reprompt, false);

      expect(fatalOutput).toContain('\x1b[31m'); // red
      expect(repromptOutput).not.toContain('\x1b[31m');
      expect(repromptOutput).toContain('\x1b[33m'); // yellow, unchanged
    });
  });
});
