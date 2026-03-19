// Streaming tests: verify narration streaming preserves truth invariants.
// Tests that canonical state, history, chronicle, and recap are identical
// whether narration was streamed or arrived whole.

import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { TurnHistory } from '../../src/session/history.js';
import { executeTurn } from '../../src/turn-loop.js';
import { narrateScene } from '../../src/narrator/narrator.js';
import { createFakeClient, createCallLog } from '../helpers/fake-claude-client.js';

const CANNED_NARRATION = 'The dim chapel echoes with your footsteps. Shadows gather in the corners.';

// ─── Streaming Completes Normally ────────────────────────────

describe('streaming: normal completion', () => {
  it('streamed turn result matches non-streamed result', async () => {
    const engine1 = createGame();
    const engine2 = createGame();
    const history1 = new TurnHistory();
    const history2 = new TurnHistory();
    const log1 = createCallLog();
    const log2 = createCallLog();

    // Non-streaming client
    const client1 = createFakeClient({ narration: CANNED_NARRATION, callLog: log1 });
    // Streaming client
    const client2 = createFakeClient({ narration: CANNED_NARRATION, callLog: log2, streaming: true });

    const result1 = await executeTurn({
      engine: engine1, client: client1, history: history1,
      playerInput: 'look', tone: 'dark fantasy',
    });

    const chunks: string[] = [];
    const result2 = await executeTurn({
      engine: engine2, client: client2, history: history2,
      playerInput: 'look', tone: 'dark fantasy',
      onNarrationChunk: (chunk) => { chunks.push(chunk); },
    });

    // Canonical narration is identical
    expect(result2.narration).toBe(result1.narration);

    // Turn results match structurally
    expect(result2.tick).toBe(result1.tick);
    expect(result2.interpreted.verb).toBe(result1.interpreted.verb);
    expect(result2.events).toEqual(result1.events);

    // Streaming path was used
    expect(log2.generateStream).toBeGreaterThan(0);
    expect(chunks.length).toBeGreaterThan(0);

    // Accumulated chunks equal the full narration
    expect(chunks.join('')).toBe(CANNED_NARRATION);
  });

  it('history records final text, not partial chunks', async () => {
    const engine = createGame();
    const history = new TurnHistory();
    const client = createFakeClient({ narration: CANNED_NARRATION, streaming: true });

    await executeTurn({
      engine, client, history,
      playerInput: 'look', tone: 'dark fantasy',
      onNarrationChunk: () => {},
    });

    const turns = history.toJSON();
    expect(turns).toHaveLength(1);
    expect(turns[0].narration).toBe(CANNED_NARRATION);
  });
});

// ─── Non-Streaming Fallback ──────────────────────────────────

describe('streaming: fallback to non-streaming', () => {
  it('client without generateStream uses generate()', async () => {
    const engine = createGame();
    const history = new TurnHistory();
    const log = createCallLog();
    const client = createFakeClient({ narration: CANNED_NARRATION, callLog: log });

    // Pass onNarrationChunk but client has no generateStream
    const chunks: string[] = [];
    const result = await executeTurn({
      engine, client, history,
      playerInput: 'look', tone: 'dark fantasy',
      onNarrationChunk: (chunk) => { chunks.push(chunk); },
    });

    // Should have used generate(), not streaming
    expect(log.generate).toBeGreaterThan(0);
    expect(log.generateStream).toBe(0);

    // No chunks emitted (non-streaming path)
    expect(chunks).toHaveLength(0);

    // But narration is still correct
    expect(result.narration).toBe(CANNED_NARRATION);
  });
});

// ─── Stream Interruption ─────────────────────────────────────

describe('streaming: interruption handling', () => {
  it('interrupted stream throws but does not corrupt engine state', async () => {
    const engine = createGame();
    const history = new TurnHistory();
    const initialZone = engine.world.locationId;

    const client = createFakeClient({
      narration: CANNED_NARRATION,
      streaming: true,
      streamInterruptAfter: 3, // Interrupt after 3 words
    });

    const chunks: string[] = [];
    // executeTurn should propagate the error (narration failure)
    await expect(
      executeTurn({
        engine, client, history,
        playerInput: 'look', tone: 'dark fantasy',
        onNarrationChunk: (chunk) => { chunks.push(chunk); },
      }),
    ).rejects.toThrow();

    // Some chunks were emitted before interruption
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThan(CANNED_NARRATION.split(' ').length);

    // Engine state is intact (look doesn't change state, but zone is preserved)
    expect(engine.world.locationId).toBe(initialZone);

    // History was not updated (turn didn't complete)
    expect(history.toJSON()).toHaveLength(0);
  });
});

// ─── narrateScene Direct Streaming ───────────────────────────

describe('streaming: narrateScene direct', () => {
  it('narrateScene streams when onChunk provided and client supports it', async () => {
    const engine = createGame();
    const log = createCallLog();
    const client = createFakeClient({ narration: CANNED_NARRATION, callLog: log, streaming: true });

    const chunks: string[] = [];
    const result = await narrateScene({
      client, world: engine.world, recentEvents: [], tone: 'dark', recentNarration: [],
      onChunk: (chunk) => { chunks.push(chunk); },
    });

    expect(log.generateStream).toBe(1);
    expect(chunks.join('')).toBe(CANNED_NARRATION);
    expect(result.narration).toBe(CANNED_NARRATION);
  });

  it('narrateScene falls back when client lacks streaming', async () => {
    const engine = createGame();
    const log = createCallLog();
    const client = createFakeClient({ narration: CANNED_NARRATION, callLog: log });

    const chunks: string[] = [];
    const result = await narrateScene({
      client, world: engine.world, recentEvents: [], tone: 'dark', recentNarration: [],
      onChunk: (chunk) => { chunks.push(chunk); },
    });

    expect(log.generate).toBe(1);
    expect(log.generateStream).toBe(0);
    expect(chunks).toHaveLength(0);
    expect(result.narration).toBe(CANNED_NARRATION);
  });
});
