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

/**
 * F-654b626a: ring-buffer cap for GameDebugLogger.entries. Every debug()/
 * info()/warn()/error() call pushed into `entries` unconditionally regardless
 * of `enabled` — only the stderr write below was ever gated — and nothing
 * evicted. A developer running an extended --debug/CLAUDE_RPG_DEBUG soak
 * session (the exact scenario --debug exists for, and the one most likely to
 * run long precisely because something intermittent is being chased)
 * accumulated an ever-growing in-memory array — each entry's optional `data`
 * payload can carry a full error stack (e.g. game.ts's `errStack`) — with no
 * bound for that session's entire lifetime. Mirrors this domain's
 * established oldest-evicted-first discipline (TurnHistory's
 * MAX_COMPACTED_CHUNKS, GameSession's capOldestFirst / MAX_JOURNAL_RECORDS /
 * MAX_RESOLVED_FALLOUT_ENTRIES / MAX_ENDGAME_TRIGGERS /
 * MAX_SUBSYSTEM_FAILURE_RECORDS).
 */
const MAX_LOG_ENTRIES = 1000;

class GameDebugLogger implements DebugLogger {
  readonly enabled: boolean;
  private tick = 0;
  private entries: LogEntry[] = [];
  /**
   * F-654b626a: fires the ring-buffer-full notice at most once per logger
   * instance — a soak session that stays over the cap for its remaining
   * lifetime shouldn't get one warning per turn.
   */
  private warnedAtCap = false;

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
    // F-654b626a: oldest-evicted-first once the ring buffer fills, mirroring
    // GameSession.capOldestFirst's while-loop discipline — a single push can
    // only ever exceed the cap by one, but the loop shape matches the
    // established sibling pattern exactly.
    if (this.entries.length > MAX_LOG_ENTRIES) {
      while (this.entries.length > MAX_LOG_ENTRIES) {
        this.entries.shift();
      }
      if (this.enabled && !this.warnedAtCap) {
        this.warnedAtCap = true;
        console.warn(
          `[debug-logger] entries ring buffer hit MAX_LOG_ENTRIES=${MAX_LOG_ENTRIES} — oldest entries are now being dropped; getEntries() reflects only the most recent ${MAX_LOG_ENTRIES}.`,
        );
      }
    }
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

/**
 * F-34078c07: shared predicate for "should diagnostic-level output be
 * visible to this run" — the same --debug/CLAUDE_RPG_DEBUG check
 * createDebugLogger() uses to decide whether GameDebugLogger writes to
 * stderr. Exported so call sites that only need a yes/no gate around an
 * existing side effect (e.g. session.ts's/migrate.ts's load-time
 * console.warn diagnostics, which run outside any DebugLogger instance)
 * don't have to duplicate the env/argv check or construct a full
 * DebugLogger just to ask the same question createDebugLogger() already
 * answers.
 */
export function isDebugEnabled(): boolean {
  return (
    process.argv.includes('--debug') ||
    process.env.CLAUDE_RPG_DEBUG === '1' ||
    process.env.CLAUDE_RPG_DEBUG === 'true'
  );
}

/** Create a debug logger. Enabled when --debug is in argv or CLAUDE_RPG_DEBUG env var is set. */
export function createDebugLogger(forceEnabled?: boolean): DebugLogger {
  const enabled = forceEnabled ?? isDebugEnabled();
  return enabled ? new GameDebugLogger(true) : new NoopLogger();
}

/** Create a logger that captures entries without writing to stderr (for tests). */
export function createTestLogger(): DebugLogger & { getEntries(): readonly LogEntry[] } {
  return new GameDebugLogger(false);
}
