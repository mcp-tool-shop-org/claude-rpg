import { describe, it, expect } from 'vitest';
import { createDebugLogger, createTestLogger } from './debug-logger.js';

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
});
