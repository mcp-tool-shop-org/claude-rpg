import { describe, it, expect, vi } from 'vitest';

// F-6bc0721e (SLATE-6, contract amendment #6, brief ruled 2026-08-26):
// renderDeathScreen is cli-display's half, landing in THEIR worktree this
// same wave -- not present in this isolated worktree's copy of
// play-renderer.ts yet. Spread the real module (renderPlayScreen/
// renderWelcome/renderThinking/getTerminalWidth are used for real by nearly
// every test in this file, via game-presenter.ts, and must stay real) and
// add the pinned export as a deterministic, inspectable stub, per the wave
// brief's isolation-discipline note.
vi.mock('./display/play-renderer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./display/play-renderer.js')>();
  return {
    ...actual,
    renderDeathScreen: vi.fn((opts: { narration: string; characterName?: string }) =>
      `[DEATH SCREEN] ${opts.characterName ?? 'Unknown'}\n${opts.narration}`),
  };
});

import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { GameSession } from './game.js';
import { createTestLogger, type DebugLogger } from './game/debug-logger.js';
import { createProfile } from '@ai-rpg-engine/character-profile';
import type { OpportunityState, PlayerRumor } from '@ai-rpg-engine/modules';
import type { McpToolCall } from './runtime/audio-bridge.js';
import { loadNpcAgencyFromSession, type SavedSession } from './session/session.js';
import { MAX_PLAYER_RUMORS } from './game/game-state.js';

/**
 * F-4ec3609b (ORDERING contract, cross-domain): turn-loop.ts's executeTurn()
 * now calls immersion.inferAndTransition(engine, events, verb) -- a method
 * runtime-foundry landed on ImmersionRuntime (src/runtime/**, out of this
 * domain's owned globs) this same wave. In an isolated worktree where only
 * game-core's half has landed, the real class doesn't have that method
 * yet, so any test that plays a real turn through GameSession would throw
 * "immersion.inferAndTransition is not a function" -- unrelated to
 * whatever that specific test is actually exercising.
 *
 * Documented local stub (per the wave brief's "test your side with a
 * documented local cast/stub if the other half is absent" allowance):
 * installs a minimal shim on the real instance ONLY if the method is
 * genuinely missing, so tests that need a real turn (e.g. to induce a
 * subsystem failure or drain announcements) can still run today. Once
 * runtime-foundry's half merges, `typeof ... === 'function'` is already
 * true and this is a no-op -- the real implementation runs untouched.
 * Signature reconciled to the real 3-arg shape (contract adjudication,
 * wave 16) -- an `engine` param was added because the inference this shim
 * stands in for reads engine.tick/engine.world unguarded.
 */
function ensureImmersionInferAndTransitionStub(session: GameSession): void {
  const immersion = session.immersion as unknown as {
    inferAndTransition?: (engine: unknown, events: unknown[], verb: string) => unknown;
    stateMachine: { current: unknown };
  };
  if (typeof immersion.inferAndTransition !== 'function') {
    immersion.inferAndTransition = (_engine: unknown, _events: unknown[], _verb: string) => immersion.stateMachine.current;
  }
}

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

    // Switch to director mode and inspect an entity — /director itself is
    // turn-count-neutral (F-58e75016's fixed sibling in
    // test/integration/game-turn-loop.test.ts: 'slash commands do not
    // consume turns').
    await h.play('/director');
    const inspectOut = await h.play('/inspect pilgrim');
    expect(inspectOut).toContain('pilgrim');

    // Switch back to play mode — /export is a play-mode command. /back is
    // what actually records the turn the snapshot below depends on: it
    // triggers getOpeningNarration(), which unconditionally records a turn
    // in history (game.ts, F-8da2e6f7), unlike /director above.
    await h.play('/back');
    expect(h.turnCount()).toBe(1);

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

  // F-0b05c26c: loadNpcAgencyFromSession's previous `{ profiles: data.profiles
  // ?? [], actions: data.actions ?? [] }` pattern trusted a syntactically
  // valid but wrong-shaped npcAgencySnapshot unexamined. bin.ts:397-398
  // assigns loadNpcAgencyFromSession()'s result directly onto
  // session.lastNpcActions/session.lastNpcProfiles — mirrored here to prove
  // the *full* pipeline (malformed save field -> loader -> GameSession
  // fields -> processInput -> getVisiblePressureContext ->
  // formatNpcAgencyForNarrator/generateNpcTextures) survives end-to-end, not
  // just that the loader itself degrades gracefully in isolation
  // (session.test.ts's loadNpcAgencyFromSession suite covers that half).
  // Before the fix, formatNpcAgencyForNarrator's `results.slice(0, 2)` threw
  // on the non-array `actions` field, and processInput() has no enclosing
  // try/catch around this call site (game.ts:732, before the nearest try at
  // line 744) — so the crash aborted the whole turn.
  it('processInput survives a malformed npcAgencySnapshot loaded via loadNpcAgencyFromSession (F-0b05c26c)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();

    const fixtureSession: SavedSession = {
      schemaVersion: 14,
      version: '1.4.0',
      engineState: '{}',
      turnHistory: { turns: [] },
      tone: 'dramatic',
      savedAt: new Date().toISOString(),
      // The finding's own documented trigger shape.
      npcAgencySnapshot: JSON.stringify({ profiles: [], actions: 42 }),
    };
    const { profiles, actions } = loadNpcAgencyFromSession(fixtureSession);
    h.session.lastNpcProfiles = profiles;
    h.session.lastNpcActions = actions;

    const output = await h.play('look around');
    expect(output).toBeTruthy();
    expect(typeof output).toBe('string');
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
    // F-f13ca236: a bare .message can't distinguish which of the ~17
    // structurally-similar post-turn subsystem calls actually threw — the
    // full stack must be captured too, not just the message.
    expect(errorEntry!.data?.stack).toContain('boom');

    // Restore
    Object.defineProperty(h.session.engine.world, 'factions', {
      value: originalFactions,
      configurable: true,
      writable: true,
    });
  });

  // F-f13ca236: debugLog is a true NoopLogger by default (debug-logger.ts) —
  // NoopLogger.error() doesn't even append to getEntries(), so for the
  // overwhelming majority of real play sessions a post-turn subsystem
  // failure left zero trace anywhere beyond the generic bracket message.
  // subsystemFailureCount/getRecentSubsystemFailures() must be tracked
  // independent of that gate.
  it('records post-turn subsystem failures independent of the --debug gate (F-f13ca236)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    // Explicit disabled logger (not createDebugLogger()'s auto-detection,
    // which could pick up a real --debug/CLAUDE_RPG_DEBUG env in this
    // process) — deterministic proof the count survives a true no-op sink.
    const disabledLogger: DebugLogger = {
      enabled: false,
      debug() {}, info() {}, warn() {}, error() {}, setTick() {}, getEntries: () => [],
    };
    const h = createHarness({ gameOpts: { debugLogger: disabledLogger } });

    expect(h.session.getSubsystemFailureCount()).toBe(0);

    const originalFactions = h.session.engine.world.factions;
    Object.defineProperty(h.session.engine.world, 'factions', {
      get() { throw new Error('boom'); },
      configurable: true,
    });

    await h.play('look around');

    expect(h.session.getSubsystemFailureCount()).toBe(1);
    const recent = h.session.getRecentSubsystemFailures();
    expect(recent).toHaveLength(1);
    expect(recent[0].error).toContain('boom');
    expect(recent[0].tick).toBe(h.session.engine.tick);

    // Restore
    Object.defineProperty(h.session.engine.world, 'factions', {
      value: originalFactions,
      configurable: true,
      writable: true,
    });
  });

  it('does not count a normal turn as a subsystem failure (F-f13ca236)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();

    await h.play('look around');

    expect(h.session.getSubsystemFailureCount()).toBe(0);
    expect(h.session.getRecentSubsystemFailures()).toHaveLength(0);
  });

  describe('/status subsystem health indicator (F-9319b8d8)', () => {
    function makeStatusProfile() {
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

    // renderCompactStatus (display/status-compact.ts) needs a non-null
    // StatusData, which getStatusDataFromProfile only builds when BOTH a
    // profile and an itemCatalog are present (game/game-state.ts) — an
    // empty catalog is sufficient shape for these tests.
    function makeStatusGameOpts() {
      return { profile: makeStatusProfile(), itemCatalog: { items: [] } };
    }

    it('does not add a Subsystems line when no subsystem failure has occurred this session', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness({ gameOpts: makeStatusGameOpts() });

      await h.play('look around');
      const status = await h.play('/status');

      expect(status).not.toContain('Subsystems:');
    });

    it('surfaces the subsystem failure count and most recent tick through /status', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness({ gameOpts: makeStatusGameOpts() });

      // F-f13ca236's own test induces a subsystem failure via a throwing
      // world.factions getter, but that field is also read by
      // buildMoveRecommendation() (game.ts's post-turn suggestion line,
      // gated on a profile being present, unlike F-f13ca236's own
      // no-profile harness) OUTSIDE the PB-001 try/catch this finding
      // covers — so it would crash the turn instead of being counted here.
      // Spying on the private tickFactionAgency() method (one of the ~17
      // calls actually inside that try/catch, game.ts:967) targets only
      // this finding's failure path.
      vi.spyOn(h.session as any, 'tickFactionAgency').mockImplementation(() => {
        throw new Error('boom');
      });

      await h.play('look around');

      expect(h.session.getSubsystemFailureCount()).toBe(1);

      const status = await h.play('/status');

      expect(status).toContain('Subsystems:');
      expect(status).toContain('1 subsystem hiccup');
      expect(status).toContain(`tick ${h.session.engine.tick}`);
    });

    it('pluralizes "hiccups" for more than one failure this session', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness({ gameOpts: makeStatusGameOpts() });

      vi.spyOn(h.session as any, 'tickFactionAgency').mockImplementation(() => {
        throw new Error('boom');
      });

      await h.play('look around');
      await h.play('look around');

      const status = await h.play('/status');
      expect(status).toContain('2 subsystem hiccups');
    });

    it('separates the Subsystems line from the status box with a blank line (F-bd2ff8c8)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness({ gameOpts: makeStatusGameOpts() });
      ensureImmersionInferAndTransitionStub(h.session);

      vi.spyOn(h.session as any, 'tickFactionAgency').mockImplementation(() => {
        throw new Error('boom');
      });

      await h.play('look around');
      const status = await h.play('/status');

      const lines = status.split('\n');
      const subsystemsIndex = lines.findIndex((l) => l.includes('Subsystems:'));

      expect(subsystemsIndex).toBeGreaterThan(0);
      // The line immediately above the Subsystems line must be blank -- it
      // must not sit flush against the box's closing divider.
      expect(lines[subsystemsIndex - 1]).toBe('');
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

    // F-af8f1048: checkAutosave()'s old `Returns a brief message if autosave
    // fired, null otherwise` contract let a genuine save failure render
    // byte-for-byte identical to "not due yet" — the player had zero signal
    // that their safety net stopped working. A failure must not vanish into
    // null silently forever; it surfaces a one-time, low-noise notice on the
    // *first* failure this session (never every turn — that would defeat the
    // original "don't disrupt gameplay" intent).
    it('surfaces a one-time notice on the first autosave failure, not silence (F-af8f1048)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const saveSpy = vi.spyOn(await import('./session/session.js'), 'saveSession')
        .mockRejectedValue(new Error('disk full'));

      const h = createHarness({
        gameOpts: {
          autosave: { enabled: true, intervalTurns: 1 },
        },
      });

      // Should not throw, and should not show the success message
      const out = await h.play('look around');
      expect(out).not.toContain('[autosaved]');
      // But the player must see *some* signal the safety net just failed.
      expect(out).toContain('autosave failed');
      // And the output should still be valid turn output
      expect(out.length).toBeGreaterThan(0);

      saveSpy.mockRestore();
    });

    it('does not repeat the autosave-failure notice on every subsequent turn (F-af8f1048)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const saveSpy = vi.spyOn(await import('./session/session.js'), 'saveSession')
        .mockRejectedValue(new Error('disk full'));

      const h = createHarness({
        gameOpts: {
          autosave: { enabled: true, intervalTurns: 1 },
        },
      });

      const out1 = await h.play('look around');
      expect(out1).toContain('autosave failed');

      // Second consecutive failure this session — the original "don't
      // disrupt gameplay" intent means this should stay quiet now that the
      // player has already been told once.
      const out2 = await h.play('look around');
      expect(out2).not.toContain('autosave failed');
      expect(out2).not.toContain('[autosaved]');

      saveSpy.mockRestore();
    });

    it('checkAutosave returns {status: "skipped"} when not yet time (F-af8f1048)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness({
        gameOpts: {
          autosave: { enabled: true, intervalTurns: 5 },
        },
      });

      const result = await h.session.checkAutosave();
      // turnsSinceLastAutosave is 1 after this call, but intervalTurns is 5
      expect(result).toEqual({ status: 'skipped' });
    });

    it('checkAutosave returns {status: "skipped"} when disabled (F-af8f1048)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness({
        gameOpts: {
          autosave: { enabled: false, intervalTurns: 1 },
        },
      });

      const result = await h.session.checkAutosave();
      expect(result).toEqual({ status: 'skipped' });
    });

    it('checkAutosave returns {status: "saved", message} on success, distinct from "skipped" (F-af8f1048)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const saveSpy = vi.spyOn(await import('./session/session.js'), 'saveSession')
        .mockImplementation(async () => {});

      const h = createHarness({
        gameOpts: {
          autosave: { enabled: true, intervalTurns: 1 },
        },
      });

      const result = await h.session.checkAutosave();
      expect(result.status).toBe('saved');
      expect(result).toMatchObject({ status: 'saved', message: expect.stringContaining('autosaved') });

      saveSpy.mockRestore();
    });

    it('checkAutosave returns {status: "failed", error} on a genuine save failure, distinct from "skipped" (F-af8f1048)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const saveSpy = vi.spyOn(await import('./session/session.js'), 'saveSession')
        .mockRejectedValue(new Error('disk full'));

      const h = createHarness({
        gameOpts: {
          autosave: { enabled: true, intervalTurns: 1 },
        },
      });

      const result = await h.session.checkAutosave();
      expect(result.status).toBe('failed');
      expect(result).toMatchObject({ status: 'failed', error: expect.stringContaining('disk full') });

      saveSpy.mockRestore();
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

    it('brackets announcements like the subsystem/autosave trailer notices, and separates multiple fired notices with a blank line (F-cfc5ff37)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const profile = makeTestProfile();
      const h = createHarness({ gameOpts: { profile } });
      ensureImmersionInferAndTransitionStub(h.session);

      // Force both an announcement AND a subsystem warning to fire on the
      // same turn, so the trailer region has two notices to separate.
      // tickFactionAgency (not the broader world.factions getter) is the
      // established sabotage target for profile-bearing harnesses in this
      // file (see the F-9319b8d8 describe block below) -- this session has
      // a profile, so buildMoveRecommendation() also reads world.factions
      // unguarded later in processInput(), and a broader getter-level
      // sabotage would crash that call too instead of landing cleanly in
      // the post-turn tick's own try/catch.
      h.session.pendingAnnouncements.push('Level up! You are now level 5.');
      vi.spyOn(h.session as any, 'tickFactionAgency').mockImplementation(() => {
        throw new Error('simulated subsystem failure');
      });

      const output = await h.play('look around');
      const lines = output.split('\n');
      const announcementIndex = lines.findIndex((l) => l.includes('Level up! You are now level 5.'));
      const subsystemIndex = lines.findIndex((l) => l.includes('subsystem hiccupped'));

      expect(announcementIndex).toBeGreaterThan(-1);
      expect(subsystemIndex).toBeGreaterThan(-1);
      // Bracket idiom: the announcement now reads as a bracketed system
      // notice, matching subsystemWarning/autosaveMsg's existing `[...]`
      // wrapping, instead of bare indented prose.
      expect(lines[announcementIndex]).toBe('  [Level up! You are now level 5.]');
      expect(lines[subsystemIndex]).toBe('  [A subsystem hiccupped — your turn was processed safely]');
      // Spacing: a full blank line separates the two notices, not zero gap.
      expect(lines[subsystemIndex - 1]).toBe('');
    });
  });

  describe('resolveOpportunity chronicle recording (F-b42790aa)', () => {
    function makeOpportunity(overrides: Partial<OpportunityState> = {}): OpportunityState {
      return {
        id: 'opp-test-1',
        kind: 'contract',
        status: 'available',
        title: 'Recover the Lost Ledger',
        description: 'A merchant wants a stolen ledger recovered.',
        objectiveDescription: 'Recover the ledger',
        linkedRumorIds: [],
        linkedNpcIds: [],
        tags: [],
        rewards: [],
        risks: [],
        visibility: 'known',
        urgency: 0.5,
        turnsRemaining: null,
        createdAtTick: 0,
        genre: 'dark fantasy',
        ...overrides,
      };
    }

    // Reach the private resolveOpportunity() directly — same white-box
    // pattern as the PB-001 tests above, which poke at private engine state.
    function resolve(session: GameSession, opp: OpportunityState, resolutionType: string): void {
      (session as unknown as { resolveOpportunity: (o: OpportunityState, r: string) => void })
        .resolveOpportunity(opp, resolutionType);
    }

    it('records a declined opportunity with a "Declined" description, not "Failed"', () => {
      const engine = createGame();
      const session = new GameSession({
        engine,
        title: 'Test Game',
        tone: 'dark fantasy',
        clientConfig: { apiKey: 'test-key' },
      });

      const opp = makeOpportunity();
      session.activeOpportunities.push(opp);
      resolve(session, opp, 'declined');

      const records = session.journal.serialize().records;
      expect(records).toHaveLength(1);
      expect(records[0].description).toContain('Declined');
      expect(records[0].description).toContain(opp.title);
      expect(records[0].description).not.toContain('Failed');
    });

    it('still records a failed opportunity as "Failed" (regression guard on the shared default branch)', () => {
      const engine = createGame();
      const session = new GameSession({
        engine,
        title: 'Test Game',
        tone: 'dark fantasy',
        clientConfig: { apiKey: 'test-key' },
      });

      const opp = makeOpportunity({ id: 'opp-test-2', status: 'accepted', acceptedAtTick: 0 });
      session.activeOpportunities.push(opp);
      resolve(session, opp, 'failed');

      const records = session.journal.serialize().records;
      expect(records).toHaveLength(1);
      expect(records[0].description).toContain('Failed');
    });
  });

  // F-51e110b9: TurnHistory's compacted-summary growth was capped
  // (F-dfd125bb, MAX_COMPACTED_CHUNKS, session/history.ts) because an
  // unbounded per-campaign string has no ceiling in a several-hundred-turn
  // campaign — this studio's target production scale. Four other
  // per-campaign structures (journal, resolvedPressures,
  // resolvedOpportunities, endgameTriggers) never received an equivalent
  // cap, and all four are serialized in full on every save. Mirrors
  // trimCompactedChunks()'s oldest-first-eviction discipline.
  describe('capped campaign-growth structures (F-51e110b9)', () => {
    it('capOldestFirst evicts the oldest elements first once length exceeds max', () => {
      const engine = createGame();
      const session = new GameSession({
        engine, title: 'Test Game', clientConfig: { apiKey: 'test-key' },
      }) as unknown as { capOldestFirst: <T>(arr: T[], max: number) => void };

      const arr = [1, 2, 3, 4, 5];
      session.capOldestFirst(arr, 3);
      expect(arr).toEqual([3, 4, 5]);

      // No-op once already within the cap.
      session.capOldestFirst(arr, 3);
      expect(arr).toEqual([3, 4, 5]);
    });

    it('trimJournalIfNeeded evicts the oldest journal records once retained count exceeds MAX_JOURNAL_RECORDS', () => {
      const engine = createGame();
      const session = new GameSession({
        engine, title: 'Test Game', clientConfig: { apiKey: 'test-key' },
      });

      for (let i = 0; i < 510; i++) {
        session.journal.record({
          tick: i, category: 'action', actorId: 'world',
          description: `event ${i}`, significance: 0.1, witnesses: [], data: {},
        });
      }
      expect(session.journal.size()).toBe(510);

      (session as unknown as { trimJournalIfNeeded: () => void }).trimJournalIfNeeded();

      expect(session.journal.size()).toBeLessThan(510);
      // Oldest-first: the earliest ticks are the ones evicted.
      const remainingTicks = session.journal.serialize().records.map((r) => r.tick);
      expect(Math.min(...remainingTicks)).toBeGreaterThan(0);
      expect(Math.max(...remainingTicks)).toBe(509);
    });

    it('recordChronicleEvents keeps the journal bounded across many ordinary turns', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      // Seed the journal past the cap directly (cheaper than playing
      // hundreds of real turns) so a single ordinary turn's
      // recordChronicleEvents() call — the unconditional every-turn call
      // site this finding anchors on (game.ts, PB-001 block) — is proven to
      // enforce the cap, not just the private helper in isolation above.
      for (let i = 0; i < 510; i++) {
        h.session.journal.record({
          tick: i, category: 'action', actorId: 'world',
          description: `event ${i}`, significance: 0.1, witnesses: [], data: {},
        });
      }
      expect(h.session.journal.size()).toBe(510);

      await h.play('look around');

      expect(h.session.journal.size()).toBeLessThan(510);
    });

    // F-fd5e8eec: playerRumors was the one growth-prone, save-persisted,
    // action-spawned array in this domain that never got a cap. addRumor()
    // (private method, wraps game-state.ts's capPlayerRumors) now enforces
    // MAX_PLAYER_RUMORS, and warns once per session via debugLog — not
    // inside game-state.ts, which is documented "No console IO".
    it('addRumor caps playerRumors at MAX_PLAYER_RUMORS and warns once via debugLog on first eviction', () => {
      const engine = createGame();
      const logger = createTestLogger();
      const session = new GameSession({
        engine, title: 'Test Game', clientConfig: { apiKey: 'test-key' }, debugLogger: logger,
      });

      function makeRumor(id: string, confidence: number): PlayerRumor {
        return {
          id, claim: `claim-${id}`, subjectDescriptor: 'a stranger', sourceEvent: 'test',
          confidence, distortion: 0, mutationCount: 0, valence: 'mysterious',
          spreadTo: [], originTick: 0,
        };
      }

      // Seed directly to MAX_PLAYER_RUMORS (cheaper than MAX_PLAYER_RUMORS
      // real addRumor calls) so the very next call is the first to overflow.
      session.playerRumors = Array.from({ length: MAX_PLAYER_RUMORS }, (_, i) => makeRumor(`r${i}`, 0.9));

      const addRumorPrivate = (session as unknown as { addRumor: (rumor: PlayerRumor) => void }).addRumor.bind(session);

      addRumorPrivate(makeRumor('overflow-1', 0.9));
      expect(session.playerRumors).toHaveLength(MAX_PLAYER_RUMORS);
      expect(session.playerRumors.some((r) => r.id === 'overflow-1')).toBe(true);

      const warnEntries = logger.getEntries().filter((e) => e.level === 'warn' && e.subsystem === 'rumors');
      expect(warnEntries).toHaveLength(1);

      // A second overflow must not repeat the notice.
      addRumorPrivate(makeRumor('overflow-2', 0.9));
      expect(session.playerRumors).toHaveLength(MAX_PLAYER_RUMORS);
      expect(logger.getEntries().filter((e) => e.level === 'warn' && e.subsystem === 'rumors')).toHaveLength(1);
    });
  });

  // F-5b48354f: game.ts's leverage and opportunity subsystems (processLeverageAction/
  // applyLeverageEffects, processOpportunityAction/matchOpportunity/resolveOpportunity)
  // had zero direct test coverage despite mutating real economic/narrative state.
  // These are the "highest-value targets" the finding names: at least one success
  // path and one edge case per subsystem, driven through the public processInput()
  // API via the game-harness pattern (not white-box casts), so processLeverageAction,
  // applyLeverageEffects, processOpportunityAction, and matchOpportunity are all
  // exercised for real, not just resolveOpportunity in isolation.
  describe('leverage + opportunity subsystem coverage (F-5b48354f)', () => {
    function makeLeverageProfile(customOverrides: Record<string, string | number | boolean> = {}) {
      const profile = createProfile(
        {
          name: 'Rhea',
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
      return { ...profile, custom: { ...profile.custom, ...customOverrides } };
    }

    it('resolves a leverage action successfully and applies its currency effects (success path)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      // 'bribe' costs 15 favor (SOCIAL_REQUIREMENTS in @ai-rpg-engine/modules) — fund it.
      const profile = makeLeverageProfile({ 'leverage.favor': 20 });
      const h = createHarness({ gameOpts: { profile } });

      await h.play('bribe guard');

      expect(h.session.lastLeverageResolution?.success).toBe(true);
      expect(h.session.lastLeverageResolution?.subAction).toBe('bribe');
      // Cost deducted (20 - 15 = 5) and bribe's debt side-effect applied (+5).
      expect(h.session.profile?.custom['leverage.favor']).toBe(5);
      expect(h.session.profile?.custom['leverage.debt']).toBe(5);
    });

    it('blocks a leverage action for insufficient currency without mutating state (edge case)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const profile = makeLeverageProfile(); // no leverage.favor set — defaults to 0
      const h = createHarness({ gameOpts: { profile } });

      await h.play('bribe guard');

      expect(h.session.lastLeverageResolution?.success).toBe(false);
      expect(h.session.lastLeverageResolution?.failReason).toContain('Not enough');
      expect(h.session.profile?.custom['leverage.favor'] ?? 0).toBe(0);
      expect(h.session.profile?.custom['leverage.debt'] ?? 0).toBe(0);
    });

    it('resolves an opportunity end-to-end through accept -> complete (success path)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      const opp: OpportunityState = {
        id: 'opp-coverage-1',
        kind: 'contract',
        status: 'available',
        title: 'Recover the Lost Ledger',
        description: 'A merchant wants a stolen ledger recovered.',
        objectiveDescription: 'Recover the ledger',
        linkedRumorIds: [],
        linkedNpcIds: [],
        tags: [],
        rewards: [],
        risks: [],
        visibility: 'known',
        urgency: 0.5,
        turnsRemaining: null,
        createdAtTick: 0,
        genre: 'fantasy',
      };
      h.session.activeOpportunities.push(opp);

      await h.play('accept contract');
      expect(h.session.activeOpportunities.find((o) => o.id === opp.id)?.status).toBe('accepted');

      await h.play('complete contract');

      expect(h.session.activeOpportunities.find((o) => o.id === opp.id)).toBeUndefined();
      expect(h.session.resolvedOpportunities).toHaveLength(1);

      const records = h.session.journal.serialize().records;
      expect(records.some((r) => r.description.includes('Accepted contract'))).toBe(true);
      expect(records.some((r) => r.description.includes('Completed contract'))).toBe(true);
    });
  });

  // F-c4332895: engine.submitAction() inside executeTurn() mutates world state
  // (Step 2) before narrateScene runs (Step 3). Once narrator.ts started
  // rethrowing fatal NarrationError kinds (auth/bad-request) instead of
  // swallowing them into fallback prose, processInput()'s unguarded
  // `await executeTurn(...)` call meant a fatal narration failure skipped
  // every post-turn bookkeeping call below it (applyProfileHints,
  // recordChronicleEvents, autosave) even though the turn's world mutation
  // had already happened and was already in history. This suite proves the
  // seam: world mutation persists, history has the turn, bookkeeping still
  // runs, and the error still reaches the caller.
  describe('fatal narration error preserves post-turn bookkeeping (F-c4332895)', () => {
    it('runs applyProfileHints/recordChronicleEvents/checkAutosave and rethrows when narration fails fatally after a state-mutating action', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness({ clientOpts: { generateFailure: 'auth' } });

      const recordChronicleSpy = vi.spyOn(h.session as unknown as { recordChronicleEvents: (r: unknown) => void }, 'recordChronicleEvents');
      const applyHintsSpy = vi.spyOn(h.session, 'applyProfileHints');
      const autosaveSpy = vi.spyOn(h.session, 'checkAutosave');

      const locationBefore = h.session.engine.world.locationId;

      await expect(h.play('go to chapel-nave')).rejects.toThrow();

      // (a) world mutation persists — the move already resolved through the
      // engine before narration ran and failed fatally.
      expect(h.session.engine.world.locationId).toBe('chapel-nave');
      expect(h.session.engine.world.locationId).not.toBe(locationBefore);

      // (b) history has the turn recorded, with fallback narration text —
      // not the real narrator output, since narrateScene never returned.
      expect(h.session.history.getAll()).toHaveLength(1);
      expect(h.session.history.getAll()[0].verb).toBe('move');
      expect(h.session.history.getAll()[0].narration).toBeTruthy();

      // (c) profile hints / chronicle bookkeeping still ran for the recorded
      // turn, even though executeTurn() never returned a TurnResult.
      expect(applyHintsSpy).toHaveBeenCalledTimes(1);
      expect(recordChronicleSpy).toHaveBeenCalledTimes(1);
      expect(autosaveSpy).toHaveBeenCalledTimes(1);

      // (d) the error still propagates to the caller — asserted above via
      // `.rejects.toThrow()`.
    });

    it('does not run post-turn bookkeeping twice on a normal (non-fatal) turn', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      const recordChronicleSpy = vi.spyOn(h.session as unknown as { recordChronicleEvents: (r: unknown) => void }, 'recordChronicleEvents');
      const applyHintsSpy = vi.spyOn(h.session, 'applyProfileHints');

      await h.play('look around');

      expect(applyHintsSpy).toHaveBeenCalledTimes(1);
      expect(recordChronicleSpy).toHaveBeenCalledTimes(1);
    });
  });

  // F-79a25863 (presentation seam contract): turn-loop.ts's executeTurn()
  // already computes TurnResult.audioCalls (sfx/music/ambient/UI-effect MCP
  // tool calls — e.g. deathHook's fade-to-black), but processInput() read
  // every other TurnResult field and silently discarded audioCalls, so the
  // audio/UI-effect presentation layer was inert for every real player of
  // the shipped CLI. This suite proves the wiring: the new GameConfig
  // `onPresentation` callback fires with each turn's calls (empty array
  // included), on the fatal-bookkeeping path too, from the
  // opening-narration path when it produces calls, and survives a throwing
  // sink without damaging the turn (mirrors PB-001 containment).
  describe('presentation seam contract (F-79a25863)', () => {
    it('invokes onPresentation with the turn\'s audioCalls (empty array) after a normal turn', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const onPresentation = vi.fn();
      const h = createHarness({ gameOpts: { onPresentation } });

      await h.play('look around');

      expect(onPresentation).toHaveBeenCalledTimes(1);
      expect(onPresentation).toHaveBeenCalledWith([]);
    });

    it('passes through the turn\'s actual audioCalls content to onPresentation', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const onPresentation = vi.fn();
      const h = createHarness({ gameOpts: { onPresentation } });

      const fakeCalls: McpToolCall[] = [{ tool: '__ui_effect_intent__', params: { type: 'fade-out' } }];
      vi.spyOn(h.session.immersion, 'processPresentation').mockResolvedValue(fakeCalls);

      await h.play('look around');

      expect(onPresentation).toHaveBeenCalledWith(fakeCalls);
    });

    it('does not let a throwing onPresentation sink damage the turn (mirrors PB-001 containment)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const onPresentation = vi.fn(() => {
        throw new Error('sink exploded');
      });
      const h = createHarness({ gameOpts: { onPresentation } });

      const output = await h.play('look around');

      expect(output).toBeTruthy();
      expect(onPresentation).toHaveBeenCalled();
    });

    it('invokes onPresentation with an empty array on the fatal-bookkeeping path (F-c4332895) too', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const onPresentation = vi.fn();
      const h = createHarness({
        clientOpts: { generateFailure: 'auth' },
        gameOpts: { onPresentation },
      });

      await expect(h.play('go to chapel-nave')).rejects.toThrow();

      expect(onPresentation).toHaveBeenCalledWith([]);
    });

    it('invokes onPresentation for the opening-narration path when it produces calls', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const onPresentation = vi.fn();
      const h = createHarness({ gameOpts: { onPresentation } });

      const fakeCalls: McpToolCall[] = [{ tool: 'sound_effect', params: { effect: 'ambient_rain' } }];
      vi.spyOn(h.session.immersion, 'processPresentation').mockResolvedValue(fakeCalls);

      await h.session.getOpeningNarration();

      expect(onPresentation).toHaveBeenCalledWith(fakeCalls);
    });

    it('skips presentation processing for the opening narration when the state machine was already restored into combat, so a mid-fight save is not silently flipped back to exploration before the first real turn', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const onPresentation = vi.fn();
      const h = createHarness({ gameOpts: { onPresentation } });

      // Mirrors ImmersionRuntime.initialize()'s session-restore transition
      // for a save captured mid-combat.
      h.session.immersion.stateMachine.transition('combat', 'test-setup');
      const processPresentationSpy = vi.spyOn(h.session.immersion, 'processPresentation');

      await h.session.getOpeningNarration();

      expect(processPresentationSpy).not.toHaveBeenCalled();
      expect(onPresentation).toHaveBeenCalledWith([]);
      expect(h.session.immersion.stateMachine.current).toBe('combat');
    });

    it('works with no onPresentation callback configured (optional, backward compatible)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      await expect(h.play('look around')).resolves.toBeTruthy();
    });
  });

  // STREAMING SEAM CONTRACT (game-core half): narrateScene already supports
  // onChunk, and the fake client's streaming mode (test/helpers/fake-claude-
  // client.ts, opts.streaming) already splits narration into word chunks and
  // invokes it — but nothing threaded a caller-supplied sink through
  // GameConfig/executeTurn into that onChunk parameter, so it was inert for
  // every real player. This suite proves the game-core half of the wire:
  // GameConfig.onNarrationChunk reaches narrateScene's onChunk for a normal
  // turn only — not opening narration, not director mode — and a throwing
  // sink never damages the turn (mirrors emitPresentation's F-79a25863
  // containment). The cli-display half (bin.ts wiring createStreamPresenter()
  // through this same opt) lands separately this same wave.
  describe('streaming narration seam contract (game-core half)', () => {
    it('relays a normal turn\'s narration chunks to the registered onNarrationChunk sink', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const chunks: string[] = [];
      const h = createHarness({
        clientOpts: { streaming: true, narration: 'Two words appear' },
        gameOpts: { onNarrationChunk: (chunk) => chunks.push(chunk) },
      });

      await h.play('look around');

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('')).toBe('Two words appear');
      expect(h.callLog.generateStream).toBe(1);
    });

    it('does not force the streaming client path (and does not stream) when no onNarrationChunk is configured', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness({
        clientOpts: { streaming: true },
      });

      await h.play('look around');

      // narrateScene only takes the streaming branch when onChunk is
      // truthy — an inert-but-defined wrapper passed through unconditionally
      // would silently switch every turn onto the legacy plain-text path
      // even when no caller ever asked to stream.
      expect(h.callLog.generateStream).toBe(0);
      expect(h.callLog.generate).toBeGreaterThan(0);
    });

    it('does not invoke the sink for the opening narration path', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const chunks: string[] = [];
      const h = createHarness({
        clientOpts: { streaming: true, narration: 'Opening scene text' },
        gameOpts: { onNarrationChunk: (chunk) => chunks.push(chunk) },
      });

      await h.session.getOpeningNarration();

      expect(chunks).toHaveLength(0);
    });

    it('does not invoke the sink for director mode commands', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const chunks: string[] = [];
      const h = createHarness({
        clientOpts: { streaming: true },
        gameOpts: { onNarrationChunk: (chunk) => chunks.push(chunk) },
      });

      await h.play('/director');
      await h.play('/inspect pilgrim');

      expect(chunks).toHaveLength(0);
    });

    it('does not let a throwing onNarrationChunk sink damage the turn', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const onNarrationChunk = vi.fn(() => {
        throw new Error('chunk sink exploded');
      });
      const h = createHarness({
        clientOpts: { streaming: true, narration: 'Two words appear' },
        gameOpts: { onNarrationChunk },
      });

      const output = await h.play('look around');

      expect(output).toBeTruthy();
      expect(onNarrationChunk).toHaveBeenCalled();
    });

    it('works with no onNarrationChunk callback configured (optional, backward compatible)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      await expect(h.play('look around')).resolves.toBeTruthy();
    });
  });

  // Wave 12 cross-domain contracts. This domain (game-core) owns the halves
  // exercised here; the sibling halves (cli-display's play-renderer turn
  // divider, runtime-foundry's ImmersionRuntime diagnostics) land in their
  // own domains' test files this same wave.
  describe('cross-domain contracts (wave 12)', () => {
    // Contract A (turn divider): game-presenter.ts's renderPlayOutput input
    // now carries `turnNumber?: number`, passed straight through to
    // cli-display's renderPlayScreen/makeTurnDivider (src/display/
    // play-renderer.ts), which already renders a "Turn N" divider when
    // turnNumber is present (turn-divider.test.ts). This proves game.ts's
    // half: the value actually flows from history into that divider.
    it('passes the current turn number through to the rendered turn divider (contract A)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      const out1 = await h.play('look around');
      expect(h.turnCount()).toBe(1);
      expect(out1).toContain('Turn 1');

      const out2 = await h.play('look around');
      expect(h.turnCount()).toBe(2);
      expect(out2).toContain('Turn 2');
    });

    // Contract B (debug mode): GameConfig's existing debug signal —
    // debugLog.enabled, resolved from config.debugLogger or
    // createDebugLogger()'s --debug/CLAUDE_RPG_DEBUG auto-detection — now
    // threads into immersion.debugMode where the runtime is constructed, so
    // runtime-foundry's ImmersionRuntime diagnostics (immersion-runtime.ts)
    // actually fire under --debug instead of always defaulting to false.
    it('threads an enabled debug logger into ImmersionRuntime.debugMode (contract B)', () => {
      const engine = createGame();
      const enabledLogger: DebugLogger = {
        enabled: true,
        debug() {}, info() {}, warn() {}, error() {}, setTick() {}, getEntries: () => [],
      };
      const session = new GameSession({
        engine,
        title: 'Test Game',
        clientConfig: { apiKey: 'test-key' },
        debugLogger: enabledLogger,
      });

      expect(session.immersion.debugMode).toBe(true);
    });

    it('leaves ImmersionRuntime.debugMode false when the debug logger is disabled (contract B)', () => {
      const engine = createGame();
      const session = new GameSession({
        engine,
        title: 'Test Game',
        clientConfig: { apiKey: 'test-key' },
        debugLogger: createTestLogger(), // enabled: false
      });

      expect(session.immersion.debugMode).toBe(false);
    });
  });

  describe('presentation state restore (F-8c3e32b7)', () => {
    it('seeds ImmersionRuntime.stateMachine from GameConfig.restoredPresentationState at construction', () => {
      const engine = createGame();
      const session = new GameSession({
        engine,
        title: 'Test Game',
        clientConfig: { apiKey: 'test-key' },
        restoredPresentationState: 'combat',
      });

      expect(session.immersion.stateMachine.current).toBe('combat');
    });

    it('leaves the presentation state at its default when restoredPresentationState is not provided', () => {
      const engine = createGame();
      const session = new GameSession({
        engine,
        title: 'Test Game',
        clientConfig: { apiKey: 'test-key' },
      });

      expect(session.immersion.stateMachine.current).toBe('exploration');
    });

    it('checkAutosave() persists the current presentation state', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const capturedInputs: Array<{ presentationState?: string }> = [];
      vi.spyOn(await import('./session/session.js'), 'saveSession')
        .mockImplementation(async (input) => {
          capturedInputs.push(input);
        });

      const h = createHarness({
        gameOpts: { autosave: { enabled: true, intervalTurns: 1 } },
      });

      // ImmersionRuntime.processPresentation() re-infers presentation state
      // from each turn's own events every turn (turn-loop.ts Step 4.5), so a
      // manually pre-set state would just be overwritten — "speak to
      // pilgrim" is a real turn whose own verb drives the state machine to
      // 'dialogue' (presentation-state.ts's inferFromEvents), which
      // checkAutosave() then reads afterward.
      await h.play('speak to pilgrim');

      expect(h.session.immersion.stateMachine.current).toBe('dialogue');
      expect(capturedInputs).toHaveLength(1);
      expect(capturedInputs[0].presentationState).toBe('dialogue');
    });
  });

  describe('BuildCatalog resolution (F-97ffd8cd)', () => {
    function makeCatalogProfile() {
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

    it("resolves the player's status bar archetypeName/disciplineName from a real pack's BuildCatalog", async () => {
      const { buildCatalog } = await import('@ai-rpg-engine/starter-fantasy');
      const engine = createGame();
      const session = new GameSession({
        engine,
        title: 'Test Game',
        clientConfig: { apiKey: 'test-key' },
        profile: makeCatalogProfile(),
        itemCatalog: { items: [] },
        buildCatalog,
      });

      const status = session.getStatusData();
      expect(status?.archetypeName).toBe('Penitent Knight');
      expect(status?.disciplineName).toBe('Occultist');
    });

    it('falls back to the raw catalog id when buildCatalog is omitted (unchanged behavior)', () => {
      const engine = createGame();
      const session = new GameSession({
        engine,
        title: 'Test Game',
        clientConfig: { apiKey: 'test-key' },
        profile: makeCatalogProfile(),
        itemCatalog: { items: [] },
      });

      const status = session.getStatusData();
      expect(status?.archetypeName).toBe('penitent-knight');
      expect(status?.disciplineName).toBe('occultist');
    });
  });

  describe('consecutiveFallbacks counter (F-940cd4d0)', () => {
    it('switches to the repeat-aware fallback text on the 2nd consecutive narration failure, and resets after a success', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const { FALLBACK_NARRATION, FALLBACK_NARRATION_REPEATED } = await import('./narrator/narrator.js');
      const h = createHarness({ clientOpts: { generateFailure: 'timeout' } });

      const out1 = await h.play('look around');
      expect(out1).toContain(FALLBACK_NARRATION);
      expect(out1).not.toContain(FALLBACK_NARRATION_REPEATED);

      const out2 = await h.play('look around');
      expect(out2).toContain(FALLBACK_NARRATION_REPEATED);
    });

    it('a subsequent successful turn resets the counter, so a later failure shows FALLBACK_NARRATION again (not _REPEATED)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const { FALLBACK_NARRATION, FALLBACK_NARRATION_REPEATED } = await import('./narrator/narrator.js');
      // Turns 1-2 fail, turn 3 succeeds, turn 4 fails again.
      const h = createHarness({
        clientOpts: { generateFailure: (n: number) => (n === 3 ? undefined : 'timeout') },
      });

      await h.play('look around'); // 1: fails -> FALLBACK_NARRATION, counter -> 1
      await h.play('look around'); // 2: fails -> FALLBACK_NARRATION_REPEATED, counter -> 2
      const out3 = await h.play('look around'); // 3: succeeds, counter resets -> 0
      expect(out3).not.toContain(FALLBACK_NARRATION);

      const out4 = await h.play('look around'); // 4: fails again, first fallback since reset
      expect(out4).toContain(FALLBACK_NARRATION);
      expect(out4).not.toContain(FALLBACK_NARRATION_REPEATED);
    });
  });

  describe('debugLog reasoning threading (F-9976a6d6, SLATE-5e option (a) only per Director ruling R3)', () => {
    it('logs the interpreted action reasoning to a real DebugLogger threaded through GameConfig.debugLogger', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const debugLog = createTestLogger();
      const h = createHarness({ gameOpts: { debugLogger: debugLog } });

      await h.play('look around');

      const entry = debugLog.getEntries().find((e) => e.subsystem === 'interpret' && e.message === 'action-reasoning');
      expect(entry).toBeDefined();
      expect(entry!.data?.verb).toBe('look');
    });
  });

  describe('NPC conversation memory (F-462792bb, SLATE-2 persisted per Director ruling R2)', () => {
    it('defaults to an empty Map when GameConfig.npcConversations is not provided', () => {
      const engine = createGame();
      const session = new GameSession({ engine, title: 'Test Game', clientConfig: { apiKey: 'test-key' } });

      expect(session.npcConversations).toEqual(new Map());
    });

    it('restores the exact Map instance passed via GameConfig.npcConversations', () => {
      const engine = createGame();
      const restored = new Map([['pilgrim', [{ speaker: 'Player', text: 'hi' }]]]);
      const session = new GameSession({
        engine, title: 'Test Game', clientConfig: { apiKey: 'test-key' },
        npcConversations: restored,
      });

      expect(session.npcConversations).toBe(restored);
    });

    it("grows by exactly 2 entries keyed by the NPC's real id after a non-fallback speak turn", async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      await h.play('speak to pilgrim');

      const entries = h.session.npcConversations.get('pilgrim');
      expect(entries).toHaveLength(2);
      expect(entries![0]).toEqual({ speaker: 'Player', text: 'speak to pilgrim' });
      expect(entries![1].speaker).toBe('Suspicious Pilgrim');
      // Keyed by real id, never name/genre.
      expect(h.session.npcConversations.has('Suspicious Pilgrim')).toBe(false);
    });

    it('does not grow when the dialogue result is a fallback stall (non-event, not remembered)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      // Only the 2nd generate() call (Step 5's generateDialogue) fails —
      // narrateScene's own call (#1) still succeeds normally.
      const h = createHarness({
        clientOpts: { generateFailure: (n: number) => (n === 2 ? 'timeout' : undefined) },
      });

      await h.play('speak to pilgrim');

      expect(h.session.npcConversations.has('pilgrim')).toBe(false);
    });

    it('does not grow on a non-speak turn', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      await h.play('look around');

      expect(h.session.npcConversations.size).toBe(0);
    });

    it('accumulates across turns within one session (the same Map instance is threaded every turn)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      await h.play('speak to pilgrim');
      expect(h.session.npcConversations.get('pilgrim')).toHaveLength(2);

      await h.play('speak to pilgrim');
      expect(h.session.npcConversations.get('pilgrim')).toHaveLength(4);
    });

    it('never exceeds 20 entries per NPC', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      for (let i = 0; i < 15; i++) {
        await h.play('speak to pilgrim');
      }

      expect(h.session.npcConversations.get('pilgrim')).toHaveLength(20);
    });

    it('checkAutosave() persists the live npcConversations map', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const capturedInputs: Array<{ npcConversations?: Map<string, unknown> }> = [];
      vi.spyOn(await import('./session/session.js'), 'saveSession')
        .mockImplementation(async (input) => {
          capturedInputs.push(input);
        });

      const h = createHarness({ gameOpts: { autosave: { enabled: true, intervalTurns: 1 } } });
      await h.play('speak to pilgrim');

      expect(capturedInputs).toHaveLength(1);
      // Reference-equal to the live map (not a stale/empty copy) AND
      // actually populated -- a session with no npcConversations field at
      // all would also satisfy a bare `.toBe(undefined)` comparison, so
      // this asserts real content is present, not just referential parity.
      expect(capturedInputs[0].npcConversations).toBe(h.session.npcConversations);
      expect(capturedInputs[0].npcConversations?.get('pilgrim')).toHaveLength(2);
    });
  });

  describe('downed gate (F-6bc0721e, SLATE-6 death-as-setback per Director ruling R1)', () => {
    it("blocks an ordinary action verb while stateMachine.current is 'menu', without consuming a turn", async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();
      h.session.immersion.stateMachine.transition('menu', 'test-setup');
      const submitSpy = vi.spyOn(h.session.engine, 'submitAction');
      const tickBefore = h.session.engine.tick;

      const output = await h.play('attack pilgrim');

      expect(submitSpy).not.toHaveBeenCalled();
      expect(h.session.engine.tick).toBe(tickBefore);
      expect(output).toContain('DEATH SCREEN');
      expect(output).toContain('You are down');
    });

    it("keeps /status (a non-diegetic introspection command) working while downed", async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();
      h.session.immersion.stateMachine.transition('menu', 'test-setup');

      const output = await h.play('/status');

      expect(output).not.toContain('DEATH SCREEN');
      expect(output).toContain('No profile loaded');
    });

    it("still allows quit while downed", async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();
      h.session.immersion.stateMachine.transition('menu', 'test-setup');

      const output = await h.play('quit');

      expect(output).toBe('__QUIT__');
    });

    it('"continue" transitions back to exploration without consuming a turn, and the next ordinary turn proceeds normally', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();
      h.session.immersion.stateMachine.transition('menu', 'test-setup');
      const submitSpy = vi.spyOn(h.session.engine, 'submitAction');

      const output = await h.play('continue');

      expect(h.session.immersion.stateMachine.current).toBe('exploration');
      expect(submitSpy).not.toHaveBeenCalled();
      expect(output).not.toContain('DEATH SCREEN');

      const next = await h.play('look');
      expect(next).not.toContain('DEATH SCREEN');
      expect(submitSpy).toHaveBeenCalledTimes(1);
    });

    it('a save made while downed (restoredPresentationState menu) gates the very first input too', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness({ gameOpts: { restoredPresentationState: 'menu' } });
      const submitSpy = vi.spyOn(h.session.engine, 'submitAction');

      const output = await h.play('attack pilgrim');

      expect(submitSpy).not.toHaveBeenCalled();
      expect(output).toContain('DEATH SCREEN');
    });

    it("renders the real turn narration through renderDeathOutput on the turn that transitions into 'menu' (justDied)", async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();
      // Override inferAndTransition directly to report a menu transition on
      // the very next turn, mirroring how a real player-defeat event would
      // resolve (the pinned StateTransition-returning contract this wave --
      // see ensureImmersionInferAndTransitionStub's own doc comment above
      // for why this domain can't construct the real inference for real).
      const immersion = h.session.immersion as unknown as {
        inferAndTransition: (engine: unknown, events: unknown[], verb: string) => unknown;
      };
      const original = immersion.inferAndTransition;
      immersion.inferAndTransition = (engine: unknown, events: unknown[], verb: string) => {
        h.session.immersion.stateMachine.transition('menu', 'forced-death');
        return { from: 'combat', to: 'menu', trigger: verb };
      };

      const output = await h.play('attack pilgrim');

      expect(output).toContain('DEATH SCREEN');
      // The narration passed through is this turn's REAL narration, not the
      // downed-gate's generic "You are down" placeholder.
      expect(output).not.toContain('You are down');
      immersion.inferAndTransition = original;
    });
  });

  describe('getCostSummary (F-b4b16d0a — COST COMMAND, game-core half)', () => {
    it('starts with a zero-usage summary before any LLM calls', () => {
      const engine = createGame();
      const session = new GameSession({
        engine,
        title: 'Test Game',
        clientConfig: { apiKey: 'test-key' },
      });

      const summary = session.getCostSummary();
      expect(summary).toContain('Session Token Usage');
      expect(summary).toContain('Total: 0 calls');
    });

    it('records narration cost after a normal turn', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      await h.play('look around');

      const summary = h.session.getCostSummary();
      expect(summary).toContain('narration: 1 calls');
      expect(summary).toContain('Estimated cost:');
    });

    it('records dialogue cost separately from narration when speaking to an NPC', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      await h.play('speak to pilgrim');

      const summary = h.session.getCostSummary();
      expect(summary).toContain('narration: 1 calls');
      expect(summary).toContain('dialogue: 1 calls');
    });

    it('accumulates narration cost across multiple turns', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      await h.play('look around');
      await h.play('look around');

      const summary = h.session.getCostSummary();
      expect(summary).toContain('narration: 2 calls');
    });

    it('records narration cost for the opening narration', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      await h.session.getOpeningNarration();

      const summary = h.session.getCostSummary();
      expect(summary).toContain('narration: 1 calls');
    });
  });
});

// task_3ddb1c06 companion: /conclude must be retry-safe — the epilogue
// fallback copy promises "type /conclude again to retry", so a second
// invocation must not duplicate the campaign-concluded chronicle record
// (handleConclude reuses the existing finale outline once concluded).
describe('handleConclude retry safety', () => {
  it('a second /conclude does not duplicate the campaign-concluded record', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();

    await h.session.processInput('/conclude');
    const countAfterFirst = h.session.journal
      .serialize().records.filter((r) => r.category === 'campaign-concluded').length;
    expect(countAfterFirst).toBe(1);
    expect(h.session.campaignStatus).toBe('completed');

    await h.session.processInput('/conclude');
    const countAfterSecond = h.session.journal
      .serialize().records.filter((r) => r.category === 'campaign-concluded').length;
    expect(countAfterSecond).toBe(1);
  });
});
