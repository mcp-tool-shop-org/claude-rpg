import { describe, it, expect, vi } from 'vitest';
import { migrateSave, CURRENT_SCHEMA_VERSION } from './migrate.js';

// F-c5ff2a5c: migrateV1toV2 shallow-spread the raw save object and never
// transformed the *content* of legacy nested-JSON-string fields
// (playerRumors/activePressures). Before F-b6456823 hardened them,
// session.ts's loadRumorsFromSession/loadPressuresFromSession did an
// unchecked `JSON.parse(...) as X[]` cast — a pre-shape-change v1 save
// deserialized into objects typed as current-shape but missing required
// fields (e.g. `.claim`), which downstream NPC dialogue/session-recap
// prompts interpolated as the literal string 'undefined' for the rest of the
// campaign. Those loaders are now guarded (isValidPlayerRumor/
// isValidWorldPressure, shared from this file) and would just DROP an
// unrecognized-shape entry instead of crashing — but this migration step is
// still what PRESERVES the player's earned rumor/pressure content instead of
// discarding it, by mapping legacy fields onto the current shape before the
// loader ever sees them. These entries mirror the real legacy shape recorded
// in test/fixtures/saves/v1-rich.json.
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

// WO-A3-1 (slice A3 §1/§2, design lock 1): schema v3 — migrateV2toV3 is a
// PURE stamp (schemaVersion: 3 only), and the full v1/v2 -> v3 chain must
// leave the ten legacy world-truth fields untouched so the runtime seed
// (game/world-truth-seed.ts's seedWorldTruthFromSession, called once per
// world) can still read them. Before this migration step existed,
// CURRENT_SCHEMA_VERSION stayed 2 and migrateSave(raw).data.schemaVersion
// on a v2 save was observed to stay 2 (stepsApplied: 0) — this suite pins
// the v3 destination directly rather than re-asserting that historical red.
describe('migrateSave — v2 -> v3 (WO-A3-1, design lock 1: PURE stamp only)', () => {
  it('CURRENT_SCHEMA_VERSION is 3', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(3);
  });

  it('stamps schemaVersion: 3 on a v2 save and reports one step applied', () => {
    const raw = { schemaVersion: 2, version: '1.4.0', tone: 'dark fantasy' };
    const result = migrateSave(raw);
    expect(result.data.schemaVersion).toBe(3);
    expect(result.sourceVersion).toBe(2);
    expect(result.targetVersion).toBe(3);
    expect(result.stepsApplied).toBe(1);
  });

  it('a v2 -> v3 migration touches NOTHING but schemaVersion — every legacy world-truth field survives byte-identical', () => {
    const raw = {
      schemaVersion: 2,
      version: '1.4.0',
      playerRumors: JSON.stringify([{ id: 'r1', claim: 'a claim', subjectDescriptor: 'x', sourceEvent: 'milestone', confidence: 0.5, distortion: 0, mutationCount: 0, valence: 'heroic', spreadTo: [], originTick: 1 }]),
      activePressures: JSON.stringify([{ id: 'p1', kind: 'k', sourceFactionId: 'f', description: 'd', triggeredBy: 't', urgency: 0.5, visibility: 'known', turnsRemaining: null, potentialOutcomes: [], tags: [], createdAtTick: 0 }]),
      resolvedPressures: JSON.stringify([{ id: 'p0' }]),
      npcAgencySnapshot: JSON.stringify({ profiles: [], actions: [] }),
      npcObligations: JSON.stringify({ npc1: {} }),
      consequenceChains: JSON.stringify({ npc1: {} }),
      partyState: JSON.stringify({ companions: [] }),
      districtEconomies: JSON.stringify({ d1: {} }),
      activeOpportunities: JSON.stringify([{ id: 'o1' }]),
      leverageSnapshot: 'Heat: 3',
    };
    const result = migrateSave(raw);
    for (const key of [
      'playerRumors', 'activePressures', 'resolvedPressures', 'npcAgencySnapshot',
      'npcObligations', 'consequenceChains', 'partyState', 'districtEconomies',
      'activeOpportunities', 'leverageSnapshot',
    ] as const) {
      expect(result.data[key]).toBe(raw[key]);
    }
    expect(result.data.schemaVersion).toBe(3);
  });

  it('a v1 save migrates through v2 in two steps to land on v3', () => {
    const raw = { version: '1.0.0' };
    const result = migrateSave(raw);
    expect(result.sourceVersion).toBe(1);
    expect(result.targetVersion).toBe(3);
    expect(result.stepsApplied).toBe(2);
    expect(result.data.schemaVersion).toBe(3);
    // migrateV1toV2's own normalization (createdWithVersion, campaignStatus
    // default) still ran as step 1 — v2->v3 only adds the version stamp on
    // top, it does not undo v1->v2's work.
    expect(result.data.createdWithVersion).toBe('1.0.0');
    expect(result.data.campaignStatus).toBe('active');
  });

  it('a v3 save passed through migrateSave is a no-op (0 steps applied)', () => {
    const raw = { schemaVersion: 3, version: '1.4.0' };
    const result = migrateSave(raw);
    expect(result.stepsApplied).toBe(0);
    expect(result.data.schemaVersion).toBe(3);
  });
});
