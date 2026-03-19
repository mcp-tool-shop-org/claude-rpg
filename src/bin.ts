#!/usr/bin/env node

// CLI entry point for claude-rpg
// v0.4: social consequence — reputation, stance, title evolution, session deltas
// v0.5: rumor ecology — player legend propagation + persistence
// v0.6: emergent pressure — world-generated threats + persistence
// v0.7: resolution & fallout — pressures resolve with structured consequences

import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { GameSession } from './game.js';
import { createAdaptedClient } from './llm/claude-adapter.js';
import { generateWorld } from './foundry/world-gen.js';
import {
  saveSession,
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
  listSaves,
  listArchivedCampaigns,
  getSavePath,
  getDefaultSaveDir,
} from './session/session.js';
import { renderArchiveBrowser } from './display/archive-browser.js';
import { TurnHistory } from './session/history.js';
import { buildCharacter } from './character/builder.js';
import { getPackById, resolveWorldFlag } from './character/packs.js';
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

const USAGE = `
claude-rpg — simulation-grounded narrative RPG

Usage:
  claude-rpg play [--world fantasy|cyberpunk]   Play a starter world
                  [--fast]                      Accelerated campaign pacing
  claude-rpg load                               Load a saved game
  claude-rpg new "<prompt>"                     Generate a world from a prompt
  claude-rpg archive                            Browse completed campaigns
  claude-rpg --help                             Show this help

Commands in-game:
  save           Save the current game
  /sheet         View character sheet
  /status        Compact strategic snapshot
  /map           Strategic map overview
  /leverage      View political capital
  /jobs          View available opportunities
  /arcs          View campaign arc trajectory
  /conclude      Trigger campaign finale
  /archive       Browse completed campaigns
  /export        Export chronicle (md/json/finale)
  /director      Inspect hidden truth
  /help          In-game help system
  quit           Exit the game

Environment:
  ANTHROPIC_API_KEY   Required. Your Claude API key.
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required.');
    console.error('Set it with: export ANTHROPIC_API_KEY=your-key-here');
    process.exit(1);
  }

  const command = args[0];

  if (command === 'play') {
    await runPlay(args.slice(1));
  } else if (command === 'load') {
    await runLoad();
  } else if (command === 'archive') {
    await runArchive();
  } else if (command === 'new') {
    const prompt = args.slice(1).join(' ').replace(/^["']|["']$/g, '');
    if (!prompt) {
      console.error('Error: provide a world prompt. Example:');
      console.error('  claude-rpg new "A flooded gothic trade city ruled by debt-priests"');
      process.exit(1);
    }
    await runNew(prompt);
  } else {
    console.error(`Unknown command: ${command}`);
    console.log(USAGE);
    process.exit(1);
  }
}

async function runPlay(args: string[]): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Character creation flow (includes pack selection)
  const result = await buildCharacter(rl);
  const engine = result.pack.createGame();

  const fastMode = args.includes('--fast');
  const session = new GameSession({
    engine,
    title: result.pack.meta.name,
    tone: result.pack.meta.narratorTone,
    profile: result.profile,
    itemCatalog: result.pack.itemCatalog,
    genre: result.pack.meta.genres[0] ?? 'fantasy',
    fastMode,
  });

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
  await runGameLoop(session, rl, result.pack.meta.id, snapshot, worldSnap, districtMoods, initialParty, initialItemChronicle, initialEconomies, initialCustom, initialOpportunities);
}

async function runLoad(): Promise<void> {
  const saves = await listSaves();
  if (saves.length === 0) {
    console.log('\n  No saved games found.\n');
    process.exit(0);
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n  Saved Games:\n');
  for (let i = 0; i < saves.length; i++) {
    const s = saves[i];
    const identity = s.characterName
      ? `${s.characterName}${s.characterTitle ? `, "${s.characterTitle}"` : ''} (Lv${s.characterLevel ?? '?'})`
      : 'Unknown character';
    const date = new Date(s.savedAt).toLocaleDateString();
    console.log(`    ${i + 1}. ${identity} — ${date}`);
    // Enhanced details
    const details: string[] = [];
    if (s.chronicleEvents != null && s.chronicleEvents > 0) {
      details.push(`${s.chronicleEvents} chronicle events`);
    }
    if (s.campaignAge != null && s.campaignAge > 0) {
      details.push(`${s.campaignAge} ticks`);
    }
    if (details.length > 0) {
      console.log(`       ${details.join(' | ')}`);
    }
  }
  console.log('');

  const answer = await new Promise<string>((resolve) => {
    rl.question('  Choose a save (or "cancel"): ', resolve);
  });

  if (answer.toLowerCase() === 'cancel') {
    rl.close();
    process.exit(0);
  }

  const idx = parseInt(answer, 10) - 1;
  if (idx < 0 || idx >= saves.length) {
    console.error('  Invalid selection.');
    rl.close();
    process.exit(1);
  }

  const savePath = join(getDefaultSaveDir(), saves[idx].filename);
  const savedSession = await loadSession(savePath);

  // Restore engine from pack (recreate with modules, then swap world state)
  let engine;
  let itemCatalog = null;
  if (savedSession.packId) {
    const pack = getPackById(savedSession.packId);
    if (pack) {
      engine = pack.createGame();
      itemCatalog = pack.itemCatalog;
      try {
        const saved = JSON.parse(savedSession.engineState);
        Object.assign(engine.store.state, saved.world.state);
      } catch {
        console.error('  Warning: could not restore world state.');
      }
    }
  }
  if (!engine) {
    console.error('  Cannot restore engine — unknown pack.');
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

  const session = new GameSession({
    engine,
    tone: savedSession.tone,
    title: savedSession.characterName ?? 'claude-rpg',
    worldPrompt: savedSession.worldPrompt,
    profile: profile ?? undefined,
    itemCatalog: itemCatalog ?? undefined,
    genre: savedSession.genre ?? 'fantasy',
    journal: restoredJournal,
  });

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
  console.log(renderRecap(profile, history));

  const snapshot = profile ? captureSnapshot(profile) : undefined;
  const worldSnap = captureWorldSnapshot(
    session.activePressures, session.playerRumors, session.resolvedPressures,
  );
  const districtMoods = captureDistrictMoods(session);
  const initialParty = structuredClone(session.partyState);
  const initialItemChronicle = profile ? structuredClone(profile.itemChronicle) : {};
  const initialEconomies = cloneEconomies(session.districtEconomies);
  const initialCustom = profile ? structuredClone(profile.custom) : {};
  const initialOpportunities = structuredClone(session.activeOpportunities);
  await runGameLoop(session, rl, savedSession.packId, snapshot, worldSnap, districtMoods, initialParty, initialItemChronicle, initialEconomies, initialCustom, initialOpportunities);
}

async function runArchive(): Promise<void> {
  const campaigns = await listArchivedCampaigns();
  console.log(renderArchiveBrowser(campaigns));
}

async function runNew(worldPrompt: string): Promise<void> {
  console.log('\n  Generating world...\n');

  const client = createAdaptedClient();
  const result = await generateWorld(client, worldPrompt);

  if (!result.ok || !result.engine) {
    console.error('Failed to generate world:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  const title = result.proposal?.title ?? 'Generated World';
  console.log(`  World "${title}" created!\n`);

  const session = new GameSession({
    engine: result.engine,
    title,
    tone: result.tone,
    worldPrompt,
  });

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await runGameLoop(session, rl);
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

async function runGameLoop(
  session: GameSession,
  rl: ReturnType<typeof createInterface>,
  packId?: string,
  initialSnapshot?: SessionSnapshot,
  initialWorldSnapshot?: WorldSnapshot,
  initialDistrictMoods?: DistrictMoodSnapshot,
  initialPartyState?: PartyState,
  initialItemChronicle?: Record<string, ItemChronicleEntry[]>,
  initialEconomies?: Map<string, DistrictEconomy>,
  initialCustom?: Record<string, string | number | boolean>,
  initialOpportunities?: OpportunityState[],
): Promise<void> {
  // Welcome
  console.log(session.getWelcome());

  // Opening narration
  try {
    const opening = await session.getOpeningNarration();
    console.log(opening);
  } catch (err) {
    console.error('Error generating opening narration:', err);
    rl.close();
    process.exit(1);
  }

  // Game loop
  const prompt = (): void => {
    rl.question('  > ', async (input) => {
      if (!input.trim()) {
        prompt();
        return;
      }

      const trimmed = input.trim().toLowerCase();

      // Save command
      if (trimmed === 'save') {
        try {
          const saveName = session.profile
            ? `${session.profile.build.name}-${Date.now()}`
            : `save-${Date.now()}`;
          const savePath = getSavePath(saveName);
          await saveSession(
            session.engine,
            session.history,
            session.tone,
            savePath,
            session.worldPrompt,
            session.profile,
            packId,
            session.playerRumors,
            session.activePressures,
            session.genre,
            session.resolvedPressures,
            session.journal,
            session.lastNpcProfiles,
            session.lastNpcActions,
            session.npcObligations,
            session.activeConsequenceChains,
            session.partyState,
            session.districtEconomies,
            session.activeOpportunities,
            session.resolvedOpportunities,
            session.arcSnapshot,
            session.endgameTriggers,
            session.finaleOutline,
            session.campaignStatus,
          );
          console.log(`\n  Saved to ${savePath}`);

          // Show unified session recap
          const recapText = buildUnifiedRecap(
            session, initialSnapshot, initialWorldSnapshot, initialDistrictMoods, initialPartyState, initialItemChronicle, initialEconomies, initialCustom, initialOpportunities,
          );
          if (recapText) console.log(recapText);
          else console.log('');
        } catch (err) {
          console.error(`  Save failed: ${err}`);
        }
        prompt();
        return;
      }

      // Character sheet command
      if (trimmed === '/sheet' || trimmed === '/character') {
        if (session.profile && session.itemCatalog) {
          console.log(renderCharacterSheet(session.profile, session.itemCatalog));
        } else {
          console.log('\n  No character profile available.\n');
        }
        prompt();
        return;
      }

      try {
        process.stdout.write(session.getThinking());
        const output = await session.processInput(input);

        if (output === '__QUIT__') {
          // Show unified session recap
          const recapText = buildUnifiedRecap(
            session, initialSnapshot, initialWorldSnapshot, initialDistrictMoods, initialPartyState, initialItemChronicle, initialEconomies, initialCustom, initialOpportunities,
          );
          if (recapText) console.log(recapText);
          console.log('\n  Farewell.\n');
          rl.close();
          process.exit(0);
        }

        console.log(output);
      } catch (err) {
        console.error(`  Error: ${err}`);
      }

      prompt();
    });
  };

  prompt();
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
  const factionNames: Record<string, string> = {};
  for (const [id, faction] of Object.entries(session.engine.world.factions)) {
    factionNames[id] = (faction as Record<string, unknown>).name as string ?? id;
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
  console.error('Fatal error:', err);
  process.exit(1);
});
