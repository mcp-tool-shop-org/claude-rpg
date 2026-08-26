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

    it('should interpret "equip armor" as equip verb', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'equip armor', engine.getAvailableActions());
      expect(result.verb).toBe('equip');
      expect(result.parameters).toEqual({ item: 'armor' });
      expect(result.confidence).toBe('high');
    });

    it('should interpret "wear helmet" as equip verb', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'wear helmet', engine.getAvailableActions());
      expect(result.verb).toBe('equip');
      expect(result.parameters).toEqual({ item: 'helmet' });
      expect(result.confidence).toBe('high');
    });

    it('should interpret "wield staff" as equip verb', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'wield staff', engine.getAvailableActions());
      expect(result.verb).toBe('equip');
      expect(result.parameters).toEqual({ item: 'staff' });
      expect(result.confidence).toBe('high');
    });

    it('should interpret "unequip ring" as unequip verb', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'unequip ring', engine.getAvailableActions());
      expect(result.verb).toBe('unequip');
      expect(result.parameters).toEqual({ item: 'ring' });
      expect(result.confidence).toBe('high');
    });

    it('should interpret "remove gauntlets" as unequip verb', async () => {
      const { interpretAction } = await import('./action-interpreter.js');
      const engine = createGame();
      const mockClient = {
        model: 'mock',
        generate: async () => ({ ok: true, text: '', inputTokens: 0, outputTokens: 0 }),
        generateStructured: async () => ({ ok: false, data: null, raw: '', error: 'mock' }),
      };

      const result = await interpretAction(mockClient, engine.world, 'remove gauntlets', engine.getAvailableActions());
      expect(result.verb).toBe('unequip');
      expect(result.parameters).toEqual({ item: 'gauntlets' });
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
