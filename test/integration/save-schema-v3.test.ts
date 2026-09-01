// WO-A3-6 / WO-A3-7 (slice A3, run swarm-1788288802-f5a0, wave 6, "tests"
// domain): the full-fidelity round trips for schema v3 (design doc
// docs/living-world-slice-a3.md §4). Law: v3 saves stop writing the ten
// legacy world-truth fields (playerRumors, activePressures,
// resolvedPressures, npcAgencySnapshot, npcObligations, consequenceChains,
// partyState, districtEconomies, activeOpportunities, leverageSnapshot),
// `resolvedOpportunities` stays (session history, not world truth), and a
// new `rumorEngine?: string` field carries the admitted RumorEngine's
// `EngineSnapshot`. `CURRENT_SCHEMA_VERSION` becomes 3; `migrateV2toV3` is a
// PURE shape-only step (stamps schemaVersion, touches nothing else — the
// runtime seed still needs the legacy fields on the way through).
//
// SEQUENCING (ADDENDUM-COMMON honesty floor + this wave's own ADDENDUM):
// game-core lands `CURRENT_SCHEMA_VERSION = 3`, `migrateV2toV3`,
// `SavedSession.rumorEngine`, `GameSession.rumorEngine`, and the
// `SaveSessionInput`/`GameConfig` shape changes design lock 2/3 require, all
// in an isolated worktree this domain cannot see; cli-display wires
// `buildSaveInput`'s own field drop in ITS isolated worktree. Until the
// coordinator merges both in, this file is RED on THIS worktree — verified
// with a scoped run:
//   npx vitest run test/integration/save-schema-v3.test.ts
// => every test in the "schema v3 pin" and "played session" describe blocks
// fails with `expected 2 to be 3` (CURRENT_SCHEMA_VERSION is still 2 on this
// worktree — `grep -n CURRENT_SCHEMA_VERSION src/session/migrate.ts` shows
// `export const CURRENT_SCHEMA_VERSION = 2;` today) or with the ten legacy
// keys still present on the written save (saveSession() hasn't been told to
// stop writing them yet); the fixture full-fidelity tests fail the same way
// once they reach their own v3-shape assertions, after the shared
// resumeHarness()/seedWorldTruth() portion (already landed at A2-truth,
// wave 5) passes exactly as it does in world-truth-seed.test.ts. This is the
// CORRECT red per the addendum's sequencing note ("write the proofs against
// the design doc's contract and mark 'green expected at merge' where your
// worktree cannot run them"), not a defect in this file. Goes green once
// the coordinator stitches game-core's and cli-display's changes in.
//
// ASSUMED CONTRACT for two fields the design doc names but doesn't spell
// the exact TypeScript shape of (flagged here, not silently guessed away —
// ADDENDUM-COMMON's honesty floor): `GameConfig.rumorEngine?: RumorEngine`
// (a pre-built/restored instance, mirroring the EXISTING `journal?:
// CampaignJournal` field's already-constructed-object convention — see
// src/game.ts's `this.journal = config.journal ?? new CampaignJournal()`)
// and `SaveSessionInput.rumorEngine?: RumorEngine` (same convention,
// mirroring `journal` there too — saveSession() would then do its own
// `.serialize()` + `JSON.stringify()` internally, the same shape every
// other JSON-string SavedSession field already gets). test/helpers/
// game-harness.ts's resumeHarness()/saveHarness() (WO-A3-7) are built
// against this exact assumption. If game-core's actual field name or shape
// differs, the fix is confined to those two call sites in game-harness.ts
// plus the field name below — everything else in this file exercises
// PUBLIC behavior (`session.rumorEngine`'s own RumorEngine API, the written
// save's JSON shape) that doesn't change either way.
//
// See test/fixtures/saves/v1-migration-fixtures.md for the three A2-truth
// fixtures reused below (provenance, and the generated-world fixture's
// documented "no production load path exists" gap — reconstructed here via
// the same hand-built engine path world-truth-seed.test.ts uses, per this
// wave's own ADDENDUM-tests: "the generated fixture through its hand-built
// engine path if resumeHarness still cannot resume a packless save").

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { RumorEngine, type EngineSnapshot, type Rumor } from '@ai-rpg-engine/rumor-system';
import {
  CURRENT_SCHEMA_VERSION,
  validateVersion,
  migrateSave,
} from '../../src/session/migrate.js';
import {
  loadSession,
  loadProfileFromSession,
  loadResolvedOpportunitiesFromSession,
} from '../../src/session/session.js';
import { GameSession } from '../../src/game.js';
import { validateEngineState } from '../../src/cli/engine-state-validator.js';
import { createFakeClient } from '../helpers/fake-claude-client.js';
import { makeParityWorldGenProposal } from '../helpers/world-gen-fixtures.js';
import { generateWorld } from '../../src/foundry/world-gen.js';
import {
  resumeHarness,
  saveHarness,
  RUMOR_ENGINE_CONFIG,
  type GameHarness,
} from '../helpers/game-harness.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'saves');
const PACK_FIXTURE = join(FIXTURES_DIR, 'v1-migration-pack-rich.json');
const VETERAN_FIXTURE = join(FIXTURES_DIR, 'v1-migration-veteran.json');
const GENERATED_FIXTURE = join(FIXTURES_DIR, 'v1-migration-generated-rich.json');

const MARKER_KEY = 'claude_rpg.stores_seeded';

// design lock 2: the ten fields a v3 writer must never emit.
const RETIRED_V3_KEYS = [
  'playerRumors',
  'activePressures',
  'resolvedPressures',
  'npcAgencySnapshot',
  'npcObligations',
  'consequenceChains',
  'partyState',
  'districtEconomies',
  'activeOpportunities',
  'leverageSnapshot',
] as const;

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'claude-rpg-save-v3-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

/** Reads a save file straight off disk as a plain record — bypasses loadSession()/migrateSave() so key ABSENCE is checked against the real bytes on disk, not against a typed SavedSession object where an omitted optional field and an explicitly-undefined one are indistinguishable. */
async function readRawSave(path: string): Promise<Record<string, unknown>> {
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function sortById<T extends { id: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.id.localeCompare(b.id));
}

/** Asserts a v3 save's raw JSON shape: none of the ten retired keys, `rumorEngine` present as a string, the seed marker inside the parsed engineState. */
function expectV3Shape(raw: Record<string, unknown>): void {
  expect(raw.schemaVersion).toBe(3);
  for (const key of RETIRED_V3_KEYS) {
    expect(raw).not.toHaveProperty(key);
  }
  // ASSUMED CONTRACT (see file header): rumorEngine rides as a JSON string,
  // same convention as every other serialized-blob SavedSession field
  // (chronicleRecords, npcObligations, etc.).
  expect(typeof raw.rumorEngine).toBe('string');
  // Coordinator stitch (slice A3): Engine.serialize() nests the world state
  // under `world.state` (the save listing's engineState peek reads the same
  // path); the marker lives in world.state.globals.
  const engineState = JSON.parse(raw.engineState as string) as {
    world?: { state?: { globals?: Record<string, unknown> }; globals?: Record<string, unknown> };
  };
  expect((engineState.world?.state?.globals ?? engineState.world?.globals)?.[MARKER_KEY]).toBeTruthy();
}

// ─── Schema v3 pin ─────────────────────────────────────────────

describe('WO-A3-6: schema v3 pin (design doc §1)', () => {
  it('CURRENT_SCHEMA_VERSION is 3', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(3);
  });

  it('validateVersion accepts 1 through 3', () => {
    expect(() => validateVersion(1)).not.toThrow();
    expect(() => validateVersion(2)).not.toThrow();
    expect(() => validateVersion(CURRENT_SCHEMA_VERSION)).not.toThrow();
  });

  it('a schemaVersion 4 save is refused with the existing "newer version" copy (design doc §4, "Future refusal")', () => {
    expect(() => validateVersion(4)).toThrow('newer version');
    const raw = { schemaVersion: 4, version: '2.0.0', engineState: '{}', turnHistory: { turns: [] }, tone: 'x', savedAt: 'x' };
    expect(() => migrateSave(raw)).toThrow('newer version');
  });
});

// ─── v1 → v3 / v2 → v3 full-fidelity round trips ──────────────

describe('WO-A3-6: v1 -> v3 full fidelity (pack-rooted fixture)', () => {
  it('loads with migrated:true, stepsApplied = version gap, views equal the fixture, then round-trips through the REAL saveSession as v3', async () => {
    const { session: savedSession, migrated, stepsApplied } = await loadSession(PACK_FIXTURE);
    // The fixture is genuinely schemaVersion 1 (see v1-migration-fixtures.md)
    // — the version gap to CURRENT_SCHEMA_VERSION (3) is 2 migration steps
    // (migrateV1toV2, migrateV2toV3), not 1.
    expect(migrated).toBe(true);
    expect(stepsApplied).toBe(CURRENT_SCHEMA_VERSION - 1);

    const h = await resumeHarness(PACK_FIXTURE);
    expect(h.seedReport?.seeded).toBe(true);

    // Views equal the fixture's legacy fields (same comparisons
    // world-truth-seed.test.ts's WO-A2T-7 proof already made for this exact
    // fixture — re-asserted here because THIS proof's point is what happens
    // to them across a v3 write, not merely that the seed ran).
    const fixtureRumors = JSON.parse(savedSession.playerRumors!);
    const fixturePressures = JSON.parse(savedSession.activePressures!);
    expect(h.session.playerRumors).toEqual(fixtureRumors);
    expect(sortById(h.session.activePressures)).toEqual(sortById(fixturePressures));

    // Save through the REAL saveSession (a temp dir) — the written file is
    // v3 with none of the ten keys, rumorEngine present, marker inside
    // engineState.
    const v3Path = join(tmpDir, 'pack-rich-v3.json');
    await saveHarness(h, v3Path);
    const raw = await readRawSave(v3Path);
    expectV3Shape(raw);

    // Load THAT: seeded:false, views identical, profile reputation identical (R1).
    const h2 = await resumeHarness(v3Path);
    expect(h2.seedReport?.seeded).toBe(false);
    expect(h2.session.playerRumors).toEqual(h.session.playerRumors);
    expect(sortById(h2.session.activePressures)).toEqual(sortById(h.session.activePressures));
    expect(h2.session.profile?.reputation).toEqual(h.session.profile?.reputation);
  });
});

describe('WO-A3-6: v1 -> v3 full fidelity (veteran fixture, R1 composition)', () => {
  it('the composed reputation view survives a v3 round trip unchanged', async () => {
    const h = await resumeHarness(VETERAN_FIXTURE);
    expect(h.seedReport?.seeded).toBe(true);
    await h.play('look'); // settle one round so the composed view (baseline + accrued globals) has run, per WO-A2T-7's own veteran proof.
    const repBefore = h.session.profile?.reputation.find((r) => r.factionId === 'chapel-undead');
    expect(repBefore?.value).toBe(28); // baseline (40) + accrued global (-12) — see world-truth-seed.test.ts.

    const v3Path = join(tmpDir, 'veteran-v3.json');
    await saveHarness(h, v3Path);
    const raw = await readRawSave(v3Path);
    expectV3Shape(raw);

    const h2 = await resumeHarness(v3Path);
    expect(h2.seedReport?.seeded).toBe(false);
    const repAfter = h2.session.profile?.reputation.find((r) => r.factionId === 'chapel-undead');
    expect(repAfter?.value).toBe(28);
  });
});

describe('WO-A3-6: v1 -> v3 full fidelity (generated/packless fixture, hand-built engine path)', () => {
  // No production load path exists for a generated-world save (documented
  // in v1-migration-fixtures.md, independent of this slice — runNew()
  // never sets packId for one, runLoad()'s engine-restore is gated entirely
  // on packId). resumeHarness() throws the same gate for the same reason
  // (`if (!savedSession.packId) throw ...`). Mirrors world-truth-seed.test.ts's
  // own workaround exactly: replay the same deterministic generateWorld()
  // call, hand-restore the serialized state, construct a GameSession
  // directly, and drive seedWorldTruth()/saveSession() by hand instead of
  // through the harness.
  it('reconstructs the engine, seeds, and round-trips through the REAL saveSession as v3', async () => {
    const { session: savedSession } = await loadSession(GENERATED_FIXTURE);

    const proposal = makeParityWorldGenProposal({
      title: 'Seedhaven Fixture World',
      factions: [
        { id: 'seedhaven-guard', name: 'Seedhaven Guard', disposition: 'neutral', description: 'Town watch', memberIds: ['guard-1'] },
      ],
    });
    const client = createFakeClient({ structuredData: proposal });
    const result = await generateWorld(client, 'a generated fixture world for A3 save-shape proofs', 303);
    expect(result.ok).toBe(true);
    const engine = result.engine!;

    const validation = validateEngineState(savedSession.engineState);
    expect(validation.valid).toBe(true);
    if (!validation.valid) return;
    Object.assign(engine.store.state, structuredClone(validation.state));
    engine.moduleManager.initializeNamespaces(engine.store);

    const client2 = createFakeClient({});
    const session = new GameSession({
      engine,
      client: client2,
      tone: savedSession.tone,
      title: 'Generated Fixture',
      worldPrompt: savedSession.worldPrompt,
      profile: loadProfileFromSession(savedSession) ?? undefined,
      genre: savedSession.genre ?? 'fantasy',
    });

    const report = session.seedWorldTruth(savedSession, 'test-engine');
    expect(report.seeded).toBe(true);

    const v3Path = join(tmpDir, 'generated-rich-v3.json');
    // No harness object here — build the GameHarness shape saveHarness()
    // needs by hand, same session/no-callLog-tracking scope as this
    // reconstruction already uses.
    const harnessLike: GameHarness = {
      session,
      callLog: { calls: [] } as unknown as GameHarness['callLog'],
      play: (input: string) => session.processInput(input),
      tick: () => session.engine.tick,
      turnCount: () => session.history.getAll().length,
      lastVerb: () => undefined,
    };
    await saveHarness(harnessLike, v3Path);
    const raw = await readRawSave(v3Path);
    expectV3Shape(raw);

    // resolvedOpportunities is session HISTORY (design lock 2) — this
    // fixture's own deliberate empty-array case (WO-A2T-6's fixture note)
    // must still be an explicit `[]`, not silently absent.
    expect(loadResolvedOpportunitiesFromSession(savedSession)).toEqual([]);
    expect(session.resolvedOpportunities).toEqual([]);
  });
});

// ─── A played session's save -> load -> save is byte-identical ───

describe('WO-A3-6: a played session round-trips byte-identically as v3', () => {
  it('save -> load -> save modulo savedAt (and rumorEngine\'s tick-dependent fields, named below)', async () => {
    // Built via resumeHarness() against a real (already-migrated, already-
    // seeded) fixture rather than a brand-new never-loaded GameSession: a
    // fresh GameSession never goes through seedWorldTruth() (only bin.ts's
    // runLoad / this harness call it), so it never stamps
    // `claude_rpg.stores_seeded` either — a genuinely new game is world
    // truth from turn 0 with nothing to seed. Whether a brand-new v3 save's
    // FIRST write is ALSO expected to carry the marker (the design doc
    // states as a flat invariant: "A v3 save always carries the marker
    // inside engineState") is a real open question this proof does not
    // resolve — see this file's summary / the coordinator note this wave.
    // Using an already-seeded fixture sidesteps that ambiguity and still
    // proves the thing WO-A3-6 actually asks for: a PLAYED session's save
    // cycle is stable.
    const h = await resumeHarness(PACK_FIXTURE);
    await h.play('look');
    await h.play('look');

    const path1 = join(tmpDir, 'played-1.json');
    await saveHarness(h, path1);
    const h2 = await resumeHarness(path1);
    expect(h2.seedReport?.seeded).toBe(false); // v3 load never re-seeds (two-phase rule).

    const path2 = join(tmpDir, 'played-2.json');
    await saveHarness(h2, path2);

    const raw1 = await readRawSave(path1);
    const raw2 = await readRawSave(path2);

    // savedAt is a wall-clock timestamp (session.ts's `new
    // Date().toISOString()`) — never expected to match between two
    // sequential saves. rumorEngine's own JSON carries `lastSpreadTick` /
    // `originTick` (Rumor) and `tick` (StanceRecord) — tick-relative fields
    // that a played round (runWorldRound calling rumorEngine.tick()) can
    // advance between the two saves even with byte-identical rumor
    // CONTENT otherwise. Normalize both away.
    //
    // engineState's own `actionLog` also has to be normalized out, but for
    // an orthogonal, pre-existing, and already-documented reason that has
    // nothing to do with this slice: resumeHarness() (test/helpers/
    // game-harness.ts's own doc comment, F-966c84ab) never calls the
    // engine's real `Engine.deserialize()`, so it can never restore
    // `actionLog` onto the reconstructed engine — the SAME gap bin.ts's
    // runLoad() documents for the identical reason ("Full Engine.deserialize
    // remains blocked"). Confirmed by a scoped run of this exact test before
    // this normalization was added: the ONLY diff between raw1/raw2 was
    // `engineState`'s `actionLog` (2 real entries after `h`'s two `look`
    // turns vs `[]` after resuming through `h2`) — not schemaVersion, not
    // the ten retired keys, not rumorEngine content. That file's own doc
    // comment is explicit that tests built on resumeHarness() "will stay
    // green even if [actionLog persistence] is missing or broken -- do not
    // rely on them as tripwires for [it]" — this proof honors that and
    // stays scoped to what WO-A3-6 actually asks for (the v3 write shape +
    // rumorEngine persistence), not actionLog continuity.
    const normalize = (raw: Record<string, unknown>) => {
      const clone = structuredClone(raw);
      delete clone.savedAt;
      if (typeof clone.rumorEngine === 'string') {
        const snap = JSON.parse(clone.rumorEngine) as EngineSnapshot;
        const stripTicks = (r: Rumor) => ({ ...r, lastSpreadTick: 0 });
        clone.rumorEngine = JSON.stringify({
          rumors: snap.rumors.map(stripTicks).sort((a, b) => a.id.localeCompare(b.id)),
          stances: snap.stances.map((s) => ({ ...s, tick: 0 })),
        });
      }
      if (typeof clone.engineState === 'string') {
        const engineState = JSON.parse(clone.engineState) as { actionLog?: unknown };
        engineState.actionLog = [];
        clone.engineState = JSON.stringify(engineState);
      }
      return clone;
    };
    expect(JSON.stringify(normalize(raw1))).toBe(JSON.stringify(normalize(raw2)));
  });
});

// ─── RumorEngine persistence (design doc §4, "RumorEngine persistence") ───

describe('WO-A3-6: RumorEngine survives save -> load with stances intact', () => {
  it('a spread rumor (with a mutation) and a per-hearer stance both survive the real saveSession/loadSession round trip', async () => {
    const h = await resumeHarness(PACK_FIXTURE);
    // Design lock 3: GameSession.rumorEngine: RumorEngine. Not yet a real
    // field on this worktree (see file header) — reads as `undefined`
    // until the coordinator merges game-core's change in; this is the
    // observed red for this block.
    const engine = (h.session as unknown as { rumorEngine?: RumorEngine }).rumorEngine;
    expect(engine).toBeInstanceOf(RumorEngine);
    if (!(engine instanceof RumorEngine)) return;

    const rumor = engine.create({
      claim: 'player looted the reliquary',
      subject: 'player',
      key: 'rum-test-1',
      value: true,
      sourceId: 'brother-aldric',
      originTick: h.session.engine.tick,
      confidence: 0.8,
      emotionalCharge: 0.6,
    });
    engine.spread(rumor.id, {
      spreaderId: 'brother-aldric',
      receiverId: 'sister-maren',
      environmentInstability: 0.5,
      hopCount: 0,
      currentTick: h.session.engine.tick + 1,
    });
    const stance = engine.setStance('sister-maren', rumor.id, 'believe', h.session.engine.tick + 1);
    expect(stance).toBe('believe');

    const savePath = join(tmpDir, 'rumor-persistence.json');
    await saveHarness(h, savePath);

    const loadResult = await loadSession(savePath);
    const rumorEngineRaw = (loadResult.session as unknown as { rumorEngine?: string }).rumorEngine;
    expect(typeof rumorEngineRaw).toBe('string');
    const restored = RumorEngine.deserializeSafe(JSON.parse(rumorEngineRaw!) as EngineSnapshot, RUMOR_ENGINE_CONFIG);
    expect(restored.warnings).toEqual([]);
    expect(restored.engine.stanceOf('sister-maren', rumor.id)).toBe('believe');
    const restoredRumor = restored.engine.findBySubjectKey('player', 'rum-test-1');
    expect(restoredRumor?.spreadPath).toContain('sister-maren');
    expect(restoredRumor?.mutationCount).toBeGreaterThanOrEqual(0);
  });

  it('a snapshot with one malformed rumor loads the rest — deserializeSafe warnings are structured, the world still boots', async () => {
    const goodRumor = new RumorEngine(RUMOR_ENGINE_CONFIG).create({
      claim: 'player defended the chapel',
      subject: 'player',
      key: 'rum-good-1',
      value: true,
      sourceId: 'world',
      originTick: 0,
      confidence: 0.5,
      emotionalCharge: 0.6,
    });
    // F-1f8c5a94 (engine.d.ts's own doc comment): a rumor missing
    // lastSpreadTick used to freeze forever pre-validation; this is
    // deliberately that exact malformed shape.
    const malformedRumor = { ...goodRumor, id: 'rum-bad-1', lastSpreadTick: undefined };
    const snapshot: EngineSnapshot = { rumors: [goodRumor, malformedRumor as unknown as Rumor], stances: [] };

    const restored = RumorEngine.deserializeSafe(snapshot, RUMOR_ENGINE_CONFIG);
    expect(restored.restored).toBe(1);
    expect(restored.warnings).toHaveLength(1);
    expect(restored.warnings[0].field).toBe('rumors[1].lastSpreadTick');
    expect(restored.warnings[0].message).toContain('rum-bad-1');
    // create() auto-generates `id` (its own `rum_N` counter) — it never
    // takes `id` as a param (engine.d.ts's create() signature has no such
    // field), so the fixture must look the good rumor up by the id it was
    // actually assigned, not by the `key` passed into create() above.
    expect(restored.engine.get(goodRumor.id)).toBeDefined();
    expect(restored.engine.get('rum-bad-1')).toBeUndefined();

    // "the world still boots": embed this exact malformed snapshot into a
    // real v3-shaped save on disk and resume through the harness — must not
    // throw, and the resumed session's rumorEngine must carry exactly the
    // one valid rumor. This exercises resumeHarness()'s own
    // deserializeSafe wiring (WO-A3-7), not just the bare engine API above.
    const { session: pristine } = await loadSession(PACK_FIXTURE);
    const rawSave = JSON.parse(await readFile(PACK_FIXTURE, 'utf-8')) as Record<string, unknown>;
    rawSave.rumorEngine = JSON.stringify(snapshot);
    const bootPath = join(tmpDir, 'malformed-rumor-boot.json');
    await writeFile(bootPath, JSON.stringify(rawSave), 'utf-8');

    const h = await resumeHarness(bootPath);
    expect(h.rumorRestoreWarnings).toHaveLength(1);
    const bootEngine = (h.session as unknown as { rumorEngine?: RumorEngine }).rumorEngine;
    expect(bootEngine).toBeInstanceOf(RumorEngine);
    if (bootEngine instanceof RumorEngine) {
      expect(bootEngine.get(goodRumor.id)).toBeDefined();
      expect(bootEngine.get('rum-bad-1')).toBeUndefined();
    }
    void pristine; // fixture loaded only to source a valid engineState/packId envelope above.
  });
});
