import { describe, it, expect, vi, beforeEach } from 'vitest';
import { narrateScene, narrateSceneLegacy, type NarrateSceneOpts } from './narrator.js';
import type { ClaudeClient, GenerateResult } from '../claude-client.js';
import type { WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { createGame } from '@ai-rpg-engine/starter-fantasy';

function makeGenerateResult(text: string): GenerateResult {
  return { ok: true, text, inputTokens: 10, outputTokens: 20 };
}

function makeClient(text: string, streamText?: string): ClaudeClient {
  const client: ClaudeClient = {
    generate: vi.fn().mockResolvedValue(makeGenerateResult(text)),
  };
  if (streamText !== undefined) {
    client.generateStream = vi.fn().mockResolvedValue(makeGenerateResult(streamText));
  }
  return client;
}

function makeOpts(overrides: Partial<NarrateSceneOpts> = {}): NarrateSceneOpts {
  const engine = createGame();
  return {
    client: makeClient('plain text fallback'),
    world: engine.world,
    recentEvents: [],
    tone: 'dark fantasy',
    recentNarration: [],
    ...overrides,
  };
}

// A valid NarrationPlan JSON
const VALID_PLAN = JSON.stringify({
  sceneText: 'You enter a dimly lit chamber.',
  tone: 'dread',
  urgency: 'normal',
  sfx: [{ effectId: 'drip', timing: 'with-text', intensity: 0.3 }],
  ambientLayers: [{ layerId: 'cave', action: 'start', volume: 0.5, fadeMs: 1000 }],
  uiEffects: [],
  interruptibility: 'free',
});

const VALID_PLAN_IN_CODE_BLOCK = '```json\n' + VALID_PLAN + '\n```';

describe('narrateScene', () => {
  // --- (1) Successful NarrationPlan JSON parsing ---
  it('should parse a valid NarrationPlan JSON response', async () => {
    const opts = makeOpts({ client: makeClient(VALID_PLAN) });
    const result = await narrateScene(opts);

    expect(result.plan).not.toBeNull();
    expect(result.plan!.sceneText).toBe('You enter a dimly lit chamber.');
    expect(result.plan!.tone).toBe('dread');
    expect(result.narration).toBe('You enter a dimly lit chamber.');
  });

  it('should parse NarrationPlan from a code block', async () => {
    const opts = makeOpts({ client: makeClient(VALID_PLAN_IN_CODE_BLOCK) });
    const result = await narrateScene(opts);

    expect(result.plan).not.toBeNull();
    expect(result.plan!.sceneText).toBe('You enter a dimly lit chamber.');
  });

  // --- (2) Fallback to plain text when JSON is absent ---
  it('should fall back to plain text when response has no JSON', async () => {
    const plainText = 'The wind howls through the corridor.';
    const opts = makeOpts({ client: makeClient(plainText) });
    const result = await narrateScene(opts);

    expect(result.plan).toBeNull();
    expect(result.narration).toBe(plainText);
  });

  it('should fall back to plain text for completely non-JSON response', async () => {
    const opts = makeOpts({ client: makeClient('Just some narration text with no braces at all.') });
    const result = await narrateScene(opts);

    expect(result.plan).toBeNull();
    expect(result.narration).toBe('Just some narration text with no braces at all.');
  });

  // --- (3) Partial plan construction when validation fails but sceneText exists ---
  it('should construct partial plan when validation fails but sceneText is present', async () => {
    const partialPlan = JSON.stringify({
      sceneText: 'A shadow moves.',
      tone: 'invalid-tone-value',
      urgency: 'bogus',
    });
    const opts = makeOpts({ client: makeClient(partialPlan) });
    const result = await narrateScene(opts);

    // The parseNarrationPlan fallback branch: invalid validation but sceneText exists
    expect(result.plan).not.toBeNull();
    expect(result.plan!.sceneText).toBe('A shadow moves.');
    // Defaults are applied
    expect(result.plan!.sfx).toEqual([]);
    expect(result.plan!.ambientLayers).toEqual([]);
    expect(result.plan!.uiEffects).toEqual([]);
    expect(result.plan!.interruptibility).toBe('free');
  });

  it('should return null plan when JSON is valid but has no sceneText', async () => {
    const noSceneText = JSON.stringify({ tone: 'calm', urgency: 'normal' });
    const opts = makeOpts({ client: makeClient(noSceneText) });
    const result = await narrateScene(opts);

    expect(result.plan).toBeNull();
    expect(result.narration).toBe(noSceneText.trim());
  });

  it('should return null plan for malformed JSON', async () => {
    const opts = makeOpts({ client: makeClient('{ broken json: }') });
    const result = await narrateScene(opts);

    expect(result.plan).toBeNull();
  });

  // --- (4) Streaming path ---
  it('should use streaming when onChunk callback is provided', async () => {
    const chunks: string[] = [];
    const onChunk = (chunk: string) => chunks.push(chunk);
    const streamClient = makeClient('unused', VALID_PLAN);

    const opts = makeOpts({ client: streamClient, onChunk });
    const result = await narrateScene(opts);

    expect(streamClient.generateStream).toHaveBeenCalled();
    expect(result.plan).not.toBeNull();
    expect(result.plan!.sceneText).toBe('You enter a dimly lit chamber.');
  });

  it('should fall back to non-streaming when client has no generateStream', async () => {
    const chunks: string[] = [];
    const onChunk = (chunk: string) => chunks.push(chunk);
    const client = makeClient('A plain response.'); // no generateStream

    const opts = makeOpts({ client, onChunk });
    const result = await narrateScene(opts);

    // Should use generate() instead since generateStream is undefined
    expect(client.generate).toHaveBeenCalled();
    expect(result.narration).toBe('A plain response.');
  });

  // --- SceneContext is always returned ---
  it('should always return sceneContext', async () => {
    const opts = makeOpts({ client: makeClient('text') });
    const result = await narrateScene(opts);

    expect(result.sceneContext).toBeDefined();
    expect(result.sceneContext.narrationInput).toBeDefined();
  });
});

// --- (5) Legacy mode ---
describe('narrateSceneLegacy', () => {
  it('should return plain text narration with null plan', async () => {
    const client = makeClient('The chapel looms before you.');
    const engine = createGame();

    const result = await narrateSceneLegacy(
      client,
      engine.world,
      [],
      'dark fantasy',
      [],
    );

    expect(result.narration).toBe('The chapel looms before you.');
    expect(result.plan).toBeNull();
    expect(result.sceneContext).toBeDefined();
  });

  it('should trim whitespace from legacy response', async () => {
    const client = makeClient('  Dust settles around you.  \n');
    const engine = createGame();

    const result = await narrateSceneLegacy(
      client,
      engine.world,
      [],
      'calm',
      [],
    );

    expect(result.narration).toBe('Dust settles around you.');
  });

  it('should pass previous location to scene context', async () => {
    const client = makeClient('You arrive.');
    const engine = createGame();

    const result = await narrateSceneLegacy(
      client,
      engine.world,
      [],
      'dark fantasy',
      [],
      'some-previous-zone',
    );

    expect(result.sceneContext.narrationInput.isNewZone).toBe(true);
  });
});
