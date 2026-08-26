import { describe, it, expect, vi, beforeEach } from 'vitest';
import { narrateScene, narrateSceneLegacy, FALLBACK_NARRATION, type NarrateSceneOpts } from './narrator.js';
import type { ClaudeClient, GenerateResult } from '../claude-client.js';
import type { WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { NARRATE_SYSTEM_LEGACY } from '../prompts/narrate-scene.js';

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

  // --- (4) Streaming path (FT-BR-004: uses LEGACY plain-text prompt) ---
  it('should use streaming with LEGACY prompt when onChunk callback is provided', async () => {
    const chunks: string[] = [];
    const onChunk = (chunk: string) => chunks.push(chunk);
    const streamClient = makeClient('unused', 'The wind howls through the corridor.');

    const opts = makeOpts({ client: streamClient, onChunk });
    const result = await narrateScene(opts);

    expect(streamClient.generateStream).toHaveBeenCalled();
    // FT-BR-004: Streaming uses plain text, no NarrationPlan
    expect(result.plan).toBeNull();
    expect(result.narration).toBe('The wind howls through the corridor.');
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

describe('parseNarrationPlan PBR-004: observability logging', () => {
  it('should warn when no JSON structure found in response', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const plainText = 'Just some narration text with no braces at all.';
    const opts = makeOpts({ client: makeClient(plainText) });

    await narrateScene(opts);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no JSON structure found'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Just some narration'),
    );
    warnSpy.mockRestore();
  });

  it('should warn when JSON parses but has no sceneText', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const noSceneText = JSON.stringify({ tone: 'calm', urgency: 'normal' });
    const opts = makeOpts({ client: makeClient(noSceneText) });

    await narrateScene(opts);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing sceneText'),
    );
    warnSpy.mockRestore();
  });

  it('should warn on malformed JSON with truncated raw text', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const opts = makeOpts({ client: makeClient('{ broken json: }') });

    await narrateScene(opts);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('JSON parse failed'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('broken json'),
    );
    warnSpy.mockRestore();
  });
});

// === F-7815df9e: game-core seam contract — chronicleContext ===
describe('narrateScene F-7815df9e: chronicleContext seam', () => {
  it('should fold opts.chronicleContext into the prompt sent to the client when present', async () => {
    const client = makeClient('plain text fallback');
    const opts = makeOpts({ client, chronicleContext: 'The player once spared the bandit chief.' });

    await narrateScene(opts);

    expect(client.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('The player once spared the bandit chief.'),
      }),
    );
  });

  it('should not add chronicle text to the prompt when chronicleContext is absent', async () => {
    const client = makeClient('plain text fallback');
    const opts = makeOpts({ client });

    await narrateScene(opts);

    const call = (client.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prompt).not.toContain('Chronicle');
  });
});

// === F-304fc328: LLM call sites must not throw uncaught ===
describe('narrateScene F-304fc328: LLM failure fallback', () => {
  it('should return a fallback NarrationResult instead of throwing when generate() rejects', async () => {
    const client: ClaudeClient = {
      generate: vi.fn().mockRejectedValue(new Error('API timeout')),
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const opts = makeOpts({ client });

    const result = await narrateScene(opts);

    expect(result.narration).toEqual(expect.any(String));
    expect(result.narration.length).toBeGreaterThan(0);
    expect(result.plan).toBeNull();
    expect(result.sceneContext).toBeDefined();
    // F-b6915850: downstream consumers (e.g. recap.ts's renderRecap) need a way
    // to tell FALLBACK_NARRATION apart from real LLM prose.
    expect(result.isFallback).toBe(true);
    expect(result.narration).toBe(FALLBACK_NARRATION);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('should return a fallback NarrationResult instead of throwing when generateStream() rejects', async () => {
    const chunks: string[] = [];
    const client: ClaudeClient = {
      generate: vi.fn(),
      generateStream: vi.fn().mockRejectedValue(new Error('stream disconnected')),
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const opts = makeOpts({ client, onChunk: (c) => chunks.push(c) });

    const result = await narrateScene(opts);

    expect(result.narration).toEqual(expect.any(String));
    expect(result.narration.length).toBeGreaterThan(0);
    expect(result.plan).toBeNull();
    expect(result.sceneContext).toBeDefined();
    expect(result.isFallback).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('narrateSceneLegacy F-304fc328: LLM failure fallback', () => {
  it('should return a fallback NarrationResult instead of throwing when generate() rejects', async () => {
    const client: ClaudeClient = {
      generate: vi.fn().mockRejectedValue(new Error('API down')),
    };
    const engine = createGame();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await narrateSceneLegacy(client, engine.world, [], 'dark fantasy', []);

    expect(result.narration).toEqual(expect.any(String));
    expect(result.narration.length).toBeGreaterThan(0);
    expect(result.plan).toBeNull();
    expect(result.sceneContext).toBeDefined();
    expect(result.isFallback).toBe(true);
    expect(result.narration).toBe(FALLBACK_NARRATION);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// === F-b6915850: NarrationResult.isFallback lets downstream consumers (e.g.
// recap.ts's renderRecap) tell placeholder text apart from real LLM prose ===
describe('narrateScene/narrateSceneLegacy F-b6915850: isFallback on the success path', () => {
  it('narrateScene should report isFallback: false for a normal plain-text response', async () => {
    const opts = makeOpts({ client: makeClient('A cool breeze greets you.') });
    const result = await narrateScene(opts);
    expect(result.isFallback).toBe(false);
  });

  it('narrateScene should report isFallback: false for a valid NarrationPlan JSON response', async () => {
    const opts = makeOpts({ client: makeClient(VALID_PLAN) });
    const result = await narrateScene(opts);
    expect(result.isFallback).toBe(false);
  });

  it('narrateSceneLegacy should report isFallback: false for a normal response', async () => {
    const engine = createGame();
    const client = makeClient('The market bustles with morning trade.');
    const result = await narrateSceneLegacy(client, engine.world, [], 'dark fantasy', []);
    expect(result.isFallback).toBe(false);
  });
});

// === FT-BR-004: Streaming-friendly narration ===
describe('narrateScene streaming with LEGACY prompt (FT-BR-004)', () => {
  it('should use NARRATE_SYSTEM_LEGACY when streaming', async () => {
    const chunks: string[] = [];
    const onChunk = (chunk: string) => chunks.push(chunk);
    const streamClient = makeClient('unused', 'A cool breeze greets you.');

    const opts = makeOpts({ client: streamClient, onChunk });
    await narrateScene(opts);

    // Verify generateStream was called with the LEGACY system prompt
    expect(streamClient.generateStream).toHaveBeenCalledWith(
      expect.objectContaining({
        system: NARRATE_SYSTEM_LEGACY,
        maxTokens: 300,
      }),
    );
  });

  it('should return null plan when streaming (plain text mode)', async () => {
    const chunks: string[] = [];
    const onChunk = (chunk: string) => chunks.push(chunk);
    const streamClient = makeClient('unused', 'Mist curls at your feet.');

    const opts = makeOpts({ client: streamClient, onChunk });
    const result = await narrateScene(opts);

    expect(result.plan).toBeNull();
    expect(result.narration).toBe('Mist curls at your feet.');
  });

  it('non-streaming should still use NarrationPlan JSON mode', async () => {
    const opts = makeOpts({ client: makeClient(VALID_PLAN) });
    const result = await narrateScene(opts);

    expect(result.plan).not.toBeNull();
    expect(result.plan!.sceneText).toBe('You enter a dimly lit chamber.');
  });
});
