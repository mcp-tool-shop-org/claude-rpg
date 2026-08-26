// spinner.ts — Animated thinking spinner for LLM calls.
// Renders braille spinner characters on stdout, clears when stopped.

import type { NarrationErrorKind } from '../llm/claude-errors.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;

export interface Spinner {
  /** Start the spinner animation. Safe to call multiple times. */
  start(): void;
  /** Stop the spinner and clear its output. Safe to call when not spinning. */
  stop(): void;
  /** Whether the spinner is currently active. */
  readonly active: boolean;
  /**
   * F-d890d23d: update the label without restarting the animation --
   * withRetry (llm/claude-adapter.ts) fires onRetry once per retry, but
   * before this a player watched an unchanging "thinking" spinner for up to
   * ~93s with zero indication a retry was even happening. Safe to call
   * before start() (updates the remembered label with no visible side
   * effect, taking effect on the next start()); when active on a TTY,
   * renders the new label immediately rather than waiting up to
   * INTERVAL_MS for the next scheduled frame.
   */
  setLabel(next: string): void;
}

/**
 * Create a spinner instance.
 * @param label Optional label shown next to spinner (default: empty)
 * @param stream Writable stream (default: process.stdout)
 */
export function createSpinner(label = '', stream: NodeJS.WriteStream = process.stdout): Spinner {
  let timer: ReturnType<typeof setInterval> | null = null;
  let frameIndex = 0;
  let isActive = false;
  let currentLabel = label;

  function render(): void {
    const frame = FRAMES[frameIndex % FRAMES.length];
    const text = currentLabel ? `  ${frame} ${currentLabel}` : `  ${frame}`;
    // Move to column 0, clear line, write frame
    stream.write(`\r\x1b[K${text}`);
    frameIndex++;
  }

  function start(): void {
    if (isActive) return;
    isActive = true;
    frameIndex = 0;
    // Only animate if stream is a TTY; otherwise write static indicator
    if (stream.isTTY) {
      render();
      timer = setInterval(render, INTERVAL_MS);
    } else {
      stream.write(currentLabel ? `  ... ${currentLabel}\n` : '  ...\n');
    }
  }

  function stop(): void {
    if (!isActive) return;
    isActive = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    // Clear the spinner line if TTY
    if (stream.isTTY) {
      stream.write('\r\x1b[K');
    }
  }

  function setLabel(next: string): void {
    currentLabel = next;
    // render() already re-reads currentLabel each frame -- only need to
    // force an out-of-cycle render so the update is visible immediately.
    // Non-TTY streams have no live line to update (start() already wrote
    // its one static line), and a not-yet-started spinner has nothing on
    // screen to update either -- both are safe no-ops here.
    if (isActive && stream.isTTY) {
      render();
    }
  }

  return {
    start,
    stop,
    setLabel,
    get active() {
      return isActive;
    },
  };
}

/**
 * F-d890d23d: maps withRetry's onRetry info (llm/claude-adapter.ts) to the
 * spinner label text. Covers exactly the 3 structurally-reachable retryable
 * kinds (claude-errors.ts: NarrationError.retryable is true only for
 * 'rate-limit'|'timeout'|'transport' -- auth/bad-request are fatal and
 * never retried, so onRetry can never fire with any other kind). Wording
 * mirrors error-presenter.ts's headline text for the same 3 kinds
 * (lowercased, mid-sentence) so a player who later sees a final-failure box
 * recognizes the same words the spinner already showed.
 *
 * DRAFT copy, pending coordinator/director review.
 */
const RETRY_KIND_TEXT: Partial<Record<NarrationErrorKind, string>> = {
  'rate-limit': 'rate limit reached',
  timeout: 'connection timed out',
  transport: 'connection interrupted',
};

export function formatRetryLabel(
  base: string,
  info: { attempt: number; maxAttempts: number; kind: NarrationErrorKind; delayMs: number },
): string {
  // Defensive fallback for a kind outside the 3 reachable ones -- never hit
  // in production (see doc comment above), but keeps this pure function
  // total rather than emitting the literal word "undefined" if that ever
  // changes.
  const kindText = RETRY_KIND_TEXT[info.kind] ?? info.kind.replace(/[_-]+/g, ' ');
  return `still ${base} (retry ${info.attempt}/${info.maxAttempts - 1} -- ${kindText})`;
}
