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
