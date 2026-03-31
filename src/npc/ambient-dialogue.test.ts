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
