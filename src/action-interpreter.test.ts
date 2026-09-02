import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { NarrationError } from './llm/claude-errors.js';
import { createTestLogger } from './game/debug-logger.js';

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
        // F-39b958e7: unlike this file's other mocks, this one's
        // generateStructured resolves a concrete non-null `data` object, so
        // the generic ClaudeClient.generateStructured<T>() can't infer T
        // without contextual typing. Cast at the call site, matching this
        // file's own established pattern for its other non-null-data mocks
        // (see the F-4d102b74 sweep tests below).
        mockClient as any,
        engine.world,
        'ponder the meaning of existence',
        engine.getAvailableActions(),
      );

      expect(result.verb).toBe('look');
      expect(result.confidence).toBe('medium');
      expect(result.reasoning).toBe('Player seems curious');
    });

    it('should fall back to look with hazy message when Claude API fails (PB-007)', async () => {
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
      // PB-007: API failure gets a player-friendly transient message
      expect(result.reasoning).toContain('hazy');
      expect(result.reasoning).toContain('try again');
    });

    it('should fall back to look with hazy message when generateStructured throws instead of resolving ok:false (F-d026f78d)', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      // claude-adapter.ts's callApi()/withRetry throws a NarrationError for
      // auth/bad-request (immediately) or after retries are exhausted for
      // rate-limit/timeout/transport/unexpected — this must degrade to the
      // same PB-007 fallback as a resolved { ok: false }, not propagate.
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => {
          throw new NarrationError({ kind: 'timeout', message: 'took too long' });
        },
      };

      const result = await interpretAction(
        mockClient,
        engine.world,
        'ponder the meaning of existence',
        engine.getAvailableActions(),
      );

      expect(result.verb).toBe('look');
      expect(result.confidence).toBe('low');
      expect(result.reasoning).toContain('hazy');
      expect(result.reasoning).toContain('try again');
    });

    it('should include recentContext in the prompt sent to Claude when provided (F-fb9e78af)', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      let capturedPrompt = '';

      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async (opts: { prompt: string }) => {
          capturedPrompt = opts.prompt;
          return { ok: false, data: null, raw: '', error: 'mock' };
        },
      };

      await interpretAction(
        mockClient,
        engine.world,
        'ponder the meaning of existence',
        engine.getAvailableActions(),
        'Player said "attack" and was asked to clarify: "Did you want to attack or flee?"',
      );

      expect(capturedPrompt).toContain('Recent context');
      expect(capturedPrompt).toContain('Did you want to attack or flee?');
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

    // FT-B-007: Opportunity disambiguation
    it('should extract opportunity name from "accept job escort"', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'accept job escort', engine.getAvailableActions());
      expect(result.verb).toBe('opportunity');
      expect(result.parameters?.subAction).toBe('accept');
      expect(result.parameters?.opportunityName).toBe('escort');
    });

    it('should extract opportunity index from "complete quest 2"', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'complete quest 2', engine.getAvailableActions());
      expect(result.verb).toBe('opportunity');
      expect(result.parameters?.subAction).toBe('complete');
      expect(result.parameters?.opportunityIndex).toBe(2);
    });

    it('should handle "decline bounty smuggling run" with name', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'decline bounty smuggling run', engine.getAvailableActions());
      expect(result.verb).toBe('opportunity');
      expect(result.parameters?.subAction).toBe('decline');
      expect(result.parameters?.opportunityName).toBe('smuggling run');
    });

    // FT-B-003: Fast-path inventory verbs
    it('should interpret "inventory" as inventory verb (no turn consumed)', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'inventory', engine.getAvailableActions());
      expect(result.verb).toBe('inventory');
      expect(result.confidence).toBe('high');
    });

    it('should interpret "i" as inventory verb shorthand', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'i', engine.getAvailableActions());
      expect(result.verb).toBe('inventory');
      expect(result.confidence).toBe('high');
    });

    it('should interpret "pick up sword" as take verb', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'pick up sword', engine.getAvailableActions());
      expect(result.verb).toBe('take');
      expect(result.parameters).toEqual({ item: 'sword' });
      expect(result.confidence).toBe('high');
    });

    it('should interpret "take the gem" as take verb', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'take the gem', engine.getAvailableActions());
      expect(result.verb).toBe('take');
      expect(result.parameters).toEqual({ item: 'gem' });
      expect(result.confidence).toBe('high');
    });

    it('should interpret "grab key" as take verb', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'grab key', engine.getAvailableActions());
      expect(result.verb).toBe('take');
      expect(result.confidence).toBe('high');
    });

    it('should interpret "loot chest" as take verb', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'loot chest', engine.getAvailableActions());
      expect(result.verb).toBe('take');
      expect(result.confidence).toBe('high');
    });

    it('should interpret "drop shield" as drop verb', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'drop shield', engine.getAvailableActions());
      expect(result.verb).toBe('drop');
      expect(result.parameters).toEqual({ item: 'shield' });
      expect(result.confidence).toBe('high');
    });

    // F-b9a844dc: @ai-rpg-engine/equipment's itemRefOf() never reads
    // parameters.item -- these five pins used to codify that wrong field
    // name (the exact bug this finding fixes) instead of catching it.
    // Inverted to the correct contract: a typed name that matches nothing
    // the player carries/has equipped (a fresh createGame() player carries
    // and wears nothing) resolves to `parameters: null` (itemId left
    // unset, not a best-effort guess), letting the engine's own guided
    // rejection fire. The positive-resolution path (2+ eligible items,
    // correct one selected) is covered below and by turn-loop.test.ts's
    // end-to-end integration test.
    it('should interpret "equip armor" as equip verb with no resolvable item', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'equip armor', engine.getAvailableActions());
      expect(result.verb).toBe('equip');
      expect(result.parameters).toBeNull();
      expect(result.confidence).toBe('high');
    });

    it('should interpret "wear helmet" as equip verb with no resolvable item', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'wear helmet', engine.getAvailableActions());
      expect(result.verb).toBe('equip');
      expect(result.parameters).toBeNull();
      expect(result.confidence).toBe('high');
    });

    it('should interpret "wield staff" as equip verb with no resolvable item', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'wield staff', engine.getAvailableActions());
      expect(result.verb).toBe('equip');
      expect(result.parameters).toBeNull();
      expect(result.confidence).toBe('high');
    });

    it('should interpret "unequip ring" as unequip verb with no resolvable item', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'unequip ring', engine.getAvailableActions());
      expect(result.verb).toBe('unequip');
      expect(result.parameters).toBeNull();
      expect(result.confidence).toBe('high');
    });

    it('should interpret "remove gauntlets" as unequip verb with no resolvable item', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'remove gauntlets', engine.getAvailableActions());
      expect(result.verb).toBe('unequip');
      expect(result.parameters).toBeNull();
      expect(result.confidence).toBe('high');
    });

    it('should resolve the specifically named item when 2+ eligible items are carried (F-b9a844dc)', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const player = engine.world.entities[engine.world.playerId];
      if (player) {
        player.inventory = ['rusted-mace', 'gravedigger-spade'];
      }
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'equip spade', engine.getAvailableActions());
      expect(result.verb).toBe('equip');
      expect(result.parameters).toEqual({ itemId: 'gravedigger-spade' });
      expect(result.confidence).toBe('high');
    });

    it('should resolve the specifically named item when 2+ items are equipped, for unequip (F-b9a844dc)', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const player = engine.world.entities[engine.world.playerId];
      if (player) {
        player.equipment = { weapon: 'rusted-mace', accessory: 'sigil-ring' };
      }
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'unequip ring', engine.getAvailableActions());
      expect(result.verb).toBe('unequip');
      expect(result.parameters).toEqual({ itemId: 'sigil-ring' });
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

  describe('craft/salvage/repair/modify word boundary (F-f57bbfd9)', () => {
    /** Mock client whose LLM fallback returns a recognizable marker verb, so
     * we can prove input reached the slow path instead of the fast regex. */
    function createLlmMarkerClient() {
      return {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({
          ok: true,
          data: {
            verb: 'llm-handled',
            targetIds: null,
            toolId: null,
            parameters: null,
            confidence: 'medium',
            reasoning: 'routed to LLM',
            alternatives: null,
          },
          raw: '',
        }),
      };
    }

    it.each([
      'repairs',
      'repairable armor',
      'craftier plan',
      'modifying the sword',
      'salvageable wreck',
    ])('should NOT fast-match %j as craft/salvage/repair/modify (falls through to LLM)', async (input) => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const result = await interpretAction(
        createLlmMarkerClient() as any,
        engine.world,
        input,
        engine.getAvailableActions(),
      );

      expect(result.verb).not.toBe('craft');
      expect(result.verb).toBe('llm-handled');
    });

    it('should still fast-match bare "craft" with no argument', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const result = await interpretAction(
        createLlmMarkerClient() as any,
        engine.world,
        'craft',
        engine.getAvailableActions(),
      );

      expect(result.verb).toBe('craft');
      expect(result.parameters).toEqual({ subAction: 'craft', recipeOrItem: '' });
      expect(result.confidence).toBe('high');
    });

    it('should still fast-match "repair shield" with a real word boundary', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const result = await interpretAction(
        createLlmMarkerClient() as any,
        engine.world,
        'repair shield',
        engine.getAvailableActions(),
      );

      expect(result.verb).toBe('craft');
      expect(result.parameters).toEqual({ subAction: 'repair', recipeOrItem: 'shield' });
      expect(result.confidence).toBe('high');
    });

    // Sibling of the same missing-word-boundary pattern, found via the
    // family-of-call-sites probe: SOCIAL_PATTERNS' disguise/conceal entry has
    // no trailing boundary at all (worse than \s* — literally none), so any
    // word merely starting with "conceal" fast-matches as the disguise action.
    it.each([
      'concealment options',
      'concealed my tracks',
      'disguised as a merchant',
    ])('should NOT fast-match %j as disguise (sibling of F-f57bbfd9 in SOCIAL_PATTERNS)', async (input) => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const result = await interpretAction(
        createLlmMarkerClient() as any,
        engine.world,
        input,
        [...engine.getAvailableActions(), 'social'],
      );

      expect(result.verb).not.toBe('social');
      expect(result.verb).toBe('llm-handled');
    });

    it('should still fast-match bare "conceal" as the disguise social action', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const result = await interpretAction(
        createLlmMarkerClient() as any,
        engine.world,
        'conceal',
        [...engine.getAvailableActions(), 'social'],
      );

      expect(result.verb).toBe('social');
      expect(result.parameters).toEqual({ subAction: 'disguise' });
      expect(result.confidence).toBe('high');
    });

    it('should still fast-match "disguise myself as a merchant" (verb + trailing text)', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const result = await interpretAction(
        createLlmMarkerClient() as any,
        engine.world,
        'disguise myself as a merchant',
        [...engine.getAvailableActions(), 'social'],
      );

      expect(result.verb).toBe('social');
      expect(result.parameters).toEqual({ subAction: 'disguise' });
    });
  });

  describe('LeverageVerbMap trailing-literal word boundary sweep (F-4d102b74)', () => {
    /** Same marker-client trick as the F-f57bbfd9 block above: proves input
     * fell through to the LLM instead of fast-matching. */
    function createLlmMarkerClient() {
      return {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({
          ok: true,
          data: {
            verb: 'llm-handled',
            targetIds: null,
            toolId: null,
            parameters: null,
            confidence: 'medium',
            reasoning: 'routed to LLM',
            alternatives: null,
          },
          raw: '',
        }),
      };
    }

    const allLeverageVerbs = ['social', 'rumor', 'diplomacy'];

    it.each([
      // SOCIAL_PATTERNS
      'stake claiming the territory',
      'call in a favorite ally',
      // RUMOR_PATTERNS
      'plant rumors everywhere',
      'deny the accusations firmly',
      'bury the scandalous affair',
      'leak the truthful account',
      'counter-rumors are spreading',
      'claim creditable results',
      // DIPLOMACY_PATTERNS
      'broker a truce-breaker',
      'trade a secretive letter',
      'propose alliances with everyone',
      'cash in milestones today',
    ])('should NOT fast-match %j (falls through to LLM)', async (input) => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const result = await interpretAction(
        createLlmMarkerClient() as any,
        engine.world,
        input,
        [...engine.getAvailableActions(), ...allLeverageVerbs],
      );

      expect(result.verb).toBe('llm-handled');
    });

    it('should still fast-match "stake claim to the territory" with a real word boundary', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const result = await interpretAction(
        createLlmMarkerClient() as any,
        engine.world,
        'stake claim to the territory',
        [...engine.getAvailableActions(), 'social'],
      );

      expect(result.verb).toBe('social');
      expect(result.parameters).toEqual({ subAction: 'stake-claim' });
    });

    it('should still fast-match bare "deny the accusation" with a real word boundary', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const result = await interpretAction(
        createLlmMarkerClient() as any,
        engine.world,
        'deny the accusation',
        [...engine.getAvailableActions(), 'rumor'],
      );

      expect(result.verb).toBe('rumor');
      expect(result.parameters).toEqual({ subAction: 'deny' });
    });

    it('should still fast-match "trade secret with the merchant" with a real word boundary', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();

      const result = await interpretAction(
        createLlmMarkerClient() as any,
        engine.world,
        'trade secret with the merchant',
        [...engine.getAvailableActions(), 'diplomacy'],
      );

      expect(result.verb).toBe('diplomacy');
      expect(result.parameters).toEqual({ subAction: 'trade-secret' });
    });
  });

  describe('opportunity regex trailing-literal word boundary (F-4d102b74 sweep)', () => {
    // Same missing-boundary shape found sweeping the rest of the file: the
    // noun alternation (job|contract|...) is immediately followed by an
    // *optional* trailing group, so nothing enforced a boundary right after
    // the noun itself — "jobless" fast-matched as a bare prefix of "job".
    it('should NOT fast-match "accept jobless benefits" as an opportunity verb (falls through to LLM)', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({
          ok: true,
          data: {
            verb: 'llm-handled',
            targetIds: null,
            toolId: null,
            parameters: null,
            confidence: 'medium',
            reasoning: 'routed to LLM',
            alternatives: null,
          },
          raw: '',
        }),
      };

      const result = await interpretAction(
        mockClient as any,
        engine.world,
        'accept jobless benefits',
        engine.getAvailableActions(),
      );

      expect(result.verb).toBe('llm-handled');
    });

    it('should still fast-match "accept job escort" with a real word boundary (regression guard)', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient as any, engine.world, 'accept job escort', engine.getAvailableActions());
      expect(result.verb).toBe('opportunity');
      expect(result.parameters?.subAction).toBe('accept');
      expect(result.parameters?.opportunityName).toBe('escort');
    });
  });
});

// WO-B1-3 (slice B1 §§2-4, design lock 4). RED before this WO: "attack the
// pilgrim" fell through to the LLM (no article stripping), a downed entity
// stayed attackable, and `flee`/`help <name>` did not exist as fast paths.
describe('WO-B1-3: leading-article stripping, downed-entity exclusion, flee, help', () => {
  function mockClient() {
    return {
      model: 'mock',
      generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
      generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
    };
  }

  it('strips a leading "the" before matching an attack target', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();

    const result = await interpretAction(mockClient(), engine.world, 'attack the pilgrim', engine.getAvailableActions());

    expect(result.verb).toBe('attack');
    expect(result.targetIds).toContain('pilgrim');
    expect(result.confidence).toBe('high');
  });

  it('strips a leading "a"/"an" before matching a speak target', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();

    const result = await interpretAction(mockClient(), engine.world, 'speak to a pilgrim', engine.getAvailableActions());

    expect(result.verb).toBe('speak');
    expect(result.targetIds).toContain('pilgrim');
  });

  it('never resolves an attack fast-path to a downed (hp<=0) entity', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();
    engine.world.entities['pilgrim'].resources.hp = 0;

    const result = await interpretAction(mockClient(), engine.world, 'attack pilgrim', engine.getAvailableActions());

    // Falls through to the (mocked, failing) LLM path instead of fast-matching a corpse.
    expect(result.verb).toBe('look');
    expect(result.confidence).toBe('low');
  });

  it('"flee" resolves to disengage', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();

    const result = await interpretAction(mockClient(), engine.world, 'flee', engine.getAvailableActions());

    expect(result.verb).toBe('disengage');
    expect(result.confidence).toBe('high');
  });

  it('"help <name>" resolves to speak + helpAskId when an open ask names that entity', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();
    engine.world.globals['claude_rpg.asks'] = JSON.stringify([{
      id: 'ask_1',
      npcId: 'pilgrim',
      kind: 'lend',
      surface: 'Could you lend me a little coin?',
      truth: 'genuine',
      stake: 5,
      offeredTick: 0,
      status: 'open',
      cues: [],
    }]);

    const result = await interpretAction(mockClient(), engine.world, 'help pilgrim', engine.getAvailableActions());

    expect(result.verb).toBe('speak');
    expect(result.targetIds).toContain('pilgrim');
    expect(result.parameters?.helpAskId).toBe('ask_1');
  });

  it('"help <name>" falls through to the LLM when there is no open ask for that entity', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();

    const result = await interpretAction(mockClient(), engine.world, 'help pilgrim', engine.getAvailableActions());

    expect(result.verb).toBe('look');
    expect(result.confidence).toBe('low');
  });
});

// WO-B1F-3 (slice B1F §3, design lock 3, ADDENDUM-COMMON): "Brother Aldric"
// typed alone was met with "Did you want to inspect or move?" (mistral, run
// a) -- a bare zone-entity name or exit name, with no verb prefix at all,
// previously fell straight through every fast-path pattern (all of which
// require a verb prefix) to the LLM.
describe('WO-B1F-3: bare name means talk; bare exit means move', () => {
  function mockClient() {
    return {
      model: 'mock',
      generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
      generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
    };
  }

  it('a bare zone-entity name resolves to speak, with no verb typed at all', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();

    const result = await interpretAction(mockClient(), engine.world, 'pilgrim', engine.getAvailableActions());

    expect(result.verb).toBe('speak');
    expect(result.targetIds).toContain('pilgrim');
    expect(result.confidence).toBe('high');
  });

  it('a bare zone-entity name with a leading article ("the pilgrim") still resolves to speak', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();

    const result = await interpretAction(mockClient(), engine.world, 'the pilgrim', engine.getAvailableActions());

    expect(result.verb).toBe('speak');
    expect(result.targetIds).toContain('pilgrim');
  });

  it('a bare exit name resolves to move', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();

    const result = await interpretAction(mockClient(), engine.world, 'nave', engine.getAvailableActions());

    expect(result.verb).toBe('move');
    expect(result.targetIds).toContain('chapel-nave');
    expect(result.confidence).toBe('high');
  });

  it('a bare word matching neither an entity nor an exit still falls through to the LLM (unaffected)', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();

    const result = await interpretAction(mockClient(), engine.world, 'xyzzyplugh', engine.getAvailableActions());

    expect(result.verb).toBe('look');
    expect(result.confidence).toBe('low');
  });
});

// WO-B1F-1 (slice B1F §1, design lock 1, ADDENDUM-COMMON): "The dead do not
// stay buried." typed in answer to an NPC's question was met with "I'm not
// sure what you mean" four times (gemini, run a).
describe('WO-B1F-1: reply-to-speaker', () => {
  function mockClient() {
    return {
      model: 'mock',
      generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
      generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
    };
  }

  it('resolves an otherwise-unmatched free-prose input as speak to the last speaker, before the LLM ever runs', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();

    const result = await interpretAction(
      mockClient(),
      engine.world,
      'The dead do not stay buried.',
      engine.getAvailableActions(),
      undefined,
      'pilgrim',
    );

    expect(result.verb).toBe('speak');
    expect(result.targetIds).toContain('pilgrim');
    expect(result.confidence).toBe('high');
  });

  it('is not consulted when the input matches an ordinary fast-path pattern (an explicit verb always wins)', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();

    const result = await interpretAction(
      mockClient(),
      engine.world,
      'attack pilgrim',
      engine.getAvailableActions(),
      undefined,
      'sister-maren',
    );

    expect(result.verb).toBe('attack');
    expect(result.targetIds).toContain('pilgrim');
  });

  it('falls through to the LLM when lastSpeakerNpcId is omitted (back-compat, unaffected)', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();

    const result = await interpretAction(
      mockClient(),
      engine.world,
      'The dead do not stay buried.',
      engine.getAvailableActions(),
    );

    expect(result.verb).toBe('look');
    expect(result.confidence).toBe('low');
  });

  it('falls through to the LLM when the named last speaker no longer exists in the world', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();

    const result = await interpretAction(
      mockClient(),
      engine.world,
      'The dead do not stay buried.',
      engine.getAvailableActions(),
      undefined,
      'no-such-npc',
    );

    expect(result.verb).toBe('look');
    expect(result.confidence).toBe('low');
  });
});

// WO-B1F-7 (slice B1F §7, design lock 7, ADDENDUM-COMMON): two `help
// <petitioner>` inputs did not resolve the ask (deepseek, llama, run b) --
// reproduced against dogfood/playtest/runs/b1-2026-09-02b/llama/transcript.txt's
// "help the shivering pilgrim" input.
describe('WO-B1F-7: help path tracing + the article-stripping fix', () => {
  function mockClient() {
    return {
      model: 'mock',
      generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
      generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
    };
  }

  it("RED before this WO: a differently-articled name (\"help the shivering pilgrim\") failed to match a petitioner literally named \"a shivering pilgrim\"", async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();
    engine.world.entities['petitioner-1'] = {
      id: 'petitioner-1',
      blueprintId: 'petitioner',
      type: 'npc',
      name: 'a shivering pilgrim',
      tags: ['npc', 'named', 'petitioner'],
      stats: {},
      resources: { hp: 1, maxHp: 1 },
      statuses: [],
      zoneId: engine.world.locationId,
    };
    engine.world.globals['claude_rpg.asks'] = JSON.stringify([{
      id: 'ask_shiver',
      petitioner: { id: 'petitioner-1', name: 'a shivering pilgrim', zoneId: engine.world.locationId },
      kind: 'hold',
      surface: 'Would you hold this for me a while?',
      truth: 'genuine',
      stake: 5,
      offeredTick: 0,
      status: 'open',
      cues: [],
    }]);

    const result = await interpretAction(mockClient(), engine.world, 'help the shivering pilgrim', engine.getAvailableActions());

    expect(result.verb).toBe('speak');
    expect(result.targetIds).toContain('petitioner-1');
    expect(result.parameters?.helpAskId).toBe('ask_shiver');
  });

  it('resolves a transient petitioner whose entity lives in a DIFFERENT zone than the player (ask-by-name branch)', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();
    const otherZoneId = engine.world.zones[engine.world.locationId].neighbors[0];
    engine.world.entities['far-petitioner'] = {
      id: 'far-petitioner',
      blueprintId: 'petitioner',
      type: 'npc',
      name: 'a distant courier',
      tags: ['npc', 'named', 'petitioner'],
      stats: {},
      resources: { hp: 1, maxHp: 1 },
      statuses: [],
      zoneId: otherZoneId,
    };
    engine.world.globals['claude_rpg.asks'] = JSON.stringify([{
      id: 'ask_far',
      petitioner: { id: 'far-petitioner', name: 'a distant courier', zoneId: otherZoneId },
      kind: 'carry',
      surface: 'Would you carry this to the district for me?',
      truth: 'genuine',
      stake: 5,
      offeredTick: 0,
      status: 'open',
      cues: [],
    }]);

    const result = await interpretAction(mockClient(), engine.world, 'help the distant courier', engine.getAvailableActions());

    expect(result.verb).toBe('speak');
    expect(result.targetIds).toContain('far-petitioner');
    expect(result.parameters?.helpAskId).toBe('ask_far');
  });

  it("resolves a petitioner whose name collides with the co-located pack NPC's name, without accidentally matching the wrong (ask-less) entity", async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();
    // 'pilgrim' ("Suspicious Pilgrim") is already co-located and has no ask.
    engine.world.entities['petitioner-2'] = {
      id: 'petitioner-2',
      blueprintId: 'petitioner',
      type: 'npc',
      name: 'a pilgrim boy',
      tags: ['npc', 'named', 'petitioner'],
      stats: {},
      resources: { hp: 1, maxHp: 1 },
      statuses: [],
      zoneId: engine.world.locationId,
    };
    engine.world.globals['claude_rpg.asks'] = JSON.stringify([{
      id: 'ask_boy',
      petitioner: { id: 'petitioner-2', name: 'a pilgrim boy', zoneId: engine.world.locationId },
      kind: 'hold',
      surface: 'Would you hold this for me a while?',
      truth: 'genuine',
      stake: 5,
      offeredTick: 0,
      status: 'open',
      cues: [],
    }]);

    const result = await interpretAction(mockClient(), engine.world, 'help pilgrim boy', engine.getAvailableActions());

    expect(result.verb).toBe('speak');
    expect(result.targetIds).toContain('petitioner-2');
    expect(result.parameters?.helpAskId).toBe('ask_boy');
  });

  it('traces which branch resolved a "help <name>" input to the debug logger (entity-with-ask)', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();
    engine.world.globals['claude_rpg.asks'] = JSON.stringify([{
      id: 'ask_1',
      npcId: 'pilgrim',
      kind: 'lend',
      surface: 'Could you lend me a little coin?',
      truth: 'genuine',
      stake: 5,
      offeredTick: 0,
      status: 'open',
      cues: [],
    }]);
    const debugLog = createTestLogger();

    await interpretAction(
      mockClient(),
      engine.world,
      'help pilgrim',
      engine.getAvailableActions(),
      undefined,
      undefined,
      debugLog,
    );

    const entry = debugLog.getEntries().find((e) => e.subsystem === 'interpret' && e.message === 'help-path');
    expect(entry).toBeDefined();
    expect(entry!.data?.branch).toBe('entity-with-ask');
  });

  it('traces the "none" branch when no entity and no ask ledger entry match', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();
    const debugLog = createTestLogger();

    await interpretAction(
      mockClient(),
      engine.world,
      'help a nobody in particular',
      engine.getAvailableActions(),
      undefined,
      undefined,
      debugLog,
    );

    const entry = debugLog.getEntries().find((e) => e.subsystem === 'interpret' && e.message === 'help-path');
    expect(entry).toBeDefined();
    expect(entry!.data?.branch).toBe('none');
  });
});

describe('flee <exit> (sixth family playtest)', () => {
  function quietClient() {
    return {
      model: 'mock',
      generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
      generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
    };
  }
  it('a named exit after flee resolves as a move to that exit; bare flee stays disengage', async () => {
    const { interpretAction } = await import('./action-interpreter.js');
    const engine = createGame();
    const world = engine.world;
    const exitId = world.zones[world.locationId]?.neighbors?.[0] as string;
    const exitName = world.zones[exitId]?.name ?? exitId;
    const moved = await interpretAction(quietClient(), world, `flee ${exitName}`, engine.getAvailableActions());
    expect(moved.verb).toBe('move');
    expect(moved.targetIds).toEqual([exitId]);
    const bare = await interpretAction(quietClient(), world, 'flee', engine.getAvailableActions());
    expect(bare.verb).toBe('disengage');
  });
});
