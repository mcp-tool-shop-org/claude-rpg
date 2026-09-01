import { describe, it, expect, afterEach, vi } from 'vitest';
import { executeDirectorCommand, renderDirectorHelp } from './director-renderer.js';

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
