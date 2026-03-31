import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { GameSession } from './game.js';

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
});
