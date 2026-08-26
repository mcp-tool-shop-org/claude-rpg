import { describe, it, expect, afterEach } from 'vitest';
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
