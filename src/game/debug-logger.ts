// Lightweight debug logger for the core game loop.
// Gated behind --debug flag or CLAUDE_RPG_DEBUG env var.
// Logs key state transitions: turn start/end, XP, reputation, subsystem errors.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEntry = {
  level: LogLevel;
  subsystem: string;
  message: string;
  tick?: number;
  data?: Record<string, unknown>;
};

export interface DebugLogger {
  /** Whether debug logging is active. */
  readonly enabled: boolean;
  /** Log a debug-level message. */
  debug(subsystem: string, message: string, data?: Record<string, unknown>): void;
  /** Log an info-level message. */
  info(subsystem: string, message: string, data?: Record<string, unknown>): void;
  /** Log a warning. */
  warn(subsystem: string, message: string, data?: Record<string, unknown>): void;
  /** Log an error with context. */
  error(subsystem: string, message: string, data?: Record<string, unknown>): void;
  /** Set the current engine tick for log context. */
  setTick(tick: number): void;
  /** Get all logged entries (for testing / inspection). */
  getEntries(): readonly LogEntry[];
}

class GameDebugLogger implements DebugLogger {
  readonly enabled: boolean;
  private tick = 0;
  private entries: LogEntry[] = [];

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  setTick(tick: number): void {
    this.tick = tick;
  }

  debug(subsystem: string, message: string, data?: Record<string, unknown>): void {
    this.log('debug', subsystem, message, data);
  }

  info(subsystem: string, message: string, data?: Record<string, unknown>): void {
    this.log('info', subsystem, message, data);
  }

  warn(subsystem: string, message: string, data?: Record<string, unknown>): void {
    this.log('warn', subsystem, message, data);
  }

  error(subsystem: string, message: string, data?: Record<string, unknown>): void {
    this.log('error', subsystem, message, data);
  }

  getEntries(): readonly LogEntry[] {
    return this.entries;
  }

  private log(level: LogLevel, subsystem: string, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = { level, subsystem, message, tick: this.tick, data };
    this.entries.push(entry);
    if (this.enabled) {
      const prefix = `[${level.toUpperCase()}][tick:${this.tick}][${subsystem}]`;
      const suffix = data ? ' ' + JSON.stringify(data) : '';
      process.stderr.write(`${prefix} ${message}${suffix}\n`);
    }
  }
}

class NoopLogger implements DebugLogger {
  readonly enabled = false;
  setTick(): void { /* noop */ }
  debug(): void { /* noop */ }
  info(): void { /* noop */ }
  warn(): void { /* noop */ }
  error(): void { /* noop */ }
  getEntries(): readonly LogEntry[] { return []; }
}

/** Create a debug logger. Enabled when --debug is in argv or CLAUDE_RPG_DEBUG env var is set. */
export function createDebugLogger(forceEnabled?: boolean): DebugLogger {
  const enabled = forceEnabled ?? (
    process.argv.includes('--debug') ||
    process.env.CLAUDE_RPG_DEBUG === '1' ||
    process.env.CLAUDE_RPG_DEBUG === 'true'
  );
  return enabled ? new GameDebugLogger(true) : new NoopLogger();
}

/** Create a logger that captures entries without writing to stderr (for tests). */
export function createTestLogger(): DebugLogger & { getEntries(): readonly LogEntry[] } {
  return new GameDebugLogger(false);
}
