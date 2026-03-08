#!/usr/bin/env node

// CLI entry point for claude-rpg
// v0.4: social consequence — reputation, stance, title evolution, session deltas
// v0.5: rumor ecology — player legend propagation + persistence
// v0.6: emergent pressure — world-generated threats + persistence
// v0.7: resolution & fallout — pressures resolve with structured consequences

import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { GameSession } from './game.js';
import { createClaudeClient } from './claude-client.js';
import { generateWorld } from './foundry/world-gen.js';
import {
  saveSession,
  loadSession,
  loadProfileFromSession,
  loadRumorsFromSession,
  loadPressuresFromSession,
  loadResolvedPressuresFromSession,
  loadChronicleFromSession,
  listSaves,
  getSavePath,
  getDefaultSaveDir,
} from './session/session.js';
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
  renderFullRecap,
} from './character/session-recap.js';

const USAGE = `
claude-rpg — simulation-grounded narrative RPG

Usage:
  claude-rpg play [--world fantasy|cyberpunk]   Play a starter world
  claude-rpg load                               Load a saved game
  claude-rpg new "<prompt>"                     Generate a world from a prompt
  claude-rpg --help                             Show this help

Commands in-game:
  save         Save the current game
  /sheet       View character sheet
  /director    Inspect hidden truth
  quit         Exit the game

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

  const session = new GameSession({
    engine,
    title: result.pack.meta.name,
    tone: result.pack.meta.narratorTone,
    profile: result.profile,
    itemCatalog: result.pack.itemCatalog,
    genre: result.pack.meta.genres[0] ?? 'fantasy',
  });

  const snapshot = captureSnapshot(result.profile);
  const worldSnap = captureWorldSnapshot(
    session.activePressures, session.playerRumors, session.resolvedPressures,
  );
  await runGameLoop(session, rl, result.pack.meta.id, snapshot, worldSnap);
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

  // Show recap
  console.log(renderRecap(profile, history));

  const snapshot = profile ? captureSnapshot(profile) : undefined;
  const worldSnap = captureWorldSnapshot(
    session.activePressures, session.playerRumors, session.resolvedPressures,
  );
  await runGameLoop(session, rl, savedSession.packId, snapshot, worldSnap);
}

async function runNew(worldPrompt: string): Promise<void> {
  console.log('\n  Generating world...\n');

  const client = createClaudeClient();
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

async function runGameLoop(
  session: GameSession,
  rl: ReturnType<typeof createInterface>,
  packId?: string,
  initialSnapshot?: SessionSnapshot,
  initialWorldSnapshot?: WorldSnapshot,
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
          );
          console.log(`\n  Saved to ${savePath}`);

          // Show unified session recap
          const recapText = buildUnifiedRecap(
            session, initialSnapshot, initialWorldSnapshot,
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
            session, initialSnapshot, initialWorldSnapshot,
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

/** Build unified 5-section recap from session state. */
function buildUnifiedRecap(
  session: GameSession,
  initialSnapshot?: SessionSnapshot,
  initialWorldSnapshot?: WorldSnapshot,
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

  return renderFullRecap(
    characterDelta,
    worldDelta,
    factionDeltas,
    rumorDelta,
    whatPeopleAreSaying,
  );
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
