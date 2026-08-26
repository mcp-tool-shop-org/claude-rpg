import { describe, it, expect } from 'vitest';
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
