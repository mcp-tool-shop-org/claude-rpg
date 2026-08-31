import { describe, it, expect, vi } from 'vitest';
import { narrateFinale, FALLBACK_EPILOGUE } from './finale-narrator.js';
import type { ClaudeClient, GenerateResult } from '../claude-client.js';
import type { FinaleOutline } from '@ai-rpg-engine/campaign-memory';
import { NarrationError, userMessage } from '../llm/claude-errors.js';
import { createTestLogger } from '../game/debug-logger.js';

function makeOutline(overrides: Partial<FinaleOutline> = {}): FinaleOutline {
  return {
    resolutionClass: 'triumphant',
    dominantArc: 'redemption',
    campaignDuration: 42,
    totalChronicleEvents: 10,
    keyMoments: [],
    npcFates: [],
    factionFates: [],
    districtFates: [],
    companionFates: [],
    legacy: [],
    epilogueSeeds: [],
    ...overrides,
  };
}

// F-a9fb247d: ClaudeClient (claude-client.ts:27-58) requires generateStructured
// and model too, not just generate. Stub both so these literals actually
// satisfy the interface they're typed as.
function makeClient(text: string): ClaudeClient {
  return {
    generate: vi.fn().mockResolvedValue({
      ok: true,
      text,
      inputTokens: 10,
      outputTokens: 20,
    } satisfies GenerateResult),
    generateStructured: vi.fn().mockResolvedValue({ ok: false, data: null, raw: '' }),
    model: 'test-model',
  };
}

function makeFailingClient(error: Error): ClaudeClient {
  return {
    generate: vi.fn().mockRejectedValue(error),
    generateStructured: vi.fn().mockResolvedValue({ ok: false, data: null, raw: '' }),
    model: 'test-model',
  };
}

describe('narrateFinale', () => {
  it('should return the trimmed LLM epilogue alongside the deterministic summary', async () => {
    const client = makeClient('  And so the city remembered.  \n');
    const result = await narrateFinale(client, makeOutline(), 'dark fantasy', 'Kael');

    expect(result.epilogue).toBe('And so the city remembered.');
    expect(result.deterministicSummary).toEqual(expect.any(String));
    expect(result.worldAfter).toContain('WORLD AFTER');
  });
});

// F-f4f6ac90: narratorTone forwarding into buildFinalePrompt's PACK_VOICES
// lookup (see finale-prompt.ts). narrateFinale is the one and only call site
// for buildFinalePrompt, so this is the seam that proves the new 5th
// parameter actually reaches the prompt sent to the LLM.
describe('narrateFinale F-f4f6ac90: narratorTone threading into buildFinalePrompt', () => {
  it('forwards narratorTone through to the LLM prompt as the matching PACK_VOICES instruction', async () => {
    const client = makeClient('epilogue text');
    await narrateFinale(
      client,
      makeOutline(),
      'fantasy',
      'Kael',
      'dark fantasy, concise, atmospheric, foreboding',
    );

    const call = (client.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prompt).toContain('epic chronicle voice');
  });

  it('omits the pack voice instruction when narratorTone is not provided (current production shape)', async () => {
    const client = makeClient('epilogue text');
    await narrateFinale(client, makeOutline(), 'fantasy', 'Kael');

    const call = (client.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prompt).not.toContain('epic chronicle voice');
  });
});

// F-6480985e: the domain-wide fatal-error contract (documented in
// claude-errors.ts near NarrationError.fatal) is "rethrow, don't swallow into
// in-fiction text" — matching narrator.ts's narrateScene/narrateSceneLegacy.
// narrateFinale previously swallowed fatal errors into FinaleNarrationResult's
// epilogue field, so a bad API key would be rendered as campaign epilogue
// prose. It must now rethrow so bin.ts's presentError renders the structured
// system-level box instead.
describe('narrateFinale F-6480985e: fatal errors rethrow instead of swallowing into epilogue text', () => {
  it('should rethrow a fatal auth NarrationError instead of returning it as the epilogue', async () => {
    const authErr = new NarrationError({ kind: 'auth', message: 'invalid x-api-key' });
    const client = makeFailingClient(authErr);

    await expect(
      narrateFinale(client, makeOutline(), 'dark fantasy', 'Kael'),
    ).rejects.toThrow(authErr);
    // F-0f76ecc2: fatal errors must not burn the new same-turn retry --
    // retrying auth/bad-request can never succeed.
    expect(client.generate).toHaveBeenCalledTimes(1);
  });

  it('should rethrow a fatal bad-request NarrationError the same way', async () => {
    const badRequestErr = new NarrationError({ kind: 'bad-request', message: 'malformed request' });
    const client = makeFailingClient(badRequestErr);

    await expect(
      narrateFinale(client, makeOutline(), 'dark fantasy', 'Kael'),
    ).rejects.toThrow(badRequestErr);
    expect(client.generate).toHaveBeenCalledTimes(1);
  });
});

// F-0f76ecc2: narrateFinale previously set epilogue = '' on a non-fatal
// failure and returned normally -- renderConcludeOutput (game-presenter.ts)
// gates the whole epilogue section on `if (result.epilogue)`, so an empty
// string rendered nothing at all: the campaign's one narratively climactic
// LLM call got exactly one silent attempt, with campaignStatus already
// stamped 'completed' by the caller before it even ran. narrateFinale now
// retries once on a non-fatal failure, and only falls back to a non-empty,
// clearly-labeled sentinel (FALLBACK_EPILOGUE) -- plus isFallback: true --
// if the retry also fails non-fatally, so the truthiness gate downstream
// renders an explicit note instead of silence.
describe('narrateFinale F-0f76ecc2: retry-once, then a labeled (non-empty) fallback', () => {
  it('should report isFallback: false and the real epilogue on a normal first-try success', async () => {
    const client = makeClient('And so the city remembered.');

    const result = await narrateFinale(client, makeOutline(), 'dark fantasy', 'Kael');

    expect(result.epilogue).toBe('And so the city remembered.');
    expect(result.isFallback).toBe(false);
    expect(client.generate).toHaveBeenCalledTimes(1);
  });

  it('should retry once after a non-fatal failure and use the real epilogue if the retry succeeds', async () => {
    const timeoutErr = new NarrationError({ kind: 'timeout', message: 'request timed out' });
    const generate = vi.fn()
      .mockRejectedValueOnce(timeoutErr)
      .mockResolvedValueOnce({ ok: true, text: 'The city rebuilt, slowly.', inputTokens: 10, outputTokens: 20 } satisfies GenerateResult);
    const client: ClaudeClient = {
      generate,
      generateStructured: vi.fn().mockResolvedValue({ ok: false, data: null, raw: '' }),
      model: 'test-model',
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await narrateFinale(client, makeOutline(), 'dark fantasy', 'Kael');

    expect(result.epilogue).toBe('The city rebuilt, slowly.');
    expect(result.isFallback).toBe(false);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('attempt 1/2'));
    warnSpy.mockRestore();
  });

  it('should fall back to the non-empty, labeled FALLBACK_EPILOGUE (not blank) when both the first attempt and the retry fail non-fatally', async () => {
    const timeoutErr = new NarrationError({ kind: 'timeout', message: 'request timed out' });
    const client = makeFailingClient(timeoutErr);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await narrateFinale(client, makeOutline(), 'dark fantasy', 'Kael');

    expect(result.epilogue).toBe(FALLBACK_EPILOGUE);
    expect(result.epilogue.length).toBeGreaterThan(0);
    expect(result.epilogue).not.toBe('');
    expect(result.isFallback).toBe(true);
    // Player-facing: still says the campaign concluded, not just that
    // something broke -- deterministicSummary/worldAfter already render
    // unconditionally above/below it in renderConcludeOutput either way.
    expect(result.epilogue.toLowerCase()).toContain('conclude');
    expect(result.deterministicSummary).toEqual(expect.any(String));
    expect(result.worldAfter).toContain('WORLD AFTER');
    expect(client.generate).toHaveBeenCalledTimes(2);
    // F-afb978de: userMessage()'s actionable per-kind text is wired into the
    // final-failure log, not left dead.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(userMessage(timeoutErr)));
    warnSpy.mockRestore();
  });
});

// F-e2ef2c38: narrateFinale's two non-fatal failure branches (retry, then
// permanent fallback) only ever console.warn'd, unlike narrator.ts's
// narrateScene/narrateSceneLegacy (F-fa65fe50), which also land in
// DebugLogger's queryable entries[] via an optional `logger` parameter — so
// a per-session degradation tally built on that logger would silently miss
// an epilogue fallback, the narratively highest-stakes degradation in the
// whole domain. Mirrors narrator.test.ts's "F-fa65fe50: optional
// DebugLogger threading" describe block: createTestLogger() captures
// entries without writing to stderr.
describe('narrateFinale F-e2ef2c38: optional DebugLogger threading', () => {
  it('logs the attempt-1 failure to the logger when the first attempt fails non-fatally but the retry succeeds', async () => {
    const timeoutErr = new NarrationError({ kind: 'timeout', message: 'request timed out' });
    const generate = vi.fn()
      .mockRejectedValueOnce(timeoutErr)
      .mockResolvedValueOnce({ ok: true, text: 'The city rebuilt, slowly.', inputTokens: 10, outputTokens: 20 } satisfies GenerateResult);
    const client: ClaudeClient = {
      generate,
      generateStructured: vi.fn().mockResolvedValue({ ok: false, data: null, raw: '' }),
      model: 'test-model',
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = createTestLogger();

    const result = await narrateFinale(client, makeOutline(), 'dark fantasy', 'Kael', undefined, logger);

    expect(result.isFallback).toBe(false);
    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'finale-narrator',
        message: expect.stringContaining('attempt 1/2'),
      }),
    );
  });

  it('logs the attempt-2 (final) failure to the logger when both attempts fail non-fatally', async () => {
    const timeoutErr = new NarrationError({ kind: 'timeout', message: 'request timed out' });
    const client = makeFailingClient(timeoutErr);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = createTestLogger();

    const result = await narrateFinale(client, makeOutline(), 'dark fantasy', 'Kael', undefined, logger);

    expect(result.epilogue).toBe(FALLBACK_EPILOGUE);
    expect(result.isFallback).toBe(true);
    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        subsystem: 'finale-narrator',
        message: expect.stringContaining('attempt 2/2'),
      }),
    );
    // Both attempts' failures are recorded, not just the final one.
    expect(logger.getEntries().filter((e) => e.subsystem === 'finale-narrator')).toHaveLength(2);
  });

  it('behaves exactly as before (no throw, normal fallback) when logger is omitted', async () => {
    const timeoutErr = new NarrationError({ kind: 'timeout', message: 'request timed out' });
    const client = makeFailingClient(timeoutErr);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await narrateFinale(client, makeOutline(), 'dark fantasy', 'Kael');

    expect(result.epilogue).toBe(FALLBACK_EPILOGUE);
    expect(result.isFallback).toBe(true);
  });
});
