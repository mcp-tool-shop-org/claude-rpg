import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  narrateScene,
  narrateSceneLegacy,
  FALLBACK_NARRATION,
  FATAL_NARRATION_FALLBACK,
  type NarrateSceneOpts,
} from './narrator.js';
import type { ClaudeClient, GenerateResult } from '../claude-client.js';
import type { WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { NARRATE_SYSTEM_LEGACY } from '../prompts/narrate-scene.js';
import { createTestLogger } from '../game/debug-logger.js';

function makeGenerateResult(text: string): GenerateResult {
  return { ok: true, text, inputTokens: 10, outputTokens: 20 };
}

// F-38b692c2: ClaudeClient (claude-client.ts:27-58) requires generateStructured
// and model too, not just generate/generateStream. Stub both so every literal
// built from this factory actually satisfies the interface it's typed as.
function makeClient(text: string, streamText?: string): ClaudeClient {
  const client: ClaudeClient = {
    generate: vi.fn().mockResolvedValue(makeGenerateResult(text)),
    generateStructured: vi.fn().mockResolvedValue({ ok: false, data: null, raw: '' }),
    model: 'test-model',
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
      generateStructured: vi.fn().mockResolvedValue({ ok: false, data: null, raw: '' }),
      model: 'test-model',
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
      generateStructured: vi.fn().mockResolvedValue({ ok: false, data: null, raw: '' }),
      model: 'test-model',
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
      generateStructured: vi.fn().mockResolvedValue({ ok: false, data: null, raw: '' }),
      model: 'test-model',
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

// === F-e8630a73 / F-18f4dd88: fallback sentinels must never be echoed back
// into the LLM-facing prompt as if they were real 'previous narration' — a
// non-fatal NarrationError on a recent turn stores FALLBACK_NARRATION (or the
// mirrored turn-loop.ts FATAL_NARRATION_FALLBACK sentinel) via history.record(),
// and buildNarratePrompt's 'Previous narration (for continuity)' section
// (prompts/narrate-scene.ts:114) used to quote it back verbatim on every
// following turn, indistinguishable from authored prose. ===
describe('narrateScene F-e8630a73: fallback sentinels are filtered from the prompt', () => {
  it('should not interpolate FALLBACK_NARRATION into the prompt when it appears in recentNarration', async () => {
    const client = makeClient('A cool breeze greets you.');
    const opts = makeOpts({
      client,
      recentNarration: ['A real narrated turn.', FALLBACK_NARRATION],
    });

    await narrateScene(opts);

    const call = (client.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prompt).not.toContain(FALLBACK_NARRATION);
    expect(call.prompt).toContain('A real narrated turn.');
  });

  it('should not interpolate the mirrored turn-loop.ts fallback sentinel into the prompt', async () => {
    const client = makeClient('A cool breeze greets you.');
    const opts = makeOpts({
      client,
      recentNarration: ['A real narrated turn.', FATAL_NARRATION_FALLBACK],
    });

    await narrateScene(opts);

    const call = (client.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prompt).not.toContain(FATAL_NARRATION_FALLBACK);
    expect(call.prompt).toContain('A real narrated turn.');
  });

  // F-14316911: the all-fallback case -- every recentNarration entry is a
  // known sentinel -- reduces to an empty array post-filter (narrator.ts:97-99),
  // which should omit the 'Previous narration' header entirely rather than
  // rendering an empty-but-present section. Distinct from the mixed-array
  // cases above, which still have one real turn surviving the filter.
  it('should omit the "Previous narration" header entirely when recentNarration is all fallback sentinels', async () => {
    const client = makeClient('A cool breeze greets you.');
    const opts = makeOpts({
      client,
      recentNarration: [FALLBACK_NARRATION, FALLBACK_NARRATION, FALLBACK_NARRATION],
    });

    await narrateScene(opts);

    const call = (client.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prompt).not.toContain(FALLBACK_NARRATION);
    expect(call.prompt).not.toContain('Previous narration');
  });
});

describe('narrateSceneLegacy F-e8630a73: fallback sentinels are filtered from the prompt', () => {
  it('should not interpolate FALLBACK_NARRATION into the legacy prompt when it appears in recentNarration', async () => {
    const client = makeClient('You arrive.');
    const engine = createGame();

    await narrateSceneLegacy(
      client,
      engine.world,
      [],
      'dark fantasy',
      ['A real narrated turn.', FALLBACK_NARRATION],
    );

    const call = (client.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prompt).not.toContain(FALLBACK_NARRATION);
    expect(call.prompt).toContain('A real narrated turn.');
  });

  // F-14316911: sibling of narrateScene's all-fallback case above -- same
  // guard chain (history.ts's filter -> narrator.ts's redundant filter ->
  // buildNarratePrompt's length>0 gate) applies identically on the legacy
  // plain-text path.
  it('should omit the "Previous narration" header entirely when recentNarration is all fallback sentinels', async () => {
    const client = makeClient('You arrive.');
    const engine = createGame();

    await narrateSceneLegacy(
      client,
      engine.world,
      [],
      'dark fantasy',
      [FALLBACK_NARRATION, FALLBACK_NARRATION, FALLBACK_NARRATION],
    );

    const call = (client.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prompt).not.toContain(FALLBACK_NARRATION);
    expect(call.prompt).not.toContain('Previous narration');
  });
});

// === F-fa65fe50: every parseNarrationPlan failure path, plus narrateScene/
// narrateSceneLegacy's own generation-failure catches, reported via bare
// console.warn with no session-level tally anywhere. debug-logger.ts's
// DebugLogger already keeps a queryable, taggable entries[] regardless of
// whether --debug is set -- these tests prove opts.logger (new, optional)
// actually reaches every one of those warn sites, using createTestLogger()
// (captures entries without writing to stderr). ===
describe('narrateScene/narrateSceneLegacy F-fa65fe50: optional DebugLogger threading', () => {
  it('parseNarrationPlan logs to the logger when no JSON structure is found', async () => {
    const logger = createTestLogger();
    const opts = makeOpts({
      client: makeClient('Just some narration text with no braces at all.'),
      logger,
    });

    await narrateScene(opts);

    const entries = logger.getEntries();
    expect(entries).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'narrator',
        message: expect.stringContaining('no JSON structure found'),
      }),
    );
  });

  it('parseNarrationPlan logs to the logger when JSON parses but has no sceneText', async () => {
    const logger = createTestLogger();
    const noSceneText = JSON.stringify({ tone: 'calm', urgency: 'normal' });
    const opts = makeOpts({ client: makeClient(noSceneText), logger });

    await narrateScene(opts);

    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'narrator',
        message: expect.stringContaining('missing sceneText'),
      }),
    );
  });

  it('parseNarrationPlan logs to the logger on malformed JSON', async () => {
    const logger = createTestLogger();
    const opts = makeOpts({ client: makeClient('{ broken json: }'), logger });

    await narrateScene(opts);

    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'narrator',
        message: expect.stringContaining('JSON parse failed'),
      }),
    );
  });

  // F-fa65fe50's narrower gap: validation-fails-but-sceneText-present
  // (narrator.ts's parseNarrationPlan) previously returned a silently
  // coerced plan with NO warning at all -- not even a console.warn, unlike
  // the three harder-failure paths above. Both channels must now fire so
  // all three degrees of "didn't get a fully valid NarrationPlan" are
  // counted consistently.
  it('warns (both console and logger) on the previously-silent coerced-plan branch', async () => {
    const logger = createTestLogger();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const partialPlan = JSON.stringify({
      sceneText: 'A shadow moves.',
      tone: 'invalid-tone-value',
      urgency: 'bogus',
    });
    const opts = makeOpts({ client: makeClient(partialPlan), logger });

    const result = await narrateScene(opts);

    expect(result.plan!.sceneText).toBe('A shadow moves.');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('sceneText'));
    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({ level: 'warn', subsystem: 'narrator' }),
    );
    warnSpy.mockRestore();
  });

  it('narrateScene logs to the logger when the LLM call itself fails', async () => {
    const logger = createTestLogger();
    const client: ClaudeClient = {
      generate: vi.fn().mockRejectedValue(new Error('API timeout')),
      generateStructured: vi.fn().mockResolvedValue({ ok: false, data: null, raw: '' }),
      model: 'test-model',
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const opts = makeOpts({ client, logger });

    await narrateScene(opts);

    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'narrator',
        message: expect.stringContaining('narrateScene: LLM generation failed'),
      }),
    );
    warnSpy.mockRestore();
  });

  it('narrateSceneLegacy logs to the logger when the LLM call itself fails', async () => {
    const logger = createTestLogger();
    const client: ClaudeClient = {
      generate: vi.fn().mockRejectedValue(new Error('API down')),
      generateStructured: vi.fn().mockResolvedValue({ ok: false, data: null, raw: '' }),
      model: 'test-model',
    };
    const engine = createGame();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await narrateSceneLegacy(client, engine.world, [], 'dark fantasy', [], undefined, logger);

    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'narrator',
        message: expect.stringContaining('narrateSceneLegacy: LLM generation failed'),
      }),
    );
    warnSpy.mockRestore();
  });

  it('works exactly as before when no logger is provided (backward compatible)', async () => {
    const opts = makeOpts({ client: makeClient('Just some narration text with no braces at all.') });
    const result = await narrateScene(opts);
    expect(result.narration).toEqual(expect.any(String));
  });
});
