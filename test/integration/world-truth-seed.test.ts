// WO-A2T-7 (slice A2-truth, run swarm-1788288802-f5a0, wave 5, "tests"
// domain): seed + idempotency proofs for load-time world-truth seeding
// (design doc docs/living-world-slice-a2.md §8). Law: a 1.x save carries
// its pressures/opportunities/NPC state/economies/rumors in SavedSession
// top-level fields and NOTHING in world.modules namespaces; on load, absent
// `world.globals['claude_rpg.stores_seeded']` means "seed each field into
// its namespace, then stamp the marker"; present means "the world is
// truth, ignore the fields" (idempotent).
//
// SEQUENCING (ADDENDUM-COMMON honesty floor + this wave's ADDENDUM-tests):
// game-core lands `seedWorldTruthFromSession` (src/game/world-truth-seed.ts)
// in an isolated worktree this domain cannot see; cli-display wires the
// bin.ts call site in its own isolated worktree. Until the coordinator
// merges both in, this file (and test/helpers/game-harness.ts's
// resumeHarness, which now seeds through the SAME function per game-core's
// wave-4 finding "A2-truth-resumeHarness-field-writes") is RED on THIS
// worktree with `Cannot find module '../../src/game/world-truth-seed.js'`
// -- a scoped run confirms:
//   npx vitest run test/integration/world-truth-seed.test.ts
//   => Error: Cannot find module '.../src/game/world-truth-seed.js'
// imported from test/helpers/game-harness.ts. That is the CORRECT red per
// the addendum's own sequencing note ("write the proofs against the design
// doc's contract and mark 'green expected at merge' where your worktree
// cannot run them"), not a bug in this file. Every fixture referenced below
// was independently verified (before this wave's code changes existed) to
// round-trip through loadSession() + every loadXFromSession loader with
// zero silently-dropped entries, and the two pack-rooted fixtures were
// verified to resume correctly through the PRE-existing (direct-field-write)
// resumeHarness -- see test/fixtures/saves/v1-migration-fixtures.md for the
// full provenance and verification method.
//
// See test/fixtures/saves/v1-migration-fixtures.md for two cross-domain
// findings surfaced while building these fixtures: (1) no SavedSession
// field has EVER persisted faction profiles/last actions, so
// setPersistedFactionState has nothing to seed from in any of the three
// fixtures below -- a design-doc gap for game-core (WO-A2T-1), not a test
// gap; (2) generated-world saves have no resume path in this app at all
// (packId is never set for them -- src/bin.ts runNew's GameSession
// construction, ~line 791), independent of this slice -- the generated
// fixture's proof below reconstructs the engine by replaying the same
// generateWorld() call rather than through resumeHarness/runLoad, because
// neither has ever supported this case.

import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getActivePressures,
  getWorldTickState,
  getPersistedOpportunities,
  getPersistedNpcLastActions,
  getPersistedNpcProfiles,
  getPersistedNpcObligations,
  getPersistedNpcChains,
  getPersistedFactionLastActions,
  getPersistedFactionProfiles,
  getEconomyCoreState,
  getPlayerRumorState,
  setPersistedOpportunities,
} from '@ai-rpg-engine/modules';
import { GameSession } from '../../src/game.js';
import { loadSession, loadProfileFromSession } from '../../src/session/session.js';
import { validateEngineState } from '../../src/cli/engine-state-validator.js';
import { createFakeClient } from '../helpers/fake-claude-client.js';
import { makeParityWorldGenProposal } from '../helpers/world-gen-fixtures.js';
import { resumeHarness } from '../helpers/game-harness.js';
// SEQUENCING: see the file header. Goes green once game-core's worktree
// merges src/game/world-truth-seed.ts in.
import { seedWorldTruthFromSession } from '../../src/game/world-truth-seed.js';
import { generateWorld } from '../../src/foundry/world-gen.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'saves');
const PACK_FIXTURE = join(FIXTURES_DIR, 'v1-migration-pack-rich.json');
const GENERATED_FIXTURE = join(FIXTURES_DIR, 'v1-migration-generated-rich.json');
const VETERAN_FIXTURE = join(FIXTURES_DIR, 'v1-migration-veteran.json');

const MARKER_KEY = 'claude_rpg.stores_seeded';

/** Sort helper so array-view comparisons don't depend on the seed function's insertion order. */
function byId<T extends { id: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.id.localeCompare(b.id));
}

describe('WO-A2T-7: world-truth seed from a 1.x pack save', () => {
  it('seeds every one of the design doc §3 view fields from the 1.x fixture\'s top-level fields, and stamps the marker', async () => {
    const { session: savedSession } = await loadSession(PACK_FIXTURE);
    const h = await resumeHarness(PACK_FIXTURE);

    // The seed function reported it actually seeded (marker was absent).
    expect(h.seedReport?.seeded).toBe(true);
    expect(h.session.engine.world.globals[MARKER_KEY]).toBeTruthy();

    // --- activePressures / resolvedPressures ---
    const fixturePressures = JSON.parse(savedSession.activePressures!);
    const fixtureResolvedPressures = JSON.parse(savedSession.resolvedPressures!);
    expect(byId(h.session.activePressures)).toEqual(byId(fixturePressures));
    expect(byId(getActivePressures(h.session.engine.world))).toEqual(byId(fixturePressures));
    expect(h.session.resolvedPressures).toEqual(fixtureResolvedPressures);
    expect(getWorldTickState(h.session.engine.world).resolvedPressures).toEqual(fixtureResolvedPressures);

    // --- activeOpportunities / resolvedOpportunities ---
    const fixtureOpportunities = JSON.parse(savedSession.activeOpportunities!);
    const fixtureResolvedOpportunities = JSON.parse(savedSession.resolvedOpportunities!);
    expect(byId(h.session.activeOpportunities)).toEqual(byId(fixtureOpportunities));
    expect(byId(getPersistedOpportunities(h.session.engine.world))).toEqual(byId(fixtureOpportunities));
    expect(h.session.resolvedOpportunities).toEqual(fixtureResolvedOpportunities);

    // --- NPC profiles / last actions / obligations / chains ---
    const fixtureNpcAgency = JSON.parse(savedSession.npcAgencySnapshot!) as {
      profiles: Array<{ npcId: string }>;
      actions: unknown[];
    };
    const sortByNpcId = <T extends { npcId: string }>(arr: T[]) =>
      [...arr].sort((a, b) => a.npcId.localeCompare(b.npcId));
    expect(sortByNpcId(h.session.lastNpcProfiles)).toEqual(sortByNpcId(fixtureNpcAgency.profiles));
    expect(sortByNpcId(getPersistedNpcProfiles(h.session.engine.world))).toEqual(sortByNpcId(fixtureNpcAgency.profiles));
    expect(h.session.lastNpcActions).toEqual(fixtureNpcAgency.actions);
    expect(getPersistedNpcLastActions(h.session.engine.world)).toEqual(fixtureNpcAgency.actions);

    const fixtureObligations = JSON.parse(savedSession.npcObligations!) as Record<string, unknown>;
    expect(Object.fromEntries(h.session.npcObligations)).toEqual(fixtureObligations);
    expect(Object.fromEntries(getPersistedNpcObligations(h.session.engine.world))).toEqual(fixtureObligations);

    // Chains: the 1.x field is keyed by npcId; the world-truth VIEW
    // (game.ts's existing refreshWorldViews, already landed at A2-core) is
    // a Map keyed by chain.id (`new Map(getPersistedNpcChains(world).map(c
    // => [c.id, c]))`) -- compare VALUES, not keys, since the two Maps use
    // different key semantics by design.
    const fixtureChains = Object.values(JSON.parse(savedSession.consequenceChains!) as Record<string, { id: string }>);
    expect(byId([...h.session.activeConsequenceChains.values()])).toEqual(byId(fixtureChains));
    expect(byId(getPersistedNpcChains(h.session.engine.world))).toEqual(byId(fixtureChains));

    // --- district economies ---
    const fixtureEconomies = JSON.parse(savedSession.districtEconomies!) as Record<string, unknown>;
    expect(Object.fromEntries(h.session.districtEconomies)).toEqual(fixtureEconomies);
    expect(getEconomyCoreState(h.session.engine.world).districts).toEqual(fixtureEconomies);

    // --- player rumors ---
    const fixtureRumors = JSON.parse(savedSession.playerRumors!);
    expect(h.session.playerRumors).toEqual(fixtureRumors);
    expect(getPlayerRumorState(h.session.engine.world).rumors).toEqual(fixtureRumors);

    // --- faction profiles / last actions: NOTHING to seed from (no
    // SavedSession field has ever persisted these -- see the fixture's
    // provenance doc). Whatever setPersistedFactionState receives (empty,
    // or whatever the tick's own next round would rebuild), this must not
    // throw and must not fabricate faction history that never existed.
    expect(() => getPersistedFactionProfiles(h.session.engine.world)).not.toThrow();
    expect(() => getPersistedFactionLastActions(h.session.engine.world)).not.toThrow();

    // Fields NOT in the design doc's view table stay untouched by seeding
    // (still restored the old direct way in resumeHarness).
    expect(h.session.profile?.build.name).toBe(loadProfileFromSession(savedSession)?.build.name);
  });

  it('a second seed call against the same world is a no-op: marker present, stores untouched', async () => {
    const { session: savedSession } = await loadSession(PACK_FIXTURE);
    const h = await resumeHarness(PACK_FIXTURE);
    expect(h.seedReport?.seeded).toBe(true);

    // Mutate one namespace to a sentinel the fixture's own opportunities
    // could never equal, so a silent re-seed (overwriting back to the
    // fixture's original opportunities) would be caught.
    setPersistedOpportunities(h.session.engine.world, []);
    expect(getPersistedOpportunities(h.session.engine.world)).toEqual([]);

    // "A second load re-seeds nothing" (design doc §8) is proven here as a
    // second call against the SAME world -- not a second file load, since a
    // second resumeHarness() on the SAME raw 1.x file would build a BRAND
    // NEW engine from scratch with the marker still absent from the file
    // itself, which would prove nothing about idempotency (both calls
    // would seed). The marker lives in world.globals, not in the fixture
    // file, so idempotency is a property of ONE world across two seed
    // calls -- exactly what "a save written after adoption ignores the
    // fields" (§8) describes for a save whose engineState already carries
    // the marker.
    const report2 = seedWorldTruthFromSession(h.session, savedSession);
    expect(report2.seeded).toBe(false);
    expect(getPersistedOpportunities(h.session.engine.world)).toEqual([]);
  });
});

describe('WO-A2T-7: world-truth seed from a veteran 1.x save (R1 composition)', () => {
  it('seeds pressures/rumors and the profile\'s baseline+globals reputation composes correctly', async () => {
    const { session: savedSession } = await loadSession(VETERAN_FIXTURE);
    const h = await resumeHarness(VETERAN_FIXTURE);

    expect(h.seedReport?.seeded).toBe(true);

    const fixturePressures = JSON.parse(savedSession.activePressures!);
    const fixtureRumors = JSON.parse(savedSession.playerRumors!);
    expect(byId(h.session.activePressures)).toEqual(byId(fixturePressures));
    expect(h.session.playerRumors).toEqual(fixtureRumors);

    // The globals this fixture carries pre-adoption (defeat-fallout writes
    // these independent of A2 adoption -- see the fixture's provenance).
    expect(h.session.engine.world.globals['player_heat']).toBe(30);
    expect(h.session.engine.world.globals['reputation_chapel-undead']).toBe(-12);
    expect(h.session.engine.world.globals['faction_alert_chapel-undead']).toBe(2);

    // R1: baseline stamped from the profile's pre-adoption value (40),
    // composed with the accrued kill delta (-12) => 28, not the stale 40
    // alone. Design doc §9: "the profile's reputation becomes a VIEW
    // refreshed after every round" -- play one settling turn so at least
    // one refreshWorldViews() has run after the seed, whichever of
    // "refreshed at seed time" or "refreshed at first round" game-core's
    // implementation chose.
    const baselineKey = 'claude_rpg.rep_baseline_chapel-undead';
    expect(h.session.engine.world.globals[baselineKey]).toBe(40);

    await h.play('look');
    const rep = h.session.profile?.reputation.find((r) => r.factionId === 'chapel-undead');
    expect(rep?.value).toBe(28); // baseline (40) + accrued global (-12)
  });
});

describe('WO-A2T-7: world-truth seed from a generated (packless) world save', () => {
  // No production load path exists for a generated-world save (see the
  // file header + fixture provenance doc) -- reconstruct the engine the
  // only way available: replay the SAME generateWorld() call (same
  // proposal, same seed => deterministic) that built the fixture, then
  // hand-restore the fixture's serialized engineState onto it exactly like
  // resumeHarness does for a pack (minus the getPackById gate, which has no
  // generated-world equivalent), then construct a GameSession by hand and
  // call seedWorldTruthFromSession directly.
  it('seeds every store from the generated-world fixture the same way as a pack save', async () => {
    const { session: savedSession } = await loadSession(GENERATED_FIXTURE);

    const proposal = makeParityWorldGenProposal({
      title: 'Seedhaven Fixture World',
      factions: [
        { id: 'seedhaven-guard', name: 'Seedhaven Guard', disposition: 'neutral', description: 'Town watch', memberIds: ['guard-1'] },
      ],
    });
    const client = createFakeClient({ structuredData: proposal });
    const result = await generateWorld(client, 'a generated fixture world for A2-truth seed proofs', 303);
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

    const report = seedWorldTruthFromSession(session, savedSession);
    expect(report.seeded).toBe(true);

    const fixturePressures = JSON.parse(savedSession.activePressures!);
    const fixtureRumors = JSON.parse(savedSession.playerRumors!);
    const fixtureEconomies = JSON.parse(savedSession.districtEconomies!) as Record<string, unknown>;
    const fixtureOpportunities = JSON.parse(savedSession.activeOpportunities!);
    const fixtureResolvedOpportunities = JSON.parse(savedSession.resolvedOpportunities!);

    expect(byId(session.activePressures)).toEqual(byId(fixturePressures));
    expect(session.playerRumors).toEqual(fixtureRumors);
    expect(Object.fromEntries(session.districtEconomies)).toEqual(fixtureEconomies);
    expect(byId(session.activeOpportunities)).toEqual(byId(fixtureOpportunities));
    // Deliberate empty-array case (WO-A2T-6's fixture note).
    expect(session.resolvedOpportunities).toEqual(fixtureResolvedOpportunities);
    expect(session.resolvedOpportunities).toEqual([]);

    expect(session.engine.world.globals[MARKER_KEY]).toBeTruthy();
  });
});
