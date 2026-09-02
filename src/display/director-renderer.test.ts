import { describe, it, expect, afterEach, vi } from 'vitest';
import { executeDirectorCommand, renderDirectorHelp } from './director-renderer.js';
import { createObligation, type NpcProfile, type NpcObligationLedger } from '@ai-rpg-engine/modules';
import { formatRumorBoard, type Rumor } from '@ai-rpg-engine/rumor-system';

// Minimal world stub for tests
function makeWorld(): any {
  return {
    tick: 5,
    locationId: 'zone_market',
    entities: {
      npc_merchant: { name: 'Merchant Alara', zoneId: 'zone_market' },
    },
    factions: {
      guild: { name: 'Merchant Guild' },
    },
    zones: {},
    state: {},
    // F-6b72db54: a real WorldState always carries `.modules` (populated by
    // buildWorldStack); this stub omitted it and nothing in this file
    // exercised a module-state reader before. district-core.ts's
    // getModuleState indexes `world.modules['district-core']` with no
    // optional-chain on `.modules` itself, so an absent `.modules` throws
    // rather than falling through to its own empty-state default.
    modules: {},
  };
}

// F-6b72db54: a world whose CURRENT district (world.locationId) has a
// district-core definition carrying the given tags, for exercising
// getAvailableRecipes' requiredTags filter via the '/craft' case. Shape
// matches district-core.ts's own module-state fallback (getModuleState's
// default: { districts: {}, zoneToDistrict: {}, definitions: {} }).
function makeWorldWithDistrictTags(districtId: string, tags: string[]): any {
  return {
    ...makeWorld(),
    locationId: districtId,
    modules: {
      'district-core': {
        districts: {},
        zoneToDistrict: {},
        definitions: {
          [districtId]: { id: districtId, name: 'Test District', zoneIds: [], tags },
        },
      },
    },
  };
}

describe('executeDirectorCommand', () => {
  // --- Command dispatch ---

  it('should return unknown command message for unrecognized commands', () => {
    const result = executeDirectorCommand({ command: '/bogus', world: makeWorld() });
    expect(result).toContain('Unknown command');
    expect(result).toContain('/bogus');
  });

  it('should return unknown command for empty-ish input', () => {
    const result = executeDirectorCommand({ command: '/xyzzy', world: makeWorld() });
    expect(result).toContain('Unknown command');
  });

  // --- Missing args error messages ---

  it('should show usage when /inspect is called without an entity-id', () => {
    const result = executeDirectorCommand({ command: '/inspect', world: makeWorld() });
    expect(result).toContain('Usage');
    expect(result).toContain('<entity-id>');
  });

  it('should show usage when /faction is called without a faction-id', () => {
    const result = executeDirectorCommand({ command: '/faction', world: makeWorld() });
    expect(result).toContain('Usage');
    expect(result).toContain('<faction-id>');
  });

  it('should show usage when /trace is called with incomplete args', () => {
    const result = executeDirectorCommand({ command: '/trace foo', world: makeWorld() });
    expect(result).toContain('Usage');
  });

  it('should show usage when /npc is called without an id', () => {
    const result = executeDirectorCommand({ command: '/npc', world: makeWorld() });
    expect(result).toContain('Usage');
  });

  it('should show usage when /district is called without an id', () => {
    const result = executeDirectorCommand({ command: '/district', world: makeWorld() });
    expect(result).toContain('Usage');
  });

  it('should show usage when /trade is called without a district-id', () => {
    const result = executeDirectorCommand({ command: '/trade', world: makeWorld() });
    expect(result).toContain('Usage');
  });

  it('should show usage when /contract is called without an id', () => {
    const result = executeDirectorCommand({ command: '/contract', world: makeWorld() });
    expect(result).toContain('Usage');
  });

  it('should show usage when /salvage is called without an item-id', () => {
    const result = executeDirectorCommand({ command: '/salvage', world: makeWorld() });
    expect(result).toContain('Usage');
  });

  // --- /status output ---

  it('should return "No status data available" when statusData is missing', () => {
    const result = executeDirectorCommand({ command: '/status', world: makeWorld() });
    expect(result).toContain('No status data available');
  });

  // F-9141a74b: /status silently dropped materialsSummary, arcIndicator, and
  // endgameIndicator even though this same function already has the source
  // data for all three (profileCustom, arcSnapshot, endgameTriggers), used
  // two cases later at /craft, /arcs, and /endgame respectively.
  it('should include arc, materials, and endgame content in the compact snapshot when the data is present', () => {
    const statusData = {
      name: 'Aldric', level: 3, archetypeName: 'Warrior',
      hp: 20, injuryTags: [], statuses: [],
    } as any;
    const leverageState = {
      favor: 0, debt: 0, blackmail: 0, influence: 0, heat: 0, legitimacy: 0,
    } as any;
    const arcSnapshot = {
      signals: [{ kind: 'rising-power', strength: 0.8, momentum: 'building', primaryDrivers: [], turnsActive: 3 }],
      dominantArc: 'rising-power',
      tick: 5,
    } as any;
    const endgameTriggers = [
      { id: 'e1', resolutionClass: 'victory', detectedAtTick: 10, reason: '', evidence: {}, dominantArc: null, acknowledged: false },
    ] as any;
    const profileCustom = { 'materials.components': 5 };

    const result = executeDirectorCommand({
      command: '/status',
      world: makeWorld(),
      statusData,
      leverageState,
      arcSnapshot,
      endgameTriggers,
      profileCustom,
    });

    expect(result).toContain('rising-power');
    expect(result).toContain('components');
    expect(result).toContain('victory');
  });

  // WO-A4-8 (slice A4 design doc §3, ADDENDUM-COMMON lock 6): the /status
  // strategic ledger line -- heat, faction alerts above zero, district tone.
  // Coded against ADDENDUM-game-core.md's `worldLedger: { heat, quietRounds,
  // factionAlerts, districtTone? }` contract (WO-A4-4, not yet landed on
  // this branch -- this test exercises cli-display's own renderer directly,
  // so it is green today; only game.ts/bin.ts's real call site building
  // that object is "green expected at merge").
  describe('/status world ledger line (WO-A4-8)', () => {
    const statusData = {
      name: 'Aldric', level: 3, archetypeName: 'Warrior',
      hp: 20, injuryTags: [], statuses: [],
    } as any;
    const leverageState = {
      favor: 0, debt: 0, blackmail: 0, influence: 0, heat: 0, legitimacy: 0,
    } as any;

    it('renders heat, alerts (filtered to >0), and district tone', () => {
      const result = executeDirectorCommand({
        command: '/status',
        world: makeWorld(),
        statusData,
        leverageState,
        worldLedger: {
          heat: 12,
          quietRounds: 3,
          factionAlerts: { 'chapel-undead': 60, 'quiet-guild': 0 },
          districtTone: 'tense',
        },
      });
      expect(result).toContain('Heat 12 (3/37 quiet)');
      expect(result).toContain('Alerts: chapel-undead 60');
      expect(result).not.toContain('quiet-guild');
      expect(result).toContain('District: tense');
    });

    it('omits the ledger line entirely when heat is 0, no alerts, and no district tone', () => {
      const result = executeDirectorCommand({
        command: '/status',
        world: makeWorld(),
        statusData,
        leverageState,
        worldLedger: { heat: 0, quietRounds: 0, factionAlerts: {} },
      });
      expect(result).not.toContain('Heat 0');
    });

    it('still renders when heat is 0 but an alert is present', () => {
      const result = executeDirectorCommand({
        command: '/status',
        world: makeWorld(),
        statusData,
        leverageState,
        worldLedger: { heat: 0, quietRounds: 0, factionAlerts: { 'chapel-undead': 15 } },
      });
      expect(result).toContain('Heat 0');
      expect(result).toContain('Alerts: chapel-undead 15');
    });

    it('omits the ledger line entirely when worldLedger is absent (existing callers unaffected)', () => {
      const result = executeDirectorCommand({
        command: '/status',
        world: makeWorld(),
        statusData,
        leverageState,
      });
      expect(result).not.toContain('Heat');
    });
  });

  // --- /chronicle output ---

  it('should return "No chronicle events" when journal is empty', () => {
    const result = executeDirectorCommand({ command: '/chronicle', world: makeWorld() });
    expect(result).toContain('No chronicle events');
  });

  it('should reject invalid chronicle mode', () => {
    // Pass a journal with size() > 0 to get past the empty check
    const journal = { size: () => 1 } as any;
    const result = executeDirectorCommand({ command: '/chronicle badmode', world: makeWorld(), journal });
    expect(result).toContain('Usage');
    expect(result).toContain('timeline|bardic|director');
  });

  // --- /item output ---

  it('should return "No profile or item catalog" when both are missing', () => {
    const result = executeDirectorCommand({ command: '/item sword_1', world: makeWorld() });
    expect(result).toContain('No profile or item catalog');
  });

  // --- /rumors output ---

  it('should return "No player rumors" when rumors list is empty', () => {
    const result = executeDirectorCommand({ command: '/rumors', world: makeWorld(), playerRumors: [] });
    expect(result).toContain('No player rumors');
  });

  // WO-A5-16 (slice A5 §6, lock 6): "What the street believes" -- rendered
  // from the engine's own formatRumorBoard(...) output. Coded against
  // ADDENDUM-game-core.md's WO-A5-4 `getRumorBoard()` contract, not yet
  // landed on this branch -- this exercises cli-display's renderer directly
  // (formatRumorBoard is a real installed 3.11 dep, not a mock), so it is
  // green today; only game.ts/bin.ts's real call site building
  // `rumorBoardInput` from the RumorEngine is "green expected at merge".
  describe('/rumors board (WO-A5-16)', () => {
    function makePlayerRumor(): any {
      return {
        id: 'prumor_1',
        claim: 'player helped the chapel',
        subjectDescriptor: 'a stranger',
        sourceEvent: 'milestone',
        confidence: 0.8,
        distortion: 0.1,
        mutationCount: 0,
        valence: 'heroic',
        spreadTo: [],
        originTick: 1,
      };
    }

    function makeRumor(overrides: Partial<Rumor> = {}): Rumor {
      return {
        id: 'rumor_1',
        claim: 'player helped the chapel',
        subject: 'player',
        key: 'helped_chapel',
        value: true,
        originalValue: true,
        sourceId: 'npc_witness',
        originTick: 1,
        confidence: 0.8,
        emotionalCharge: 0.2,
        spreadPath: ['npc_witness'],
        mutationCount: 0,
        factionUptake: [],
        status: 'spreading',
        lastSpreadTick: 1,
        ...overrides,
      };
    }

    it('appends "WHAT THE STREET BELIEVES" after the player-side rumor list when board input is present', () => {
      const result = executeDirectorCommand({
        command: '/rumors',
        world: makeWorld(),
        playerRumors: [makePlayerRumor()],
        rumorBoard: formatRumorBoard([makeRumor()]),
      });
      expect(result).toContain('WHAT THE STREET BELIEVES');
      expect(result).toContain('player helped the chapel');
      const playerListIdx = result.indexOf('PLAYER RUMORS');
      const boardIdx = result.indexOf('WHAT THE STREET BELIEVES');
      expect(boardIdx).toBeGreaterThan(playerListIdx);
    });

    it('shows a mutated line with hop count when the rumor mutated during spread', () => {
      const result = executeDirectorCommand({
        command: '/rumors',
        world: makeWorld(),
        playerRumors: [makePlayerRumor()],
        rumorBoard: formatRumorBoard([makeRumor({ mutationCount: 2, spreadPath: ['npc_witness', 'npc_two', 'npc_three'] })]),
      });
      expect(result).toContain('mutated over 2 hops');
    });

    it('renders the board even when there are no player-side rumors to list', () => {
      const result = executeDirectorCommand({
        command: '/rumors',
        world: makeWorld(),
        playerRumors: [],
        rumorBoard: formatRumorBoard([makeRumor()]),
      });
      // Coordinator ratification (wave 8 stitch): the empty player-side
      // notice yields to the board when the street has something to say.
      expect(result).not.toContain('No player rumors yet.');
      expect(result).toContain('WHAT THE STREET BELIEVES');
    });

    it('omits the board section entirely when rumorBoard is absent (existing callers unaffected)', () => {
      const result = executeDirectorCommand({
        command: '/rumors',
        world: makeWorld(),
        playerRumors: [makePlayerRumor()],
      });
      expect(result).not.toContain('WHAT THE STREET BELIEVES');
    });
  });

  // WO-A5-12 (slice A5 §1, lock 1): the /market and /trade quote line.
  // Coded against ADDENDUM-game-core.md's WO-A5-1 `{ districtId,
  // controllingFactionId, sampleItemId, quotedPrice, basePrice }` contract,
  // not yet landed on this branch -- this exercises cli-display's renderer
  // directly, so it is green today; only game.ts/bin.ts's real call site
  // building `marketQuotes` from `quoteBuyPrice` is "green expected at
  // merge".
  describe('/market and /trade quote line (WO-A5-12)', () => {
    function makeMarketWorld(): any {
      return {
        ...makeWorld(),
        locationId: 'district_chapel',
        globals: { reputation_chapel_undead: -40 },
        factions: {
          chapel_undead: { name: 'Chapel Undead', reputation: 0 },
        },
      };
    }

    const economy = {
      supplies: {
        medicine: { category: 'medicine', level: 50, trend: 'stable' },
        weapons: { category: 'weapons', level: 50, trend: 'stable' },
        ammunition: { category: 'ammunition', level: 50, trend: 'stable' },
        food: { category: 'food', level: 50, trend: 'stable' },
        fuel: { category: 'fuel', level: 50, trend: 'stable' },
        luxuries: { category: 'luxuries', level: 50, trend: 'stable' },
        components: { category: 'components', level: 50, trend: 'stable' },
        contraband: { category: 'contraband', level: 50, trend: 'stable' },
      },
      tradeVolume: 50,
      blackMarketActive: false,
      lastUpdateTick: 0,
    } as any;

    const itemCatalog = {
      items: [{ id: 'iron_sword', name: 'Iron Sword' }],
    } as any;

    it('/trade appends the reputation quote line after the economy summary', () => {
      const districtEconomies = new Map([['district_chapel', economy]]);
      const result = executeDirectorCommand({
        command: '/trade district_chapel',
        world: makeMarketWorld(),
        districtEconomies,
        itemCatalog,
        marketQuotes: [{
          districtId: 'district_chapel',
          controllingFactionId: 'chapel_undead',
          sampleItemId: 'iron_sword',
          quotedPrice: 46,
          basePrice: 40,
        }],
      });
      expect(result).toContain('Merchants here quote Iron Sword at 46 (+15% vs base · Chapel Undead: hostile)');
    });

    it('/trade omits the quote line when the district has no controlling faction', () => {
      const districtEconomies = new Map([['district_chapel', economy]]);
      const result = executeDirectorCommand({
        command: '/trade district_chapel',
        world: makeMarketWorld(),
        districtEconomies,
        itemCatalog,
        marketQuotes: [{
          districtId: 'district_chapel',
          sampleItemId: 'iron_sword',
          quotedPrice: 40,
          basePrice: 40,
        }],
      });
      expect(result).not.toContain('Merchants here quote');
    });

    it('/market lists a MARKET QUOTES section with one line per district that has quote data', () => {
      const districtEconomies = new Map([['district_chapel', economy]]);
      const result = executeDirectorCommand({
        command: '/market',
        world: makeMarketWorld(),
        districtEconomies,
        itemCatalog,
        marketQuotes: [{
          districtId: 'district_chapel',
          controllingFactionId: 'chapel_undead',
          sampleItemId: 'iron_sword',
          quotedPrice: 46,
          basePrice: 40,
        }],
      });
      expect(result).toContain('MARKET QUOTES');
      expect(result).toContain('Merchants here quote Iron Sword at 46 (+15% vs base · Chapel Undead: hostile)');
    });

    it('/market renders unchanged (no MARKET QUOTES section) when marketQuotes is absent', () => {
      const districtEconomies = new Map([['district_chapel', economy]]);
      const withoutQuotes = executeDirectorCommand({
        command: '/market', world: makeMarketWorld(), districtEconomies, itemCatalog,
      });
      const withEmptyQuotes = executeDirectorCommand({
        command: '/market', world: makeMarketWorld(), districtEconomies, itemCatalog, marketQuotes: [],
      });
      expect(withoutQuotes).not.toContain('MARKET QUOTES');
      expect(withEmptyQuotes).toBe(withoutQuotes);
    });
  });

  // WO-A5-13 (slice A5 §4, lock 4): the /leverage ledger block. Coded
  // against ADDENDUM-game-core.md's WO-A5-3 `worldLedger` extension
  // (`income`, `decayAfter`), not yet landed on this branch -- green today
  // via direct renderer exercise; game.ts/bin.ts's real call site is "green
  // expected at merge".
  describe('/leverage ledger block (WO-A5-13)', () => {
    const leverageState = {
      favor: 10, debt: 0, blackmail: 0, influence: 5, heat: 0, legitimacy: 0,
    } as any;

    it('renders heat/quiet-rounds, faction alerts above zero, and income this round', () => {
      const result = executeDirectorCommand({
        command: '/leverage',
        world: makeWorld(),
        leverageState,
        worldLedger: {
          heat: 15,
          quietRounds: 5,
          decayAfter: 37,
          factionAlerts: { 'chapel-undead': 20, 'quiet-guild': 0 },
          income: { favor: 2, influence: 1, debt: 0 },
        },
      });
      expect(result).toContain('Heat: 15 (5/37 quiet rounds to cooling)');
      expect(result).toContain('Alerts: chapel-undead 20');
      expect(result).not.toContain('quiet-guild');
      expect(result).toContain('Income this round: +2 favor · +1 influence');
    });

    it('shows "cooling" instead of the fraction once quietRounds reaches decayAfter', () => {
      const result = executeDirectorCommand({
        command: '/leverage',
        world: makeWorld(),
        leverageState,
        worldLedger: { heat: 0, quietRounds: 37, decayAfter: 37, factionAlerts: {} },
      });
      expect(result).toContain('Heat: 0 (cooling)');
      expect(result).not.toContain('37/37');
    });

    it('omits the income line when there is no income this round', () => {
      const result = executeDirectorCommand({
        command: '/leverage',
        world: makeWorld(),
        leverageState,
        worldLedger: { heat: 0, quietRounds: 0, factionAlerts: {} },
      });
      expect(result).not.toContain('Income this round');
    });

    it('renders unchanged (no ledger block) when worldLedger is absent', () => {
      const result = executeDirectorCommand({ command: '/leverage', world: makeWorld(), leverageState });
      expect(result).not.toContain('quiet rounds to cooling');
      expect(result).not.toContain('Income this round');
    });
  });

  // WO-A5-14 (slice A5 §3, lock 3): /npc's goal + obligation lines --
  // deliberately the same DRAFT wording as narrative-llm's WO-A5-6 dialogue
  // prompt lines (ADDENDUM-narrative-llm.md), verified here as an
  // independent implementation from the same engine-typed inputs.
  describe('/npc goal + obligation lines (WO-A5-14)', () => {
    function makeNpcProfile(overrides: Partial<NpcProfile> = {}): NpcProfile {
      return {
        npcId: 'npc_merchant',
        name: 'Merchant Alara',
        factionId: null,
        goals: [
          { id: 'g1', label: 'protect the chapel', priority: 0.9, verb: 'protect', reason: 'faith' },
          { id: 'g2', label: 'earn coin', priority: 0.3, verb: 'bargain', reason: 'trade' },
        ],
        relationship: { trust: 0, fear: 0, greed: 0, loyalty: 0 },
        breakpoint: 'wavering',
        dominantAxis: 'trust',
        leverageAngle: 'none',
        knownRumors: [],
        underPressure: false,
        ...overrides,
      };
    }

    function npcWorld(): any {
      return { ...makeWorld(), playerId: 'player', entities: { ...makeWorld().entities } };
    }

    it('shows the top-priority goal as "Current goal: ..."', () => {
      const result = executeDirectorCommand({
        command: '/npc npc_merchant',
        world: npcWorld(),
        npcProfiles: [makeNpcProfile()],
      });
      expect(result).toContain('Current goal: protect the chapel');
      expect(result).not.toContain('Current goal: earn coin');
    });

    it('shows "owes you a favor" when the NPC owes the player', () => {
      const ledger: NpcObligationLedger = {
        obligations: [createObligation('favor', 'npc-owes-player', 'npc_merchant', 'player', 3, 'saved-life', 1)],
      };
      const result = executeDirectorCommand({
        command: '/npc npc_merchant',
        world: npcWorld(),
        npcProfiles: [makeNpcProfile()],
        npcObligations: new Map([['npc_merchant', ledger]]),
      });
      expect(result).toContain('Standing with you: owes you a favor');
    });

    it('shows "you owe them a debt" for a plain player-owes-npc obligation', () => {
      const ledger: NpcObligationLedger = {
        obligations: [createObligation('debt', 'player-owes-npc', 'npc_merchant', 'player', 2, 'borrowed-coin', 1)],
      };
      const result = executeDirectorCommand({
        command: '/npc npc_merchant',
        world: npcWorld(),
        npcProfiles: [makeNpcProfile()],
        npcObligations: new Map([['npc_merchant', ledger]]),
      });
      expect(result).toContain('Standing with you: you owe them a debt');
    });

    it('shows "was betrayed by you" for a betrayed player-owes-npc obligation, even alongside a plain debt', () => {
      const ledger: NpcObligationLedger = {
        obligations: [
          createObligation('debt', 'player-owes-npc', 'npc_merchant', 'player', 2, 'borrowed-coin', 1),
          createObligation('betrayed', 'player-owes-npc', 'npc_merchant', 'player', 6, 'sold-secret', 2),
        ],
      };
      const result = executeDirectorCommand({
        command: '/npc npc_merchant',
        world: npcWorld(),
        npcProfiles: [makeNpcProfile()],
        npcObligations: new Map([['npc_merchant', ledger]]),
      });
      expect(result).toContain('Standing with you: was betrayed by you');
      expect(result).not.toContain('you owe them a debt');
    });

    it('omits the "Standing with you" line when there is no obligation toward the player', () => {
      const result = executeDirectorCommand({
        command: '/npc npc_merchant',
        world: npcWorld(),
        npcProfiles: [makeNpcProfile()],
      });
      expect(result).not.toContain('Standing with you');
    });
  });

  // --- /pressures output ---

  it('should return "No active world pressures" when pressures list is empty', () => {
    const result = executeDirectorCommand({ command: '/pressures', world: makeWorld(), activePressures: [] });
    expect(result).toContain('No active world pressures');
  });

  // --- /jobs output ---

  it('should return "No opportunities" when opportunity list is empty', () => {
    const result = executeDirectorCommand({ command: '/jobs', world: makeWorld(), activeOpportunities: [] });
    expect(result).toContain('No opportunities');
  });

  // --- /help output ---

  it('should return help text listing available commands', () => {
    const result = executeDirectorCommand({ command: '/help', world: makeWorld() });
    expect(result).toContain('DIRECTOR MODE');
    expect(result).toContain('/inspect');
    expect(result).toContain('/faction');
  });

  // --- renderDirectorHelp standalone ---

  it('renderDirectorHelp should include all major command groups', () => {
    const help = renderDirectorHelp();
    expect(help).toContain('/inspect');
    expect(help).toContain('/rumors');
    expect(help).toContain('/pressures');
    expect(help).toContain('/chronicle');
    expect(help).toContain('/back');
    expect(help).toContain('/status');
    expect(help).toContain('/jobs');
    expect(help).toContain('/arcs');
  });

  // --- /arcs output ---

  it('should return "No arc data" when arcSnapshot is null', () => {
    const result = executeDirectorCommand({ command: '/arcs', world: makeWorld(), arcSnapshot: null });
    expect(result).toContain('No arc data');
  });

  // --- /endgame output ---

  it('should return "No endgame triggers" when list is empty', () => {
    const result = executeDirectorCommand({ command: '/endgame', world: makeWorld(), endgameTriggers: [] });
    expect(result).toContain('No endgame triggers');
  });

  // --- /finale output ---

  it('should return "No finale generated" when finaleOutline is null', () => {
    const result = executeDirectorCommand({ command: '/finale', world: makeWorld(), finaleOutline: null });
    expect(result).toContain('No finale generated');
  });

  // --- /craft output ---

  // F-6b72db54: getAvailableRecipes' requiredTags filter (crafting-recipes.ts)
  // drops ANY tag-gated recipe when no tags are passed at all -- not shown
  // as "missing requirements," just silently absent. 'Bless Item' (fantasy
  // genre, requiredTags: ['sacred']) is one of exactly two recipes gated
  // this way today. Before this fix, '/craft' called getAvailableRecipes
  // with no tag arguments whatsoever, so this recipe could never appear in
  // this preview in ANY world, sacred district or not.
  it('includes a requiredTags-gated recipe when the current district carries the matching tag', () => {
    const world = makeWorldWithDistrictTags('temple_quarter', ['sacred']);
    const result = executeDirectorCommand({ command: '/craft', world, profileCustom: {} });
    expect(result).toContain('Bless Item');
  });

  it('omits a requiredTags-gated recipe when the current district carries a different tag', () => {
    const world = makeWorldWithDistrictTags('market_square', ['commerce']);
    const result = executeDirectorCommand({ command: '/craft', world, profileCustom: {} });
    expect(result).not.toContain('Bless Item');
  });

  it('omits a requiredTags-gated recipe when the current district has no district-core definition at all', () => {
    const result = executeDirectorCommand({ command: '/craft', world: makeWorld(), profileCustom: {} });
    expect(result).not.toContain('Bless Item');
    // Sanity check this isn't a wholesale craft failure -- an ungated
    // recipe in the same genre still shows.
    expect(result).toContain('Brew Potion');
  });

  // --- /party output ---

  it('should return "No companions" when partyState has empty companions', () => {
    const emptyParty = { companions: [] } as any;
    const result = executeDirectorCommand({ command: '/party', world: makeWorld(), partyState: emptyParty });
    expect(result).toContain('No companions');
  });
});

// F-38eb3dec: director-renderer.ts's DIVIDER was a fixed 60-char string,
// unlike play-renderer.ts's own dividers (PFE-005), which adapt to the
// real terminal width. Mirrors play-renderer-divider.test.ts's assertions.
describe('renderDirectorHelp divider width (F-38eb3dec)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('divider matches a narrow terminal width instead of a fixed 60', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, writable: true });
    const help = renderDirectorHelp();
    expect(help).toContain('─'.repeat(40));
    expect(help).not.toContain('─'.repeat(60));
  });

  it('divider matches a wide terminal width, clamped to 120', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 200, writable: true });
    const help = renderDirectorHelp();
    expect(help).toContain('─'.repeat(120));
    expect(help).not.toContain('─'.repeat(121));
  });
});

/**
 * F-1367afd9: renderDirectorHelp()'s hand-typed command table had three
 * concrete defects, verified against true visible columns (color enabled,
 * ANSI stripped): (a) only '/inspect' was wrapped in cyan() while every
 * other command name rendered plain, with no reason given; (b) the
 * description column drifted from the shared baseline on rows whose
 * command name ran long (e.g. '/trace <entity> <subject> <key>'); (c) the
 * '/chronicle [mode]' row ran past an 80-column terminal with a hard wrap
 * and no hanging indent, since the table was hand-typed rather than
 * computed. Rebuilt programmatically (padEnd + wrapWords/hanging-indent,
 * the same approach renderArcHelp/renderConcludeHelp already use via
 * help-system.ts's renderNameDescriptionRow) so every row lands on the same
 * column and none are individually miscolored.
 */
describe('renderDirectorHelp command table (F-1367afd9)', () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, writable: true });
  });

  it('does not single out /inspect in color while every other command renders plain, even with colors enabled', async () => {
    const originalIsTTY = process.stdout.isTTY;
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    const mod = await import('./director-renderer.js');
    const help = mod.renderDirectorHelp();
    expect(help).toContain('/inspect <entity-id>');
    // No raw cyan (SGR 36) anywhere in the table -- /inspect no longer gets
    // singled out, and none of the other 36 rows gained color either
    // ("either color all consistently or none" -- this picks "none" to
    // match the other reference tables in this domain, which stay plain).
    expect(help).not.toContain('\x1b[36m');
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
    vi.resetModules();
  });

  it('every command row starts its description at the same column, including the long /trace row', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 120, writable: true });
    const lines = renderDirectorHelp().split('\n');
    const traceLine = lines.find((l) => l.includes('/trace <entity>'));
    const leverageLine = lines.find((l) => l.trim().startsWith('/leverage'));
    expect(traceLine).toBeDefined();
    expect(leverageLine).toBeDefined();
    const traceDescCol = traceLine!.indexOf('Trace belief provenance');
    const leverageDescCol = leverageLine!.indexOf('Show player leverage currencies');
    expect(traceDescCol).toBeGreaterThan(-1);
    expect(leverageDescCol).toBeGreaterThan(-1);
    expect(traceDescCol).toBe(leverageDescCol);
  });

  it('wraps the /chronicle [mode] row with a hanging indent instead of running past an 80-column terminal', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true });
    const lines = renderDirectorHelp().split('\n');
    const startIdx = lines.findIndex((l) => l.includes('/chronicle [mode]'));
    expect(startIdx).toBeGreaterThan(-1);
    expect(lines[startIdx].length).toBeLessThanOrEqual(80);
    // The description wraps onto a hanging-indented continuation line
    // rather than a hard 82-char overflow.
    expect(lines[startIdx]).not.toContain('director)');
    expect(lines[startIdx + 1].trim().length).toBeGreaterThan(0);
    expect(lines[startIdx + 1].length).toBeLessThanOrEqual(80);
  });

  it('still documents every command the table listed before (no content lost in the rebuild)', () => {
    const help = renderDirectorHelp();
    for (const cmd of [
      '/inspect', '/faction', '/zone', '/trace', '/rumors', '/pressures',
      '/world', '/factions', '/people', '/npc', '/leverage', '/map',
      '/party', '/item', '/districts', '/district', '/market', '/trade',
      '/craft', '/materials', '/salvage', '/jobs', '/contracts',
      '/contract', '/accepted', '/arcs', '/endgame', '/finale', '/status',
      '/stats', '/help leverage', '/help <pack-id>', '/chronicle',
      '/history', '/snapshot', '/divergences', '/back',
    ]) {
      expect(help, `expected renderDirectorHelp() to still mention ${cmd}`).toContain(cmd);
    }
  });
});

/**
 * F-05e061ec (wave-6 amend): '/aftermath' is a working alias for '/world'
 * in executeDirectorCommand's switch (`case '/world': case '/aftermath':`),
 * but had no corresponding row in DIRECTOR_COMMANDS / renderDirectorHelp(),
 * unlike the structurally identical '/contracts' alias for '/jobs', which
 * DOES get its own documented row. A director-mode player would only
 * discover '/aftermath' by reading source, not by typing /help.
 */
describe('renderDirectorHelp documents the /aftermath alias (F-05e061ec)', () => {
  it('documents /aftermath as an alias for /world, the same way /contracts documents its alias for /jobs', () => {
    const help = renderDirectorHelp();
    const lines = help.split('\n');
    const aftermathLine = lines.find((l) => l.trim().startsWith('/aftermath'));
    expect(aftermathLine).toBeDefined();
    expect(aftermathLine).toContain('Alias for /world');
  });
});

/**
 * F-de13eb60: 8 of the 9 section headers this director-views renderer
 * produces (a boxed title between two divider() calls) rendered as plain,
 * uncolored text -- only renderDirectorHelp's own "DIRECTOR MODE" title used
 * bold(). Representative sample below (ENDGAME TRIGGERS, WORLD PRESSURES) --
 * each of the 8 shares the identical one-line `bold(...)` wrap.
 */
describe('director-renderer section headers are bolded (F-de13eb60)', () => {
  let originalIsTTY: boolean | undefined;

  afterEach(() => {
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
    delete process.env.NO_COLOR;
  });

  it('bolds the ENDGAME TRIGGERS header when colors are enabled', async () => {
    originalIsTTY = process.stdout.isTTY;
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    const mod = await import('./director-renderer.js');

    const endgameTriggers = [
      { id: 'e1', resolutionClass: 'victory', detectedAtTick: 10, reason: '', evidence: {}, dominantArc: null, acknowledged: false },
    ] as any;
    const result = mod.executeDirectorCommand({ command: '/endgame', world: makeWorld(), endgameTriggers });
    const headerLine = result.split('\n').find((l) => l.includes('ENDGAME TRIGGERS'));
    expect(headerLine).toBeDefined();
    expect(headerLine).toContain('\x1b[1m'); // bold
  });

  it('bolds the WORLD PRESSURES header when colors are enabled', async () => {
    originalIsTTY = process.stdout.isTTY;
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    const mod = await import('./director-renderer.js');

    const activePressures = [
      {
        kind: 'political', description: 'A pressing threat', sourceFactionId: 'faction-1',
        sourceNpcId: null, urgency: 0.5, visibility: 'known', turnsRemaining: 5,
        triggeredBy: 'test', tags: [], potentialOutcomes: [],
      },
    ] as any;
    const result = mod.executeDirectorCommand({ command: '/pressures', world: makeWorld(), activePressures });
    const headerLine = result.split('\n').find((l) => l.includes('WORLD PRESSURES'));
    expect(headerLine).toBeDefined();
    expect(headerLine).toContain('\x1b[1m');
  });

  it('stays plain text with no escape codes when colors are disabled (default test env)', () => {
    const endgameTriggers = [
      { id: 'e1', resolutionClass: 'victory', detectedAtTick: 10, reason: '', evidence: {}, dominantArc: null, acknowledged: false },
    ] as any;
    const result = executeDirectorCommand({ command: '/endgame', world: makeWorld(), endgameTriggers });
    expect(result).toContain('ENDGAME TRIGGERS');
    expect(result).not.toContain('\x1b[');
  });
});

/**
 * WO-A6-5 (slice A6 §3, lock 1): the read-only `/tuning` director view --
 * LIVING WORLD TUNING (one line per lever, `(default)` suffix when the
 * value equals the measured default) and LAST ROUND (round metrics, one
 * line per non-zero counter; absent when no round has run). Coded against
 * ADDENDUM-cli-display.md's WO-A6-5 contract and ADDENDUM-COMMON's lock 1 /
 * lock 2 shapes for `LivingWorldTuning` / `RoundMetrics`
 * (game-core's WO-A6-1 / WO-A6-2, not yet on this branch -- the `tuningView`
 * object here is this domain's own structurally-identical local mirror per
 * the addendum's "green expected at merge" allowance). This is a VIEW only
 * -- no verb, no mutation (R6).
 */
describe('/tuning director view (WO-A6-5)', () => {
  const defaultTuning = {
    rumorStanceFadeTicks: 24,
    rumorBelieveSuspicionBelow: 0,
    rumorSpreadScope: 'adjacent-districts' as const,
    worldMovedCap: 200,
    narrationPressureLines: 10,
    narrationOpportunityLines: Infinity,
    narrationRumorLines: Infinity,
    ambushHeadline: 'always' as const,
  };

  it('should return "No tuning data available" when tuningView is missing', () => {
    const result = executeDirectorCommand({ command: '/tuning', world: makeWorld() });
    expect(result).toContain('No tuning data available');
  });

  it('lists /tuning in renderDirectorHelp', () => {
    const help = renderDirectorHelp();
    expect(help).toContain('/tuning');
  });

  it('renders every lever with a (default) suffix when the resolved tuning equals the measured defaults', () => {
    const result = executeDirectorCommand({
      command: '/tuning',
      world: makeWorld(),
      tuningView: { tuning: defaultTuning, rounds: 0 },
    });
    expect(result).toContain('LIVING WORLD TUNING');
    // Six of the eight levers carry a measured, non-Infinity default --
    // exercise those explicitly to keep this test resilient to the
    // still-provisional narrationOpportunityLines/narrationRumorLines
    // fallback (see DEFAULT_LIVING_WORLD_TUNING's doc comment).
    expect(result).toContain('Rumor stance fade (ticks): 24 (default)');
    expect(result).toContain('Rumor believe threshold (suspicion below): 0 (default)');
    expect(result).toContain('Rumor spread scope: adjacent-districts (default)');
    expect(result).toContain('World-moved ledger cap: 200 (default)');
    expect(result).toContain('Narration pressure lines: 10 (default)');
    expect(result).toContain('Ambush headline: always (default)');
  });

  it('omits the (default) suffix for a lever that has been tuned away from its default', () => {
    const result = executeDirectorCommand({
      command: '/tuning',
      world: makeWorld(),
      tuningView: {
        tuning: { ...defaultTuning, rumorSpreadScope: 'zone', ambushHeadline: 'never' },
        rounds: 0,
      },
    });
    expect(result).toContain('Rumor spread scope: zone');
    expect(result).not.toContain('Rumor spread scope: zone (default)');
    expect(result).toContain('Ambush headline: never');
    expect(result).not.toContain('Ambush headline: never (default)');
    // Untouched levers on the same tuningView still show (default).
    expect(result).toContain('World-moved ledger cap: 200 (default)');
  });

  it('renders an unlimited narration cap as "unlimited" rather than the raw Infinity value', () => {
    const result = executeDirectorCommand({
      command: '/tuning',
      world: makeWorld(),
      tuningView: { tuning: defaultTuning, rounds: 0 },
    });
    expect(result).toContain('Narration opportunity lines: unlimited (default)');
    expect(result).toContain('Narration rumor lines: unlimited (default)');
    expect(result).not.toContain('Infinity');
  });

  it('renders "No rounds played yet" when lastRound is absent', () => {
    const result = executeDirectorCommand({
      command: '/tuning',
      world: makeWorld(),
      tuningView: { tuning: defaultTuning, rounds: 0 },
    });
    expect(result).toContain('LAST ROUND');
    expect(result).toContain('No rounds played yet.');
  });

  it('renders only the non-zero round-metric counters, plus the tick/round-count header', () => {
    const lastRound = {
      tick: 42, heat: 12, quietRounds: 0, kills: 1, pressuresActive: 2,
      pressuresSpawned: 1, pressuresResolved: 0, pressuresExpired: 0,
      factionActions: 0, opportunitiesSpawned: 0, opportunitiesAccepted: 0,
      opportunitiesExpired: 0, ambushes: 0, moodTransition: false,
      rumorsCreated: 0, rumorsMutated: 0, rumorHearers: 0, stanceBelieve: 0,
      stanceDoubt: 0,
    };
    const result = executeDirectorCommand({
      command: '/tuning',
      world: makeWorld(),
      tuningView: { tuning: defaultTuning, lastRound, rounds: 7 },
    });
    expect(result).toContain('Round tick 42 (7 rounds recorded)');
    expect(result).toContain('Heat: 12');
    expect(result).toContain('Kills: 1');
    expect(result).toContain('Pressures active: 2');
    expect(result).toContain('Pressures spawned: 1');
    // Zero counters are omitted entirely.
    expect(result).not.toContain('Quiet rounds:');
    expect(result).not.toContain('Faction actions:');
    expect(result).not.toContain('Mood transition');
    expect(result).not.toContain('Price quote');
  });

  it('renders mood transition and price quote lines when present, even though the latter can legitimately omit at zero', () => {
    const lastRound = {
      tick: 1, heat: 0, quietRounds: 0, kills: 0, pressuresActive: 0,
      pressuresSpawned: 0, pressuresResolved: 0, pressuresExpired: 0,
      factionActions: 0, opportunitiesSpawned: 0, opportunitiesAccepted: 0,
      opportunitiesExpired: 0, ambushes: 0, moodTransition: true,
      rumorsCreated: 0, rumorsMutated: 0, rumorHearers: 0, stanceBelieve: 0,
      stanceDoubt: 0, priceQuote: 15,
    };
    const result = executeDirectorCommand({
      command: '/tuning',
      world: makeWorld(),
      tuningView: { tuning: defaultTuning, lastRound, rounds: 1 },
    });
    expect(result).toContain('Mood transition: yes');
    expect(result).toContain('Price quote: 15');
  });

  it('singles round recorded reads "1 round recorded", not "1 rounds recorded"', () => {
    const lastRound = {
      tick: 3, heat: 0, quietRounds: 0, kills: 0, pressuresActive: 0,
      pressuresSpawned: 0, pressuresResolved: 0, pressuresExpired: 0,
      factionActions: 0, opportunitiesSpawned: 0, opportunitiesAccepted: 0,
      opportunitiesExpired: 0, ambushes: 0, moodTransition: false,
      rumorsCreated: 0, rumorsMutated: 0, rumorHearers: 0, stanceBelieve: 0,
      stanceDoubt: 0,
    };
    const result = executeDirectorCommand({
      command: '/tuning',
      world: makeWorld(),
      tuningView: { tuning: defaultTuning, lastRound, rounds: 1 },
    });
    expect(result).toContain('1 round recorded');
    expect(result).not.toContain('1 rounds recorded');
  });
});
