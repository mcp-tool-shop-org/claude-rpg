#!/usr/bin/env node

// CLI entry point for claude-rpg
// v0.4: social consequence — reputation, stance, title evolution, session deltas
// v0.5: rumor ecology — player legend propagation + persistence
// v0.6: emergent pressure — world-generated threats + persistence
// v0.7: resolution & fallout — pressures resolve with structured consequences

import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version: pkgVersion } = require('../package.json') as { version: string };
import { GameSession, type GameConfig } from './game.js';
import type { McpToolCall } from './runtime/audio-bridge.js';
import { createAdaptedClient } from './llm/claude-adapter.js';
import { generateWorld, type WorldGenResult } from './foundry/world-gen.js';
import {
  saveSession,
  type SaveSessionInput,
  loadSession,
  loadProfileFromSession,
  loadRumorsFromSession,
  loadPressuresFromSession,
  loadResolvedPressuresFromSession,
  loadChronicleFromSession,
  loadNpcAgencyFromSession,
  loadObligationsFromSession,
  loadConsequenceChainsFromSession,
  loadPartyFromSession,
  loadEconomiesFromSession,
  loadOpportunitiesFromSession,
  loadResolvedOpportunitiesFromSession,
  loadArcSnapshotFromSession,
  loadEndgameTriggersFromSession,
  loadFinaleFromSession,
  loadNpcConversationsFromSession,
  listSaves,
  listArchivedCampaigns,
  getSavePath,
  getDefaultSaveDir,
} from './session/session.js';
import { renderArchiveBrowser } from './display/archive-browser.js';
import { presentError, renderError, type ErrorPresentation } from './cli/error-presenter.js';
import { slashCompleter } from './cli/slash-completer.js';
import { createSpinner, formatRetryLabel, type Spinner } from './cli/spinner.js';
import { createStreamPresenter } from './cli/stream-presenter.js';
import { renderPresentationCues, insertCuesBeforePrompt } from './cli/presentation-renderer.js';
import { validateEngineState } from './cli/engine-state-validator.js';
import { parseSaveSelection, formatSaveSelectionPrompt, formatInvalidSelectionMessage } from './cli/save-selection.js';
import {
  formatSaveDetails, formatSaveSlotPrefix, formatSaveSlotIndent,
  SAVE_LISTING_CAP, formatOlderSavesFooter,
} from './cli/save-listing.js';
import { isPathInside } from './cli/path-guard.js';
import { attemptExitAutosave } from './cli/exit-autosave.js';
import { renderUsage } from './cli/usage.js';
import { parseWorldFlag, formatValidWorlds } from './cli/world-flag.js';
import { getTerminalWidth } from './display/play-renderer.js';
import { bold, dim, red, yellow } from './cli/colors.js';
import { TurnHistory } from './session/history.js';
import { buildCharacter } from './character/builder.js';
import { getPackById, type PackInfo } from './character/packs.js';
import { renderCharacterSheet } from './character/sheet.js';
import { renderRecap } from './character/recap.js';
import {
  captureSnapshot,
  computeSessionDelta,
  type SessionSnapshot,
} from './character/recap-delta.js';
import {
  captureWorldSnapshot,
  computeWorldDelta,
  type WorldSnapshot,
} from './character/world-delta.js';
import {
  computeFactionDeltas,
  computeRumorDelta,
  deriveWhatPeopleAreSaying,
  computeDistrictDeltas,
  computeCompanionRecapEntries,
  computeItemRecapEntries,
  computeEconomyRecapEntries,
  computeCraftingRecapEntries,
  computeCraftingRecapFromJournal,
  computeOpportunityRecapEntries,
  renderFullRecap,
  type ArcRecapData,
} from './character/session-recap.js';
import type { ItemChronicleEntry } from '@ai-rpg-engine/equipment';
import type { PartyState, DistrictEconomy, OpportunityState, OpportunityFallout, ArcSnapshot, EndgameTrigger } from '@ai-rpg-engine/modules';
import type { FinaleOutline } from '@ai-rpg-engine/campaign-memory';
import {
  computeNpcRecapEntries,
  getAllDistrictIds,
  getDistrictState,
  getDistrictDefinition,
  computeDistrictMood,
} from '@ai-rpg-engine/modules';

/** Build a SaveSessionInput from a GameSession + save path. */
function buildSaveInput(session: GameSession, savePath: string, packId?: string): SaveSessionInput {
  return {
    engine: session.engine,
    history: session.history,
    tone: session.tone,
    savePath,
    worldPrompt: session.worldPrompt,
    profile: session.profile,
    packId,
    // Conversation memory (coordinator brief item 4c, wave-18/cli-display.md,
    // director ruling R4: conversation memory IS PERSISTED): every
    // saveSession call site in this file funnels through this one function,
    // so this single edit covers all of them (the SIGINT autosave, the
    // stdin-closed autosave, and the in-game "save" command).
    npcConversations: session.npcConversations,
    playerRumors: session.playerRumors,
    activePressures: session.activePressures,
    genre: session.genre,
    resolvedPressures: session.resolvedPressures,
    journal: session.journal,
    npcProfiles: session.lastNpcProfiles,
    npcActions: session.lastNpcActions,
    npcObligations: session.npcObligations,
    consequenceChains: session.activeConsequenceChains,
    partyState: session.partyState,
    districtEconomies: session.districtEconomies,
    activeOpportunities: session.activeOpportunities,
    resolvedOpportunities: session.resolvedOpportunities,
    arcSnapshot: session.arcSnapshot,
    endgameTriggers: session.endgameTriggers,
    finaleOutline: session.finaleOutline,
    campaignStatus: session.campaignStatus,
  };
}

/**
 * F-4997779f: PFE-002's graceful SIGINT contract ("first Ctrl+C saves,
 * second force-exits") is only registered once runGameLoop() starts --
 * well after runNew()'s generateWorld() call (the largest LLM token budget
 * anywhere in this app) and runPlay's buildCharacter() flow have already
 * run. A player who Ctrl+C's during world generation or character creation
 * previously got Node's raw default SIGINT disposition (immediate
 * termination, exit 130, no "Farewell." message) instead of the
 * considerate exit the rest of the app markets. Neither pre-gameplay
 * window has session data to protect yet, so this is deliberately lighter
 * than PFE-002's save-then-exit dance: a single Ctrl+C here just prints
 * the same farewell and exits cleanly (exit 0, matching every other
 * graceful exit path in this file).
 *
 * Callers MUST invoke the returned disposer immediately before handing off
 * to runGameLoop (which installs its own permanent SIGINT handler), so the
 * two never both fire for the same keypress.
 */
function installEarlySigintGuard(): () => void {
  const handler = (): void => {
    console.log('\n  Farewell.\n');
    process.exit(0);
  };
  process.on('SIGINT', handler);
  return () => {
    process.removeListener('SIGINT', handler);
  };
}

/**
 * Promisified readline question helper (avoids recursive callbacks growing
 * the stack). PFE-001: rejects on 'close' (Ctrl+D / pipe EOF) so a caller
 * awaiting an answer doesn't hang forever if stdin closes before one
 * arrives. Hoisted to module scope (F-e3f935ec) so both runGameLoop's
 * per-turn prompt and runLoad's save-selection prompt share the one PFE-001
 * guard instead of runLoad bypassing it via its own raw, close-unaware
 * `new Promise<string>((resolve) => { rl.question(...) })`.
 */
function question(rlInst: ReturnType<typeof createInterface>, promptText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    rlInst.question(promptText, resolve);
    rlInst.once('close', () => reject(new Error('__STDIN_CLOSED__')));
  });
}

let debugMode = false;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  debugMode = args.includes('--debug');

  // Catch unhandled rejections from fire-and-forget callback chains (e.g. rl.question)
  // that escape the main() promise chain. Routes through presentError so users never
  // see raw stack traces.
  //
  // F-cdbe6d09: this used to call presentError(...) then unconditionally
  // process.exit(1), discarding presentError's own returned exit code --
  // the only call site in this file that discarded it outright (the
  // opening-narration handler below correctly does
  // `process.exit(exitCode ?? 1)`). Now matches that pattern; combined with
  // classifyForPresentation's 'startup' fatal branch (error-presenter.ts),
  // the rendered copy and the actual exit agree. This handler stays
  // registered for the entire process lifetime, not just true startup, so
  // any promise that escapes the main chain later during actual gameplay
  // hits this same path.
  process.on('unhandledRejection', (reason: unknown) => {
    const exitCode = presentError(reason, 'startup', debugMode);
    process.exit(exitCode ?? 1);
  });

  const filteredArgs = args.filter((a) => a !== '--debug');

  if (filteredArgs.includes('--version') || filteredArgs.includes('-v')) {
    console.log(`claude-rpg v${pkgVersion}`);
    process.exit(0);
  }

  if (filteredArgs.length === 0 || filteredArgs.includes('--help') || filteredArgs.includes('-h')) {
    console.log(renderUsage());
    process.exit(0);
  }

  const command = filteredArgs[0];

  // F-f51578f1: 'archive' (runArchive -> listArchivedCampaigns +
  // renderArchiveBrowser) only reads saved/archived campaign files from
  // disk and renders them -- it makes no LLM calls at all. Dispatches here,
  // before the ANTHROPIC_API_KEY gate below, the same way --version/--help
  // already bypass that gate above. usage.ts's own --help text documents
  // 'claude-rpg archive' as a peer of --version/--help for exactly this
  // reason -- a user who just wants to browse completed campaigns shouldn't
  // be blocked by a key requirement that command never uses.
  if (command === 'archive') {
    await runArchive();
    return;
  }

  // Check for API key
  // F-34e44560: the old two-line message ('Set it with: export
  // ANTHROPIC_API_KEY=...') gave a shell-specific, non-persistent command
  // with no link to get a key and no one-time-vs-per-play distinction -- a
  // player following it literally hits the same error again in a fresh
  // terminal window.
  if (!process.env.ANTHROPIC_API_KEY) {
    // F-f6983775: error-presenter.ts's own header comment says it is
    // "Central CLI error rendering. All user-visible error output routes
    // through this module" -- but this is plausibly the single most common
    // first-run experience for anyone installing this CLI before
    // configuring their key, and it bypassed that pipeline entirely with 4
    // bare, uncolored console.error() lines. Now routed through the same
    // renderError() every in-game error branch uses.
    const presentation: ErrorPresentation = {
      headline: 'ANTHROPIC_API_KEY required',
      explanation: 'ANTHROPIC_API_KEY environment variable is required to narrate gameplay.',
      preserved: 'No session was started.',
      nextAction: 'Get your API key at https://console.anthropic.com, then add it permanently to your shell profile -- e.g. on macOS/Linux: echo "export ANTHROPIC_API_KEY=your-key-here" >> ~/.bashrc (or ~/.zshrc on macOS). Restart your terminal, then run claude-rpg again.',
      exitCode: 1,
    };
    process.stderr.write(renderError(presentation, debugMode));
    process.exit(1);
  }

  // PFE-006: Command dispatch is an if/else chain. If more commands are added,
  // consider extracting to a command registry map (e.g. Record<string, (args) => Promise<void>>).
  if (command === 'play') {
    await runPlay(filteredArgs.slice(1));
  } else if (command === 'load') {
    await runLoad();
  } else if (command === 'new') {
    const raw = filteredArgs.slice(1).join(' ');
    // Strip matching quote pairs only (e.g. "foo" or 'foo', not "foo')
    let prompt = raw;
    if (raw.length >= 2) {
      const first = raw[0];
      const last = raw[raw.length - 1];
      if ((first === '"' || first === "'") && first === last) {
        prompt = raw.slice(1, -1);
      }
    }
    if (!prompt) {
      // F-f6983775: see the ANTHROPIC_API_KEY branch above -- same bypass,
      // same fix.
      const presentation: ErrorPresentation = {
        headline: 'World prompt required',
        explanation: 'claude-rpg new needs a prompt describing the world to generate.',
        preserved: 'No session was started.',
        nextAction: 'Example: claude-rpg new "A flooded gothic trade city ruled by debt-priests"',
        exitCode: 1,
      };
      process.stderr.write(renderError(presentation, debugMode));
      process.exit(1);
    }
    await runNew(prompt);
  } else {
    // F-f6983775: this headline sat immediately above the fully-boxed,
    // styled renderUsage() output with zero color of its own -- red()
    // matches error-presenter.ts's fatal-headline palette (process.exit(1)
    // follows, same as every other fatal branch in this file). Full
    // classifyForPresentation()/renderError() integration doesn't fit here
    // (this isn't a caught exception, and the full usage screen that
    // immediately follows already IS the "next action"), so this is the
    // addendum's documented minimum: red() on the headline.
    console.error(red(`Unknown command: ${command}`));
    console.log(renderUsage());
    process.exit(1);
  }
}

async function runPlay(args: string[]): Promise<void> {
  // F-7862c05d: --world <name> resolved fully pre-interactive (before
  // buildCharacter/readline start), matching this file's own top-of-main()
  // convention for --version/--help/missing-API-key. Director ruling R1
  // (wave-18/cli-display.md coordinator brief): an unknown --world is a
  // structured error + exit 1 -- never a silent fall-through to the
  // interactive world-selection menu.
  const { packInfo, errorMessage } = parseWorldFlag(args);
  if (errorMessage) {
    const presentation: ErrorPresentation = {
      headline: 'Unknown world',
      explanation: errorMessage,
      preserved: 'No session was started.',
      nextAction: `Valid worlds: ${formatValidWorlds()}`,
      exitCode: 1,
    };
    process.stderr.write(renderError(presentation, debugMode));
    process.exit(1);
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: slashCompleter,
    historySize: 100,
  });

  // F-4997779f: covers Ctrl+C for the entire pre-gameplay window (character
  // creation below, plus the synchronous session setup that follows it) --
  // disposed right before runGameLoop hands off to its own permanent
  // SIGINT handler.
  const disposeEarlySigintGuard = installEarlySigintGuard();

  // Character creation flow (includes pack selection). Director ruling R2:
  // a --world selection stays LOCKED through the character retry loop --
  // packInfo is a function-scope parameter builder.ts's own retry loop
  // can't reopen (see world-flag.ts's doc comment / builder.ts's
  // presetPack, narrative-llm's half).
  const result = await buildCharacter(rl, packInfo);
  const engine = result.pack.createGame();

  const fastMode = args.includes('--fast');
  const presentationBox: PresentationBox = { calls: [] };
  const streamBox: StreamBox = { current: null };
  // F-d890d23d: spinnerBox + onRetry wiring -- see the SpinnerBox doc
  // comment below for the race-safety argument. Threaded through the
  // EXISTING GameConfig.client field (bypasses createAdaptedClient's own
  // default construction inside GameSession's constructor).
  const spinnerBox: SpinnerBox = { current: null };
  const client = createAdaptedClient(undefined, {
    onRetry: (info) => spinnerBox.current?.setLabel(formatRetryLabel('thinking', info)),
  });
  const session = new GameSession(withStreamingHook(withPresentationHook({
    engine,
    client,
    title: result.pack.meta.name,
    tone: result.pack.meta.narratorTone,
    profile: result.profile,
    itemCatalog: result.pack.itemCatalog,
    buildCatalog: result.pack.buildCatalog,
    genre: result.pack.meta.genres[0] ?? 'fantasy',
    packId: result.pack.meta.id,
    fastMode,
  }, (calls) => { presentationBox.calls = calls; }), streamBox));

  const snapshot = captureSnapshot(result.profile);
  const worldSnap = captureWorldSnapshot(
    session.activePressures, session.playerRumors, session.resolvedPressures,
  );
  const districtMoods = captureDistrictMoods(session);
  const initialParty = structuredClone(session.partyState);
  const initialItemChronicle = structuredClone(result.profile.itemChronicle);
  const initialEconomies = cloneEconomies(session.districtEconomies);
  const initialCustom = structuredClone(result.profile.custom);
  const initialOpportunities = structuredClone(session.activeOpportunities);
  disposeEarlySigintGuard();
  await runGameLoop({
    session, rl, packId: result.pack.meta.id, presentationBox, streamBox, spinnerBox,
    initialSnapshot: snapshot, initialWorldSnapshot: worldSnap, initialDistrictMoods: districtMoods,
    initialPartyState: initialParty, initialItemChronicle, initialEconomies,
    initialCustom, initialOpportunities,
  });
}

// F-135957de: matches every divider-producing helper elsewhere in this
// domain (play-renderer.ts's makeDivider(), director-renderer.ts's
// divider(), status-compact.ts's divider(), usage.ts's rule) -- dim()-wrapped
// and tracking the real terminal width (PFE-005), used to give runLoad's
// save listing the same divider()+bold() header treatment
// renderArchiveBrowser/renderDirectorHelp/renderPlayHelp already use.
function divider(): string {
  return dim('─'.repeat(getTerminalWidth()));
}

async function runLoad(): Promise<void> {
  const saves = await listSaves();
  if (saves.length === 0) {
    // F-46026cfc: matches archive-browser.ts's renderArchiveBrowser() empty
    // state, which orients the player with a concrete next step instead of
    // just naming what's missing.
    // One atomic write, not two: a console.log immediately before
    // process.exit can be lost in the exit flush race (observed
    // intermittently in the spawned-CLI suite — and a player piping output
    // would lose the guidance line the same way).
    console.log('\n  No saved games found.\n  Run `claude-rpg play` to start a new game, or `claude-rpg new "<prompt>"` to generate one.\n');
    process.exit(0);
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: slashCompleter,
    historySize: 100,
  });

  // F-4997779f: covers Ctrl+C for the save-selection prompt below and the
  // rest of this pre-gameplay window -- disposed right before runGameLoop
  // hands off to its own permanent SIGINT handler.
  const disposeEarlySigintGuard = installEarlySigintGuard();

  // F-135957de: this was the entire /load screen -- arguably the
  // most-used returning-player entry point in the app -- built from raw,
  // uncolored console.log calls with no framing, unlike its functionally
  // parallel sibling archive-browser.ts's renderArchiveBrowser (boxed
  // between two divider() calls with a title).
  console.log('');
  console.log(divider());
  console.log(`  ${bold('SAVED GAMES')}`);
  console.log(divider());
  console.log('');
  // F-df387f5b: cap the printed/selectable listing to the most recent
  // SAVE_LISTING_CAP entries instead of every save ever written -- every
  // save action in this app names its file with a fresh Date.now() suffix
  // (saves are never overwritten, only added), so a long campaign
  // realistically accumulates dozens-to-hundreds of entries with no
  // cleanup path anywhere in this domain. listSaves() (session/session.ts)
  // already returns entries newest-first, so this is exactly "most recent
  // N" with no extra sort needed here. Selection below indexes into this
  // same capped array (not the full `saves`), so the printed numbers and
  // the selectable range always agree.
  const visibleSaves = saves.slice(0, SAVE_LISTING_CAP);
  for (let i = 0; i < visibleSaves.length; i++) {
    const s = visibleSaves[i];
    const identity = s.characterName
      ? `${s.characterName}${s.characterTitle ? `, "${s.characterTitle}"` : ''} (Lv${s.characterLevel ?? '?'})`
      : 'Unknown character';
    const date = new Date(s.savedAt).toLocaleDateString();
    console.log(`${formatSaveSlotPrefix(i)}${identity} — ${date}`);
    // Enhanced details
    const details = formatSaveDetails(s);
    if (details.length > 0) {
      // F-01e3acfc: indent tracks formatSaveSlotPrefix's own width (7
      // columns for slots 1-9, 8 once a 10th save exists) instead of a
      // hardcoded 7-space literal, so this nests under the identity text
      // above it regardless of how many digits the entry number has.
      // F-135957de: dim() subordinates this detail line under the identity
      // line above it, matching every other secondary-text treatment in
      // this domain (ambient lines, presentation cue lines).
      console.log(dim(`${formatSaveSlotIndent(i)}${details.join(' | ')}`));
    }
  }
  const olderSavesFooter = formatOlderSavesFooter(saves.length - visibleSaves.length);
  if (olderSavesFooter) console.log(olderSavesFooter);
  console.log('');

  // F-d01d16f6: a typo'd/out-of-range number, an empty Enter-press, or stray
  // text used to hard-exit the whole process (process.exit(1)) instead of
  // re-prompting -- the one interactive moment in the CLI that terminated
  // the session on ordinary human fumbling. Now re-asks with a live range
  // hint, matching every other invalid-input moment in the CLI (an
  // unrecognized in-game verb, an unknown /help topic) that responds and
  // keeps the session alive.
  let idx: number | null = null;
  while (idx === null) {
    // F-e3f935ec: previously a raw `new Promise<string>((resolve) => {
    // rl.question(...) })` with no 'close'-event listener, unlike the
    // shared question() helper (PFE-001) used below/in runGameLoop -- if
    // stdin closed (Ctrl+D, or piped/redirected input running out) while at
    // this prompt, that Promise never resolved or rejected and the process
    // hung indefinitely with no error and no exit code.
    let answer: string;
    try {
      answer = await question(rl, formatSaveSelectionPrompt(visibleSaves.length));
    } catch (err) {
      if (err instanceof Error && err.message === '__STDIN_CLOSED__') {
        // No session exists yet at this point (still choosing a save), so
        // there is nothing to autosave -- just exit cleanly, mirroring
        // this same loop's existing 'cancel' branch below.
        console.log('\n  Input stream closed.');
        rl.close();
        process.exit(0);
      }
      throw err;
    }

    if (answer.toLowerCase() === 'cancel') {
      console.log('  Cancelled.');
      rl.close();
      process.exit(0);
    }

    idx = parseSaveSelection(answer, visibleSaves.length);
    if (idx === null) {
      console.log(formatInvalidSelectionMessage(visibleSaves.length));
    }
  }

  const savePath = join(getDefaultSaveDir(), visibleSaves[idx].filename);
  // F-e58b49ed follow-through (coordinator stitch, traced by the wave-8
  // tests agent): loadSession throws SaveValidationError for
  // version-rejected/corrupt saves, and without this wrap the error fell
  // through to main()'s generic 'startup' catch — a bare "Unexpected error"
  // headline instead of the dedicated load presentation (headline +
  // what-survived + next step) this same wave shipped.
  let loadResult;
  try {
    loadResult = await loadSession(savePath);
  } catch (err) {
    const exitCode = presentError(err, 'load', debugMode);
    rl.close();
    process.exit(exitCode ?? 1);
  }
  const savedSession = loadResult.session;
  if (loadResult.migrated) {
    console.log(`\n  Save upgraded from older format (schema v${loadResult.sourceVersion} → v${loadResult.stepsApplied + loadResult.sourceVersion}).`);
  }

  // Restore engine from pack (recreate with modules, then swap world state)
  let engine;
  let itemCatalog = null;
  // F-7484bd2e/coordinator brief item 4a: hoisted out of the if-block below
  // (mirrors itemCatalog's own existing hoist) so pack?.buildCatalog is
  // still in scope at the renderRecap() call site further down.
  let pack: PackInfo | undefined;
  if (savedSession.packId) {
    pack = getPackById(savedSession.packId);
    if (pack) {
      engine = pack.createGame();
      itemCatalog = pack.itemCatalog;
      try {
        // PFE-007: Validate structure before assigning — corrupted saves shouldn't silently break.
        // Explicitly rejects world.state === null (F-1b8be73f); see cli/engine-state-validator.ts.
        const validation = validateEngineState(savedSession.engineState);
        if (!validation.valid) {
          // F-e58b49ed: previously two raw, uncolored console.error() lines
          // plus a bare process.exit(1) -- the only fatal branch in this
          // function that bypassed presentError()/classifyForPresentation
          // (no headline/explanation/preserved/nextAction shape, no
          // red-vs-yellow severity signal, no [debug] block even under
          // --debug). Routes through the same pipeline the adjacent catch
          // block and the "!engine" branch below already use;
          // error-presenter.ts's presentLoadError has a matching branch
          // keyed on this exact message prefix so validation.error survives
          // into the rendered explanation.
          presentError(
            new Error(`Save file has invalid engine state: ${validation.error}.`),
            'load',
            debugMode,
          );
          rl.close();
          process.exit(1);
        }
        Object.assign(engine.store.state, structuredClone(validation.state));
        // F-1afba928 (3.9 slice): the assign above wholesale-replaces the
        // top-level `modules` key, so a namespace for any module ADDED to the
        // engine after this save was written would stay undefined and crash
        // (or silently blank) its first reader. Mirror Engine.deserialize's
        // own post-restore step: absent namespaces get the module's registered
        // defaults; present ones are never touched.
        engine.moduleManager.initializeNamespaces(engine.store);
        // task_3ddb1c06 (c): the save carries the full engine.serialize()
        // envelope — restore the seeded RNG stream too, or every resume
        // silently forks the world's determinism. Number.isFinite, not
        // typeof: JSON.parse('1e999') yields Infinity, and SeededRNG.setState
        // does no validation (mirrors the engine's own world.ts guard).
        // Full Engine.deserialize remains blocked: it needs the pack's module
        // list, which packs don't export — and actionLog is private with no
        // setter, so campaign-spanning getActionLog() after a resume is an
        // engine-side ask (pack engine-options export), not fixable here.
        const envelope = JSON.parse(savedSession.engineState) as { world?: { rngState?: unknown } };
        if (typeof envelope.world?.rngState === 'number' && Number.isFinite(envelope.world.rngState)) {
          engine.store.rng.setState(envelope.world.rngState);
        }
      } catch (err) {
        // F-c7e13af2: every exception here is fatal (not just JSON parse errors,
        // which validateEngineState now handles internally) — falling through with
        // a partially-restored engine would start the game loop on inconsistent state.
        presentError(err, 'load', debugMode);
        rl.close();
        process.exit(1);
      }
    }
  }
  if (!engine) {
    // F-c8dd84fe: was a bare console.error with no packId and no next-action
    // guidance, unlike every other fatal branch in this function. Routes
    // through the same presentError(err, 'load', debugMode) pipeline the
    // adjacent engine-state-validation catch above already uses.
    presentError(
      new Error(`Cannot restore engine — unknown pack "${savedSession.packId}".`),
      'load',
      debugMode,
    );
    rl.close();
    process.exit(1);
  }

  // Restore profile
  const profile = loadProfileFromSession(savedSession);

  // Restore history
  const history = TurnHistory.fromJSON(savedSession.turnHistory);

  // Restore player rumors, pressures, fallout history, and chronicle
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
  // Conversation memory (coordinator brief item 4c, wave-18/cli-display.md,
  // director ruling R4: conversation memory IS PERSISTED).
  const restoredNpcConversations = loadNpcConversationsFromSession(savedSession);

  const presentationBox: PresentationBox = { calls: [] };
  const streamBox: StreamBox = { current: null };
  // F-d890d23d: spinnerBox + onRetry wiring -- see runPlay/the SpinnerBox
  // doc comment for the race-safety argument. Threaded through the EXISTING
  // GameConfig.client field.
  const spinnerBox: SpinnerBox = { current: null };
  const client = createAdaptedClient(undefined, {
    onRetry: (info) => spinnerBox.current?.setLabel(formatRetryLabel('thinking', info)),
  });
  const session = new GameSession(withStreamingHook(withPresentationHook({
    engine,
    client,
    tone: savedSession.tone,
    title: savedSession.characterName ?? 'claude-rpg',
    worldPrompt: savedSession.worldPrompt,
    profile: profile ?? undefined,
    itemCatalog: itemCatalog ?? undefined,
    genre: savedSession.genre ?? 'fantasy',
    journal: restoredJournal,
    // task_3ddb1c06 (a)+(b): resumed sessions keep their narration continuity
    // and their concluded-ness — both were computed from the save and dropped.
    history,
    packId: savedSession.packId,
    npcConversations: restoredNpcConversations,
    campaignStatus: savedSession.campaignStatus ?? 'active',
  }, (calls) => { presentationBox.calls = calls; }), streamBox));

  // Restore rumors, pressures, and fallout history into session
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

  // Show recap
  // Coordinator brief item 4a (narrative-llm's recap half): pack?.buildCatalog
  // as renderRecap's new third arg.
  console.log(renderRecap(profile, history, pack?.buildCatalog));

  const snapshot = profile ? captureSnapshot(profile) : undefined;
  const worldSnap = captureWorldSnapshot(
    session.activePressures, session.playerRumors, session.resolvedPressures,
  );
  const districtMoods = captureDistrictMoods(session);
  const initialParty = structuredClone(session.partyState);
  const initialItemChronicle = profile ? structuredClone(profile.itemChronicle) : undefined;
  const initialEconomies = cloneEconomies(session.districtEconomies);
  const initialCustom = profile ? structuredClone(profile.custom) : {};
  const initialOpportunities = structuredClone(session.activeOpportunities);
  disposeEarlySigintGuard();
  await runGameLoop({
    session, rl, packId: savedSession.packId, presentationBox, streamBox, spinnerBox,
    initialSnapshot: snapshot, initialWorldSnapshot: worldSnap, initialDistrictMoods: districtMoods,
    initialPartyState: initialParty, initialItemChronicle, initialEconomies,
    initialCustom, initialOpportunities,
  });
}

async function runArchive(): Promise<void> {
  const campaigns = await listArchivedCampaigns();
  console.log(renderArchiveBrowser(campaigns));
}

async function runNew(worldPrompt: string): Promise<void> {
  // F-4997779f: covers Ctrl+C for the world-gen call below (this file's own
  // comment on generateWorld calls it "the largest LLM token budget
  // anywhere in this app") through the rest of this pre-gameplay window --
  // disposed right before runGameLoop hands off to its own permanent
  // SIGINT handler.
  const disposeEarlySigintGuard = installEarlySigintGuard();

  console.log('\n  Generating world...\n');

  // F-b1c363e3: generateWorld's single generateStructured call carries the
  // largest LLM token budget anywhere in this app (title, theme, tone
  // guide, ruleset, zones, factions, npcs, player, and quests all at once)
  // -- yet it was the one major LLM call with no spinner, unlike the
  // per-turn narration call in runGameLoop. A brand-new player's very first
  // command sat at a motionless terminal with no indication the process
  // hadn't hung.
  //
  // F-d890d23d: spinner created before its client so the client's onRetry
  // callback can close over it directly -- this one-shot world-gen call has
  // no per-turn boundary to key a SpinnerBox off of (unlike the ongoing
  // gameplay session constructed below), so the simpler direct closure is
  // enough.
  const spinner = createSpinner('thinking');
  const client = createAdaptedClient(undefined, {
    onRetry: (info) => spinner.setLabel(formatRetryLabel('thinking', info)),
  });
  spinner.start();
  let result: WorldGenResult;
  try {
    // F-9da15f24 (coordinator stitch): consume world-gen's onAttempt so the
    // shape-retry loop is visible — generateWorld silently re-prompts the
    // LLM when a proposal comes back malformed, and the spinner used to sit
    // on a plain 'thinking' through every restart.
    result = await generateWorld(client, worldPrompt, undefined, {
      onAttempt: (info) => {
        if (info.attempt > 1) {
          spinner.setLabel(`thinking — the world didn't take shape, regenerating (attempt ${info.attempt}/${info.maxAttempts})`);
        }
      },
    });
  } finally {
    spinner.stop();
  }

  if (!result.ok || !result.engine) {
    // F-f6983775: this listing is 0..N error strings (result.errors), not a
    // single Error object, so it doesn't map cleanly onto
    // ErrorPresentation's single-explanation shape -- red() on the headline
    // matches error-presenter.ts's fatal palette (process.exit(1) follows),
    // per the addendum's documented minimum. The bullets themselves stay
    // plain, matching how renderError() itself leaves `explanation`
    // uncolored (only headline/preserved/nextAction get color).
    console.error(red('Failed to generate world:'));
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  const title = result.proposal?.title ?? 'Generated World';
  console.log(`  World "${title}" created!\n`);

  const presentationBox: PresentationBox = { calls: [] };
  const streamBox: StreamBox = { current: null };
  // Separate box + client for the ONGOING gameplay session -- distinct from
  // the one-shot world-gen spinner/client above, since runGameLoop's
  // per-turn spinner is shared code that needs the box treatment (see
  // runPlay/runLoad's identical pattern).
  const spinnerBox: SpinnerBox = { current: null };
  const gameplayClient = createAdaptedClient(undefined, {
    onRetry: (info) => spinnerBox.current?.setLabel(formatRetryLabel('thinking', info)),
  });
  const session = new GameSession(withStreamingHook(withPresentationHook({
    engine: result.engine,
    client: gameplayClient,
    title,
    tone: result.tone,
    worldPrompt,
  }, (calls) => { presentationBox.calls = calls; }), streamBox));

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: slashCompleter,
    historySize: 100,
  });

  disposeEarlySigintGuard();
  await runGameLoop({ session, rl, presentationBox, streamBox, spinnerBox });
}

type DistrictMoodSnapshot = {
  districtId: string;
  districtName: string;
  descriptor: string;
  metrics: { commerce: number; morale: number; alertPressure: number; stability: number };
}[];

function cloneEconomies(economies: Map<string, DistrictEconomy>): Map<string, DistrictEconomy> {
  const clone = new Map<string, DistrictEconomy>();
  for (const [id, econ] of economies) {
    clone.set(id, structuredClone(econ));
  }
  return clone;
}

function captureDistrictMoods(session: GameSession): DistrictMoodSnapshot {
  const moods: DistrictMoodSnapshot = [];
  for (const districtId of getAllDistrictIds(session.engine.world)) {
    const dState = getDistrictState(session.engine.world, districtId);
    const dDef = getDistrictDefinition(session.engine.world, districtId);
    if (!dState || !dDef) continue;
    const mood = computeDistrictMood(dState, dDef.tags);
    moods.push({
      districtId,
      districtName: dDef.name,
      descriptor: mood.descriptor,
      metrics: {
        commerce: dState.commerce,
        morale: dState.morale,
        alertPressure: dState.alertPressure,
        stability: dState.stability,
      },
    });
  }
  return moods;
}

// F-08f594de (presentation seam contract, wave-8/cli-display.md): accumulates
// one turn's queued presentation calls between GameSession's onPresentation
// callback firing and this file printing them via renderPresentationCues().
// A plain mutable box (not a `let` reassigned across function boundaries) so
// it can be captured by the constructor callback in runPlay/runLoad/runNew
// and then read+cleared later inside runGameLoop, which receives the
// already-built session and box together.
type PresentationBox = { calls: McpToolCall[] };

/**
 * game.ts (game-core domain, not owned here) declares `onPresentation` on
 * GameConfig directly now (F-79a25863's seam merged) — this function is the
 * harmless wrapper the original seam-documenting `as GameConfig` cast
 * predicted it would become. F-c885f79f dropped that cast: `onPresentation`
 * is a real, typed field on GameConfig, so the object literal below needs
 * no excess-property escape hatch.
 */
function withPresentationHook(
  config: GameConfig,
  onPresentation: (calls: McpToolCall[]) => void,
): GameConfig {
  return { ...config, onPresentation };
}

// F-c94fa782 (streaming seam contract, wave-10/cli-display.md): holds the
// in-flight turn's chunk sink, if streaming is armed for this turn. Same
// "plain mutable box" shape as PresentationBox above, but for a per-call
// callback instead of an accumulator: runGameLoop arms it immediately
// before each processInput() call and disarms it right after, since a
// fresh StreamSession is created per turn while GameConfig itself (and the
// onNarrationChunk closure below) is only built once per session.
type StreamBox = { current: ((chunk: string) => void) | null };

/**
 * game.ts (game-core domain, not owned here) declares `onNarrationChunk` on
 * GameConfig directly now (F-c94fa782's seam merged) -- same resolved seam
 * as withPresentationHook above. F-c885f79f dropped the `as GameConfig`
 * cast: `onNarrationChunk` is a real, typed field on GameConfig. The
 * forwarding callback is guarded: a throwing chunk sink (e.g. a write to a
 * closed stream) must never damage turn processing.
 */
function withStreamingHook(config: GameConfig, box: StreamBox): GameConfig {
  const onNarrationChunk = (chunk: string) => {
    try {
      box.current?.(chunk);
    } catch {
      // Display-only failure -- narration generation must continue.
    }
  };
  return { ...config, onNarrationChunk };
}

/**
 * F-d890d23d (retry-visibility contract, wave-18/cli-display.md): holds the
 * in-flight turn's spinner, if one is active, so the session's client's
 * onRetry hook (armed once per client, closing over this box) can update
 * its label mid-retry without needing a fresh client constructed per turn.
 * Same "plain mutable box" shape as PresentationBox/StreamBox above.
 *
 * Race safety: onRetry only ever fires synchronously inside the awaited
 * session.processInput() chain (withRetry, llm/claude-adapter.ts), so
 * spinnerBox.current is guaranteed to be the current turn's own spinner for
 * the entire window it could fire, cleared only after that await resolves.
 */
type SpinnerBox = { current: Spinner | null };

/** Print any presentation cues queued during the just-completed turn (or the
 *  opening narration), then clear the box so a failed turn never leaks
 *  stale cues into the next successful one's output. */
function flushPresentationCues(box: PresentationBox): void {
  const calls = box.calls;
  box.calls = [];
  if (calls.length === 0) return;
  const cues = renderPresentationCues(calls, debugMode);
  if (cues) console.log(cues);
}

type GameLoopOptions = {
  session: GameSession;
  rl: ReturnType<typeof createInterface>;
  presentationBox: PresentationBox;
  streamBox: StreamBox;
  spinnerBox: SpinnerBox;
  packId?: string;
  initialSnapshot?: SessionSnapshot;
  initialWorldSnapshot?: WorldSnapshot;
  initialDistrictMoods?: DistrictMoodSnapshot;
  initialPartyState?: PartyState;
  initialItemChronicle?: Record<string, ItemChronicleEntry[]>;
  initialEconomies?: Map<string, DistrictEconomy>;
  initialCustom?: Record<string, string | number | boolean>;
  initialOpportunities?: OpportunityState[];
};

async function runGameLoop(opts: GameLoopOptions): Promise<void> {
  const {
    session, rl, packId, presentationBox, streamBox, spinnerBox,
    initialSnapshot, initialWorldSnapshot, initialDistrictMoods,
    initialPartyState, initialItemChronicle, initialEconomies,
    initialCustom, initialOpportunities,
  } = opts;
  // Welcome
  console.log(session.getWelcome());

  // Opening narration
  // F-51852e69: session.getOpeningNarration() -- the very first LLM call of
  // every session (new game, play, and load all reach it) -- used to be
  // awaited with zero waiting feedback: no spinner (unlike runNew's
  // world-gen call, F-b1c363e3) and no streaming (streamBox.current was
  // still null here; it's only armed inside the per-turn loop below, after
  // this call already returned and printed). Wrapped the same way the
  // per-turn loop wraps processInput() just below: spinnerBox reuses the
  // EXISTING retry-spinner infrastructure (the same box the client's
  // onRetry callback already targets in runPlay/runLoad/runNew) instead of
  // inventing a second spinner, and streamBox is armed for the call's
  // duration so any chunks getOpeningNarration() streams reach the player
  // progressively -- erased via openingStream.clear() before the full
  // `opening` string prints, the same double-print guard the per-turn loop
  // uses.
  //
  // Streaming seam note: getOpeningNarration() (game.ts, game-core domain,
  // not owned here) does not yet forward an onChunk callback into
  // generateOpeningNarration() the way the per-turn executeTurn() path
  // forwards onNarrationChunk -- so streamBox.current currently has no
  // chunks to relay for this specific call. Wiring that is a game-core
  // change outside cli-display's scope this wave (mirrors the
  // withPresentationHook/withStreamingHook seam-contract precedent above:
  // cli-display lands its half of a seam independently of game-core's
  // half). The spinner alone already removes the "is this hung?" risk this
  // finding flags; streaming activates automatically, with no further
  // cli-display change, once that seam's other half lands.
  const openingStream = createStreamPresenter();
  try {
    const openingSpinner = createSpinner('thinking');
    spinnerBox.current = openingSpinner;
    openingSpinner.start();
    if (process.stdout.isTTY) {
      let openingSpinnerLive = true;
      streamBox.current = (chunk: string) => {
        if (openingSpinnerLive) {
          openingSpinner.stop();
          openingSpinnerLive = false;
        }
        openingStream.onChunk(chunk);
      };
    }
    let opening: string;
    try {
      opening = await session.getOpeningNarration();
    } finally {
      openingSpinner.stop();
      streamBox.current = null;
      spinnerBox.current = null;
    }
    if (openingStream.chunkCount > 0) openingStream.clear();
    console.log(opening);
    flushPresentationCues(presentationBox);
  } catch (err) {
    if (openingStream.chunkCount > 0) openingStream.markInterrupted();
    const exitCode = presentError(err, 'opening', debugMode);
    rl.close();
    process.exit(exitCode ?? 1);
  }

  // question() (PFE-001: rejects on readline 'close' so this doesn't hang
  // forever on Ctrl+D/pipe EOF) is now a module-level helper shared with
  // runLoad's save-selection prompt -- see its doc comment above.

  // PFE-002: Graceful SIGINT handling — first Ctrl+C attempts save, second force-exits.
  let sigintCount = 0;
  process.on('SIGINT', async () => {
    sigintCount++;
    if (sigintCount >= 2) {
      console.log('\n  Force-exiting. Farewell.\n');
      process.exit(1);
    }
    console.log('\n  Interrupted. Saving your progress...');
    const saveName = session.profile
      ? `${session.profile.build.name}-autosave-${Date.now()}`
      : `autosave-${Date.now()}`;
    const savePath = getSavePath(saveName);
    const outcome = await attemptExitAutosave(savePath, getDefaultSaveDir(), (p) =>
      saveSession(buildSaveInput(session, p, packId)),
    );
    if (outcome.status === 'failed') {
      // F-b832167c: routes through the same presentError()/
      // classifyForPresentation() pipeline every other error path in this
      // file uses, instead of a flat, detail-free string -- under --debug
      // this now surfaces the real error type/message/cause for the exact
      // moment (Ctrl+C mid-session) a player most needs to trust the save
      // worked or understand why not.
      presentError(outcome.error, 'save', debugMode);
    } else if (outcome.status === 'rejected') {
      // F-bfed3361: 'rejected' means the guard skipped the save entirely --
      // the closest thing to a data-loss signal this exit flow produces --
      // but used to fall through to the exact same plain console.log the
      // routine 'saved' case gets. Now renders with the same severity
      // signal genuine errors get, so it doesn't visually blend into a
      // success message at the exact moment (process about to exit) a
      // player has the least chance to notice and react.
      console.log(yellow(outcome.message));
    } else {
      console.log(outcome.message);
    }
    console.log('  Farewell.\n');
    rl.close();
    process.exit(0);
  });

  // Game loop — iterative to avoid unbounded stack growth
  while (true) {
    let input: string;
    try {
      input = await question(rl, '  > ');
    } catch (err) {
      // PFE-001: stdin closed (Ctrl+D or pipe EOF) — auto-save and exit cleanly.
      if (err instanceof Error && err.message === '__STDIN_CLOSED__') {
        console.log('\n  Input stream closed.');
        const saveName = session.profile
          ? `${session.profile.build.name}-autosave-${Date.now()}`
          : `autosave-${Date.now()}`;
        const savePath = getSavePath(saveName);
        const outcome = await attemptExitAutosave(savePath, getDefaultSaveDir(), (p) =>
          saveSession(buildSaveInput(session, p, packId)),
        );
        if (outcome.status === 'failed') {
          // F-b832167c: same pipeline as the SIGINT handler's autosave
          // failure above -- previously worded differently ("Auto-save
          // failed." vs "Auto-save failed. Your in-game progress was not
          // saved.") for the identical status, and neither ever showed
          // real error detail even under --debug.
          presentError(outcome.error, 'save', debugMode);
        } else if (outcome.status === 'rejected') {
          // F-bfed3361: same treatment as the SIGINT handler's autosave
          // rejection above.
          console.log(yellow(outcome.message));
        } else {
          console.log(outcome.message);
        }
        console.log('  Farewell.\n');
        rl.close();
        process.exit(0);
      }
      throw err;
    }

    if (!input.trim()) continue;

    const trimmed = input.trim().toLowerCase();

    // Save command
    if (trimmed === 'save') {
      try {
        const saveName = session.profile
          ? `${session.profile.build.name}-${Date.now()}`
          : `save-${Date.now()}`;
        const savePath = getSavePath(saveName);
        // Guard against directory traversal in character names
        const expectedDir = resolve(getDefaultSaveDir());
        if (!isPathInside(savePath, expectedDir)) {
          // F-f6983775: this guard rejection sits 13 lines above its own
          // sibling branch below (the catch block's presentError(err,
          // 'save', debugMode) for this same command's OTHER failure mode)
          // yet rendered with zero visual treatment. yellow() matches the
          // non-fatal/reprompt severity error-presenter.ts uses (this
          // `continue`s back to the input loop, same shape as a reprompt --
          // not a fatal exit), and matches F-bfed3361's identical
          // guard-rejected-the-path treatment in the exit-autosave paths.
          console.error(yellow('  Save path escapes save directory — aborting.'));
          continue;
        }
        await saveSession(buildSaveInput(session, savePath, packId));
        console.log(`\n  Saved to ${savePath}`);

        // Show unified session recap
        const recapText = buildUnifiedRecap(
          session, initialSnapshot, initialWorldSnapshot, initialDistrictMoods, initialPartyState, initialItemChronicle, initialEconomies, initialCustom, initialOpportunities,
        );
        if (recapText) console.log(recapText);
        else console.log('');
      } catch (err) {
        presentError(err, 'save', debugMode);
      }
      continue;
    }

    // Character sheet command
    if (trimmed === '/sheet' || trimmed === '/character') {
      if (session.profile && session.itemCatalog) {
        console.log(renderCharacterSheet(session.profile, session.itemCatalog));
      } else {
        console.log('\n  No character profile available.\n');
      }
      continue;
    }

    // Cost summary command — COST COMMAND cross-domain contract (wave-14,
    // F-b4b16d0a): game-core wires a SessionTokenTracker into GameSession
    // and exposes it as GameSession.getCostSummary(): string, built on
    // token-tracker.ts's existing formatCostSummary(). cli-display's half
    // is this dispatch branch plus the completer/help entries (see
    // slash-completer.ts's PLAY_COMMANDS and bin.ts's USAGE text above).
    // GameConfig's public type may not declare the method yet in this
    // worktree if game-core's half hasn't landed in the same tree -- this
    // local cast documents the contract instead of widening `session` to
    // `any`; drop it once GameSession's real type covers it natively.
    if (trimmed === '/cost') {
      console.log(`\n${(session as GameSession & { getCostSummary(): string }).getCostSummary()}\n`);
      continue;
    }

    // F-c94fa782 (streaming seam contract): one presenter per turn, created
    // outside the try so the catch block below can still read chunkCount
    // (whether anything streamed) even when the turn itself throws.
    const stream = createStreamPresenter();
    try {
      const spinner = createSpinner('thinking');
      // F-d890d23d: armed for the entire window this turn's client could
      // fire onRetry, cleared in the same finally block that stops it below.
      spinnerBox.current = spinner;
      spinner.start();
      if (process.stdout.isTTY) {
        // Arm the box only while this call is in flight, and stop the
        // spinner the instant the first chunk arrives -- its animation
        // writes to the same line streaming now owns, and would otherwise
        // interleave with (and corrupt) the streamed text.
        let spinnerLive = true;
        streamBox.current = (chunk: string) => {
          if (spinnerLive) {
            spinner.stop();
            spinnerLive = false;
          }
          stream.onChunk(chunk);
        };
      }
      let output: string;
      try {
        output = await session.processInput(input.trim());
      } finally {
        spinner.stop();
        streamBox.current = null;
        spinnerBox.current = null;
      }

      if (output === '__QUIT__') {
        // F-c6da7ad9: the third of three "session about to exit" paths.
        // The SIGINT handler (~line 1012) and the stdin-closed/EOF handler
        // (~line 1054) already route through the guarded attemptExitAutosave
        // contract; typing "quit" used to skip it entirely and go straight
        // to the recap, silently dropping progress the other two paths
        // already protected. Mirrors the SIGINT block's shape/branching
        // exactly so all three exit paths present a save outcome
        // consistently. play-renderer.ts's renderDeathScreen hint (this same
        // wave) is updated in step to match.
        console.log('\n  Saving your progress...');
        const saveName = session.profile
          ? `${session.profile.build.name}-autosave-${Date.now()}`
          : `autosave-${Date.now()}`;
        const savePath = getSavePath(saveName);
        const outcome = await attemptExitAutosave(savePath, getDefaultSaveDir(), (p) =>
          saveSession(buildSaveInput(session, p, packId)),
        );
        if (outcome.status === 'failed') {
          presentError(outcome.error, 'save', debugMode);
        } else if (outcome.status === 'rejected') {
          console.log(yellow(outcome.message));
        } else {
          console.log(outcome.message);
        }

        // Show unified session recap
        const recapText = buildUnifiedRecap(
          session, initialSnapshot, initialWorldSnapshot, initialDistrictMoods, initialPartyState, initialItemChronicle, initialEconomies, initialCustom, initialOpportunities,
        );
        if (recapText) console.log(recapText);
        console.log('\n  Farewell.\n');
        rl.close();
        process.exit(0);
      }

      // Narration already reached the player incrementally while it was
      // generated -- erase the streamed copy so `output` below (which bakes
      // the same narration back in via renderPlayScreen) doesn't show it
      // twice.
      if (stream.chunkCount > 0) stream.clear();
      // F-135b1970 / F-e78d68c1: splice this turn's presentation cues into
      // the screen before the "What do you do?" prompt (insertCuesBeforePrompt,
      // presentation-renderer.ts) instead of console.logging them in a
      // separate call after the full screen -- the old order printed cues
      // BELOW the prompt asking what the player wants to do next, between it
      // and the actual '  > ' input marker.
      const cues = renderPresentationCues(presentationBox.calls, debugMode);
      presentationBox.calls = [];
      console.log(insertCuesBeforePrompt(output, cues));
    } catch (err) {
      // A partial stream is still real narration the player already saw --
      // mark it interrupted (visual break) rather than erasing it.
      if (stream.chunkCount > 0) stream.markInterrupted();
      presentError(err, 'turn', debugMode);
      // Discard any cues queued before the turn failed — they describe a
      // turn that never finished printing and would otherwise leak into the
      // next successful turn's output.
      presentationBox.calls = [];
    }
  }
}

/** Build unified session recap from session state. */
function buildUnifiedRecap(
  session: GameSession,
  initialSnapshot?: SessionSnapshot,
  initialWorldSnapshot?: WorldSnapshot,
  initialDistrictMoods?: DistrictMoodSnapshot,
  initialPartyState?: PartyState,
  initialItemChronicle?: Record<string, ItemChronicleEntry[]>,
  initialEconomies?: Map<string, DistrictEconomy>,
  initialCustom?: Record<string, string | number | boolean>,
  initialOpportunities?: OpportunityState[],
): string {
  if (!initialSnapshot || !session.profile) return '';

  const currentSnapshot = captureSnapshot(session.profile);
  const characterDelta = computeSessionDelta(initialSnapshot, currentSnapshot);

  const currentWorldSnap = captureWorldSnapshot(
    session.activePressures, session.playerRumors, session.resolvedPressures,
  );
  const worldDelta = initialWorldSnapshot
    ? computeWorldDelta(initialWorldSnapshot, currentWorldSnap, session.resolvedPressures)
    : { pressuresSpawned: 0, pressuresResolved: 0, resolutionSummaries: [], chainReactions: 0, rumorsDelta: 0 };

  const factionDeltas = computeFactionDeltas(
    initialSnapshot.reputation,
    currentSnapshot.reputation,
    session.playerRumors,
    session.resolvedPressures,
    initialWorldSnapshot?.resolvedCount ?? 0,
  );

  const rumorDelta = computeRumorDelta(
    initialWorldSnapshot?.rumorCount ?? 0,
    session.playerRumors,
  );

  // Build faction names from engine world state
  // F-50cab734: session.engine.world.factions is Record<string, FactionState>
  // and FactionState.name is a required (non-optional) string at engine 3.9
  // (packages/core/src/types.ts) — no cast needed to read it type-safely.
  const factionNames: Record<string, string> = {};
  for (const [id, faction] of Object.entries(session.engine.world.factions)) {
    factionNames[id] = faction.name ?? id;
  }

  const whatPeopleAreSaying = deriveWhatPeopleAreSaying(
    session.playerRumors,
    session.profile.reputation,
    factionNames,
  );

  // Compute NPC recap entries
  const npcRecapEntries = computeNpcRecapEntries(
    session.lastNpcProfiles,
    session.previousBreakpoints,
    session.npcObligations,
    session.activeConsequenceChains,
  );

  // Compute district deltas
  const currentDistrictMoods = captureDistrictMoods(session);
  const districtDeltas = initialDistrictMoods
    ? computeDistrictDeltas(initialDistrictMoods, currentDistrictMoods)
    : undefined;

  // Compute companion recap entries
  const companionNames: Record<string, string> = {};
  for (const comp of session.partyState?.companions ?? []) {
    companionNames[comp.npcId] = session.engine.world.entities[comp.npcId]?.name ?? comp.npcId;
  }
  for (const comp of initialPartyState?.companions ?? []) {
    if (!companionNames[comp.npcId]) {
      companionNames[comp.npcId] = session.engine.world.entities[comp.npcId]?.name ?? comp.npcId;
    }
  }
  const companionRecapEntries = computeCompanionRecapEntries(
    initialPartyState, session.partyState, companionNames,
  );

  // Compute item recap entries
  const itemNames: Record<string, string> = {};
  if (session.itemCatalog) {
    for (const item of session.itemCatalog.items) {
      itemNames[item.id] = item.name;
    }
  }
  const itemRecapEntries = initialItemChronicle
    ? computeItemRecapEntries(initialItemChronicle, session.profile.itemChronicle, itemNames)
    : [];

  // Compute economy recap entries
  const districtNameMap: Record<string, string> = {};
  for (const districtId of getAllDistrictIds(session.engine.world)) {
    const dDef = getDistrictDefinition(session.engine.world, districtId);
    if (dDef) districtNameMap[districtId] = dDef.name;
  }
  const economyRecapEntries = computeEconomyRecapEntries(
    initialEconomies,
    session.districtEconomies,
    districtNameMap,
  );

  // Compute crafting recap entries (v1.8)
  const craftingMaterials = initialCustom
    ? computeCraftingRecapEntries(initialCustom, session.profile.custom)
    : { entries: [], materialChanges: [] };
  const journalCraftEntries = computeCraftingRecapFromJournal(
    session.journal,
    initialWorldSnapshot?.resolvedCount ?? 0,
  );
  const craftingData = {
    entries: [...craftingMaterials.entries, ...journalCraftEntries],
    materialChanges: craftingMaterials.materialChanges,
  };
  const hasCrafting = craftingData.entries.length > 0 || craftingData.materialChanges.length > 0;

  // Compute opportunity recap entries (v1.9)
  const opportunityRecapEntries = computeOpportunityRecapEntries(
    initialOpportunities ?? [],
    session.activeOpportunities,
    session.resolvedOpportunities,
  );

  // Build arc recap data (v2.0)
  let arcRecapData: ArcRecapData | undefined;
  if (session.arcSnapshot?.dominantArc || session.endgameTriggers.length > 0) {
    const dominantSignal = session.arcSnapshot?.signals.find(
      (s) => s.kind === session.arcSnapshot?.dominantArc,
    );
    arcRecapData = {
      dominantArc: session.arcSnapshot?.dominantArc ?? null,
      momentum: dominantSignal?.momentum ?? 'steady',
      endgameTriggers: session.endgameTriggers.map((t) => ({
        resolutionClass: t.resolutionClass,
        reason: t.reason,
      })),
    };
  }

  return renderFullRecap(
    characterDelta,
    worldDelta,
    factionDeltas,
    rumorDelta,
    whatPeopleAreSaying,
    npcRecapEntries.length > 0 ? npcRecapEntries : undefined,
    districtDeltas,
    companionRecapEntries.length > 0 ? companionRecapEntries : undefined,
    itemRecapEntries.length > 0 ? itemRecapEntries : undefined,
    economyRecapEntries.length > 0 ? economyRecapEntries : undefined,
    hasCrafting ? craftingData : undefined,
    opportunityRecapEntries.length > 0 ? opportunityRecapEntries : undefined,
    arcRecapData,
  );
}

main().catch((err) => {
  presentError(err, 'startup', debugMode);
  process.exit(1);
});
