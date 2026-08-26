// Test harness for creating GameSession instances with fake Claude clients.
// Provides a quick way to set up a game, execute turns, and inspect state.

import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { GameSession, type GameConfig } from '../../src/game.js';
import { createFakeClient, createCallLog, type FakeClientOptions, type CallLog } from './fake-claude-client.js';
import {
  loadSession,
  loadProfileFromSession,
  loadRumorsFromSession,
  loadPressuresFromSession,
  loadResolvedPressuresFromSession,
  loadChronicleFromSession,
  loadNpcAgencyFromSession,
  loadObligationsFromSession,
  loadNpcConversationsFromSession,
  loadConsequenceChainsFromSession,
  loadPartyFromSession,
  loadEconomiesFromSession,
  loadOpportunitiesFromSession,
  loadResolvedOpportunitiesFromSession,
  loadArcSnapshotFromSession,
  loadEndgameTriggersFromSession,
  loadFinaleFromSession,
} from '../../src/session/session.js';
import { getPackById } from '../../src/character/packs.js';
import { validateEngineState } from '../../src/cli/engine-state-validator.js';
import { TurnHistory } from '../../src/session/history.js';

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
};

/** Wraps a constructed GameSession in the shared GameHarness shape -- the one thing createHarness() and resumeHarness() must never drift apart on. */
function wrapSession(session: GameSession, callLog: CallLog): GameHarness {
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
 */
export async function resumeHarness(
  savePath: string,
  opts: HarnessOptions = {},
): Promise<GameHarness> {
  const loadResult = await loadSession(savePath);
  const savedSession = loadResult.session;

  if (!savedSession.packId) {
    throw new Error(`resumeHarness: save at "${savePath}" has no packId -- cannot restore engine.`);
  }
  const pack = getPackById(savedSession.packId);
  if (!pack) {
    throw new Error(`resumeHarness: unknown pack "${savedSession.packId}".`);
  }

  const engine = pack.createGame();
  const validation = validateEngineState(savedSession.engineState);
  if (!validation.valid) {
    throw new Error(`resumeHarness: save at "${savePath}" has invalid engine state (${validation.error}).`);
  }
  Object.assign(engine.store.state, structuredClone(validation.state));
  // Mirrors bin.ts task_3ddb1c06 (c): restore the seeded RNG stream too.
  const envelope = JSON.parse(savedSession.engineState) as { world?: { rngState?: unknown } };
  if (typeof envelope.world?.rngState === 'number') {
    engine.store.rng.setState(envelope.world.rngState);
  }

  const profile = loadProfileFromSession(savedSession);
  const restoredRumors = loadRumorsFromSession(savedSession);
  const restoredPressures = loadPressuresFromSession(savedSession);
  const restoredResolved = loadResolvedPressuresFromSession(savedSession);
  const restoredJournal = loadChronicleFromSession(savedSession);
  const restoredNpcAgency = loadNpcAgencyFromSession(savedSession);
  const restoredObligations = loadObligationsFromSession(savedSession);
  const restoredChains = loadConsequenceChainsFromSession(savedSession);
  const restoredParty = loadPartyFromSession(savedSession);
  const restoredEconomies = loadEconomiesFromSession(savedSession);
  const restoredOpportunities = loadOpportunitiesFromSession(savedSession);
  const restoredResolvedOpps = loadResolvedOpportunitiesFromSession(savedSession);
  const restoredArcSnapshot = loadArcSnapshotFromSession(savedSession);
  const restoredEndgameTriggers = loadEndgameTriggersFromSession(savedSession);
  const restoredFinale = loadFinaleFromSession(savedSession);

  const callLog = opts.clientOpts?.callLog ?? createCallLog();
  const clientOpts = { ...opts.clientOpts, callLog };
  const client = createFakeClient(clientOpts);

  const session = new GameSession({
    engine,
    client,
    tone: savedSession.tone,
    title: savedSession.characterName ?? 'Test Game',
    worldPrompt: savedSession.worldPrompt,
    profile: profile ?? undefined,
    itemCatalog: pack.itemCatalog,
    genre: savedSession.genre ?? 'fantasy',
    journal: restoredJournal,
    // task_3ddb1c06 (a)+(b): mirrored as fixed — see bin.ts runLoad().
    history: TurnHistory.fromJSON(savedSession.turnHistory),
    packId: savedSession.packId,
    campaignStatus: savedSession.campaignStatus ?? 'active',
    // Coordinator stitch (wave 18): mirror bin.ts's conversation-memory
    // restoration (F-462792bb, Director ruling: persisted).
    npcConversations: loadNpcConversationsFromSession(savedSession),
    ...opts.gameOpts,
  });

  // Mirrors bin.ts's runLoad() post-construction restoration exactly
  // (src/bin.ts, "Restore rumors, pressures, and fallout history into
  // session").
  session.playerRumors = restoredRumors;
  session.activePressures = restoredPressures;
  session.resolvedPressures = restoredResolved;
  session.lastNpcProfiles = restoredNpcAgency.profiles;
  session.lastNpcActions = restoredNpcAgency.actions;
  session.npcObligations = restoredObligations;
  session.activeConsequenceChains = restoredChains;
  session.partyState = restoredParty;
  if (restoredEconomies.size > 0) session.districtEconomies = restoredEconomies;
  session.activeOpportunities = restoredOpportunities;
  session.resolvedOpportunities = restoredResolvedOpps;
  if (restoredArcSnapshot) session.arcSnapshot = restoredArcSnapshot;
  session.endgameTriggers = restoredEndgameTriggers;
  if (restoredFinale) session.finaleOutline = restoredFinale;

  return wrapSession(session, callLog);
}
