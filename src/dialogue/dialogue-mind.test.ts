import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateDialogue } from './dialogue-mind.js';
import type { ClaudeClient, GenerateResult } from '../claude-client.js';
import type { WorldState } from '@ai-rpg-engine/core';

// Mock npc-context so we control the context shape
vi.mock('./npc-context.js', () => ({
  buildNPCDialogueContext: vi.fn(),
}));

import { buildNPCDialogueContext } from './npc-context.js';
const mockedBuildContext = vi.mocked(buildNPCDialogueContext);

beforeEach(() => {
  vi.clearAllMocks();
});

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
