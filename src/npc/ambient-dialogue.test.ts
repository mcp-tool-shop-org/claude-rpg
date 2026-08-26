import { describe, it, expect } from 'vitest';
import { generateAmbientLine, generateZoneAmbience, type AmbientNpcInfo } from './ambient-dialogue.js';

function makeNpc(overrides?: Partial<AmbientNpcInfo>): AmbientNpcInfo {
  return {
    name: 'Guard Captain',
    personality: 'stern',
    beliefs: {},
    tags: ['guard'],
    ...overrides,
  };
}

describe('generateAmbientLine (FT-BR-007)', () => {
  it('should return a string containing the NPC name', () => {
    const line = generateAmbientLine(makeNpc(), 0);
    expect(line).toContain('Guard Captain');
  });

  it('should produce deterministic output for the same seed', () => {
    const npc = makeNpc();
    const a = generateAmbientLine(npc, 42);
    const b = generateAmbientLine(npc, 42);
    expect(a).toBe(b);
  });

  it('should use default pool for unknown personality', () => {
    const npc = makeNpc({ personality: 'enigmatic' });
    const line = generateAmbientLine(npc, 0);
    expect(typeof line).toBe('string');
    expect(line.length).toBeGreaterThan(0);
    expect(line).toContain('Guard Captain');
  });

  it('should append belief overlay for low trust', () => {
    const npc = makeNpc({
      beliefs: { 'player.trust': 'low' },
    });
    const line = generateAmbientLine(npc, 0);
    // Line should contain both a base template and a belief overlay
    expect(line).toContain('Guard Captain');
    // The overlay adds a second sentence about suspicion/distance
    expect(line.split('.').length).toBeGreaterThanOrEqual(2);
  });

  it('should not append overlay when beliefs do not match', () => {
    const npc = makeNpc({ beliefs: { 'weather': 'sunny' } });
    const lineWithBeliefs = generateAmbientLine(npc, 0);
    const lineWithout = generateAmbientLine(makeNpc(), 0);
    // Without matching belief patterns, should get the same base line
    expect(lineWithBeliefs).toBe(lineWithout);
  });
});

describe('generateZoneAmbience (FT-BR-007)', () => {
  it('should return empty array for fewer than 2 NPCs', () => {
    expect(generateZoneAmbience([])).toEqual([]);
    expect(generateZoneAmbience([makeNpc()])).toEqual([]);
  });

  it('should return lines for 2+ NPCs', () => {
    const npcs = [
      makeNpc({ name: 'Alice', personality: 'friendly' }),
      makeNpc({ name: 'Bob', personality: 'merchant' }),
    ];
    const lines = generateZoneAmbience(npcs, 10);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Alice');
    expect(lines[1]).toContain('Bob');
  });

  it('should cap output at 3 NPCs', () => {
    const npcs = Array.from({ length: 5 }, (_, i) =>
      makeNpc({ name: `NPC-${i}`, personality: 'default' }),
    );
    const lines = generateZoneAmbience(npcs, 0);
    expect(lines).toHaveLength(3);
  });
});

// F-20ec59de: JS `%` preserves the dividend's sign, so a negative seed used to
// index a template array with pool[negativeIndex] === undefined and throw on
// the following .replace() call.
describe('generateAmbientLine F-20ec59de: negative seed safety', () => {
  it('should not throw and should return a valid line for a negative seed', () => {
    const npc = makeNpc();
    expect(() => generateAmbientLine(npc, -1)).not.toThrow();
    const line = generateAmbientLine(npc, -1);
    expect(typeof line).toBe('string');
    expect(line).toContain('Guard Captain');
  });

  it('should produce deterministic output for the same negative seed', () => {
    const npc = makeNpc();
    const a = generateAmbientLine(npc, -42);
    const b = generateAmbientLine(npc, -42);
    expect(a).toBe(b);
  });

  it('should not throw for a negative seed that also triggers a belief overlay', () => {
    const npc = makeNpc({ beliefs: { 'player.trust': 'low' } });
    expect(() => generateAmbientLine(npc, -7)).not.toThrow();
    const line = generateAmbientLine(npc, -7);
    expect(line).toContain('Guard Captain');
  });
});

describe('generateZoneAmbience F-20ec59de: negative seed safety', () => {
  it('should not throw when effectiveSeed + i goes negative for some NPCs', () => {
    const npcs = [
      makeNpc({ name: 'Alice', personality: 'friendly' }),
      makeNpc({ name: 'Bob', personality: 'merchant' }),
    ];
    expect(() => generateZoneAmbience(npcs, -2)).not.toThrow();
    const lines = generateZoneAmbience(npcs, -2);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Alice');
    expect(lines[1]).toContain('Bob');
  });
});
