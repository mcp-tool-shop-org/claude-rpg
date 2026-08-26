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

  describe('fatal dialogue error after successful narration (F-b6494bc2)', () => {
    beforeEach(() => {
      mockedNarrateScene.mockClear();
    });

    /**
     * Client whose first generate() call (consumed by narrateScene's Step
     * 3+4) succeeds, and whose second call (consumed by generateDialogue's
     * Step 5, gated on the 'speak' verb) rejects with a fatal NarrationError
     * — dialogue-mind.ts's F-6480985e contract rethrows exactly this kind
     * (auth/bad-request) rather than absorbing it into an in-character
     * fallback, mirroring narrateScene's own F-304fc328 fatal contract.
     * interpretAction's fast path resolves 'speak to pilgrim' without any
     * client call, so call #1 is deterministically narrateScene's and call
     * #2 is deterministically generateDialogue's.
     */
    function createNarrationThenFatalDialogueClient(): ClaudeClient {
      let calls = 0;
      return {
        model: 'mock',
        async generate() {
          calls += 1;
          if (calls === 1) {
            return { ok: true, text: 'The pilgrim looks up as you approach.', inputTokens: 0, outputTokens: 0 };
          }
          throw new NarrationError({ kind: 'bad-request', message: 'npc dialogue payload rejected' });
        },
        async generateStructured() {
          return { ok: false, data: null, raw: '', error: 'mock' };
        },
      };
    }

    it('records the turn with the narration that already succeeded (dialogue omitted) and rethrows when generateDialogue fails fatally', async () => {
      const engine = createGame();
      const client = createNarrationThenFatalDialogueClient();
      const history = new TurnHistory();

      await expect(
        executeTurn({ engine, client, history, playerInput: 'speak to pilgrim', tone: 'dark fantasy' }),
      ).rejects.toBeInstanceOf(NarrationError);

      // Step 3+4 (narrateScene) already succeeded — real narration was
      // computed. Step 5's fatal dialogue failure must not lose it: the
      // turn is still recorded, with that real narration, dialogue omitted
      // (never generated), not the generic FATAL_NARRATION_FALLBACK text
      // Step 3+4's own catch would have used.
      const turns = history.getAll();
      expect(turns).toHaveLength(1);
      expect(turns[0].verb).toBe('speak');
      expect(turns[0].narration).toBe('The pilgrim looks up as you approach.');
      expect(turns[0].dialogue).toBeUndefined();
      expect(turns[0].isFallback).toBe(false);
    });

    it('attaches turn bookkeeping (with the real narration) to the rethrown error for the caller to recover', async () => {
      const engine = createGame();
      const client = createNarrationThenFatalDialogueClient();
      const history = new TurnHistory();

      let caught: unknown;
      try {
        await executeTurn({ engine, client, history, playerInput: 'speak to pilgrim', tone: 'dark fantasy' });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(NarrationError);
      const bookkeeping = getFatalTurnBookkeeping(caught);
      expect(bookkeeping).toBeDefined();
      expect(bookkeeping!.interpreted.verb).toBe('speak');
      expect(bookkeeping!.narration).toBe('The pilgrim looks up as you approach.');
      expect(bookkeeping!.tick).toBe(engine.tick);
    });
  });

  describe('low-confidence clarification path (F-d026f78d / F-e8262ed1 / F-fb9e78af)', () => {
    /** Client whose slow-path interpretation always throws a (retryable-kind) NarrationError. */
    function createInterpretFailureClient(): ClaudeClient {
      return {
        model: 'mock',
        async generate() {
          return { ok: true, text: 'The scene unfolds.', inputTokens: 0, outputTokens: 0 };
        },
        async generateStructured() {
          throw new NarrationError({ kind: 'timeout', message: 'took too long' });
        },
      };
    }

    it('resolves to the clarification fallback instead of throwing when interpretAction hits a transient API failure (F-d026f78d)', async () => {
      const engine = createGame();
      const client = createInterpretFailureClient();
      const history = new TurnHistory();
      const tickBefore = engine.tick;

      // "xyzzy" matches no fast-path pattern, forcing interpretAction's slow
      // (LLM) path, which this client fails every time.
      const result = await executeTurn({ engine, client, history, playerInput: 'xyzzy', tone: 'dark fantasy' });

      expect(result.interpreted.confidence).toBe('low');
      expect(result.narration).toBeTruthy();
      expect(result.events).toEqual([]);
      // Consumes no turn: Step 2 (engine.submitAction) never ran.
      expect(engine.tick).toBe(tickBefore);

      // Session continues: a follow-up turn (fast-path, no LLM interpretation
      // call) still works normally afterward.
      const next = await executeTurn({ engine, client, history, playerInput: 'look', tone: 'dark fantasy' });
      expect(next.narration).toBeTruthy();
    });

    it('surfaces a transient-retry framing rather than the generic "something else" text (F-e8262ed1)', async () => {
      const engine = createGame();
      const client = createInterpretFailureClient();
      const history = new TurnHistory();

      const result = await executeTurn({ engine, client, history, playerInput: 'xyzzy', tone: 'dark fantasy' });

      expect(result.narration).not.toContain('something else');
      expect(result.narration.toLowerCase()).toContain('try again');
    });

    it('still surfaces the PB-007 transient-retry message for a non-throwing ok:false response (unchanged mapping)', async () => {
      // action-interpreter.ts's pre-existing isApiFailure = !result.ok maps
      // every non-throwing `ok:false` (unparseable JSON, validator
      // rejection) to the same "hazy...try again" reasoning as a thrown
      // error — this test pins that this rewrite doesn't disturb it.
      const engine = createGame();
      const history = new TurnHistory();
      const client: ClaudeClient = {
        model: 'mock',
        async generate() {
          return { ok: true, text: 'The scene unfolds.', inputTokens: 0, outputTokens: 0 };
        },
        async generateStructured() {
          return { ok: false, data: null, raw: '', error: 'no json found' };
        },
      };

      const result = await executeTurn({ engine, client, history, playerInput: 'xyzzy', tone: 'dark fantasy' });
      expect(result.narration.toLowerCase()).toContain('try again');
    });

    it('surfaces the "Could not interpret input" reasoning for an ok:true/data:null response', async () => {
      // The only way action-interpreter.ts's isApiFailure branch resolves to
      // "Could not interpret input" rather than the transient-retry message.
      const engine = createGame();
      const history = new TurnHistory();
      const client: ClaudeClient = {
        model: 'mock',
        async generate() {
          return { ok: true, text: 'The scene unfolds.', inputTokens: 0, outputTokens: 0 };
        },
        async generateStructured() {
          return { ok: true, data: null, raw: '' };
        },
      };

      const result = await executeTurn({ engine, client, history, playerInput: 'xyzzy', tone: 'dark fantasy' });
      expect(result.narration).toContain('Could not interpret input');
    });

    it('builds the clarification from full alternatives — verb plus resolved target name (F-fb9e78af)', async () => {
      const engine = createGame();
      const history = new TurnHistory();
      const client: ClaudeClient = {
        model: 'mock',
        async generate() {
          return { ok: true, text: 'The scene unfolds.', inputTokens: 0, outputTokens: 0 };
        },
        async generateStructured<T>() {
          const data = {
            verb: 'attack', targetIds: null, toolId: null, parameters: null,
            confidence: 'low', reasoning: 'ambiguous',
            alternatives: [{ verb: 'attack', targetIds: ['pilgrim'] }, { verb: 'examine', targetIds: [] }],
          };
          // F-39b958e7 pattern: a concrete non-null `data` shape can't
          // satisfy the generic ClaudeClient.generateStructured<T>() without
          // this cast (see action-interpreter.test.ts's established fix for
          // the same friction).
          return { ok: true, data: data as unknown as T, raw: '' };
        },
      };

      // "get it" matches no fast-path pattern.
      const result = await executeTurn({ engine, client, history, playerInput: 'get it', tone: 'dark fantasy' });

      // 'pilgrim' resolves to a real starter-fantasy entity ("Suspicious
      // Pilgrim") — the alternative with a target id should name it, the one
      // with an empty targetIds array should fall back to the bare verb.
      expect(result.narration).toContain('attack Suspicious Pilgrim');
      expect(result.narration).toContain('examine');
    });

    it('records the clarification turn to history, marked as fallback, excluded from getRecentNarration (F-fb9e78af)', async () => {
      const engine = createGame();
      const client = createInterpretFailureClient();
      const history = new TurnHistory();

      const result = await executeTurn({ engine, client, history, playerInput: 'xyzzy', tone: 'dark fantasy' });

      const turns = history.getAll();
      expect(turns).toHaveLength(1);
      expect(turns[0].narration).toBe(result.narration);
      expect(turns[0].isFallback).toBe(true);
      expect(history.getRecentNarration(3)).not.toContain(result.narration);
    });

    it('threads the previous clarification into the next interpretAction call as recentContext (F-fb9e78af)', async () => {
      const engine = createGame();
      const history = new TurnHistory();
      const prompts: string[] = [];
      let call = 0;
      const client: ClaudeClient = {
        model: 'mock',
        async generate() {
          return { ok: true, text: 'The scene unfolds.', inputTokens: 0, outputTokens: 0 };
        },
        async generateStructured<T>(opts: { prompt: string }) {
          call += 1;
          prompts.push(opts.prompt);
          // F-39b958e7 pattern: see the cast note in the previous test.
          if (call === 1) {
            const data = {
              verb: 'attack', targetIds: null, toolId: null, parameters: null,
              confidence: 'low', reasoning: 'ambiguous',
              alternatives: [{ verb: 'attack', targetIds: ['pilgrim'] }, { verb: 'flee', targetIds: [] }],
            };
            return { ok: true, data: data as unknown as T, raw: '' };
          }
          const data = {
            verb: 'attack', targetIds: ['pilgrim'], toolId: null, parameters: null,
            confidence: 'high', reasoning: 'resolved from context', alternatives: null,
          };
          return { ok: true, data: data as unknown as T, raw: '' };
        },
      };

      // "get it" and a bare "attack" (no trailing target) both miss every
      // fast-path pattern, forcing the slow path both turns.
      await executeTurn({ engine, client, history, playerInput: 'get it', tone: 'dark fantasy' });
      await executeTurn({ engine, client, history, playerInput: 'attack', tone: 'dark fantasy' });

      expect(call).toBe(2);
      expect(prompts[1]).toContain('Recent context');
      expect(prompts[1]).toContain('get it');
    });
  });

  describe('presentation-state ordering (F-4ec3609b, game-core half of the ORDERING contract)', () => {
    beforeEach(() => {
      mockedNarrateScene.mockClear();
    });

    /**
     * F-4ec3609b: runtime-foundry landed a public
     * `ImmersionRuntime.inferAndTransition(engine, events, verb):
     * PresentationState` this same wave (src/runtime/immersion-runtime.ts)
     * -- out of this domain's owned globs, so it cannot be edited or
     * constructed for real here. It performs exactly the inference+
     * transition step processPresentation() already runs as its own first
     * step, but lets executeTurn() run that step BEFORE narration instead
     * of after. `engine` is required (not just events/verb) because the
     * inference reads engine.tick/engine.world.playerId/engine.world
     * directly -- reconciled against the real shipped 3-arg signature
     * (contract adjudication, wave 16).
     *
     * This is a documented local stub (not the real class) standing in for
     * that contract: it implements only the two members executeTurn's Step
     * 3+4/4.5 actually call, so the ordering fix below can be proven from
     * this domain's side independent of whether runtime-foundry's half has
     * landed in this worktree yet. The `as unknown as ImmersionRuntime`
     * cast is deliberate -- every other ImmersionRuntime member
     * (hookManager, audioDirector, voiceCaster, ...) is unreachable from
     * executeTurn() and therefore from this test.
     */
    function createImmersionStub(opts: {
      priorState: string;
      inferredState: string;
    }) {
      let current = opts.priorState;
      const inferAndTransition = vi.fn((_engine: unknown, _events: unknown[], _verb: string) => {
        current = opts.inferredState;
        return opts.inferredState;
      });
      const processPresentation = vi.fn(async () => []);
      const raw = {
        stateMachine: {
          get current() {
            return current;
          },
        },
        inferAndTransition,
        processPresentation,
      };
      return {
        immersion: raw as unknown as ExecuteTurnOpts['immersion'],
        inferAndTransition,
        processPresentation,
      };
    }

    it("passes this turn's inferred presentation state to narrateScene, not the prior turn's stateMachine.current", async () => {
      const engine = createGame();
      const client = createMockClient();
      const history = new TurnHistory();
      const { immersion } = createImmersionStub({ priorState: 'exploration', inferredState: 'combat' });

      await executeTurn({
        engine, client, history, playerInput: 'look', tone: 'dark fantasy',
        immersion,
      });

      expect(mockedNarrateScene).toHaveBeenCalledTimes(1);
      const callOpts = mockedNarrateScene.mock.calls[0][0] as unknown as { presentationState?: string };
      // Before the fix, this read immersion.stateMachine.current *before*
      // inferAndTransition ran, so it would still be 'exploration' here.
      expect(callOpts.presentationState).toBe('combat');
    });

    it('calls inferAndTransition (pre-narration pass) before narrateScene, and processPresentation after', async () => {
      const engine = createGame();
      const client = createMockClient();
      const history = new TurnHistory();
      const { immersion, inferAndTransition, processPresentation } = createImmersionStub({
        priorState: 'exploration',
        inferredState: 'exploration',
      });

      await executeTurn({
        engine, client, history, playerInput: 'look', tone: 'dark fantasy',
        immersion,
      });

      expect(inferAndTransition).toHaveBeenCalledTimes(1);
      expect(inferAndTransition).toHaveBeenCalledWith(engine, expect.any(Array), 'look');
      expect(processPresentation).toHaveBeenCalledTimes(1);

      const inferOrder = inferAndTransition.mock.invocationCallOrder[0];
      const narrateOrder = mockedNarrateScene.mock.invocationCallOrder[0];
      const processOrder = processPresentation.mock.invocationCallOrder[0];
      expect(inferOrder).toBeLessThan(narrateOrder);
      expect(narrateOrder).toBeLessThan(processOrder);
    });
  });
});
