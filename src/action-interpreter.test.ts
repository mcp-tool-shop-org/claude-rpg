import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';

// Test the fast keyword-based interpreter by importing the module
// and testing via the public interpretAction with a mock client

describe('action-interpreter', () => {
  describe('fast interpretation (keyword matching)', () => {
    it('should interpret "look" as look action', async () => {
      // We test the fast path indirectly via interpretAction with a mock client
      // that should never be called (fast path handles it)
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(
        mockClient,
        engine.world,
        'look',
        engine.getAvailableActions(),
      );

      expect(result.verb).toBe('look');
      expect(result.confidence).toBe('high');
    });

    it('should interpret "look around" as look', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(
        mockClient,
        engine.world,
        'look around',
        engine.getAvailableActions(),
      );

      expect(result.verb).toBe('look');
      expect(result.confidence).toBe('high');
    });

    it('should interpret "go to chapel nave" as move', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(
        mockClient,
        engine.world,
        'go to nave',
        engine.getAvailableActions(),
      );

      expect(result.verb).toBe('move');
      expect(result.targetIds).toContain('chapel-nave');
      expect(result.confidence).toBe('high');
    });

    it('should interpret "attack pilgrim" as attack', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(
        mockClient,
        engine.world,
        'attack pilgrim',
        engine.getAvailableActions(),
      );

      expect(result.verb).toBe('attack');
      expect(result.targetIds).toContain('pilgrim');
      expect(result.confidence).toBe('high');
    });

    it('should interpret "talk to pilgrim" as speak', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(
        mockClient,
        engine.world,
        'talk to pilgrim',
        engine.getAvailableActions(),
      );

      expect(result.verb).toBe('speak');
      expect(result.targetIds).toContain('pilgrim');
      expect(result.confidence).toBe('high');
    });
  });

  describe('LLM fallback path (T-006)', () => {
    it('should call Claude when fast path returns null and use structured result', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const structuredResponse = {
        verb: 'look',
        targetIds: null,
        toolId: null,
        parameters: null,
        confidence: 'medium' as const,
        reasoning: 'Player seems curious',
        alternatives: null,
      };

      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({
          ok: true,
          data: structuredResponse,
          raw: JSON.stringify(structuredResponse),
        }),
      };

      // Ambiguous input that won't match any fast-path regex
      const result = await interpretAction(
        mockClient,
        engine.world,
        'ponder the meaning of existence',
        engine.getAvailableActions(),
      );

      expect(result.verb).toBe('look');
      expect(result.confidence).toBe('medium');
      expect(result.reasoning).toBe('Player seems curious');
    });

    it('should fall back to look when Claude returns failure', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({
          ok: false,
          data: null,
          raw: '',
          error: 'Parse error',
        }),
      };

      // Ambiguous input that won't match any fast-path regex
      const result = await interpretAction(
        mockClient,
        engine.world,
        'ponder the meaning of existence',
        engine.getAvailableActions(),
      );

      expect(result.verb).toBe('look');
      expect(result.confidence).toBe('low');
      expect(result.reasoning).toBe('Could not interpret input');
    });
  });

  describe('leverage/social/crafting/opportunity verbs (T-008)', () => {
    it('should interpret "bribe guard" as social verb', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      // Add a guard entity to the world for targeting
      engine.world.entities['guard'] = {
        id: 'guard',
        name: 'Guard',
        type: 'npc',
        zoneId: engine.world.locationId,
        tags: [],
        stats: {},
      } as any;

      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(
        mockClient,
        engine.world,
        'bribe guard',
        [...engine.getAvailableActions(), 'social'],
      );

      expect(result.verb).toBe('social');
      expect(result.parameters).toEqual({ subAction: 'bribe' });
      expect(result.targetIds).toContain('guard');
      expect(result.confidence).toBe('high');
    });

    it('should interpret "spread rumor about pilgrim" as rumor verb', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(
        mockClient,
        engine.world,
        'spread rumor about pilgrim',
        [...engine.getAvailableActions(), 'rumor'],
      );

      expect(result.verb).toBe('rumor');
      expect(result.parameters).toEqual({ subAction: 'seed' });
      expect(result.targetIds).toContain('pilgrim');
      expect(result.confidence).toBe('high');
    });

    it('should interpret "craft sword" as craft verb', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(
        mockClient,
        engine.world,
        'craft sword',
        engine.getAvailableActions(),
      );

      expect(result.verb).toBe('craft');
      expect(result.parameters).toEqual({ subAction: 'craft', recipeOrItem: 'sword' });
      expect(result.confidence).toBe('high');
    });

    it('should interpret "accept job" as opportunity verb', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(
        mockClient,
        engine.world,
        'accept job',
        engine.getAvailableActions(),
      );

      expect(result.verb).toBe('opportunity');
      expect(result.parameters).toEqual({ subAction: 'accept' });
      expect(result.confidence).toBe('high');
    });

    it('should interpret "use potion" as use verb when item exists in inventory', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      // Add a potion to the player's inventory
      const player = engine.world.entities[engine.world.playerId];
      if (player) {
        player.inventory = ['healing potion'];
      }

      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(
        mockClient,
        engine.world,
        'use potion',
        [...engine.getAvailableActions(), 'use'],
      );

      expect(result.verb).toBe('use');
      expect(result.toolId).toBe('healing potion');
      expect(result.confidence).toBe('high');
    });
  });
});
