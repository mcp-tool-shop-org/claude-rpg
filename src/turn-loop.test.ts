import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { TurnHistory } from './session/history.js';
import type { ClaudeClient } from './claude-client.js';

// F-7815df9e: spy on narrateScene (delegating to the real implementation by
// default) so we can assert on the opts it actually receives, without
// disturbing any other test in this file.
vi.mock('./narrator/narrator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./narrator/narrator.js')>();
  return {
    ...actual,
    narrateScene: vi.fn(actual.narrateScene),
  };
});

import { executeTurn, getFatalTurnBookkeeping, type ExecuteTurnOpts } from './turn-loop.js';
import { narrateScene } from './narrator/narrator.js';
import { NarrationError } from './llm/claude-errors.js';

const mockedNarrateScene = vi.mocked(narrateScene);

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

  describe('chronicleContext seam (F-7815df9e)', () => {
    beforeEach(() => {
      mockedNarrateScene.mockClear();
    });

    it('forwards chronicleContext from ExecuteTurnOpts into the narrateScene call', async () => {
      const engine = createGame();
      const client = createMockClient();
      const history = new TurnHistory();
      const chronicleContext = 'Chronicle: [3 events over 12 turns] Betrayed the merchant guild.';

      const opts: ExecuteTurnOpts = {
        engine,
        client,
        history,
        playerInput: 'look',
        tone: 'dark fantasy',
        chronicleContext,
      };

      await executeTurn(opts);

      expect(mockedNarrateScene).toHaveBeenCalledTimes(1);
      const callOpts = mockedNarrateScene.mock.calls[0][0] as unknown as { chronicleContext?: string };
      expect(callOpts.chronicleContext).toBe(chronicleContext);
    });

    it('omits chronicleContext when the caller does not provide it', async () => {
      const engine = createGame();
      const client = createMockClient();
      const history = new TurnHistory();

      await executeTurn({ engine, client, history, playerInput: 'look', tone: 'dark fantasy' });

      expect(mockedNarrateScene).toHaveBeenCalledTimes(1);
      const callOpts = mockedNarrateScene.mock.calls[0][0] as unknown as { chronicleContext?: string };
      expect(callOpts.chronicleContext).toBeUndefined();
    });
  });

  describe('fatal narration error after world mutation (F-c4332895)', () => {
    beforeEach(() => {
      mockedNarrateScene.mockClear();
    });

    it('records the turn with fallback narration and rethrows when narrateScene throws fatally', async () => {
      const engine = createGame();
      const client = createMockClient();
      const history = new TurnHistory();

      // "attack pilgrim" resolves through engine.submitAction (Step 2) *before*
      // narrateScene runs (Step 3) — the world mutation (combat) has already
      // happened by the time narration fails.
      mockedNarrateScene.mockRejectedValueOnce(
        new NarrationError({ kind: 'auth', message: 'invalid api key' }),
      );

      await expect(
        executeTurn({ engine, client, history, playerInput: 'attack pilgrim', tone: 'dark fantasy' }),
      ).rejects.toBeInstanceOf(NarrationError);

      // History has the turn recorded with fallback narration — not silently
      // dropped just because executeTurn() never returned a TurnResult.
      const turns = history.getAll();
      expect(turns).toHaveLength(1);
      expect(turns[0].verb).toBe('attack');
      expect(turns[0].narration).toBeTruthy();
      // F-8da2e6f7: the fatal-bookkeeping path must flag this turn as
      // fallback so getRecentNarration() (and recap.ts) exclude the
      // placeholder text from later narration prompts / recap display.
      expect(turns[0].isFallback).toBe(true);
    });

    it('attaches turn bookkeeping to the rethrown error for the caller to recover', async () => {
      const engine = createGame();
      const client = createMockClient();
      const history = new TurnHistory();

      mockedNarrateScene.mockRejectedValueOnce(
        new NarrationError({ kind: 'bad-request', message: 'malformed prompt' }),
      );

      let caught: unknown;
      try {
        await executeTurn({ engine, client, history, playerInput: 'attack pilgrim', tone: 'dark fantasy' });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(NarrationError);
      const bookkeeping = getFatalTurnBookkeeping(caught);
      expect(bookkeeping).toBeDefined();
      expect(bookkeeping!.interpreted.verb).toBe('attack');
      expect(bookkeeping!.events.length).toBeGreaterThan(0);
      expect(bookkeeping!.profileHints.xpGained).toBeGreaterThan(0);
    });

    it('leaves non-fatal (retryable) narration failures on their existing fallback path, not the new bookkeeping path', async () => {
      // Sanity check the fatal-only scope of the new catch: narrateScene's own
      // F-304fc328 try/catch already absorbs retryable kinds into a fallback
      // NarrationResult instead of throwing, so executeTurn's new catch must
      // never even trigger for them. Left unmocked so the real narrateScene
      // implementation runs (mockedNarrateScene wraps `actual.narrateScene` by
      // default — see the vi.mock at the top of this file).
      const engine = createGame();
      const history = new TurnHistory();
      const flakyClient: ClaudeClient = {
        model: 'mock',
        async generate() {
          throw new NarrationError({ kind: 'timeout', message: 'took too long' });
        },
        async generateStructured() {
          return { ok: false, data: null, raw: '', error: 'mock' };
        },
      };

      const result = await executeTurn({
        engine, client: flakyClient, history, playerInput: 'look', tone: 'dark fantasy',
      });

      expect(result.narration).toBeTruthy();
      expect(history.getAll()).toHaveLength(1);
      // F-8da2e6f7: narrator.ts's own F-304fc328 catch already absorbed this
      // into a fallback NarrationResult (isFallback: true) rather than
      // throwing — executeTurn()'s success path must carry that flag
      // through to the recorded turn.
      expect(history.getAll()[0].isFallback).toBe(true);
    });
  });
});
