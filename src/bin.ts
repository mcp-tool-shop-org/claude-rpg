#!/usr/bin/env node

// CLI entry point for claude-rpg

import { createInterface } from 'node:readline';
import { createGame as createFantasyGame } from '@ai-rpg-engine/starter-fantasy';
import { createGame as createCyberpunkGame } from '@ai-rpg-engine/starter-cyberpunk';
import { GameSession } from './game.js';
import { createClaudeClient } from './claude-client.js';
import { generateWorld } from './foundry/world-gen.js';
import { saveSession, getSavePath } from './session/session.js';

const USAGE = `
claude-rpg — simulation-grounded narrative RPG

Usage:
  claude-rpg play [--world fantasy|cyberpunk]   Play a starter world
  claude-rpg new "<prompt>"                     Generate a world from a prompt
  claude-rpg --help                             Show this help

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
  const worldFlag = args.indexOf('--world');
  const worldName = worldFlag >= 0 ? args[worldFlag + 1] : 'fantasy';

  let engine;
  let title: string;
  let tone: string;

  switch (worldName) {
    case 'fantasy':
      engine = createFantasyGame();
      title = 'The Chapel Threshold';
      tone = 'dark fantasy, concise, atmospheric, foreboding';
      break;
    case 'cyberpunk':
      engine = createCyberpunkGame();
      title = 'Neon Lockbox';
      tone = 'cyberpunk noir, terse, neon-lit, paranoid';
      break;
    default:
      console.error(`Unknown world: ${worldName}. Available: fantasy, cyberpunk`);
      process.exit(1);
  }

  const session = new GameSession({ engine, title, tone });
  await runGameLoop(session);
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
  await runGameLoop(session);
}

async function runGameLoop(session: GameSession): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

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

      // Save command
      if (input.trim().toLowerCase() === 'save') {
        try {
          const savePath = getSavePath(`save-${Date.now()}`);
          await saveSession(
            session.engine,
            session.history,
            session.tone,
            savePath,
            session.worldPrompt,
          );
          console.log(`\n  Saved to ${savePath}\n`);
        } catch (err) {
          console.error(`  Save failed: ${err}`);
        }
        prompt();
        return;
      }

      try {
        process.stdout.write(session.getThinking());
        const output = await session.processInput(input);

        if (output === '__QUIT__') {
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

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
