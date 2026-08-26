// App-level error types for Claude/Anthropic SDK failures.
// These normalize SDK exceptions into game-meaningful categories
// so the rest of the codebase never imports @anthropic-ai/sdk error types.

export type NarrationErrorKind =
  | 'auth'
  | 'rate-limit'
  | 'timeout'
  | 'transport'
  | 'bad-request'
  | 'unexpected';

export class NarrationError extends Error {
  readonly kind: NarrationErrorKind;
  readonly requestId: string | undefined;
  readonly retryable: boolean;
  /**
   * F-6480985e: domain-wide fatal-error contract. `fatal` is true for kinds
   * that retrying can never fix (auth/bad-request). Every narrative-llm LLM
   * call site — narrateScene/narrateSceneLegacy (narrator.ts), generateDialogue
   * (dialogue-mind.ts), narrateFinale (finale-narrator.ts) — MUST rethrow a
   * fatal NarrationError rather than swallow it into in-fiction text (scene
   * narration, NPC dialogue, campaign epilogue), so a bad API key stays
   * distinguishable from authored prose.
   *
   * F-18928d14: that rethrow eventually reaches bin.ts's presentError(), but
   * presentError does NOT call userMessage() below — it renders the box via
   * error-presenter.ts's presentNarrationError(), an independently-authored
   * switch over the same NarrationErrorKind values with its own headline/
   * explanation/nextAction copy (a real, tracked duplication, not a bug this
   * comment can fix by itself; error-presenter.ts sits outside this domain).
   * userMessage() itself is called directly by every non-fatal fallback path
   * below (narrator.ts, dialogue-mind.ts, finale-narrator.ts — see
   * F-afb978de) to label *why* a fallback happened, alongside each site's
   * diagnostic console.warn — a narrower, distinct purpose from rendering
   * the fatal-error box.
   *
   * Non-fatal kinds (rate-limit, timeout, transport, unexpected) are safe to
   * swallow into each call site's own fallback (FALLBACK_NARRATION or its
   * repeated-outage sibling FALLBACK_NARRATION_REPEATED, the in-character
   * stall, or finale-narrator's labeled degraded-epilogue sentinel — see
   * F-681d3382 and F-0f76ecc2) since retrying may succeed and the failure
   * isn't diagnostic-worthy enough to interrupt play.
   *
   * Future call sites must follow this contract rather than inventing a third
   * variant.
   */
  readonly fatal: boolean;

  constructor(opts: {
    kind: NarrationErrorKind;
    message: string;
    requestId?: string;
    cause?: unknown;
  }) {
    super(opts.message, { cause: opts.cause });
    this.name = 'NarrationError';
    this.kind = opts.kind;
    this.requestId = opts.requestId;
    this.retryable = opts.kind === 'rate-limit' || opts.kind === 'timeout' || opts.kind === 'transport';
    this.fatal = opts.kind === 'auth' || opts.kind === 'bad-request';
  }
}

export function userMessage(err: NarrationError): string {
  switch (err.kind) {
    case 'auth':
      return 'API key invalid or missing. Set ANTHROPIC_API_KEY and restart.';
    case 'rate-limit':
      return 'The narrator needs a moment to catch their breath. Try again shortly, or save your game.';
    case 'timeout':
      return 'The narrator lost their thread. Your progress is safe — try again.';
    case 'transport':
      return 'Connection to the narrator was interrupted. Your progress is safe — try again.';
    case 'bad-request':
      return 'Something went wrong building the narrator prompt. This is a bug — please report it.';
    case 'unexpected':
      return 'The narrator encountered an unexpected problem. Your progress is safe.';
  }
}
