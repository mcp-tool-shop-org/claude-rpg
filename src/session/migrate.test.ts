import { describe, it, expect, vi } from 'vitest';
import { migrateSave } from './migrate.js';

// F-c5ff2a5c: migrateV1toV2 shallow-spread the raw save object and never
// transformed the *content* of legacy nested-JSON-string fields
// (playerRumors/activePressures). session.ts's loadRumorsFromSession/
// loadPressuresFromSession then do an unchecked `JSON.parse(...) as X[]`
// cast — a pre-shape-change v1 save deserializes into objects typed as
// current-shape but missing required fields (e.g. `.claim`), which
// downstream NPC dialogue/session-recap prompts interpolate as the literal
// string 'undefined' for the rest of the campaign. These entries mirror the
// real legacy shape recorded in test/fixtures/saves/v1-rich.json.
describe('migrateSave — legacy rumor/pressure normalization (F-c5ff2a5c)', () => {
  it('normalizes a legacy-shaped playerRumors entry to the current PlayerRumor field shape', () => {
    const raw = {
      version: '1.4.0',
      playerRumors: JSON.stringify([
        { id: 'r1', text: 'The chapel guards whisper of a sealed crypt.', source: 'guard', tick: 1 },
      ]),
    };

    const result = migrateSave(raw);
    const rumors = JSON.parse(result.data.playerRumors as string);

    expect(rumors).toHaveLength(1);
    const r = rumors[0];
    expect(r.id).toBe('r1');
    // The legacy `.text` maps onto the current `.claim` field.
    expect(r.claim).toContain('sealed crypt');
    // The legacy `.tick` maps onto the current `.originTick` field.
    expect(r.originTick).toBe(1);
    // Every required PlayerRumor field is now present with the right type —
    // these must not read back as `undefined` through the unchecked cast in
    // session.ts's loadRumorsFromSession.
    expect(typeof r.subjectDescriptor).toBe('string');
    expect(typeof r.sourceEvent).toBe('string');
    expect(typeof r.confidence).toBe('number');
    expect(typeof r.distortion).toBe('number');
    expect(typeof r.mutationCount).toBe('number');
    expect(typeof r.valence).toBe('string');
    expect(Array.isArray(r.spreadTo)).toBe(true);
  });

  it('normalizes a legacy-shaped activePressures entry to the current WorldPressure field shape', () => {
    const raw = {
      version: '1.4.0',
      activePressures: JSON.stringify([
        { id: 'p1', kind: 'faction-conflict', description: 'Rival guilds clash over chapel territory', severity: 2 },
      ]),
    };

    const result = migrateSave(raw);
    const pressures = JSON.parse(result.data.activePressures as string);

    expect(pressures).toHaveLength(1);
    const p = pressures[0];
    expect(p.id).toBe('p1');
    expect(p.description).toBe('Rival guilds clash over chapel territory');
    expect(typeof p.sourceFactionId).toBe('string');
    expect(typeof p.triggeredBy).toBe('string');
    expect(typeof p.urgency).toBe('number');
    expect(p.urgency).toBeGreaterThanOrEqual(0);
    expect(p.urgency).toBeLessThanOrEqual(1);
    expect(['hidden', 'rumored', 'known', 'public']).toContain(p.visibility);
    expect(p.turnsRemaining === null || typeof p.turnsRemaining === 'number').toBe(true);
    expect(Array.isArray(p.potentialOutcomes)).toBe(true);
    expect(Array.isArray(p.tags)).toBe(true);
    expect(typeof p.createdAtTick).toBe('number');
  });

  it('passes an already-conformant PlayerRumor entry through unchanged', () => {
    const conformant = {
      id: 'r2', claim: 'Defeated the Bone Collector', subjectDescriptor: 'a grim wanderer',
      sourceEvent: 'milestone', confidence: 0.8, distortion: 0, mutationCount: 0,
      valence: 'heroic', spreadTo: ['guild-a'], originTick: 5,
    };
    const raw = { version: '1.4.0', playerRumors: JSON.stringify([conformant]) };

    const result = migrateSave(raw);
    const rumors = JSON.parse(result.data.playerRumors as string);

    expect(rumors).toEqual([conformant]);
  });

  it('drops an entry with no id (unrecognizable) but keeps conformant siblings', () => {
    const raw = {
      version: '1.4.0',
      playerRumors: JSON.stringify([
        { text: 'floating text with no id at all' },
        { id: 'r3', text: 'a second, id-bearing legacy rumor', source: 'npc', tick: 2 },
      ]),
    };

    const result = migrateSave(raw);
    const rumors = JSON.parse(result.data.playerRumors as string);

    expect(rumors).toHaveLength(1);
    expect(rumors[0].id).toBe('r3');
  });

  // F-34078c07: the "dropped N unrecognizable entries" diagnostic used a
  // bare, unconditional console.warn, mixing raw text into a normal
  // player's terminal on every v1-save migration that happened to drop a
  // legacy entry. Gated behind --debug/CLAUDE_RPG_DEBUG, matching
  // session.ts's sibling loaders (see session.test.ts).
  it('console.warns about the dropped entry when debug is enabled', () => {
    vi.stubEnv('CLAUDE_RPG_DEBUG', '1');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const raw = {
      version: '1.4.0',
      playerRumors: JSON.stringify([
        { text: 'floating text with no id at all' },
        { id: 'r3', text: 'a second, id-bearing legacy rumor', source: 'npc', tick: 2 },
      ]),
    };

    migrateSave(raw);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('dropped 1 unrecognizable playerRumors entry');
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('does NOT console.warn about the dropped entry by default (no --debug/CLAUDE_RPG_DEBUG)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const raw = {
      version: '1.4.0',
      playerRumors: JSON.stringify([
        { text: 'floating text with no id at all' },
        { id: 'r3', text: 'a second, id-bearing legacy rumor', source: 'npc', tick: 2 },
      ]),
    };

    const result = migrateSave(raw);
    const rumors = JSON.parse(result.data.playerRumors as string);

    // The drop itself still happens -- only the diagnostic is gated.
    expect(rumors).toHaveLength(1);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('leaves absent playerRumors/activePressures fields absent (no crash on v1 saves without them)', () => {
    const raw = { version: '1.2.0' };
    const result = migrateSave(raw);
    expect(result.data.playerRumors).toBeUndefined();
    expect(result.data.activePressures).toBeUndefined();
  });
});
