import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { GameSession } from './game.js';
import { createTestLogger } from './game/debug-logger.js';

describe('GameSession', () => {
  it('should create a session with a starter world', () => {
    const engine = createGame();
    const session = new GameSession({
      engine,
      title: 'Test Game',
      tone: 'dark fantasy',
      clientConfig: { apiKey: 'test-key' },
    });

    expect(session.engine).toBe(engine);
    expect(session.title).toBe('Test Game');
    expect(session.tone).toBe('dark fantasy');
    expect(session.mode).toBe('play');
  });

  it('should return welcome text', () => {
    const engine = createGame();
    const session = new GameSession({
      engine,
      title: 'Test Game',
      clientConfig: { apiKey: 'test-key' },
    });

    const welcome = session.getWelcome();
    expect(welcome).toContain('Test Game');
    expect(welcome).toContain('/director');
  });

  it('should switch to director mode', async () => {
    const engine = createGame();
    const session = new GameSession({
      engine,
      title: 'Test Game',
      clientConfig: { apiKey: 'test-key' },
    });

    const output = await session.processInput('/director');
    expect(output).toContain('DIRECTOR MODE');
    expect(session.mode).toBe('director');
  });

  it('should handle quit command', async () => {
    const engine = createGame();
    const session = new GameSession({
      engine,
      title: 'Test Game',
      clientConfig: { apiKey: 'test-key' },
    });

    const output = await session.processInput('quit');
    expect(output).toBe('__QUIT__');
  });

  it('should execute director commands', async () => {
    const engine = createGame();
    const session = new GameSession({
      engine,
      title: 'Test Game',
      clientConfig: { apiKey: 'test-key' },
    });

    // Switch to director mode
    await session.processInput('/director');

    // Inspect pilgrim — a real entity in the starter-fantasy world
    const output = await session.processInput('/inspect pilgrim');
    expect(output).toBeTruthy();
    // T-001: Verify the output is meaningful entity data, not an error
    expect(output).not.toContain('Unknown command');
    expect(output).not.toContain('not found');
    // formatEntityInspection renders the entity ID as a heading
    expect(output).toContain('pilgrim');
  });

  it('should produce save/export snapshot data via /export', async () => {
    // T-019: Coverage for save/load flow.
    // GameSession.buildSavedSessionSnapshot() is private, but /export json
    // exercises it and writes a file. We use the game harness with a fake
    // client so no real API calls are made.
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();

    // Record a turn so the snapshot has data
    await h.play('/director');
    const inspectOut = await h.play('/inspect pilgrim');
    expect(inspectOut).toContain('pilgrim');

    // Switch back to play mode — /export is a play-mode command
    await h.play('/back');

    // Export json exercises buildSavedSessionSnapshot → writeExport
    const exportResult = await h.session.processInput('/export json');
    // The export writes a file and returns the path
    expect(exportResult).toContain('Chronicle exported to');
  });

  it('should return usage when /export has no valid format', async () => {
    // T-019 supplemental: verify the export command exists and responds
    const engine = createGame();
    const session = new GameSession({
      engine,
      title: 'Test Game',
      clientConfig: { apiKey: 'test-key' },
    });

    const output = await session.processInput('/export badformat');
    expect(output).toContain('Usage');
  });

  it('should process natural language input in play mode via executeTurn', async () => {
    // T-003: Core play loop — processInput with natural language calls
    // executeTurn + interpretAction and returns narrated output.
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();

    // In play mode, a natural language action should go through the turn pipeline
    const output = await h.play('look around');
    expect(output).toBeTruthy();
    expect(typeof output).toBe('string');
    // The harness fake client returns narration, so output should contain scene text
    expect(output.length).toBeGreaterThan(0);
    // Verify a turn was recorded in history
    expect(h.turnCount()).toBeGreaterThanOrEqual(1);
    expect(h.lastVerb()).toBe('look');
  });

  it('should contain subsystem warning when a post-turn tick throws (PB-001)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();

    // Sabotage a subsystem to force an error in the post-turn tick block.
    // tickFactionAgency reads engine.world.factions — we make it throw.
    const originalFactions = h.session.engine.world.factions;
    Object.defineProperty(h.session.engine.world, 'factions', {
      get() { throw new Error('simulated subsystem failure'); },
      configurable: true,
    });

    const output = await h.play('look around');
    expect(output).toContain('subsystem hiccupped');
    expect(output).toContain('processed safely');

    // Restore
    Object.defineProperty(h.session.engine.world, 'factions', {
      value: originalFactions,
      configurable: true,
      writable: true,
    });
  });

  it('should log turn start/end with debug logger (PB-004)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const logger = createTestLogger();
    const h = createHarness({ gameOpts: { debugLogger: logger } });

    await h.play('look around');

    const entries = logger.getEntries();
    const turnStart = entries.find((e) => e.message === 'turn-start');
    const turnEnd = entries.find((e) => e.message === 'turn-end');
    expect(turnStart).toBeDefined();
    expect(turnStart!.subsystem).toBe('turn');
    expect(turnEnd).toBeDefined();
    expect(turnEnd!.subsystem).toBe('turn');
  });

  it('should log subsystem error in debug logger on failure (PB-001 + PB-004)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const logger = createTestLogger();
    const h = createHarness({ gameOpts: { debugLogger: logger } });

    // Sabotage
    const originalFactions = h.session.engine.world.factions;
    Object.defineProperty(h.session.engine.world, 'factions', {
      get() { throw new Error('boom'); },
      configurable: true,
    });

    await h.play('look around');

    const errorEntry = logger.getEntries().find((e) => e.level === 'error');
    expect(errorEntry).toBeDefined();
    expect(errorEntry!.subsystem).toBe('subsystem');
    expect(errorEntry!.data?.error).toContain('boom');

    // Restore
    Object.defineProperty(h.session.engine.world, 'factions', {
      value: originalFactions,
      configurable: true,
      writable: true,
    });
  });
});
