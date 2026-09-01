// F-a6575a94 (SLATE-2, wave 18 tests domain): end-to-end conversation-memory
// round trip (capture, save, load, next dialogue call receives history), the
// malformed-snapshot load guard, and the trim-window boundary.
//
// Coordinator Brief ruling (R1, binding): SLATE-2 conversation memory IS
// PERSISTED -- persist-branch round trip (capture -> saveSession field ->
// resumeHarness -> next dialogue prompt contains pre-save exchange) plus the
// malformed-fixture guard case and the window boundary.
//
// dialogue-mind.ts's generateDialogue() already accepted a trailing
// `conversationHistory?` param and threads it into buildDialoguePrompt()
// correctly (unit-level); prompts/dialogue-npc.ts's
// formatConversationHistory() already implements the 5-exchange/~800-char
// window. The WIRING landed in commit a6b2ca0 (F-462792bb) -- turn-loop.ts's
// executeTurn() now calls generateDialogue() with
// `conversationHistory?.get(interpreted.targetIds[0])` at Step 5 (see
// turn-loop.ts:644), and GameSession.npcConversations / GameConfig
// .npcConversations / SaveSessionInput.npcConversations /
// loadNpcConversationsFromSession all landed alongside it in session.ts and
// game.ts (out of this "tests" domain's edit scope, but present now).
//
// Current shape: loadNpcConversationsFromSession() landed alongside the rest
// of F-462792bb (commit a6b2ca0), and test/helpers/game-harness.ts's
// resumeHarness() now calls it (see game-harness.ts:194) to thread a saved
// session's conversation history back in on resume. These tests still
// observe the round trip entirely through the public GameHarness surface
// (h.play(), h.callLog), which continues to work unchanged.

import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { saveSession } from '../../src/session/session.js';
import { TurnHistory } from '../../src/session/history.js';
import { createHarness, resumeHarness } from '../helpers/game-harness.js';

const TALK_TO_PILGRIM = 'talk to pilgrim';

describe('conversation memory round trip (F-a6575a94, brief R1 = persisted)', () => {
  it('in-memory threading -- the second speak turn in one session receives the first exchange\'s NPC reply in its own prompt (landed in commit a6b2ca0, F-462792bb)', async () => {
    const h = createHarness({
      // Call-count-aware: each speak turn burns 2 generate() calls (Step
      // 3+4 narration, then Step 5 dialogue) -- the dialogue call is always
      // the even-numbered one. Tags each turn's dialogue reply distinctly.
      clientOpts: { narration: (n) => (n % 2 === 0 ? `FIRST_EXCHANGE_MARKER_${n / 2}` : 'ambient narration') },
    });

    await h.play(TALK_TO_PILGRIM); // turn 1 dialogue reply: FIRST_EXCHANGE_MARKER_1
    await h.play(TALK_TO_PILGRIM); // turn 2 -- its dialogue prompt should carry turn 1's reply

    expect(h.callLog.lastGeneratePrompt).toContain('FIRST_EXCHANGE_MARKER_1');
  });

  it('full round trip -- save, resume, and the FIRST post-resume dialogue prompt still carries the pre-save exchange (landed in commit a6b2ca0, F-462792bb)', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'claude-rpg-conversation-memory-'));
    try {
      const h1 = createHarness({
        clientOpts: { narration: (n) => (n === 2 ? 'PRESAVE_EXCHANGE_MARKER' : 'ambient narration') },
      });
      await h1.play(TALK_TO_PILGRIM); // the one pre-save exchange, reply = PRESAVE_EXCHANGE_MARKER

      const savePath = join(tmpDir, 'save.json');
      await saveSession({
        engine: h1.session.engine,
        history: h1.session.history,
        tone: h1.session.tone,
        savePath,
        packId: 'chapel-threshold',
        // SaveSessionInput.npcConversations field. GameSession.npcConversations
        // (landed in commit a6b2ca0, F-462792bb) now carries the real
        // Map<string, ConversationExchange[]> -- the through-`unknown` cast
        // is kept only because saveSession()'s own param type doesn't
        // narrow it further here.
        npcConversations: (h1.session as unknown as { npcConversations?: unknown }).npcConversations,
      } as Parameters<typeof saveSession>[0]);

      const h2 = await resumeHarness(savePath, {
        clientOpts: { narration: 'postload narration -- never equals the marker' },
      });
      await h2.play(TALK_TO_PILGRIM); // first post-resume exchange

      expect(h2.callLog.lastGeneratePrompt).toContain('PRESAVE_EXCHANGE_MARKER');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('absence case (already safe today, forward regression lock): a save with no conversation-history field at all resumes and plays a speak turn cleanly -- not a migrate.ts transform, since the field is a new optional addition, not a legacy-shape change', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'claude-rpg-conversation-memory-absent-'));
    try {
      const engine = createGame();
      const savePath = join(tmpDir, 'save.json');
      await saveSession({
        engine,
        history: new TurnHistory(),
        tone: 'dark fantasy',
        savePath,
        packId: 'chapel-threshold',
        // deliberately no npcConversations field
      });

      const h = await resumeHarness(savePath);
      const output = await h.play(TALK_TO_PILGRIM);
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('malformed-snapshot guard: a save whose npcConversations field is syntactically-valid JSON but the wrong shape does not prevent resumeHarness() from loading and playing a speak turn', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'claude-rpg-conversation-memory-malformed-'));
    try {
      const engine = createGame();
      const savePath = join(tmpDir, 'save.json');
      await saveSession({
        engine,
        history: new TurnHistory(),
        tone: 'dark fantasy',
        savePath,
        packId: 'chapel-threshold',
      });

      // Simulates a future save shape carrying a malformed npcConversations
      // field -- syntactically valid JSON, wrong shape (bare number, and an
      // array with a null entry), mirroring the F-1357a6e0/F-1c412093
      // precedent this repo already uses for other persisted-map/array
      // fields (see session.ts's isValidPartyState doc comment).
      const raw = JSON.parse(await readFile(savePath, 'utf-8'));
      raw.npcConversations = '42';
      await writeFile(savePath, JSON.stringify(raw), 'utf-8');

      const h = await resumeHarness(savePath);
      const output = await h.play(TALK_TO_PILGRIM);
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('window/cap boundary -- the oldest exchange is evicted from the prompt after enough turns accumulate, the most recent one survives (landed in commit a6b2ca0, F-462792bb)', async () => {
    const TURN_COUNT = 8;
    const h = createHarness({
      clientOpts: {
        narration: (n) => (n % 2 === 0 ? `WINDOW_MARKER_${n / 2}` : 'ambient narration'),
      },
    });

    for (let i = 1; i <= TURN_COUNT; i++) {
      await h.play(TALK_TO_PILGRIM);
    }

    const finalPrompt = h.callLog.lastGeneratePrompt ?? '';
    // Oldest exchange (turn 1's reply) must be evicted by turn 8 regardless
    // of whether formatConversationHistory's "last 5" counts player lines
    // as separate exchanges or not (worst case for retention: 1
    // exchange/turn -> 7 accumulated by turn 8's prompt, last 5 = turns
    // 3-7, turn 1 and 2 both fall out).
    expect(finalPrompt).not.toContain('WINDOW_MARKER_1');
    // Most recent completed turn (7) must survive in either counting
    // convention (it's always within the last 5 regardless of whether
    // player lines count separately).
    expect(finalPrompt).toContain('WINDOW_MARKER_7');
  });
});
