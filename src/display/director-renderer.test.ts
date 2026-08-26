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
