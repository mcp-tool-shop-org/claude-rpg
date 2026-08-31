import { describe, it, expect, afterEach, vi } from 'vitest';
import { createDebugLogger, createTestLogger, isDebugEnabled } from './debug-logger.js';

describe('debug-logger (PB-004)', () => {
  it('createTestLogger captures entries without stderr output', () => {
    const logger = createTestLogger();
    logger.setTick(5);
    logger.info('turn', 'turn-start', { input: 'look' });
    logger.debug('profile', 'xp-granted', { xp: 10 });
    logger.warn('subsystem', 'minor-issue');
    logger.error('subsystem', 'something broke', { error: 'oops' });

    const entries = logger.getEntries();
    expect(entries).toHaveLength(4);
    expect(entries[0]).toEqual({
      level: 'info',
      subsystem: 'turn',
      message: 'turn-start',
      tick: 5,
      data: { input: 'look' },
    });
    expect(entries[1].level).toBe('debug');
    expect(entries[2].level).toBe('warn');
    expect(entries[3].level).toBe('error');
    expect(entries[3].data).toEqual({ error: 'oops' });
  });

  it('noop logger (disabled) returns empty entries', () => {
    const logger = createDebugLogger(false);
    expect(logger.enabled).toBe(false);
    logger.info('turn', 'test');
    logger.debug('turn', 'test');
    logger.warn('turn', 'test');
    logger.error('turn', 'test');
    expect(logger.getEntries()).toHaveLength(0);
  });

  it('enabled logger marks enabled flag', () => {
    const logger = createDebugLogger(true);
    expect(logger.enabled).toBe(true);
  });

  it('tick context propagates to entries', () => {
    const logger = createTestLogger();
    logger.setTick(10);
    logger.info('a', 'msg1');
    logger.setTick(11);
    logger.info('b', 'msg2');

    const entries = logger.getEntries();
    expect(entries[0].tick).toBe(10);
    expect(entries[1].tick).toBe(11);
  });

  it('entries without data have undefined data field', () => {
    const logger = createTestLogger();
    logger.info('x', 'no data');
    expect(logger.getEntries()[0].data).toBeUndefined();
  });

  describe('entries ring buffer (F-654b626a)', () => {
    it('caps entries at MAX_LOG_ENTRIES (1000), evicting the oldest first', () => {
      const logger = createTestLogger();
      for (let i = 0; i < 1001; i++) {
        logger.info('turn', `event-${i}`);
      }
      const entries = logger.getEntries();
      expect(entries).toHaveLength(1000);
      // event-0 was the oldest and should have been evicted first.
      expect(entries[0].message).toBe('event-1');
      expect(entries[entries.length - 1].message).toBe('event-1000');
    });

    it('warns once (debug-gated) the first time the ring buffer fills, not on every subsequent drop', () => {
      const logger = createDebugLogger(true);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      for (let i = 0; i < 1005; i++) {
        logger.info('turn', `event-${i}`);
      }

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('MAX_LOG_ENTRIES');
      expect(logger.getEntries()).toHaveLength(1000);

      warnSpy.mockRestore();
      stderrSpy.mockRestore();
    });

    it('does not warn when the logger is disabled (createTestLogger)', () => {
      const logger = createTestLogger();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      for (let i = 0; i < 1005; i++) {
        logger.info('turn', `event-${i}`);
      }

      expect(warnSpy).not.toHaveBeenCalled();
      expect(logger.getEntries()).toHaveLength(1000);
      warnSpy.mockRestore();
    });
  });

  describe('isDebugEnabled (F-34078c07)', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('is false by default (no --debug argv, no CLAUDE_RPG_DEBUG env var)', () => {
      expect(isDebugEnabled()).toBe(false);
    });

    it('is true when CLAUDE_RPG_DEBUG=1', () => {
      vi.stubEnv('CLAUDE_RPG_DEBUG', '1');
      expect(isDebugEnabled()).toBe(true);
    });

    it('is true when CLAUDE_RPG_DEBUG=true', () => {
      vi.stubEnv('CLAUDE_RPG_DEBUG', 'true');
      expect(isDebugEnabled()).toBe(true);
    });

    it('is false for an unrecognized CLAUDE_RPG_DEBUG value', () => {
      vi.stubEnv('CLAUDE_RPG_DEBUG', 'yes');
      expect(isDebugEnabled()).toBe(false);
    });
  });
});
