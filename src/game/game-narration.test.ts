// F-7815df9e: chronicle-memory seam coverage for the opening-narration path.
// generateOpeningNarration() is the second half of the seam contract
// (ExecuteTurnOpts / OpeningNarrationContext both gained a `chronicleContext`
// field) — this locks down that it actually reaches the narrateScene() call,
// mirroring the equivalent test in ../turn-loop.test.ts for the per-turn path.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import type { ClaudeClient } from '../claude-client.js';

vi.mock('../narrator/narrator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../narrator/narrator.js')>();
  return {
    ...actual,
    narrateScene: vi.fn(actual.narrateScene),
  };
});

import { generateOpeningNarration, type OpeningNarrationContext } from './game-narration.js';
import { narrateScene } from '../narrator/narrator.js';

const mockedNarrateScene = vi.mocked(narrateScene);

function createMockClient(): ClaudeClient {
  return {
    model: 'mock',
    async generate() {
      return { ok: true, text: 'The dawn breaks over the ruined keep.', inputTokens: 0, outputTokens: 0 };
    },
    async generateStructured() {
      return { ok: false, data: null, raw: '', error: 'mock' };
    },
  };
}

describe('generateOpeningNarration chronicleContext seam (F-7815df9e)', () => {
  beforeEach(() => {
    mockedNarrateScene.mockClear();
  });

  it('forwards chronicleContext from OpeningNarrationContext into the narrateScene call', async () => {
    const engine = createGame();
    const client = createMockClient();
    const chronicleContext = 'Chronicle: [1 events over 0 turns] Arrived as a stranger. [Long-term memory] Traveled (tick 4).';

    const ctx: OpeningNarrationContext = {
      client,
      world: engine.world,
      tone: 'dark fantasy',
      immersionState: 'exploration',
      chronicleContext,
    };

    await generateOpeningNarration(ctx);

    expect(mockedNarrateScene).toHaveBeenCalledTimes(1);
    const callOpts = mockedNarrateScene.mock.calls[0][0] as unknown as { chronicleContext?: string };
    expect(callOpts.chronicleContext).toBe(chronicleContext);
  });

  it('omits chronicleContext when the caller does not provide it (fresh campaign, nothing to recall yet)', async () => {
    const engine = createGame();
    const client = createMockClient();

    const ctx: OpeningNarrationContext = {
      client,
      world: engine.world,
      tone: 'dark fantasy',
      immersionState: 'exploration',
    };

    await generateOpeningNarration(ctx);

    expect(mockedNarrateScene).toHaveBeenCalledTimes(1);
    const callOpts = mockedNarrateScene.mock.calls[0][0] as unknown as { chronicleContext?: string };
    expect(callOpts.chronicleContext).toBeUndefined();
  });
});

// F-f4f6ac90 (coordinator stitch): the finale voice is keyed by narratorTone —
// this locks down that generateFinaleNarration actually forwards it into
// narrateFinale's 5th parameter, closing the wave-12 regression where the
// re-keyed PACK_VOICES lookup received undefined from every caller.
vi.mock('../narrator/finale-narrator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../narrator/finale-narrator.js')>();
  return { ...actual, narrateFinale: vi.fn(actual.narrateFinale) };
});

describe('generateFinaleNarration narratorTone forwarding (F-f4f6ac90)', () => {
  it('forwards narratorTone as narrateFinale\'s 5th argument', async () => {
    const { generateFinaleNarration } = await import('./game-narration.js');
    const { narrateFinale } = await import('../narrator/finale-narrator.js');
    const mockedNarrateFinale = vi.mocked(narrateFinale);
    mockedNarrateFinale.mockResolvedValueOnce({
      deterministicSummary: 'done', epilogue: 'end', worldAfter: 'after',
    });
    await generateFinaleNarration({
      client: createMockClient(),
      outline: { kind: 'triumph', beats: [], epilogueSeeds: [] } as never,
      genre: 'fantasy',
      characterName: 'Aldric',
      narratorTone: 'dark fantasy, concise, atmospheric, foreboding',
    });
    expect(mockedNarrateFinale).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'fantasy', 'Aldric',
      'dark fantasy, concise, atmospheric, foreboding',
    );
  });
});
