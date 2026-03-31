import { describe, it, expect, vi } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { GameSession } from './game.js';
import { createTestLogger } from './game/debug-logger.js';
import { createProfile } from '@ai-rpg-engine/character-profile';

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

  describe('autosave (FT-B-002)', () => {
    it('should trigger autosave after configured number of turns', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      // Use a mock getSavePath to avoid real filesystem writes
      const savePaths: string[] = [];
      const { saveSession } = await import('./session/session.js');
      const saveSpy = vi.spyOn(await import('./session/session.js'), 'saveSession')
        .mockImplementation(async (input) => {
          savePaths.push(input.savePath);
        });

      const h = createHarness({
        gameOpts: {
          autosave: { enabled: true, intervalTurns: 2 },
        },
      });

      // Turn 1 — no autosave
      const out1 = await h.play('look around');
      expect(out1).not.toContain('[autosaved]');

      // Turn 2 — autosave triggers
      const out2 = await h.play('look around');
      expect(out2).toContain('[autosaved]');

      // Turn 3 — counter reset, no autosave
      const out3 = await h.play('look around');
      expect(out3).not.toContain('[autosaved]');

      // Turn 4 — autosave again
      const out4 = await h.play('look around');
      expect(out4).toContain('[autosaved]');

      saveSpy.mockRestore();
    });

    it('should not autosave when disabled', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const saveSpy = vi.spyOn(await import('./session/session.js'), 'saveSession')
        .mockImplementation(async () => {});

      const h = createHarness({
        gameOpts: {
          autosave: { enabled: false, intervalTurns: 1 },
        },
      });

      const out = await h.play('look around');
      expect(out).not.toContain('[autosaved]');
      expect(saveSpy).not.toHaveBeenCalled();

      saveSpy.mockRestore();
    });

    it('should silently handle autosave failures', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const saveSpy = vi.spyOn(await import('./session/session.js'), 'saveSession')
        .mockRejectedValue(new Error('disk full'));

      const h = createHarness({
        gameOpts: {
          autosave: { enabled: true, intervalTurns: 1 },
        },
      });

      // Should not throw, and should not show [autosaved]
      const out = await h.play('look around');
      expect(out).not.toContain('[autosaved]');
      // But the output should still be valid turn output
      expect(out.length).toBeGreaterThan(0);

      saveSpy.mockRestore();
    });

    it('checkAutosave returns null when not yet time', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness({
        gameOpts: {
          autosave: { enabled: true, intervalTurns: 5 },
        },
      });

      const result = await h.session.checkAutosave();
      // turnsSinceLastAutosave is 1 after this call, but intervalTurns is 5
      expect(result).toBe(null);
    });
  });

  describe('structured announcements (FT-B-008)', () => {
    function makeTestProfile() {
      return createProfile(
        {
          name: 'Aldric',
          archetypeId: 'penitent-knight',
          backgroundId: 'oath-breaker',
          traitIds: ['iron-frame'],
          disciplineId: 'occultist',
          portraitRef: 'abc123',
        },
        { vigor: 7, instinct: 4, will: 1 },
        { hp: 25, stamina: 8 },
        ['martial'],
        'fantasy',
      );
    }

    it('should push level-up announcement instead of console.log', () => {
      const engine = createGame();
      const profile = makeTestProfile();
      const session = new GameSession({
        engine,
        title: 'Test Game',
        clientConfig: { apiKey: 'test-key' },
        profile,
      });

      expect(session.pendingAnnouncements).toEqual([]);

      // Grant 100 XP triggers level 2
      session.applyProfileHints({
        xpGained: 100,
      });

      expect(session.pendingAnnouncements).toContainEqual(
        expect.stringContaining('Level up!'),
      );
      expect(session.pendingAnnouncements).toContainEqual(
        expect.stringContaining('level 2'),
      );
    });

    it('should not push announcement when XP does not trigger level-up', () => {
      const engine = createGame();
      const profile = makeTestProfile();
      const session = new GameSession({
        engine,
        title: 'Test Game',
        clientConfig: { apiKey: 'test-key' },
        profile,
      });

      session.applyProfileHints({ xpGained: 10 });
      expect(session.pendingAnnouncements).toEqual([]);
    });

    it('should drain announcements into processInput output', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const profile = makeTestProfile();
      const h = createHarness({ gameOpts: { profile } });

      // Manually push announcements to verify they appear in output
      h.session.pendingAnnouncements.push('Level up! You are now level 5.');
      h.session.pendingAnnouncements.push('Title evolved: "Grandmaster"');

      const output = await h.play('look around');
      expect(output).toContain('Level up! You are now level 5.');
      expect(output).toContain('Title evolved: "Grandmaster"');

      // Announcements should be drained after processInput
      expect(h.session.pendingAnnouncements).toEqual([]);
    });
  });
});
