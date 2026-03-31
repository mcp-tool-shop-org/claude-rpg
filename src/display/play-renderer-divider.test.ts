import { describe, it, expect, vi, afterEach } from 'vitest';
import { getTerminalWidth, renderPlayScreen, renderWelcome } from './play-renderer.js';

// ─── PFE-005: Dynamic divider width ───────────────────────

describe('play-renderer: dynamic divider width', () => {
  afterEach(() => {
    // Restore original columns (may be undefined in test env)
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('getTerminalWidth returns stdout.columns when available', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });
    expect(getTerminalWidth()).toBe(80);
  });

  it('getTerminalWidth falls back to 60 when columns is undefined', () => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
    expect(getTerminalWidth()).toBe(60);
  });

  it('getTerminalWidth clamps narrow terminals to 40', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 20, writable: true });
    expect(getTerminalWidth()).toBe(40);
  });

  it('getTerminalWidth clamps wide terminals to 120', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 200, writable: true });
    expect(getTerminalWidth()).toBe(120);
  });

  it('renderPlayScreen divider matches terminal width', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });
    // Minimal world stub
    const world = {
      playerId: 'p1',
      locationId: 'z1',
      entities: { p1: { name: 'Hero', resources: { hp: 10 }, statuses: [] } },
      zones: { z1: { name: 'Town', neighbors: [] } },
      factions: {},
    } as any;

    const output = renderPlayScreen({
      narration: 'Test.',
      world,
      availableActions: [],
    });

    // The divider should be 80 chars of '─'
    expect(output).toContain('─'.repeat(80));
    expect(output).not.toContain('─'.repeat(81));
  });

  it('renderWelcome divider matches terminal width', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 50, writable: true });
    const output = renderWelcome('Test Game');
    expect(output).toContain('─'.repeat(50));
    expect(output).not.toContain('─'.repeat(51));
  });
});
