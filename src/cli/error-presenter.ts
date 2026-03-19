// error-presenter.ts: Central CLI error rendering.
// All user-visible error output routes through this module.
// Consumes app-owned error types, never SDK internals.

import { NarrationError } from '../llm/claude-errors.js';
import { SaveValidationError } from '../session/session.js';

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
        nextAction: 'Check ANTHROPIC_API_KEY and restart.',
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

function presentLoadError(err: Error): ErrorPresentation {
  const isSaveValidation = err instanceof SaveValidationError;
  const isFutureVersion = isSaveValidation && err.message.includes('newer version');
  const isMissingVersion = isSaveValidation && err.message.includes('no recognizable version');

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

  // Opening narration failures are fatal — can't start game without narration
  if (context === 'opening' && presentation.exitCode === null) {
    presentation = { ...presentation, exitCode: 1 };
  }

  return presentation;
}

/**
 * Render an error presentation as CLI output.
 * Returns a string ready for console.error().
 */
export function renderError(presentation: ErrorPresentation, debug: boolean, err?: unknown): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  \u26A0 ${presentation.headline}`);
  lines.push(`  ${presentation.explanation}`);
  lines.push(`  ${presentation.preserved}`);
  lines.push(`  \u2192 ${presentation.nextAction}`);

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
