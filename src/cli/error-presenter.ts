// error-presenter.ts: Central CLI error rendering.
// All user-visible error output routes through this module.
// Consumes app-owned error types, never SDK internals.
// v1.1: semantic terminal coloring

import { NarrationError } from '../llm/claude-errors.js';
import { SaveLoadError } from '@ai-rpg-engine/core';
import { SaveValidationError } from '../session/session.js';
import { yellow, red, dim, cyan, isColorEnabled } from './colors.js';

export type ErrorPresentation = {
  headline: string;
  explanation: string;
  preserved: string;
  nextAction: string;
  exitCode: number | null; // null = reprompt, number = exit with code
};

// ─── Error Classification ───────────────────────────────────

function presentNarrationError(err: NarrationError): ErrorPresentation {
  switch (err.kind) {
    case 'auth':
      return {
        headline: 'API key error',
        explanation: 'Your API key is invalid, expired, or missing.',
        preserved: 'Your session was not modified.',
        // F-9eefaf97: this was the only one of the five NarrationError
        // kinds whose nextAction didn't mention saving first -- 'rate-limit',
        // 'timeout', 'transport', and 'unexpected' all end with a "...or
        // type \"save\"" clause. An auth failure (invalid/expired/revoked
        // key) can happen mid-turn just as easily as at startup -- this
        // case's own `preserved` text implies a live session, not just
        // pre-game -- and 'restart' is advice a player might follow
        // literally, exiting the live process without being told "save"
        // (which needs no API call) is available first.
        nextAction: 'Check ANTHROPIC_API_KEY and restart, or type "save" to keep your progress.',
        exitCode: null,
      };
    case 'rate-limit':
      return {
        headline: 'Rate limit reached',
        explanation: 'Too many requests — the API needs a moment.',
        preserved: 'Your session and progress are intact.',
        nextAction: 'Wait a moment and try again, or type "save".',
        exitCode: null,
      };
    case 'timeout':
      return {
        headline: 'Connection timed out',
        explanation: 'The narrator took too long to respond.',
        preserved: 'Your session and progress are intact.',
        nextAction: 'Try your action again, or type "save" to keep your progress.',
        exitCode: null,
      };
    case 'transport':
      return {
        headline: 'Connection interrupted',
        explanation: 'Network error reaching the API.',
        preserved: 'Your session and progress are intact.',
        nextAction: 'Check your connection and try again, or type "save".',
        exitCode: null,
      };
    case 'bad-request':
      return {
        headline: 'Internal error',
        explanation: 'Something went wrong building the narrator request.',
        preserved: 'Your session was not modified.',
        nextAction: 'This is a bug — please report it.',
        exitCode: null,
      };
    case 'unexpected':
      return {
        headline: 'Unexpected error',
        explanation: 'An unclassified problem occurred.',
        preserved: 'Your session and progress are intact.',
        nextAction: 'Try again, or type "save" to keep your progress.',
        exitCode: null,
      };
  }
}

function presentSaveError(_err: Error): ErrorPresentation {
  return {
    headline: 'Save failed',
    explanation: 'Could not write the save file.',
    preserved: 'Your in-memory session is still active.',
    nextAction: 'Check disk space and permissions, then try "save" again.',
    exitCode: null,
  };
}

/** Headline for a structured engine SaveLoadError, keyed off its `.code`. */
function saveLoadErrorHeadline(code: SaveLoadError['code']): string {
  switch (code) {
    case 'SAVE_VERSION_UNSUPPORTED':
      return 'Incompatible save version';
    case 'SAVE_MODULE_MIGRATION_FAILED':
      return 'Save migration failed';
    case 'SAVE_MALFORMED':
      return 'Save file corrupted';
  }
}

function presentLoadError(err: Error): ErrorPresentation {
  // F-0b17db86: @ai-rpg-engine/core's SaveLoadError (thrown by
  // Engine.deserialize / WorldStore.deserialize) is a separate, structurally
  // typed error from claude-rpg's own SaveValidationError below — checked
  // first via instanceof + its `.code`/`.hint` fields (never message
  // string-matching), so the engine team's purpose-written diagnostic
  // survives instead of falling into the generic bucket at the end of this
  // function once a caller adopts Engine.deserialize().
  if (err instanceof SaveLoadError) {
    return {
      headline: saveLoadErrorHeadline(err.code),
      explanation: err.message,
      preserved: 'No session was started. The save file was not modified.',
      nextAction: err.hint,
      exitCode: 1,
    };
  }

  const isSaveValidation = err instanceof SaveValidationError;
  const isFutureVersion = isSaveValidation && err.message.includes('newer version');
  const isMissingVersion = isSaveValidation && err.message.includes('no recognizable version');
  // F-c8dd84fe: bin.ts's runLoad() raises this when a save's packId doesn't
  // resolve via getPackById() (e.g. a renamed/retired starter world). Gets
  // its own branch so the failing pack id survives into the non-debug
  // explanation line, instead of falling into the generic bucket below.
  const isUnknownPack = err.message.includes('unknown pack');

  // F-e58b49ed: bin.ts's runLoad() raises this when validateEngineState()
  // (cli/engine-state-validator.ts) rejects a save's serialized engine
  // state -- previously rendered as two raw, uncolored console.error() lines
  // plus a bare process.exit(1), the only fatal branch in that function that
  // bypassed this classify/render pipeline entirely (no headline/
  // explanation/preserved/nextAction shape, no red-vs-yellow severity
  // signal, no [debug] block). Keyed on message prefix (same
  // message-substring convention as isUnknownPack above, since bin.ts
  // constructs a plain Error here rather than a dedicated error class) so
  // the validator's own specific diagnostic ('not valid JSON' / 'missing
  // world.state' / 'missing world.state.meta') survives into the rendered
  // explanation instead of a bespoke two-line print.
  const isEngineStateInvalid = err.message.startsWith('Save file has invalid engine state:');

  if (isEngineStateInvalid) {
    return {
      headline: 'Invalid save data',
      explanation: err.message,
      preserved: 'No session was started. The save file was not modified.',
      nextAction: 'Your save may be corrupted. Check for a .bak backup, or start a new game.',
      exitCode: 1,
    };
  }

  if (isFutureVersion) {
    return {
      headline: 'Save file too new',
      explanation: err.message,
      preserved: 'No session was started. The save file was not modified.',
      nextAction: 'Upgrade claude-rpg to load this save.',
      exitCode: 1,
    };
  }

  if (isMissingVersion) {
    return {
      headline: 'Unrecognized save format',
      explanation: 'The file has no version metadata — it may not be a claude-rpg save.',
      preserved: 'No session was started.',
      nextAction: 'Check the file path, or start a new game.',
      exitCode: 1,
    };
  }

  if (isUnknownPack) {
    return {
      headline: 'Unknown character pack',
      explanation: err.message,
      preserved: 'No session was started. The save file was not modified.',
      nextAction: 'The pack this save depends on is not installed in this build. Check for an updated version of claude-rpg, or start a new game.',
      exitCode: 1,
    };
  }

  return {
    headline: 'Could not load save',
    explanation: isSaveValidation
      ? `The save file is invalid: ${err.message}`
      : 'The save file is missing, corrupted, or incompatible.',
    preserved: 'No session was started.',
    nextAction: 'Check the file, or start a new game. A .bak file may exist.',
    exitCode: 1,
  };
}

function presentUnknownError(err: unknown): ErrorPresentation {
  return {
    headline: 'Unexpected error',
    explanation: err instanceof Error ? err.message : String(err),
    preserved: 'Your session may still be active.',
    nextAction: 'Try again, or type "save" to keep your progress.',
    exitCode: null,
  };
}

// ─── Public API ─────────────────────────────────────────────

export type ErrorContext = 'turn' | 'opening' | 'save' | 'load' | 'startup';

/**
 * Classify an error and produce a structured presentation.
 * Context tells the presenter where the error occurred, which
 * affects exit semantics (e.g., opening failures are fatal).
 */
export function classifyForPresentation(err: unknown, context: ErrorContext): ErrorPresentation {
  let presentation: ErrorPresentation;

  if (err instanceof NarrationError) {
    presentation = presentNarrationError(err);
  } else if (context === 'save') {
    presentation = presentSaveError(err instanceof Error ? err : new Error(String(err)));
  } else if (context === 'load') {
    presentation = presentLoadError(err instanceof Error ? err : new Error(String(err)));
  } else {
    presentation = presentUnknownError(err);
  }

  // Opening narration failures are fatal — can't start game without narration.
  // F-cdbe6d09: 'startup' joins this branch too — every call site that
  // passes 'startup' (bin.ts's process-lifetime unhandledRejection handler)
  // unconditionally calls process.exit() right after presentError() returns,
  // so presentUnknownError's default exitCode: null (a "try again" reprompt)
  // rendered a non-fatal yellow warning encouraging the player to keep
  // playing or save, immediately followed by the process force-exiting —
  // contradicting the message it just printed. Forcing exitCode: 1 here
  // makes renderError's fatal styling (red + "Exiting.") match what
  // actually happens next, the same way it already does for 'opening'.
  if ((context === 'opening' || context === 'startup') && presentation.exitCode === null) {
    presentation = { ...presentation, exitCode: 1 };
  }

  return presentation;
}

/**
 * Render an error presentation as CLI output.
 * Returns a string ready for console.error().
 *
 * F-643e4d55: every presentation used to render with an identical
 * yellow('\u26A0 headline') treatment regardless of presentation.exitCode --
 * but several are fatal (bin.ts calls process.exit() immediately after
 * presentError() returns on every load/opening failure path) with zero
 * intervening visual cue. A player couldn't tell from the warning alone
 * whether it meant "try again" or "this process is about to terminate."
 * Fatal presentations (exitCode !== null) now get both a distinct color
 * (red instead of yellow) AND an explicit "Exiting." line, so the
 * distinction survives NO_COLOR too instead of relying on color alone.
 */
export function renderError(presentation: ErrorPresentation, debug: boolean, err?: unknown): string {
  const fatal = presentation.exitCode !== null;
  const headlineColor = fatal ? red : yellow;
  // F-937c9399: \u26A0/\u2192 used to be baked into the template string
  // unconditionally, unlike headlineColor/dim/cyan just below (which already
  // no-op under NO_COLOR or a non-TTY stream) -- so the glyphs printed even
  // when color was off, violating the POSIX no-color contract this wave's
  // own addendum names scripts/check-critical-coverage.mjs (F-1a4feed0) as
  // "the model" fix for. Both glyphs now gate on the same isColorEnabled()
  // check, falling back to plain ASCII.
  const warnGlyph = isColorEnabled() ? '\u26A0' : '!';
  const arrowGlyph = isColorEnabled() ? '\u2192' : '->';
  const lines: string[] = [];
  lines.push('');
  lines.push(headlineColor(`  ${warnGlyph} ${presentation.headline}`));
  lines.push(`  ${presentation.explanation}`);
  lines.push(dim(`  ${presentation.preserved}`));
  lines.push(cyan(`  ${arrowGlyph} ${presentation.nextAction}`));
  if (fatal) {
    lines.push(red('  Exiting.'));
  }

  if (debug && err) {
    lines.push('');
    lines.push('  [debug]');
    if (err instanceof NarrationError) {
      lines.push(`    kind: ${err.kind}`);
      if (err.requestId) lines.push(`    request_id: ${err.requestId}`);
      lines.push(`    retryable: ${err.retryable}`);
      if (err.cause) lines.push(`    cause: ${summarizeCause(err.cause)}`);
    } else if (err instanceof Error) {
      lines.push(`    type: ${err.name}`);
      if (err.message) lines.push(`    message: ${err.message}`);
      if (err.cause) lines.push(`    cause: ${summarizeCause(err.cause)}`);
    } else {
      lines.push(`    raw: ${String(err)}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * One-stop: classify, render, and write to stderr.
 * Returns the exit code (null = reprompt, number = exit).
 */
export function presentError(err: unknown, context: ErrorContext, debug: boolean): number | null {
  const presentation = classifyForPresentation(err, context);
  process.stderr.write(renderError(presentation, debug, err));
  return presentation.exitCode;
}

// ─── Helpers ────────────────────────────────────────────────

function summarizeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message || cause.name;
  }
  const str = String(cause);
  return str.length > 120 ? str.slice(0, 117) + '...' : str;
}
