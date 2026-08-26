import { describe, it, expect, vi } from 'vitest';
import { narrateFinale } from './finale-narrator.js';
import type { ClaudeClient, GenerateResult } from '../claude-client.js';
import type { FinaleOutline } from '@ai-rpg-engine/campaign-memory';
import { NarrationError, userMessage } from '../llm/claude-errors.js';

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

function makeClient(text: string): ClaudeClient {
  return {
    generate: vi.fn().mockResolvedValue({
      ok: true,
      text,
      inputTokens: 10,
      outputTokens: 20,
    } satisfies GenerateResult),
  };
}

function makeFailingClient(error: Error): ClaudeClient {
  return {
    generate: vi.fn().mockRejectedValue(error),
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

// F-afb978de: fatal NarrationErrors (auth/bad-request) must surface an actionable
// userMessage() instead of silently returning an unexplained blank epilogue.
describe('narrateFinale F-afb978de: actionable fatal-error messages', () => {
  it('should surface the auth userMessage as the epilogue when the client throws a fatal auth NarrationError', async () => {
    const authErr = new NarrationError({ kind: 'auth', message: 'invalid x-api-key' });
    const client = makeFailingClient(authErr);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await narrateFinale(client, makeOutline(), 'dark fantasy', 'Kael');

    expect(result.epilogue).toBe(userMessage(authErr));
    expect(result.epilogue).toContain('ANTHROPIC_API_KEY');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('epilogue'));
    warnSpy.mockRestore();
  });

  it('should still return a usable deterministicSummary and worldAfter when the epilogue call fails', async () => {
    const authErr = new NarrationError({ kind: 'auth', message: 'invalid x-api-key' });
    const client = makeFailingClient(authErr);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await narrateFinale(client, makeOutline(), 'dark fantasy', 'Kael');

    expect(result.deterministicSummary).toEqual(expect.any(String));
    expect(result.worldAfter).toContain('WORLD AFTER');
    vi.restoreAllMocks();
  });

  it('should keep the blank-epilogue fallback (deterministic-summary-only) for non-fatal errors, but still log', async () => {
    const timeoutErr = new NarrationError({ kind: 'timeout', message: 'request timed out' });
    const client = makeFailingClient(timeoutErr);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await narrateFinale(client, makeOutline(), 'dark fantasy', 'Kael');

    expect(result.epilogue).toBe('');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
