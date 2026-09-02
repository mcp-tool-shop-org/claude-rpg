import { describe, it, expect } from 'vitest';
import { computeUnknownCommandInfo } from './unknown-command.js';

describe('computeUnknownCommandInfo', () => {
  it('finds a near-miss play command for a one-letter typo', () => {
    const info = computeUnknownCommandInfo('/staus', 'play');
    expect(info.nearest).toBe('/status');
    expect(info.family).toBe('play');
  });

  it('classifies a director-only command by family, so the reply can say "type /director"', () => {
    const info = computeUnknownCommandInfo('/pressure', 'play'); // singular typo for director's /pressures
    expect(info.nearest).toBe('/pressures');
    expect(info.family).toBe('director');
  });

  it('reports no match for something unrelated to any known command', () => {
    const info = computeUnknownCommandInfo('/xyzzyplugh', 'play');
    expect(info.nearest).toBeUndefined();
    expect(info.family).toBeNull();
  });

  it('always returns validNow as 2-3 commands with a leading slash, for the current mode', () => {
    const play = computeUnknownCommandInfo('/nonsense', 'play');
    expect(play.validNow.length).toBeGreaterThanOrEqual(2);
    expect(play.validNow.length).toBeLessThanOrEqual(3);
    expect(play.validNow.every((c) => c.startsWith('/'))).toBe(true);

    const director = computeUnknownCommandInfo('/nonsense', 'director');
    expect(director.validNow.length).toBeGreaterThanOrEqual(2);
    expect(director.validNow.length).toBeLessThanOrEqual(3);
  });

  it('preserves the original input verbatim', () => {
    const info = computeUnknownCommandInfo('/Staus foo', 'play');
    expect(info.input).toBe('/Staus foo');
  });
});
