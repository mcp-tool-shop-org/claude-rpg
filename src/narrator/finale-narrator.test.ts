import { describe, it, expect, vi } from 'vitest';
import { narrateFinale } from './finale-narrator.js';
import type { ClaudeClient, GenerateResult } from '../claude-client.js';
import type { FinaleOutline } from '@ai-rpg-engine/campaign-memory';
import { NarrationError } from '../llm/claude-errors.js';

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
  });

  it('should rethrow a fatal bad-request NarrationError the same way', async () => {
    const badRequestErr = new NarrationError({ kind: 'bad-request', message: 'malformed request' });
    const client = makeFailingClient(badRequestErr);

    await expect(
      narrateFinale(client, makeOutline(), 'dark fantasy', 'Kael'),
    ).rejects.toThrow(badRequestErr);
  });

  it('should keep the blank-epilogue fallback (deterministic-summary-only) for non-fatal errors, but still log', async () => {
    const timeoutErr = new NarrationError({ kind: 'timeout', message: 'request timed out' });
    const client = makeFailingClient(timeoutErr);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await narrateFinale(client, makeOutline(), 'dark fantasy', 'Kael');

    expect(result.epilogue).toBe('');
    expect(result.deterministicSummary).toEqual(expect.any(String));
    expect(result.worldAfter).toContain('WORLD AFTER');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
