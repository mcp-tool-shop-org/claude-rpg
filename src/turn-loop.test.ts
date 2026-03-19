import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { executeTurn, type ExecuteTurnOpts } from './turn-loop.js';
import { TurnHistory } from './session/history.js';
import type { ClaudeClient } from './claude-client.js';

/** Mock client that handles fast-path actions (look) without LLM calls. */
function createMockClient(): ClaudeClient {
  return {
    model: 'mock',
    async generate() {
      return { ok: true, text: 'The scene unfolds.', inputTokens: 0, outputTokens: 0 };
    },
    async generateStructured() {
      return { ok: false, data: null, raw: '', error: 'mock' };
    },
  };
}

describe('executeTurn (opts object)', () => {
  it('accepts named fields and returns a valid TurnResult', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();

    const opts: ExecuteTurnOpts = {
      engine,
      client,
      history,
      playerInput: 'look',
      tone: 'dark fantasy',
    };

    const result = await executeTurn(opts);

    expect(result.playerInput).toBe('look');
    expect(result.interpreted.verb).toBe('look');
    expect(result.tick).toBe(engine.tick);
    expect(result.narration).toBeTruthy();
  });

  it('passes optional context fields through to narration', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();

    // These optional fields should not cause errors or misalignment
    const opts: ExecuteTurnOpts = {
      engine,
      client,
      history,
      playerInput: 'look',
      tone: 'dark fantasy',
      characterPresence: 'A battle-scarred warrior.',
      districtDescriptor: 'The market district hums with tension.',
      economyContext: 'Prices are inflated due to siege.',
      arcContext: 'Chapter 2: The Siege',
      endgameContext: 'The final confrontation approaches.',
    };

    const result = await executeTurn(opts);

    expect(result.playerInput).toBe('look');
    expect(result.interpreted.verb).toBe('look');
    expect(result.narration).toBeTruthy();
  });

  it('records turn in history with correct verb', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();

    await executeTurn({
      engine,
      client,
      history,
      playerInput: 'look',
      tone: 'dark fantasy',
    });

    const turns = history.getAll();
    expect(turns).toHaveLength(1);
    expect(turns[0].verb).toBe('look');
    expect(turns[0].narration).toBeTruthy();
  });
});
