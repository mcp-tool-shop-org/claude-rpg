import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateDialogue } from './dialogue-mind.js';
import type { ClaudeClient, GenerateResult } from '../claude-client.js';
import type { WorldState } from '@ai-rpg-engine/core';
import { NarrationError } from '../llm/claude-errors.js';

// Mock npc-context so we control the context shape
vi.mock('./npc-context.js', () => ({
  buildNPCDialogueContext: vi.fn(),
}));

import { buildNPCDialogueContext } from './npc-context.js';
const mockedBuildContext = vi.mocked(buildNPCDialogueContext);

beforeEach(() => {
  vi.clearAllMocks();
});

// F-124124a9: ClaudeClient (claude-client.ts:27-58) requires generateStructured
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

function makeWorld(): WorldState {
  return {
    entities: {
      'npc-1': { id: 'npc-1', name: 'Town Guard', type: 'npc' },
    },
  } as unknown as WorldState;
}

function makeContext() {
  return {
    npcName: 'Town Guard',
    npcType: 'npc',
    personality: 'stern',
    morale: 60,
    suspicion: 30,
    beliefs: [{ subject: 'player', key: 'threat', value: false, confidence: 0.5 }],
    recentMemories: [],
    rumors: [],
    playerRelationship: 'neutral',
    playerUtterance: 'Hello',
    tone: 'dark fantasy',
    faction: { name: 'guards', alertLevel: 10 },
  };
}

describe('generateDialogue PBR-002: LLM failure fallback', () => {
  it('should return fallback dialogue when LLM throws', async () => {
    const ctx = makeContext();
    mockedBuildContext.mockReturnValue(ctx as any);
    const client = makeFailingClient(new Error('API timeout'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateDialogue(
      client,
      makeWorld(),
      'npc-1',
      'Hello',
      'dark fantasy',
    );

    expect(result).not.toBeNull();
    expect(result!.text).toBe('The NPC pauses, gathering their thoughts...');
    expect(result!.speakerId).toBe('npc-1');
    expect(result!.speakerName).toBe('Town Guard');
    expect(result!.grounding.beliefCount).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('LLM generation failed'));
    warnSpy.mockRestore();
  });

  it('should return null when context cannot be built', async () => {
    mockedBuildContext.mockReturnValue(null as any);
    const client = makeClient('should not be called');

    const result = await generateDialogue(
      client,
      makeWorld(),
      'npc-1',
      'Hello',
      'dark fantasy',
    );

    expect(result).toBeNull();
    expect(client.generate).not.toHaveBeenCalled();
  });

  it('should return normal dialogue on successful LLM call', async () => {
    const ctx = makeContext();
    mockedBuildContext.mockReturnValue(ctx as any);
    const client = makeClient('Halt! State your business.');

    const result = await generateDialogue(
      client,
      makeWorld(),
      'npc-1',
      'Hello',
      'dark fantasy',
    );

    expect(result).not.toBeNull();
    expect(result!.text).toBe('Halt! State your business.');
    expect(result!.speakerId).toBe('npc-1');
    expect(result!.grounding.morale).toBe(60);
    expect(result!.grounding.suspicion).toBe(30);
  });

  it('should use NPC name from world state when available', async () => {
    const ctx = makeContext();
    mockedBuildContext.mockReturnValue(ctx as any);
    const client = makeFailingClient(new Error('network error'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateDialogue(
      client,
      makeWorld(),
      'npc-1',
      'Hi',
      'fantasy',
    );

    expect(result!.speakerName).toBe('Town Guard');
    vi.restoreAllMocks();
  });

  it('should fall back to npcId as name when entity not in world', async () => {
    const ctx = makeContext();
    mockedBuildContext.mockReturnValue(ctx as any);
    const client = makeFailingClient(new Error('error'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const emptyWorld = { entities: {} } as unknown as WorldState;
    const result = await generateDialogue(
      client,
      emptyWorld,
      'unknown-npc',
      'Hi',
      'fantasy',
    );

    expect(result!.speakerName).toBe('unknown-npc');
    vi.restoreAllMocks();
  });
});

// F-6480985e: the domain-wide fatal-error contract (documented in
// claude-errors.ts near NarrationError.fatal) is "rethrow, don't swallow into
// in-fiction text" — matching narrator.ts's narrateScene/narrateSceneLegacy.
// generateDialogue previously swallowed fatal errors into DialogueResult.text,
// so a bad API key would be rendered as the NPC's own spoken line. It must now
// rethrow so bin.ts's presentError renders the structured system-level box
// instead.
describe('generateDialogue F-6480985e: fatal errors rethrow instead of swallowing into dialogue text', () => {
  it('should rethrow a fatal auth NarrationError instead of returning it as in-character dialogue', async () => {
    const ctx = makeContext();
    mockedBuildContext.mockReturnValue(ctx as any);
    const authErr = new NarrationError({ kind: 'auth', message: 'invalid x-api-key' });
    const client = makeFailingClient(authErr);

    await expect(
      generateDialogue(client, makeWorld(), 'npc-1', 'Hello', 'dark fantasy'),
    ).rejects.toThrow(authErr);
  });

  it('should rethrow a fatal bad-request NarrationError the same way', async () => {
    const ctx = makeContext();
    mockedBuildContext.mockReturnValue(ctx as any);
    const badRequestErr = new NarrationError({ kind: 'bad-request', message: 'malformed request' });
    const client = makeFailingClient(badRequestErr);

    await expect(
      generateDialogue(client, makeWorld(), 'npc-1', 'Hello', 'dark fantasy'),
    ).rejects.toThrow(badRequestErr);
  });

  it('should keep the generic in-character fallback for non-fatal (retryable) errors', async () => {
    const ctx = makeContext();
    mockedBuildContext.mockReturnValue(ctx as any);
    const timeoutErr = new NarrationError({ kind: 'timeout', message: 'request timed out' });
    const client = makeFailingClient(timeoutErr);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateDialogue(
      client,
      makeWorld(),
      'npc-1',
      'Hello',
      'dark fantasy',
    );

    expect(result).not.toBeNull();
    expect(result!.text).toBe('The NPC pauses, gathering their thoughts...');
    warnSpy.mockRestore();
  });
});
