import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test with and without NO_COLOR, which is read at module load.
// Use dynamic import with cache-busting.

describe('colors', () => {
  const ESC = '\x1b[';

  // Default: NO_COLOR is unset AND stdout is a TTY (colors enabled).
  // F-622bfe0a: enabled now also gates on process.stdout.isTTY, so these
  // tests must stub a TTY — vitest's own stdout is not one.
  describe('with color enabled', () => {
    let colors: typeof import('./colors.js');
    let originalIsTTY: boolean | undefined;

    beforeEach(async () => {
      // Ensure NO_COLOR is unset, simulate a TTY, and re-import fresh.
      delete process.env.NO_COLOR;
      originalIsTTY = process.stdout.isTTY;
      (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
      vi.resetModules();
      const mod = await import('./colors.js');
      colors = mod;
    });

    afterEach(() => {
      (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
    });

    it('bold wraps text with ANSI bold code', () => {
      const result = colors.bold('test');
      expect(result).toContain(`${ESC}1m`);
      expect(result).toContain('test');
      expect(result).toContain(`${ESC}0m`);
    });

    it('dim wraps text with ANSI dim code', () => {
      const result = colors.dim('faded');
      expect(result).toContain(`${ESC}2m`);
      expect(result).toContain('faded');
    });

    it('red wraps text with ANSI red code', () => {
      const result = colors.red('danger');
      expect(result).toContain(`${ESC}31m`);
      expect(result).toContain('danger');
    });

    it('green wraps text with ANSI green code', () => {
      const result = colors.green('success');
      expect(result).toContain(`${ESC}32m`);
    });

    it('yellow wraps text with ANSI yellow code', () => {
      const result = colors.yellow('warning');
      expect(result).toContain(`${ESC}33m`);
    });

    it('cyan wraps text with ANSI cyan code', () => {
      const result = colors.cyan('info');
      expect(result).toContain(`${ESC}36m`);
    });

    it('speaker uses bold', () => {
      const result = colors.speaker('NPC Name');
      expect(result).toContain(`${ESC}1m`);
      expect(result).toContain('NPC Name');
    });

    it('secondary uses dim', () => {
      const result = colors.secondary('meta text');
      expect(result).toContain(`${ESC}2m`);
    });

    it('danger uses bold yellow', () => {
      const result = colors.danger('combat!');
      expect(result).toContain('combat!');
      // Should contain bold and yellow codes
      expect(result).toContain(`${ESC}1m`);
      expect(result).toContain(`${ESC}33m`);
    });

    it('critical uses bold red', () => {
      const result = colors.critical('death');
      expect(result).toContain(`${ESC}1m`);
      expect(result).toContain(`${ESC}31m`);
    });

    it('positive uses green', () => {
      const result = colors.positive('level up!');
      expect(result).toContain(`${ESC}32m`);
    });

    it('hint uses cyan', () => {
      const result = colors.hint('try this');
      expect(result).toContain(`${ESC}36m`);
    });

    it('isColorEnabled returns true when NO_COLOR is unset', () => {
      expect(colors.isColorEnabled()).toBe(true);
    });
  });

  describe('with a non-TTY stdout and NO_COLOR unset', () => {
    let originalIsTTY: boolean | undefined;

    beforeEach(() => {
      originalIsTTY = process.stdout.isTTY;
    });

    afterEach(() => {
      (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
    });

    it('disables color when stdout is not a TTY, even without NO_COLOR (F-622bfe0a)', async () => {
      delete process.env.NO_COLOR;
      (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = false;
      vi.resetModules();
      const colors = await import('./colors.js');
      const result = colors.bold('test');
      expect(result).not.toContain('\x1b[');
      expect(result).toBe('test');
      expect(colors.isColorEnabled()).toBe(false);
    });
  });

  describe('with NO_COLOR set', () => {
    let originalNoColor: string | undefined;
    let originalIsTTY: boolean | undefined;

    beforeEach(() => {
      originalNoColor = process.env.NO_COLOR;
      originalIsTTY = process.stdout.isTTY;
    });

    afterEach(() => {
      if (originalNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = originalNoColor;
      }
      (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
    });

    it('bold returns plain text when NO_COLOR is set, even on a TTY', async () => {
      // Simulate a real terminal so this test isolates the NO_COLOR gate
      // specifically, rather than piggybacking on the non-TTY default.
      (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
      process.env.NO_COLOR = '1';
      vi.resetModules();
      const colors = await import('./colors.js');
      const result = colors.bold('test');
      expect(result).not.toContain('\x1b[');
      expect(result).toBe('test');
      expect(colors.isColorEnabled()).toBe(false);
    });
  });
});
