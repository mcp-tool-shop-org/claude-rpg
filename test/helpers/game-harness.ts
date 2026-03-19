// Test harness for creating GameSession instances with fake Claude clients.
// Provides a quick way to set up a game, execute turns, and inspect state.

import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { GameSession, type GameConfig } from '../../src/game.js';
import { createFakeClient, createCallLog, type FakeClientOptions, type CallLog } from './fake-claude-client.js';

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

  return {
    session,
    callLog,
    play: (input: string) => session.processInput(input),
    tick: () => session.engine.tick,
    turnCount: () => session.history.turns.length,
    lastVerb: () => {
      const turns = session.history.turns;
      return turns.length > 0 ? turns[turns.length - 1].verb : undefined;
    },
  };
}
