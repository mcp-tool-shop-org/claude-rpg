import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('scene-context source verification (BR-004)', () => {
  it('should call getPerceptionLog before the .map() loop, not inside it', () => {
    // Read the actual source to verify the fix structurally
    const src = readFileSync(resolve(__dirname, 'scene-context.ts'), 'utf-8');

    // getPerceptionLog should appear BEFORE the .map( call, not inside it
    const perceptionCallIndex = src.indexOf('getPerceptionLog(');
    const mapCallIndex = src.indexOf('zoneEntities.map(');

    expect(perceptionCallIndex).toBeGreaterThan(-1);
    expect(mapCallIndex).toBeGreaterThan(-1);
    // The perception call should come before the map
    expect(perceptionCallIndex).toBeLessThan(mapCallIndex);

    // Additionally, getPerceptionLog should NOT appear inside the .map callback
    const mapBlock = src.slice(mapCallIndex);
    const closingIndex = findMatchingBrace(mapBlock);
    const mapBody = mapBlock.slice(0, closingIndex);
    expect(mapBody).not.toContain('getPerceptionLog(');
  });
});

/** Find the index of the closing paren/brace that matches the first opening one. */
function findMatchingBrace(code: string): number {
  let depth = 0;
  let started = false;
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '(') { depth++; started = true; }
    if (code[i] === ')') { depth--; }
    if (started && depth === 0) return i;
  }
  return code.length;
}
