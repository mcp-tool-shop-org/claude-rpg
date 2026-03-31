// spinner.ts — Animated thinking spinner for LLM calls.
// Renders braille spinner characters on stdout, clears when stopped.

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;

export interface Spinner {
  /** Start the spinner animation. Safe to call multiple times. */
  start(): void;
  /** Stop the spinner and clear its output. Safe to call when not spinning. */
  stop(): void;
  /** Whether the spinner is currently active. */
  readonly active: boolean;
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

  function render(): void {
    const frame = FRAMES[frameIndex % FRAMES.length];
    const text = label ? `  ${frame} ${label}` : `  ${frame}`;
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
      stream.write(label ? `  ... ${label}\n` : '  ...\n');
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

  return {
    start,
    stop,
    get active() {
      return isActive;
    },
  };
}
