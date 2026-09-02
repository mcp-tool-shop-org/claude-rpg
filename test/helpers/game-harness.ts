// Test harness for creating GameSession instances with fake Claude clients.
// Provides a quick way to set up a game, execute turns, and inspect state.

import { createGame, itemCatalog as fantasyItemCatalog } from '@ai-rpg-engine/starter-fantasy';
// WO-A3-7 (slice A3, run swarm-1788288802-f5a0, wave 6, "tests" domain):
// the engine package the design doc admits this slice (docs/
// living-world-slice-a3.md §3) -- already an installed dependency
// (`grep -n rumor-system package.json` => "@ai-rpg-engine/rumor-system":
// "^3.11.0") even though nothing in src/ imports it yet on this worktree
// (game-core's own worktree lands GameSession.rumorEngine; this one cannot
// see that change until the coordinator merges it in -- see the
// SEQUENCING note on resumeHarness below, same pattern as WO-A2T-7's
// world-truth-seed.js import last wave).
import { RumorEngine, type RumorEngineConfig, type EngineSnapshot } from '@ai-rpg-engine/rumor-system';
import type { Engine } from '@ai-rpg-engine/core';
import { setPartyState } from '@ai-rpg-engine/modules';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import { GameSession, type GameConfig } from '../../src/game.js';
import { createFakeClient, createCallLog, type FakeClientOptions, type CallLog } from './fake-claude-client.js';
import {
  loadSession,
  loadProfileFromSession,
  loadChronicleFromSession,
  loadNpcConversationsFromSession,
  loadPartyFromSession,
  loadArcSnapshotFromSession,
  loadEndgameTriggersFromSession,
  loadFinaleFromSession,
  saveSession,
  type SaveSessionInput,
  type SavedSession,
  loadWorldMovedFromSession,
} from '../../src/session/session.js';
import { getPackById } from '../../src/character/packs.js';
import { validateEngineState } from '../../src/cli/engine-state-validator.js';
import { TurnHistory } from '../../src/session/history.js';
// WO-A4-10 (slice A4, run swarm-1788288802-f5a0, wave 7, "tests" domain):
// generateWorld/WorldGenProposal already exist today (runtime-foundry's own
// isolated worktree for THIS wave only ADDS the proposeWorld/instantiateWorld
// split -- design doc docs/living-world-slice-a4.md §4 -- it does not remove
// or change generateWorld's existing signature/behavior, per that section's
// own "generateWorld composes the two"), so this is a safe STATIC import.
// `instantiateWorld` itself is deliberately NOT imported statically here --
// see rebuildGeneratedEngine's own doc comment below for why.
import { generateWorld, type WorldGenProposal } from '../../src/foundry/world-gen.js';

/**
 * design doc §3 (locked): "constructed on a new game with
 * `{ stanceFadeTicks: 24 }`... restored on load with
 * `RumorEngine.deserializeSafe(snapshot, config)`". Shared here so the
 * harness and the test file pin the identical config the (not-yet-landed)
 * production constructor is contracted to use.
 */
export const RUMOR_ENGINE_CONFIG: RumorEngineConfig = { stanceFadeTicks: 24 };

/**
 * Structured warnings from RumorEngine.deserializeSafe(), surfaced the same
 * way seedReport surfaces seedWorldTruthFromSession()'s report -- never
 * thrown, never shown to the player (design doc §3: "its warnings go to the
 * debug log, never the player").
 */
export type RumorRestoreWarning = { field: string; message: string };
// WO-A2T-7 (slice A2-truth, run swarm-1788288802-f5a0, wave 5): game-core's
// wave-4 finding "A2-truth-resumeHarness-field-writes" flagged that this
// helper directly assigned the eleven now-view session fields from a loaded
// 1.x SavedSession -- correct only until the NEXT round's refreshWorldViews()
// call resets them to whatever (likely empty) world truth already holds,
// since a 1.x save never wrote into the world.modules namespaces those views
// read from. This wave's own contract (ADDENDUM-COMMON design lock 1,
// ADDENDUM-game-core WO-A2T-1) closes that exact gap with
// seedWorldTruthFromSession -- resumeHarness now seeds through the SAME
// function bin.ts's runLoad calls (ADDENDUM-cli-display WO-A2T-5), instead
// of re-deriving its own copy of the eight loaders below.
//
// SEQUENCING (ADDENDUM-COMMON honesty floor + this wave's own addendum):
// game-core lands src/game/world-truth-seed.ts in an isolated worktree this
// domain cannot see. Until the coordinator merges it in, this import is RED
// (module not found) on this worktree's checked-out src/ -- that is the
// CORRECT red per the addendum's own sequencing note ("write the proofs
// against the design doc's contract and mark 'green expected at merge'
// where your worktree cannot run them"), not a bug in this file.
import type { WorldTruthSeedReport } from '../../src/game/world-truth-seed.js';

export type HarnessOptions = {
  /** Options for the fake Claude client. */
  clientOpts?: FakeClientOptions;
  /** Override GameConfig fields. */
  gameOpts?: Partial<GameConfig>;
};

export type GameHarness = {
  session: GameSession;
  callLog: CallLog;
  /** Execute a turn and return the rendered output. */
  play: (input: string) => Promise<string>;
  /** Get the current engine tick. */
  tick: () => number;
  /** Get the number of recorded turns. */
  turnCount: () => number;
  /** Get the last recorded turn's verb. */
  lastVerb: () => string | undefined;
  /**
   * WO-A2T-7: seedWorldTruthFromSession()'s own report ({ seeded, stores }),
   * present only on a resumeHarness() result -- createHarness() builds a
   * fresh world with no 1.x fields to seed from, so it stays undefined
   * there. Lets a test assert seeded:true/false directly instead of
   * inferring it from side effects.
   */
  seedReport?: WorldTruthSeedReport;
  /**
   * WO-A3-7: RumorEngine.deserializeSafe()'s structured warnings when
   * resumeHarness() restored a `rumorEngine` snapshot off a v3 save.
   * Undefined on createHarness() (no snapshot to restore) and on a
   * resumeHarness() call against a save with no `rumorEngine` field (v1/v2
   * -- the engine starts fresh via GameConfig's own default, no snapshot to
   * warn about).
   */
  rumorRestoreWarnings?: RumorRestoreWarning[];
};

/** Wraps a constructed GameSession in the shared GameHarness shape -- the one thing createHarness() and resumeHarness() must never drift apart on. */
function wrapSession(
  session: GameSession,
  callLog: CallLog,
  seedReport?: WorldTruthSeedReport,
  rumorRestoreWarnings?: RumorRestoreWarning[],
): GameHarness {
  return {
    session,
    callLog,
    play: (input: string) => session.processInput(input),
    tick: () => session.engine.tick,
    turnCount: () => session.history.getAll().length,
    lastVerb: () => {
      const turns = session.history.getAll();
      return turns.length > 0 ? turns[turns.length - 1].verb : undefined;
    },
    seedReport,
    rumorRestoreWarnings,
  };
}

export function createHarness(opts: HarnessOptions = {}): GameHarness {
  const callLog = opts.clientOpts?.callLog ?? createCallLog();
  const clientOpts = { ...opts.clientOpts, callLog };
  const client = createFakeClient(clientOpts);
  const engine = createGame();

  const session = new GameSession({
    engine,
    client,
    title: 'Test Game',
    tone: 'dark fantasy',
    genre: 'fantasy',
    // Stitch (wave 8): the pack's item catalog rides the fresh session the
    // way bin.ts runNew hands it over (and resumeHarness already does) --
    // without it no /market or /trade quote can be priced (WO-A5-1 reads
    // GameConfig.itemCatalog). gameOpts overrides still win.
    itemCatalog: fantasyItemCatalog,
    ...opts.gameOpts,
  });

  return wrapSession(session, callLog);
}

/**
 * F-95191273: reconstructs a GameHarness from a save file on disk,
 * mirroring bin.ts's runLoad() reconstruction (src/bin.ts, roughly
 * lines 312-415) -- loadSession() + every loadXFromSession loader + a
 * fresh GameSession with the loaded state copied onto it. This closes the
 * Stage-C gap where no test/** helper could play turns, save, and resume
 * playing against a *second* live GameSession the way a real
 * save-quit-relaunch-resume cycle works.
 *
 * Deliberately scoped to session-state continuity only (option (b) named
 * by the finding this closes, not option (a)): bin.ts is a bare CLI entry
 * point with no exports (`grep -c '^export' src/bin.ts` => 0, the same
 * reason test/helpers/bin-cli-harness.ts's bundled-child-process approach
 * exists), and this "tests" domain cannot edit src/bin.ts to extract a
 * shared reconstruction function. This is therefore a deliberate,
 * documented hand-mirror, NOT a guarantee that bin.ts's own call site
 * stays wired correctly -- that is what
 * test/integration/bin-cli-turn-loop.test.ts's real child-process harness
 * proves, and it must keep doing so.
 *
 * task_3ddb1c06: the restoration gaps this helper originally mirrored
 * faithfully (turn history dropped, campaignStatus not restored, rngState
 * discarded) are FIXED in bin.ts's runLoad() and mirrored as fixed here:
 * the restored TurnHistory, campaignStatus, packId, and the envelope's
 * rngState all flow into the resumed session, exactly as production does.
 *
 * F-966c84ab (wave-2 tests domain, verify-the-stitch): this helper does not
 * call the engine's own `Engine.deserialize()`, so it never runs
 * WorldStore's save-version migration chain or any registered module's
 * migrateState() hook (engine.ts's ENG-009 seam), and it never restores
 * `actionLog`. This is not a gap unique to this helper -- bin.ts's runLoad()
 * documents the identical limitation for the identical reason (src/bin.ts:
 * "Full Engine.deserialize remains blocked"): `PackInfo` (src/character/
 * packs.ts) exposes only `createGame(seed?)`, never the registered module
 * list `Engine.deserialize()`'s `options.modules` needs to run real
 * migrateState() hooks or rebuild the module registry, and Engine's
 * `actionLog` field is private with no setter, so nothing outside the
 * engine can push a restored actionLog onto an engine built any other way.
 * Tests built on resumeHarness() (this file, consecutive-fallbacks.test.ts,
 * conversation-memory.test.ts) do not exercise a module's migrateState()
 * hook or actionLog continuity, and will stay green even if one is missing
 * or broken -- do not rely on them as tripwires for either.
 */
/**
 * WO-A4-10 (slice A4, run swarm-1788288802-f5a0, wave 7, "tests" domain):
 * rebuilds a PACKLESS save's engine via `instantiateWorld(proposal, seed)`
 * -- design doc docs/living-world-slice-a4.md §4 / ADDENDUM-COMMON design
 * lock 5: "runLoad rebuilds a packless world via instantiateWorld then runs
 * the SAME restore sequence as a pack world (validate -> assign state ->
 * initializeNamespaces -> rng -> seedWorldTruth)". This closes the exact
 * gap world-truth-seed.test.ts's file header and save-schema-v3.test.ts's
 * WO-A3-6 fixture test both documented last wave: "generated-world saves
 * have no resume path in this app at all" -- runLoad's own generated
 * branch, and this mirror of it, is what A4 adds.
 *
 * Deliberately a DYNAMIC `import()`, not a static one: `instantiateWorld`
 * does not exist on src/foundry/world-gen.ts on THIS worktree yet --
 * runtime-foundry's own isolated worktree for this wave adds the
 * proposeWorld/instantiateWorld split. A static named import of a
 * not-yet-existing export throws a SyntaxError at MODULE LOAD time for
 * every file that imports this helper (nearly every integration test in
 * this suite, transitively via resumeHarness) -- exactly the blast radius
 * WO-A4-11 ("phase9/parity/driver/seed/v3 proofs stay green") forbids.
 * Accessing a missing property on a dynamically-imported module's
 * namespace object is merely `undefined`, not a throw, so the RED below is
 * confined to whichever test actually exercises a packless-generated
 * resume -- the same isolation discipline `seedWorldTruthFromSession`'s
 * import got last wave (that one was a brand-new file, a cleaner case; this
 * one is an existing file gaining a new export, which is why the static
 * form is unsafe here specifically).
 *
 * ASSUMED CONTRACT (design doc §4 names `instantiateWorld(proposal, seed,
 * logger)` but not its literal return shape): this reads either a bare
 * `Engine` (has a `.world`) or a `{ engine: Engine }` wrapper matching
 * `WorldGenResult`'s existing shape, whichever runtime-foundry's split
 * actually returns -- flagged per the addendum's honesty floor, not
 * silently guessed away. If the real export differs in a way this
 * detection can't handle, the fix is confined to this one function.
 */
async function rebuildGeneratedEngine(savedSession: SavedSession, savePath: string): Promise<Engine> {
  const worldGenProposalRaw = (savedSession as unknown as { worldGenProposal?: string }).worldGenProposal;
  if (!worldGenProposalRaw) {
    // Design lock 5: "a save with neither packId nor worldGenProposal is
    // refused through the existing load presenter (no new copy)" -- this
    // helper has no presenter to route through (same documented limitation
    // as the packId-absent throw below), so it throws directly instead.
    throw new Error(
      `resumeHarness: save at "${savePath}" has no packId and no worldGenProposal -- cannot restore engine.`,
    );
  }

  const worldGenModule = (await import('../../src/foundry/world-gen.js')) as unknown as {
    instantiateWorld?: (proposal: WorldGenProposal, seed?: number) => Engine | { engine: Engine };
  };
  if (typeof worldGenModule.instantiateWorld !== 'function') {
    throw new Error(
      'resumeHarness: src/foundry/world-gen.ts does not export instantiateWorld yet -- ' +
        'runtime-foundry\'s isolated worktree for THIS wave (run swarm-1788288802-f5a0, wave 7, ' +
        'design doc docs/living-world-slice-a4.md §4) adds the proposeWorld/instantiateWorld split. ' +
        'RED per ADDENDUM-COMMON\'s sequencing note, not a bug in this helper -- goes green once ' +
        'the coordinator merges runtime-foundry\'s change in.',
    );
  }

  const proposal = JSON.parse(worldGenProposalRaw) as WorldGenProposal;
  const worldSeed = (savedSession as unknown as { worldSeed?: number }).worldSeed;
  const built = worldGenModule.instantiateWorld(proposal, worldSeed);
  return 'world' in built ? (built as Engine) : (built as { engine: Engine }).engine;
}

export async function resumeHarness(
  savePath: string,
  opts: HarnessOptions = {},
): Promise<GameHarness> {
  const loadResult = await loadSession(savePath);
  const savedSession = loadResult.session;

  let engine: Engine;
  // WO-A4-10: `itemCatalog` below has no equivalent for a packless/generated
  // world (WorldGenProposal carries no item catalog this slice) -- stays
  // `undefined` for that branch, same as every other pack-only optional
  // field this function already treats that way (buildCatalog, below).
  let itemCatalog: ItemCatalog | undefined;
  if (savedSession.packId) {
    const pack = getPackById(savedSession.packId);
    if (!pack) {
      throw new Error(`resumeHarness: unknown pack "${savedSession.packId}".`);
    }
    engine = pack.createGame();
    itemCatalog = pack.itemCatalog;
  } else {
    // WO-A4-10: the packless branch -- see rebuildGeneratedEngine's own doc
    // comment for the full sequencing/contract discussion.
    engine = await rebuildGeneratedEngine(savedSession, savePath);
  }

  const validation = validateEngineState(savedSession.engineState);
  if (!validation.valid) {
    throw new Error(`resumeHarness: save at "${savePath}" has invalid engine state (${validation.error}).`);
  }
  Object.assign(engine.store.state, structuredClone(validation.state));
  // Mirrors bin.ts F-1afba928 (3.9 slice): backfill namespaces for modules
  // the save predates — absent get defaults, present are never touched.
  engine.moduleManager.initializeNamespaces(engine.store);
  // Mirrors bin.ts task_3ddb1c06 (c): restore the seeded RNG stream too.
  // Number.isFinite, not typeof — JSON.parse('1e999') yields Infinity and
  // SeededRNG.setState does no validation (F-fe598c44).
  const envelope = JSON.parse(savedSession.engineState) as { world?: { rngState?: unknown } };
  if (typeof envelope.world?.rngState === 'number' && Number.isFinite(envelope.world.rngState)) {
    engine.store.rng.setState(envelope.world.rngState);
  }

  const profile = loadProfileFromSession(savedSession);
  const restoredJournal = loadChronicleFromSession(savedSession);
  // WO-A2T-7: partyState/arcSnapshot/endgameTriggers/finaleOutline are NOT
  // among the design doc's eleven world-truth VIEW fields (§3's table) --
  // they stay direct session-field restores, unaffected by seeding.
  const restoredParty = loadPartyFromSession(savedSession);
  const restoredArcSnapshot = loadArcSnapshotFromSession(savedSession);
  const restoredEndgameTriggers = loadEndgameTriggersFromSession(savedSession);
  const restoredFinale = loadFinaleFromSession(savedSession);

  // WO-A3-7 (slice A3 §3, design lock 3): restore the RumorEngine from a v3
  // save's `rumorEngine` snapshot the same way bin.ts's runLoad is
  // contracted to -- "restored on load with
  // RumorEngine.deserializeSafe(snapshot, config)", warnings to the debug
  // log/harness result, never the player.
  //
  // SEQUENCING (ADDENDUM-COMMON honesty floor, same shape as WO-A2T-7's
  // world-truth-seed.js gap last wave): `SavedSession` on THIS worktree
  // predates game-core's own isolated worktree adding the
  // `rumorEngine?: string` field (design doc §1) -- `grep -n "rumorEngine"
  // src/session/session.ts` on this tree returns nothing today. Reading it
  // through an inline cast rather than the (not-yet-existing) typed
  // property is deliberate, not a bug: a v1/v2 save (and this worktree's
  // current view of ANY save, until the coordinator merges game-core's
  // change in) simply has no such property, so this resolves to `undefined`
  // exactly like every other optional legacy field on an old save --
  // `restoredRumorEngine` stays `undefined` and GameSession's own
  // constructor default (`config.rumorEngine ?? new RumorEngine(...)`,
  // assumed to mirror the existing `journal` pattern -- see this file's
  // `saveHarness` doc comment for the full assumption) takes over, exactly
  // as it would for a save that genuinely predates this slice.
  const rumorSnapshotRaw = (savedSession as unknown as { rumorEngine?: string }).rumorEngine;
  let restoredRumorEngine: RumorEngine | undefined;
  let rumorRestoreWarnings: RumorRestoreWarning[] | undefined;
  if (rumorSnapshotRaw) {
    const parsed = JSON.parse(rumorSnapshotRaw) as EngineSnapshot;
    const restored = RumorEngine.deserializeSafe(parsed, RUMOR_ENGINE_CONFIG);
    restoredRumorEngine = restored.engine;
    rumorRestoreWarnings = restored.warnings;
  }

  const callLog = opts.clientOpts?.callLog ?? createCallLog();
  const clientOpts = { ...opts.clientOpts, callLog };
  const client = createFakeClient(clientOpts);

  // GameConfig doesn't declare `rumorEngine` on this worktree yet (same
  // cross-domain gap as the snapshot read above) -- the widened local type
  // lets this helper pass it through today without an `any` escape hatch,
  // and costs nothing once game-core's own worktree lands the real field
  // (a structural superset of GameConfig is still assignable to it).
  // WO-A4-10: a packless/generated save carries `worldGenProposal`/
  // `worldSeed` (widened cast -- see rebuildGeneratedEngine's own doc
  // comment for why these aren't typed on SavedSession here yet). Threaded
  // back onto the RESUMED session's own config so a second save/resume
  // cycle carries them forward too (design lock 5's "resumes like a pack
  // world" implies indefinitely, not just once) -- absent entirely for a
  // pack session, matching every other optional field's "omit if absent"
  // convention.
  // Stitch (wave 7): SavedSession carries the proposal as a JSON string;
  // GameConfig wants the parsed WorldGenProposal (game-core's contract).
  const resumedProposal: WorldGenProposal | undefined =
    savedSession.worldGenProposal !== undefined
      ? (JSON.parse(savedSession.worldGenProposal) as WorldGenProposal)
      : undefined;

  const gameConfig: GameConfig = {
    engine,
    client,
    tone: savedSession.tone,
    title: savedSession.characterName ?? 'Test Game',
    worldPrompt: savedSession.worldPrompt,
    profile: profile ?? undefined,
    itemCatalog,
    genre: savedSession.genre ?? 'fantasy',
    journal: restoredJournal,
    // task_3ddb1c06 (a)+(b): mirrored as fixed — see bin.ts runLoad().
    history: TurnHistory.fromJSON(savedSession.turnHistory),
    packId: savedSession.packId,
    campaignStatus: savedSession.campaignStatus ?? 'active',
    // Coordinator stitch (wave 18): mirror bin.ts's conversation-memory
    // restoration (F-462792bb, Director ruling: persisted).
    npcConversations: loadNpcConversationsFromSession(savedSession),
    // Coordinator stitch (slice A3): GameSession restores the RumorEngine from
    // the serialized snapshot itself (GameConfig.rumorEngineSnapshot); the
    // deserializeSafe above runs only to expose restore warnings to tests.
    ...(rumorSnapshotRaw ? { rumorEngineSnapshot: rumorSnapshotRaw } : {}),
    // WO-A5-5 (stitched at wave 8): mirrors bin.ts runLoad.
    ...(savedSession.worldMoved ? { worldMoved: loadWorldMovedFromSession(savedSession) } : {}),
    ...(resumedProposal !== undefined ? { worldGenProposal: resumedProposal } : {}),
    ...(savedSession.worldSeed !== undefined ? { worldSeed: savedSession.worldSeed } : {}),
    ...opts.gameOpts,
  };
  const session = new GameSession(gameConfig);

  // WO-A2T-7: the eleven world-truth VIEW fields (design doc §3 --
  // activePressures/resolvedPressures/activeOpportunities/
  // resolvedOpportunities/lastNpcActions/lastNpcProfiles/npcObligations/
  // activeConsequenceChains/lastFactionActions/lastFactionProfiles/
  // districtEconomies/playerRumors) are no longer restored by direct
  // field assignment here -- that was only ever correct until the NEXT
  // round's refreshWorldViews() call reset them from (empty) world truth,
  // per game-core's wave-4 finding "A2-truth-resumeHarness-field-writes".
  // seedWorldTruthFromSession writes each 1.x field into its
  // world.modules namespace (idempotent via the
  // `claude_rpg.stores_seeded` marker) and refreshes the session's views
  // from that namespace, exactly like bin.ts's runLoad() call site
  // (ADDENDUM-cli-display WO-A2T-5) -- mirroring production's ONE seed
  // path instead of this helper re-deriving its own.
  const seedReport = session.seedWorldTruth(savedSession);

  // Fields NOT covered by the design doc's view table stay direct restores.
  // Stitch (wave 7): partyState is a live getter over companion-core (A4);
  // the restore writes the module namespace, matching bin.ts runLoad.
  setPartyState(session.engine.world, restoredParty);
  if (restoredArcSnapshot) session.arcSnapshot = restoredArcSnapshot;
  session.endgameTriggers = restoredEndgameTriggers;
  if (restoredFinale) session.finaleOutline = restoredFinale;

  return wrapSession(session, callLog, seedReport, rumorRestoreWarnings);
}

/**
 * WO-A3-7 (slice A3, run swarm-1788288802-f5a0, wave 6, "tests" domain):
 * saves a harness's live session through the REAL production `saveSession()`
 * (never a hand-rolled JSON.stringify -- the whole point of "full-fidelity"
 * round trips is exercising the actual write path), to `savePath`.
 *
 * Field selection mirrors bin.ts's `buildSaveInput` (src/bin.ts, current
 * worktree state) MINUS the ten legacy world-truth fields design lock 2
 * retires this slice (`playerRumors`, `activePressures`, `resolvedPressures`,
 * `npcAgencySnapshot`'s two source arrays, `npcObligations`,
 * `consequenceChains`, `partyState`, `districtEconomies`,
 * `activeOpportunities`, `leverageSnapshot` -- the last has no
 * SaveSessionInput field to begin with, it's derived from `profile` inside
 * saveSession() itself) PLUS `rumorEngine` (design lock 3).
 * `resolvedOpportunities` stays (design lock 2: session history, not world
 * truth).
 *
 * SEQUENCING: `SaveSessionInput` on this worktree still declares (and
 * saveSession() still writes) the ten legacy fields -- game-core's own
 * isolated worktree is the one that deletes them (design doc §2: "a compile
 * error is the tripwire for any caller still passing them"). This function
 * deliberately does NOT pass them (matching what the type will require
 * post-merge), which means the CURRENT saveSession() implementation writes
 * a schema v2 save missing nine of its normal optional fields until the
 * coordinator merges game-core's change in -- the correct, forward-looking
 * red for this wave's contract, not a bug in this helper. `rumorEngine` is
 * passed as the live `RumorEngine` instance (mirrors the existing `journal`
 * field's already-constructed-object convention, never a pre-serialized
 * string) through the same widened-type pattern resumeHarness() uses above,
 * since SaveSessionInput doesn't declare it here yet either.
 */
export async function saveHarness(h: GameHarness, savePath: string): Promise<void> {
  const session = h.session;
  // WO-A4-10 (slice A4 §4, design lock 5): `worldGenProposal`/`worldSeed`
  // aren't declared on `GameSession`/`SaveSessionInput` on this worktree yet
  // (game-core's own isolated worktree adds them this wave -- "written by
  // saveSession when the session has no packId"). Read through the same
  // widened-cast pattern this file already uses for the rumorEngine
  // snapshot: on THIS worktree a pack session and a createGeneratedHarness()
  // session read back identically as `undefined` here, so the object-spread
  // below is a no-op today and both fields are simply absent from every
  // save this helper writes -- the correct red for a packless-generated
  // save/resume round trip until the coordinator merges game-core's change
  // in, not a bug in this helper.
  const input: SaveSessionInput = {
    engine: session.engine,
    history: session.history,
    tone: session.tone,
    savePath,
    worldPrompt: session.worldPrompt,
    profile: session.profile,
    packId: session.packId,
    npcConversations: session.npcConversations,
    genre: session.genre,
    journal: session.journal,
    resolvedOpportunities: session.resolvedOpportunities,
    arcSnapshot: session.arcSnapshot,
    endgameTriggers: session.endgameTriggers,
    finaleOutline: session.finaleOutline,
    campaignStatus: session.campaignStatus,
    // Coordinator stitch (slice A3): the save carries the serialized snapshot,
    // exactly as bin.ts's buildSaveInput does.
    rumorEngine: session.getRumorEngineSnapshot(),
    ...(session.getWorldGenProposal() !== undefined ? { worldGenProposal: session.getWorldGenProposal() } : {}),
    ...(session.getWorldSeed() !== undefined ? { worldSeed: session.getWorldSeed() } : {}),
  };
  await saveSession(input as SaveSessionInput);
}

/**
 * WO-A4-10 (slice A4, run swarm-1788288802-f5a0, wave 7, "tests" domain):
 * builds a GameHarness the same way bin.ts's `runNew()` does for a
 * generated (packless) world -- `generateWorld()` with a fake client
 * returning `opts.proposal`, then a `GameSession` constructed directly over
 * the resulting engine, with `worldGenProposal`/`worldSeed` threaded onto
 * `GameConfig` so a later `saveHarness()`/`resumeHarness()` round trip
 * exercises the SAME packless-generated resume path bin.ts's `runLoad` is
 * contracted to (design lock 5: "runNew passes the proposal + seed into the
 * session so the first save carries them").
 *
 * SEQUENCING: `GameConfig.worldGenProposal`/`worldSeed` are not declared on
 * this worktree's src/game.ts yet (game-core's own isolated worktree adds
 * them this wave, mirroring the existing `rumorEngineSnapshot` convention)
 * -- passed through the same widened-cast pattern as that field. Until the
 * coordinator merges game-core's change in, `GameSession`'s constructor
 * simply never reads these two extra keys (structural typing lets the
 * widened object through harmlessly), so `session.worldGenProposal`/
 * `worldSeed` read back as `undefined` on THIS worktree -- the correct red
 * for generated-world-resume.test.ts's own proof, not a bug in this helper.
 */
export async function createGeneratedHarness(
  proposal: WorldGenProposal,
  opts: HarnessOptions & { worldPrompt?: string; seed?: number } = {},
): Promise<GameHarness> {
  const callLog = opts.clientOpts?.callLog ?? createCallLog();
  const clientOpts = { ...opts.clientOpts, callLog };

  const genClient = createFakeClient({ ...clientOpts, structuredData: proposal });
  const result = await generateWorld(genClient, opts.worldPrompt ?? 'a generated-world-resume fixture world', opts.seed);
  if (!result.ok || !result.engine) {
    throw new Error(`createGeneratedHarness: generateWorld failed: ${result.errors.join('; ')}`);
  }

  const playClient = createFakeClient(clientOpts);
  // Stitch (wave 7): GameConfig.worldGenProposal is the parsed object; the
  // save writer (session.ts) is the single JSON.stringify site. Passing a
  // pre-stringified proposal here double-encoded it on save.
  const gameConfig: GameConfig = {
    engine: result.engine,
    client: playClient,
    title: proposal.title,
    tone: result.tone,
    genre: proposal.genre ?? 'fantasy',
    worldGenProposal: result.proposal ?? proposal,
    worldSeed: opts.seed,
    ...opts.gameOpts,
  };
  const session = new GameSession(gameConfig);

  return wrapSession(session, callLog);
}
