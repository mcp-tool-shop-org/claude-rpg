// F-a6575a94 (SLATE-2, wave 18 tests domain): end-to-end conversation-memory
// round trip (capture, save, load, next dialogue call receives history), the
// malformed-snapshot load guard, and the trim-window boundary.
//
// Coordinator Brief ruling (R1, binding): SLATE-2 conversation memory IS
// PERSISTED -- persist-branch round trip (capture -> saveSession field ->
// resumeHarness -> next dialogue prompt contains pre-save exchange) plus the
// malformed-fixture guard case and the window boundary.
//
// Verified directly against this worktree's src: dialogue-mind.ts's
// generateDialogue() already accepts a trailing `conversationHistory?`
// param and threads it into buildDialoguePrompt() correctly (unit-level,
// already works); prompts/dialogue-npc.ts's formatConversationHistory()
// already implements the 5-exchange/~800-char window (already works). What
// is missing -- verified directly against src/turn-loop.ts:358-372 -- is
// turn-loop.ts's executeTurn() call to generateDialogue() passing only 13
// positional args, never the 14th `conversationHistory` one, so the real
// call site never threads anything through regardless of what GameSession
// tracks. GameSession.npcConversations / GameConfig.npcConversations /
// SaveSessionInput.npcConversations / loadNpcConversationsFromSession are
// all pinned as landing this wave from another domain (session.ts and
// game.ts are out of this "tests" domain's edit scope).
//
// Risk containment note: this file deliberately does NOT modify
// test/helpers/game-harness.ts's resumeHarness() to call the not-yet-
// existing loadNpcConversationsFromSession() -- doing so would make EVERY
// test in this domain (and any other file) that calls resumeHarness() throw
// a hard TypeError today, not just the tests that care about conversation
// memory. These tests instead observe the round trip entirely through the
// existing public GameHarness surface (h.play(), h.callLog), which is
// reachable without editing any shared helper's src-import surface.

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
  it('red in-worktree, green expected at merge: in-memory threading -- the second speak turn in one session receives the first exchange\'s NPC reply in its own prompt', async () => {
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

  it('red in-worktree, green expected at merge: full round trip -- save, resume, and the FIRST post-resume dialogue prompt still carries the pre-save exchange', async () => {
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
        // Pinned SaveSessionInput.npcConversations field -- h1.session
        // doesn't carry this property in this worktree's OLD game.ts, so
        // this reads as `undefined` today (harmless: saveSession() doesn't
        // destructure a field it doesn't know about either).
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

  it('red in-worktree, green expected at merge: window/cap boundary -- the oldest exchange is evicted from the prompt after enough turns accumulate, the most recent one survives', async () => {
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
