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
});
