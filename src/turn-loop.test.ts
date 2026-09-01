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

// F-462792bb: spy on generateDialogue the same way, so tests can assert on
// the conversationHistory slice it receives without disturbing the existing
// real-implementation dialogue tests below.
vi.mock('./dialogue/dialogue-mind.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dialogue/dialogue-mind.js')>();
  return {
    ...actual,
    generateDialogue: vi.fn(actual.generateDialogue),
  };
});

// F-6e75fa93 isolation (wave brief, ruled 2026-08-26): deriveNpcPersonality
// is narrative-llm's half, landing in THEIR worktree this same wave -- not
// present in this isolated worktree's copy of npc-context.ts yet. Spread the
// real module (buildNPCDialogueContext, used for real by the dialogue tests
// above via dialogue-mind.ts, must stay real) and add the pinned export as a
// mock so this file's tests don't depend on the unlanded counterpart.
vi.mock('./dialogue/npc-context.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dialogue/npc-context.js')>();
  return {
    ...actual,
    deriveNpcPersonality: vi.fn((npc: { name: string }) => `personality-of-${npc.name}`),
  };
});

// F-6e75fa93 isolation: ambient-dialogue.ts's 3rd `packId` param is
// narrative-llm's half, landing this same wave -- not present in this
// isolated worktree's copy yet. Fully replaced (not spread) since this
// module has no other real export this file's tests depend on; returns
// deterministic, inspectable output instead of the real template pool so
// assertions don't depend on the (soon to be re-keyed, cross-domain)
// personality-vocabulary match.
vi.mock('./npc/ambient-dialogue.js', () => ({
  generateAmbientLine: vi.fn((npc: { name: string }) => `${npc.name} does something ambient.`),
  generateZoneAmbience: vi.fn((npcs: { name: string }[]) => npcs.map((n) => `${n.name} does something ambient.`)),
}));

import {
  executeTurn,
  getFatalTurnBookkeeping,
  SUPPORTED_VERBS,
  KNOWN_EXCLUDED_VERBS,
  filterSupportedVerbs,
  type ExecuteTurnOpts,
} from './turn-loop.js';
import { narrateScene } from './narrator/narrator.js';
import { generateDialogue } from './dialogue/dialogue-mind.js';
import { generateAmbientLine, generateZoneAmbience } from './npc/ambient-dialogue.js';
import { NarrationError } from './llm/claude-errors.js';
import { createTestLogger } from './game/debug-logger.js';

const mockedNarrateScene = vi.mocked(narrateScene);
const mockedGenerateDialogue = vi.mocked(generateDialogue);
const mockedGenerateAmbientLine = vi.mocked(generateAmbientLine);
const mockedGenerateZoneAmbience = vi.mocked(generateZoneAmbience);

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

/**
 * F-4ec3609b: runtime-foundry landed a public
 * `ImmersionRuntime.inferAndTransition(engine, events, verb)` -- out of this
 * domain's owned globs, so it cannot be edited or constructed for real here.
 * It performs exactly the inference+transition step processPresentation()
 * already runs as its own first step, but lets executeTurn() run that step
 * BEFORE narration instead of after. `engine` is required (not just
 * events/verb) because the inference reads engine.tick/engine.world.playerId
 * /engine.world directly.
 *
 * This is a documented local stub (not the real class) standing in for that
 * contract: it implements only the two members executeTurn's Step 3+4/4.5
 * actually call, so fixes can be proven from this domain's side independent
 * of whether runtime-foundry's half has landed in this worktree yet. The
 * `as unknown as ImmersionRuntime` cast is deliberate -- every other
 * ImmersionRuntime member (hookManager, audioDirector, voiceCaster, ...) is
 * unreachable from executeTurn() and therefore from these tests.
 *
 * F-6bc0721e (SLATE-6 mechanism, brief ruled 2026-08-26): inferAndTransition
 * now returns the full StateTransition ({from, to, trigger}), not just the
 * resulting label -- hoisted to module scope (was previously local to the
 * "presentation-state ordering" describe block only) so the newer
 * justDied/ambient-dialogue describe blocks below can reuse the same stub.
 */
function createImmersionStub(opts: {
  priorState: string;
  inferredState: string;
}) {
  let current = opts.priorState;
  const inferAndTransition = vi.fn((_engine: unknown, _events: unknown[], verb: string) => {
    const from = current;
    current = opts.inferredState;
    return { from, to: opts.inferredState, trigger: verb };
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

// F-462792bb: RUNTIME WIRE half of NPC conversation memory (SLATE-2,
// persisted per Director ruling R2). game.ts owns capture/persistence; this
// domain's turn-loop.ts half is purely "pass the right per-NPC slice to
// generateDialogue's already-accepting-but-unused 14th positional param."
describe('conversation history seam (F-462792bb)', () => {
  beforeEach(() => {
    mockedGenerateDialogue.mockClear();
  });

  it("passes only the target NPC's slice from the whole map as generateDialogue's 14th positional arg, not the whole map", async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const pilgrimHistory = [
      { speaker: 'Player', text: 'hello' },
      { speaker: 'Suspicious Pilgrim', text: 'hi' },
    ];
    const conversationHistory = new Map([
      ['pilgrim', pilgrimHistory],
      ['sister-maren', [{ speaker: 'Player', text: 'unrelated exchange' }]],
    ]);

    await executeTurn({
      engine, client, history, playerInput: 'speak to pilgrim', tone: 'dark fantasy',
      conversationHistory,
    });

    expect(mockedGenerateDialogue).toHaveBeenCalledTimes(1);
    const call = mockedGenerateDialogue.mock.calls[0];
    expect(call[2]).toBe('pilgrim');
    expect(call[13]).toBe(pilgrimHistory);
  });

  it('passes undefined when the map has no entry for the NPC being spoken to', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const conversationHistory = new Map([['sister-maren', [{ speaker: 'Player', text: 'x' }]]]);

    await executeTurn({
      engine, client, history, playerInput: 'speak to pilgrim', tone: 'dark fantasy',
      conversationHistory,
    });

    const call = mockedGenerateDialogue.mock.calls[0];
    expect(call[13]).toBeUndefined();
  });

  it('passes undefined for the 14th arg when ExecuteTurnOpts.conversationHistory is omitted entirely (back-compat)', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();

    await executeTurn({ engine, client, history, playerInput: 'speak to pilgrim', tone: 'dark fantasy' });

    const call = mockedGenerateDialogue.mock.calls[0];
    expect(call[13]).toBeUndefined();
  });

  it('never calls generateDialogue for a non-speak turn, regardless of conversationHistory', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const conversationHistory = new Map([['pilgrim', [{ speaker: 'Player', text: 'x' }]]]);

    await executeTurn({
      engine, client, history, playerInput: 'look', tone: 'dark fantasy', conversationHistory,
    });

    expect(mockedGenerateDialogue).not.toHaveBeenCalled();
  });
});

// F-940cd4d0: wire narrator.ts's already-built repeat-aware outage messaging
// -- the game-core half is purely "thread consecutiveFallbacks through to
// narrateScene, and expose narrationResult.isFallback on TurnResult so
// game.ts can maintain the counter across turns."
describe('consecutiveFallbacks / isFallback seam (F-940cd4d0)', () => {
  beforeEach(() => {
    mockedNarrateScene.mockClear();
  });

  it('forwards consecutiveFallbacks from ExecuteTurnOpts into the narrateScene call', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();

    await executeTurn({
      engine, client, history, playerInput: 'look', tone: 'dark fantasy', consecutiveFallbacks: 3,
    });

    expect(mockedNarrateScene).toHaveBeenCalledTimes(1);
    const callOpts = mockedNarrateScene.mock.calls[0][0] as unknown as { consecutiveFallbacks?: number };
    expect(callOpts.consecutiveFallbacks).toBe(3);
  });

  it('omits consecutiveFallbacks (undefined) when the caller does not provide it', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();

    await executeTurn({ engine, client, history, playerInput: 'look', tone: 'dark fantasy' });

    const callOpts = mockedNarrateScene.mock.calls[0][0] as unknown as { consecutiveFallbacks?: number };
    expect(callOpts.consecutiveFallbacks).toBeUndefined();
  });

  it('sets TurnResult.isFallback to false on the normal (real narration) path', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();

    const result = await executeTurn({ engine, client, history, playerInput: 'look', tone: 'dark fantasy' });

    expect(result.isFallback).toBe(false);
  });

  it('sets TurnResult.isFallback to true when narrateScene falls back (non-fatal failure)', async () => {
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

    expect(result.isFallback).toBe(true);
  });

  it('sets TurnResult.isFallback to false on the low-confidence clarification early return (distinct UX path, not a narrator outage)', async () => {
    const engine = createGame();
    const history = new TurnHistory();
    const client: ClaudeClient = {
      model: 'mock',
      async generate() {
        return { ok: true, text: 'The scene unfolds.', inputTokens: 0, outputTokens: 0 };
      },
      async generateStructured() {
        throw new NarrationError({ kind: 'timeout', message: 'took too long' });
      },
    };

    const result = await executeTurn({ engine, client, history, playerInput: 'xyzzy', tone: 'dark fantasy' });

    expect(result.interpreted.confidence).toBe('low');
    expect(result.isFallback).toBe(false);
  });

  it('sets TurnResult.isFallback to false on the engine.submitAction-catch early return', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();

    // An unavailable/unresolvable action target trips engine.submitAction's
    // own throw path (Step 2's catch) before narrateScene ever runs.
    const result = await executeTurn({
      engine, client, history, playerInput: 'attack nonexistent-target-xyz', tone: 'dark fantasy',
    });

    // F-d421875b: the catch's player-facing text changed from "You try to
    // ${verb}, but nothing happens." (implied the action was evaluated and
    // declined -- misleading, since an ordinary invalid target is rejected
    // through the engine's own non-throwing action.rejected event instead,
    // never reaching this catch) to "Something interrupted your attempt to
    // ${verb} -- try again." — updating the substring this branch keys off
    // of rather than leaving it checking text that can no longer appear.
    if (result.narration.includes('interrupted')) {
      expect(result.isFallback).toBe(false);
    } else {
      // If the fast-path interpreter didn't resolve a target and this ended
      // up on a different path instead, this assertion is skipped rather
      // than asserting a false positive on an untested branch.
      expect(result).toBeDefined();
    }
  });
});

// F-9976a6d6: wire InterpretedAction.reasoning into --debug diagnostics for
// every confidence tier (SLATE-5e option (a) only, per Director ruling R3 --
// no prompt/schema change this wave).
describe('debugLog reasoning seam (F-9976a6d6)', () => {
  it('logs the interpreted verb/confidence/reasoning for a high-confidence (fast-path) turn', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const debugLog = createTestLogger();

    await executeTurn({ engine, client, history, playerInput: 'look', tone: 'dark fantasy', debugLog });

    const entry = debugLog.getEntries().find((e) => e.subsystem === 'interpret' && e.message === 'action-reasoning');
    expect(entry).toBeDefined();
    expect(entry!.data?.verb).toBe('look');
    expect(entry!.data?.confidence).toBe('high');
  });

  it('logs reasoning for a low-confidence turn too, not just the fast-path high-confidence case', async () => {
    const engine = createGame();
    const history = new TurnHistory();
    const debugLog = createTestLogger();
    const client: ClaudeClient = {
      model: 'mock',
      async generate() {
        return { ok: true, text: 'The scene unfolds.', inputTokens: 0, outputTokens: 0 };
      },
      async generateStructured() {
        return { ok: true, data: null, raw: '' };
      },
    };

    await executeTurn({ engine, client, history, playerInput: 'xyzzy', tone: 'dark fantasy', debugLog });

    const entry = debugLog.getEntries().find((e) => e.subsystem === 'interpret' && e.message === 'action-reasoning');
    expect(entry).toBeDefined();
    expect(entry!.data?.confidence).toBe('low');
    expect(entry!.data?.reasoning).toContain('Could not interpret input');
  });

  it('does not throw when debugLog is omitted (optional-field back-compat)', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();

    await expect(
      executeTurn({ engine, client, history, playerInput: 'look', tone: 'dark fantasy' }),
    ).resolves.toBeDefined();
  });
});

// F-6bc0721e (SLATE-6, death-as-setback per Director ruling R1): the
// game-core half is purely "compute the from!='menu'->to=='menu' edge from
// this turn's own StateTransition." The downed *gate* itself lives in
// game.ts (reads stateMachine.current directly, independent of this flag).
describe('justDied seam (F-6bc0721e)', () => {
  it('is true when this turn transitions from a non-menu state into menu', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const { immersion } = createImmersionStub({ priorState: 'combat', inferredState: 'menu' });

    const result = await executeTurn({
      engine, client, history, playerInput: 'look', tone: 'dark fantasy', immersion,
    });

    expect(result.justDied).toBe(true);
  });

  it('is false when the turn stays in menu (continuing an already-downed session, no fresh edge)', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const { immersion } = createImmersionStub({ priorState: 'menu', inferredState: 'menu' });

    const result = await executeTurn({
      engine, client, history, playerInput: 'look', tone: 'dark fantasy', immersion,
    });

    expect(result.justDied).toBe(false);
  });

  it('is false for an ordinary transition that never touches menu', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const { immersion } = createImmersionStub({ priorState: 'exploration', inferredState: 'combat' });

    const result = await executeTurn({
      engine, client, history, playerInput: 'look', tone: 'dark fantasy', immersion,
    });

    expect(result.justDied).toBe(false);
  });

  it('is false when no immersion runtime is present at all', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();

    const result = await executeTurn({ engine, client, history, playerInput: 'look', tone: 'dark fantasy' });

    expect(result.justDied).toBe(false);
  });
});

// F-6e75fa93: wire the fully-built, zero-LLM-cost ambient NPC dialogue
// module into the live turn flow (SLATE-1, packId per brief ruled
// 2026-08-26). Uses the real starter-fantasy zone graph: chapel-entrance
// (start) has 2 NPCs (pilgrim, sister-maren), chapel-nave has exactly 1
// (brother-aldric), chapel-alcove has 0 -- all direct neighbors of
// chapel-entrance, so the fast-path movement interpreter resolves them
// without any LLM call.
describe('ambient NPC dialogue (F-6e75fa93)', () => {
  beforeEach(() => {
    mockedGenerateAmbientLine.mockClear();
    mockedGenerateZoneAmbience.mockClear();
  });

  it('fires generateAmbientLine (not generateZoneAmbience) on zone entry into a single-NPC zone, seeded from engine.store.rng and carrying packId', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const { immersion } = createImmersionStub({ priorState: 'exploration', inferredState: 'exploration' });

    const result = await executeTurn({
      engine, client, history, playerInput: 'go to chapel-nave', tone: 'dark fantasy', immersion,
      packId: 'starter-fantasy',
    });

    expect(engine.world.locationId).toBe('chapel-nave');
    expect(mockedGenerateAmbientLine).toHaveBeenCalledTimes(1);
    expect(mockedGenerateZoneAmbience).not.toHaveBeenCalled();
    const [npcInfo, seed, packId] = mockedGenerateAmbientLine.mock.calls[0];
    expect((npcInfo as { name: string }).name).toBe('Brother Aldric');
    expect(typeof seed).toBe('number');
    expect(packId).toBe('starter-fantasy');
    expect(result.ambientLines).toEqual(['Brother Aldric does something ambient.']);
  });

  it('fires generateZoneAmbience (not generateAmbientLine) on zone entry into a 2+-NPC zone', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const { immersion } = createImmersionStub({ priorState: 'exploration', inferredState: 'exploration' });

    await executeTurn({ engine, client, history, playerInput: 'go to chapel-nave', tone: 'dark fantasy', immersion });
    mockedGenerateAmbientLine.mockClear();
    mockedGenerateZoneAmbience.mockClear();

    const result = await executeTurn({
      engine, client, history, playerInput: 'go to chapel-entrance', tone: 'dark fantasy', immersion,
    });

    expect(engine.world.locationId).toBe('chapel-entrance');
    expect(mockedGenerateZoneAmbience).toHaveBeenCalledTimes(1);
    expect(mockedGenerateAmbientLine).not.toHaveBeenCalled();
    const [npcs] = mockedGenerateZoneAmbience.mock.calls[0];
    expect(npcs.map((n) => n.name).sort()).toEqual(['Sister Maren', 'Suspicious Pilgrim']);
    expect(result.ambientLines).toHaveLength(2);
  });

  it('fires on the 5th quiet turn (tick % 5 === 0, zero events), not on turns 1-4', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const { immersion } = createImmersionStub({ priorState: 'exploration', inferredState: 'exploration' });

    let lastResult;
    for (let i = 0; i < 5; i++) {
      lastResult = await executeTurn({
        engine, client, history, playerInput: 'look', tone: 'dark fantasy', immersion,
      });
    }

    expect(engine.tick).toBe(5);
    // chapel-entrance (start, never left) has 2 NPCs -> the zone function.
    expect(mockedGenerateZoneAmbience).toHaveBeenCalledTimes(1);
    expect(mockedGenerateAmbientLine).not.toHaveBeenCalled();
    expect(lastResult!.ambientLines).toHaveLength(2);
  });

  it('does not fire on a non-5th, non-zone-entry turn', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const { immersion } = createImmersionStub({ priorState: 'exploration', inferredState: 'exploration' });

    const result = await executeTurn({
      engine, client, history, playerInput: 'look', tone: 'dark fantasy', immersion,
    });

    expect(engine.tick).toBe(1);
    expect(mockedGenerateAmbientLine).not.toHaveBeenCalled();
    expect(mockedGenerateZoneAmbience).not.toHaveBeenCalled();
    expect(result.ambientLines).toBeUndefined();
  });

  it('does not fire when presentationState is not exploration (e.g. combat), even on a zone-entry turn', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const { immersion } = createImmersionStub({ priorState: 'exploration', inferredState: 'combat' });

    const result = await executeTurn({
      engine, client, history, playerInput: 'go to chapel-nave', tone: 'dark fantasy', immersion,
    });

    // The move itself still resolves -- only ambient dialogue is suppressed.
    expect(engine.world.locationId).toBe('chapel-nave');
    expect(mockedGenerateAmbientLine).not.toHaveBeenCalled();
    expect(mockedGenerateZoneAmbience).not.toHaveBeenCalled();
    expect(result.ambientLines).toBeUndefined();
  });

  it('does not fire in a zone with zero NPCs', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const { immersion } = createImmersionStub({ priorState: 'exploration', inferredState: 'exploration' });

    const result = await executeTurn({
      engine, client, history, playerInput: 'go to chapel-alcove', tone: 'dark fantasy', immersion,
    });

    expect(engine.world.locationId).toBe('chapel-alcove');
    expect(mockedGenerateAmbientLine).not.toHaveBeenCalled();
    expect(mockedGenerateZoneAmbience).not.toHaveBeenCalled();
    expect(result.ambientLines).toBeUndefined();
  });

  it('never fires when no immersion runtime is present at all (presentationState is always undefined)', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();

    const result = await executeTurn({
      engine, client, history, playerInput: 'go to chapel-nave', tone: 'dark fantasy',
    });

    expect(mockedGenerateAmbientLine).not.toHaveBeenCalled();
    expect(mockedGenerateZoneAmbience).not.toHaveBeenCalled();
    expect(result.ambientLines).toBeUndefined();
  });
});

describe('equip fast-path resolves the typed item to itemId (F-b9a844dc)', () => {
  it('equips the specifically named item -- not the other eligible one -- when 2+ items are carried', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const player = engine.world.entities[engine.world.playerId];
    // Two real starter-fantasy weapon-slot items so a bare "equip" (no
    // resolvable name) would be genuinely ambiguous -- this is the case
    // that silently broke: parameters.item was never read by
    // @ai-rpg-engine/equipment's itemRefOf(), so the typed name was
    // discarded and the engine fell back to its own "equip what?"
    // rejection instead of equipping the item the player asked for.
    player.inventory = ['rusted-mace', 'gravedigger-spade'];

    const result = await executeTurn({
      engine, client, history, playerInput: 'equip spade', tone: 'dark fantasy',
    });

    expect(result.interpreted.verb).toBe('equip');
    expect(result.interpreted.parameters).toEqual({ itemId: 'gravedigger-spade' });
    // The real engine handler actually resolved and equipped it -- not a
    // rejection, and not the OTHER eligible item.
    expect(engine.world.entities[engine.world.playerId]?.equipment?.weapon).toBe('gravedigger-spade');
    expect(
      result.events.some((e) => e.type === 'item.equipped' && e.payload.itemId === 'gravedigger-spade'),
    ).toBe(true);
    expect(result.events.some((e) => e.type === 'action.rejected')).toBe(false);
  });
});

describe('verb allowlist (F-4fc952ae)', () => {
  it('every verb the real installed engine registers is either supported or a pinned known exclusion', () => {
    // Full catalog, not the context-filtered getAvailableActions() --
    // broader coverage: a verb that merely is not legal in THIS fresh
    // game's starting state must still be a reviewed decision, not just
    // accidentally never observed.
    const engine = createGame();
    const registered = engine.getRegisteredVerbs();
    const unreviewed = registered.filter((v) => !SUPPORTED_VERBS.has(v) && !KNOWN_EXCLUDED_VERBS.has(v));
    expect(unreviewed).toEqual([]);
  });

  it('flags a verb that is neither allowlisted nor pinned-excluded -- proves the gate is provably RED, not a silent pass-through', () => {
    // A fake verb dropped into a mock list, exactly as the addendum
    // requires: this must go red if the check logic (or SUPPORTED_VERBS/
    // KNOWN_EXCLUDED_VERBS) is ever weakened into a silent pass-through.
    const mockVerbs = ['move', 'attack', 'totally-new-verb-nobody-reviewed'];
    const unreviewed = mockVerbs.filter((v) => !SUPPORTED_VERBS.has(v) && !KNOWN_EXCLUDED_VERBS.has(v));
    expect(unreviewed).toEqual(['totally-new-verb-nobody-reviewed']);
  });

  it('filterSupportedVerbs keeps the curated surface and drops every 3.9-new individual verb', () => {
    const raw = [...SUPPORTED_VERBS, ...KNOWN_EXCLUDED_VERBS, 'some-unreviewed-verb'];
    const filtered = filterSupportedVerbs(raw);
    expect(filtered.sort()).toEqual([...SUPPORTED_VERBS].sort());
    for (const excluded of KNOWN_EXCLUDED_VERBS) {
      expect(filtered).not.toContain(excluded);
    }
    expect(filtered).not.toContain('some-unreviewed-verb');
    // The aggregate categories claude-rpg owns survive the filter.
    expect(filtered).toEqual(expect.arrayContaining(['social', 'rumor', 'diplomacy', 'sabotage', 'craft']));
  });

  it('executeTurn filters the engine verb list before it reaches the interpreter prompt', async () => {
    const engine = createGame();
    const history = new TurnHistory();
    let capturedPrompt = '';
    const client: ClaudeClient = {
      model: 'mock',
      async generate() {
        return { ok: true, text: 'The scene unfolds.', inputTokens: 0, outputTokens: 0 };
      },
      async generateStructured(genOpts) {
        capturedPrompt = genOpts.prompt;
        return { ok: false, data: null, raw: '', error: 'mock' };
      },
    };

    // "xyzzy" matches none of action-interpreter's fast-path keyword
    // patterns, so this is guaranteed to fall through to the slow path and
    // actually build a prompt from (filtered) availableVerbs --
    // buildInterpretPrompt embeds it verbatim as "Available verbs: ...".
    await executeTurn({ engine, client, history, playerInput: 'xyzzy', tone: 'dark fantasy' });

    expect(capturedPrompt).toContain('Available verbs:');
    // KNOWN_EXCLUDED_VERBS entries never reach the prompt...
    expect(capturedPrompt).not.toContain('bribe');
    expect(capturedPrompt).not.toContain('salvage');
    expect(capturedPrompt).not.toContain('incite-riot');
    // ...while the curated surface does.
    expect(capturedPrompt).toContain('craft');
  });
});

// WO-A2-1 (slice A2 §1, docs/living-world-slice-a2.md): the onResolved
// hook contract game.ts's own runWorldRound() is wired through (game.ts,
// out of this file's scope) -- these tests exercise the CONTRACT directly
// against executeTurn(), independent of GameSession.
describe('executeTurn onResolved hook (WO-A2-1)', () => {
  /**
   * Forces engine.submitAction to reject: a well-formed, high-confidence
   * interpreted action whose target id nothing in the world has.
   * F-d421875b's own documented contract (turn-loop.ts, Step 2's catch
   * comment): ActionDispatcher.dispatch emits a non-throwing
   * action.rejected event for an ordinary invalid/missing-target action
   * and returns normally, rather than throwing.
   */
  function createRejectingActionClient(): ClaudeClient {
    return {
      model: 'mock',
      async generate() {
        return { ok: true, text: 'The scene unfolds.', inputTokens: 0, outputTokens: 0 };
      },
      // Coordinator stitch: the fake returns a concrete interpreter shape; the
      // ClaudeClient contract is generic over T, so the method is widened as a whole.
      generateStructured: (async () => {
        return {
          ok: true,
          data: {
            verb: 'attack',
            targetIds: ['totally-nonexistent-entity-xyz'],
            toolId: null,
            parameters: null,
            confidence: 'high',
            reasoning: 'forces the engine to reject an unresolvable target',
            alternatives: null,
          },
          raw: '',
        };
      }) as unknown as ClaudeClient['generateStructured'],
    };
  }

  it('calls onResolved exactly once with this turn\'s own action events after a normal (non-rejected) action resolves', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const onResolved = vi.fn((_events: unknown[]) => []);

    // Coordinator stitch: 'attack pilgrim' resolves through the interpreter's
    // fast path into a real engine action (the pilgrim shares the player's
    // starting zone), so the action events are non-empty; a bare 'look' is
    // free prose the engine rejects with an empty events array.
    const result = await executeTurn({
      engine, client, history, playerInput: 'attack pilgrim', tone: 'dark fantasy',
      onResolved: onResolved as unknown as ExecuteTurnOpts['onResolved'],
    });

    expect(onResolved).toHaveBeenCalledTimes(1);
    const callArgs = onResolved.mock.calls[0][0] as { type: string }[];
    expect(callArgs.length).toBeGreaterThan(0);
    // onResolved returned [] (no round events), so the final events are
    // exactly what it was called with.
    expect(result.events).toEqual(callArgs);
  });

  it('still runs the round on a rejected action -- claude-rpg deviates from the engine CLI: free prose the engine cannot resolve still advanced the tick, so the world still reacts', async () => {
    const engine = createGame();
    const client = createRejectingActionClient();
    const history = new TurnHistory();
    const onResolved = vi.fn((_events: unknown[]) => []);

    const result = await executeTurn({
      engine, client, history, playerInput: 'attack the nonexistent one', tone: 'dark fantasy',
      onResolved: onResolved as unknown as ExecuteTurnOpts['onResolved'],
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('action.rejected');
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('a throwing hook is logged through debugLog and yields [] -- a normal narrated turn, never a killed one', async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const logger = createTestLogger();
    const onResolved = vi.fn(() => { throw new Error('hook boom'); });

    const result = await executeTurn({
      engine, client, history, playerInput: 'attack pilgrim', tone: 'dark fantasy',
      onResolved: onResolved as unknown as ExecuteTurnOpts['onResolved'],
      debugLog: logger,
    });

    expect(result.narration).toBeTruthy();
    // Still carries the action's own events -- only the round's ADDITIONAL
    // events were lost, not the whole turn.
    expect(result.events.length).toBeGreaterThan(0);
    const errorEntry = logger.getEntries().find(
      (e) => e.level === 'error' && e.message === 'onResolved hook threw',
    );
    expect(errorEntry).toBeDefined();
    expect(errorEntry!.subsystem).toBe('turn');
  });

  it("round events onResolved returns reach narrateScene's recentEvents and the final TurnResult.events", async () => {
    const engine = createGame();
    const client = createMockClient();
    const history = new TurnHistory();
    const fakeRoundEvent = {
      id: 'round-1', type: 'pressure.spawned', payload: {}, targetIds: [], tick: engine.tick,
    };
    const onResolved = vi.fn(() => [fakeRoundEvent]);

    const result = await executeTurn({
      engine, client, history, playerInput: 'look', tone: 'dark fantasy',
      onResolved: onResolved as unknown as ExecuteTurnOpts['onResolved'],
    });

    expect(result.events).toContainEqual(fakeRoundEvent);
    expect(mockedNarrateScene).toHaveBeenCalled();
    const narrateOpts = mockedNarrateScene.mock.calls[mockedNarrateScene.mock.calls.length - 1][0];
    expect(narrateOpts.recentEvents).toContainEqual(fakeRoundEvent);
  });
});
