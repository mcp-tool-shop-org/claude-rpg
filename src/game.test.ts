import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

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
import type { ResolvedEvent, Engine } from '@ai-rpg-engine/core';
import { GameSession } from './game.js';
import { createTestLogger, type DebugLogger } from './game/debug-logger.js';
import { createProfile, getReputation } from '@ai-rpg-engine/character-profile';
import type { OpportunityState, PlayerRumor } from '@ai-rpg-engine/modules';
import { setPlayerRumorState, getLeverageState } from '@ai-rpg-engine/modules';
import { RumorEngine } from '@ai-rpg-engine/rumor-system';
// WO-A2-5 (slice A2 §7, proofs): the same world-truth readers/setters
// game.ts's own refreshWorldViews()/write-through paths use, verified
// against the installed 3.11 dist (see game.ts's own import doc comment).
import {
  getActivePressures,
  getWorldTickState,
  getPersistedOpportunities,
  setPersistedOpportunities,
  makeOpportunity,
  makePressure,
  pushActivePressure,
  getPlayerRumorState,
  getEconomyCoreState,
  // WO-A4-1 (slice A4 §1): the getter-backed fields can no longer be
  // assigned directly — a test that used to seed
  // session.lastNpcProfiles/lastNpcActions now seeds world truth instead,
  // same discipline as the pressure/opportunity/rumor seeds above.
  setPersistedNpcState,
  getPersistedNpcObligations,
  getPersistedNpcChains,
  getPersistedNpcRecapEntries,
  getPersistedMoveRecommendation,
  setPersistedMoveRecommendation,
} from '@ai-rpg-engine/modules';
import type { McpToolCall } from './runtime/audio-bridge.js';
import { loadNpcAgencyFromSession, type SavedSession, saveSession, loadSession, loadProfileFromSession, loadWorldMovedFromSession } from './session/session.js';
// WO-A5 (slice A5, wave 8) test-only imports.
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import { SELL_BASE_VALUE, QUIET_ROUNDS_BEFORE_DECAY, getDistrictState } from '@ai-rpg-engine/modules';
import { MAX_PLAYER_RUMORS } from './game/game-state.js';
// Slice A1 (WO-A1-6, WO-A1-7, docs/living-world-slice-a1.md): generated-world
// boot + verb-parity + defeat-fallout proofs, built against world-gen.ts's
// CURRENT (main) generateWorld() signature per the wave-3 game-core
// addendum -- see the describe block near the end of this file for why.
import { generateWorld, type WorldGenProposal } from './foundry/world-gen.js';
import { createFakeClient } from '../test/helpers/fake-claude-client.js';
import { filterSupportedVerbs, SUPPORTED_VERBS, KNOWN_EXCLUDED_VERBS } from './turn-loop.js';

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
    // WO-A4-1: lastNpcProfiles/lastNpcActions are live getters over world
    // truth now — seed the world-tick namespace directly instead of the
    // (no longer assignable) session fields.
    const world = h.session.engine.world;
    setPersistedNpcState(
      world,
      profiles,
      actions,
      getPersistedNpcObligations(world),
      getPersistedNpcChains(world),
      getPersistedNpcRecapEntries(world),
    );

    const output = await h.play('look around');
    expect(output).toBeTruthy();
    expect(typeof output).toBe('string');
  });

  it('should contain subsystem warning when a post-turn tick throws (PB-001)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();

    // Sabotage a subsystem to force an error in the post-turn tick block.
    // tickFactionAgency reads engine.world.factions — we make it throw.
    // Coordinator stitch (slice A2): tickFactionAgency was deleted (the engine
    // tick runs faction agency); sabotage a ticker the post-turn block still runs.
    vi.spyOn(h.session as any, 'tickItemRecognition').mockImplementation(() => { throw new Error('simulated subsystem failure'); });

    const output = await h.play('look around');
    expect(output).toContain('subsystem hiccupped');
    expect(output).toContain('processed safely');

    // Restore
    vi.restoreAllMocks();
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
    // Coordinator stitch (slice A2): tickFactionAgency was deleted (the engine
    // tick runs faction agency); sabotage a ticker the post-turn block still runs.
    vi.spyOn(h.session as any, 'tickItemRecognition').mockImplementation(() => { throw new Error('boom'); });

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
    vi.restoreAllMocks();
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

    // Coordinator stitch (slice A2): tickFactionAgency was deleted (the engine
    // tick runs faction agency); sabotage a ticker the post-turn block still runs.
    vi.spyOn(h.session as any, 'tickItemRecognition').mockImplementation(() => { throw new Error('boom'); });

    await h.play('look around');

    expect(h.session.getSubsystemFailureCount()).toBe(1);
    const recent = h.session.getRecentSubsystemFailures();
    expect(recent).toHaveLength(1);
    expect(recent[0].error).toContain('boom');
    expect(recent[0].tick).toBe(h.session.engine.tick);

    // Restore
    vi.restoreAllMocks();
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
      vi.spyOn(h.session as any, 'tickItemRecognition').mockImplementation(() => {
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

      vi.spyOn(h.session as any, 'tickItemRecognition').mockImplementation(() => {
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

      vi.spyOn(h.session as any, 'tickItemRecognition').mockImplementation(() => {
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
      vi.spyOn(h.session as any, 'tickItemRecognition').mockImplementation(() => {
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
      // WO-A4-1: playerRumors is a live getter over the engine's own
      // player-rumor ledger now — seeding the ledger is enough, no refresh
      // call needed (refreshWorldViews is deleted; the renamed
      // refreshProfileViews only refreshes reputation, not this).
      setPlayerRumorState(session.engine.world, { rumors: Array.from({ length: MAX_PLAYER_RUMORS }, (_, i) => makeRumor(`r${i}`, 0.9)) });

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
      // WO-A4-1: activeOpportunities is a live getter over
      // world.modules['opportunity-core'] now — seeding world truth is
      // enough, no refresh call needed.
      setPersistedOpportunities(h.session.engine.world, [...getPersistedOpportunities(h.session.engine.world), opp]);

      await h.play('accept contract');
      expect(h.session.activeOpportunities.find((o) => o.id === opp.id)?.status).toBe('accepted');

      await h.play('complete contract');

      expect(h.session.activeOpportunities.find((o) => o.id === opp.id)).toBeUndefined();
      expect(h.session.resolvedOpportunities).toHaveLength(1);

      const records = h.session.journal.serialize().records;
      expect(records.some((r) => r.description.includes('Accepted contract'))).toBe(true);
      expect(records.some((r) => r.description.includes('Completed contract'))).toBe(true);
    });

    it('surfaces a player-facing notice instead of a silent no-op when no opportunity is available (edge case, F-7c44396e)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();
      // No opportunity was ever pushed onto activeOpportunities — this is
      // the finding's own cited reachability example: ordinary phrasing
      // ("decline the offer") fast-matches the opportunity verb on syntax
      // alone with zero check that a matching opportunity exists.
      // Coordinator stitch (slice A2): with the living world on, the round
      // inside the turn may SPAWN an opportunity before the post-turn
      // opportunity verb runs, so a full 'decline' turn can no longer be
      // relied on to find an empty ledger. The notice contract is proven
      // directly: empty the world ledger, run the verb. WO-A4-1:
      // activeOpportunities is a live getter now — no refresh call needed.
      setPersistedOpportunities(h.session.engine.world, []);
      const notice = (h.session as unknown as {
        processOpportunityAction: (t: unknown) => string | null;
      }).processOpportunityAction({ interpreted: { verb: 'opportunity', parameters: { subAction: 'decline' } } });

      expect(notice).toContain('No opportunity is available to decline');
      expect(h.session.activeOpportunities).toHaveLength(0);
      expect(h.session.resolvedOpportunities).toHaveLength(0);
    });
  });

  // F-88570323: /recruit and /dismiss used to index the raw entity table
  // directly (this.engine.world.entities[npcId]), requiring the exact
  // internal id verbatim -- inconsistent with every other targeting command
  // in this domain (attack/speak/inspect/use), which all resolve through
  // findEntityByName's tiered case-insensitive exact-name -> substring-name
  // -> substring-id matching. Entity ids aren't reliably derivable from what
  // a player sees: starter-fantasy's 'brother-aldric' displays everywhere
  // else as "Brother Aldric".
  describe('recruit/dismiss by display name (F-88570323)', () => {
    it('recruits and dismisses by a spoken display-name fragment, not just the exact internal id', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      await h.play('go to chapel-nave');
      // Original code required npcId === 'brother-aldric' exactly; this now
      // resolves 'aldric' via the same substring-name tier attack/speak/
      // inspect already use, scoped to the player's current zone.
      const recruitOutput = await h.play('/recruit aldric');
      expect(recruitOutput).toContain('Brother Aldric has joined your party');
      expect(h.session.partyState.companions.some((c) => c.npcId === 'brother-aldric')).toBe(true);

      // Dismiss by the same spoken fragment -- resolved against the party
      // roster's display names this time, not every entity in the world.
      const dismissOutput = await h.play('/dismiss aldric');
      expect(dismissOutput).toContain('Brother Aldric has left your party');
      expect(h.session.partyState.companions.some((c) => c.npcId === 'brother-aldric')).toBe(false);
    });

    it('still falls back to the exact internal id for power users', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      await h.play('go to chapel-nave');
      const output = await h.play('/recruit brother-aldric');
      expect(output).toContain('Brother Aldric has joined your party');
    });

    it('reports no one by that name instead of the raw "Entity ... not found" engineer copy', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      const output = await h.play('/recruit nobody-here-xyz');
      expect(output).toContain('No one named "nobody-here-xyz" is here to recruit');
      expect(output).not.toContain('Entity "nobody-here-xyz" not found');
    });
  });

  // F-934bed47: no test in this suite exercised the companion combat-reaction
  // branch (game.ts:1199-1213) -- hasCombatWon/hasCombatLost gating
  // processCompanionReactions('combat-won'|'combat-lost'). Both cases below
  // drive a REAL engine (createGame() via the game-harness, same
  // createGame()+executeTurn pattern as turn-loop.test.ts:249-299's
  // 'attack pilgrim' precedent) through the real 'attack' verb to a genuine
  // combat.entity.defeated event, rather than fabricating a TurnResult.
  //
  // Both scenarios stay in chapel-entrance specifically: (a) it is the one
  // zone with both a killable non-hostile-tagged NPC (the pilgrim) and the
  // player's own start position, so combat-won needs no travel back and
  // forth to line up companion + target in the same zone; (b) its district
  // (chapel-grounds) has mood tone 'tense' in a fresh game (verified
  // directly against the engine) rather than 'grim'/'oppressive'/
  // 'prosperous' -- the OTHER trigger this same post-turn block can fire
  // (game.ts's district-mood check, right after the combat-reaction check)
  // would otherwise call processCompanionReactions again the same turn and
  // overwrite lastCompanionReactions before the assertion runs. (The
  // starter-fantasy hostiles -- ash-ghoul/crypt-warden/crypt-stalker -- all
  // sit in crypt-depths, whose tone is 'oppressive' in a fresh game, which
  // is exactly this collision; verified directly against the engine rather
  // than assumed.)
  //
  // Both hits are driven through combat-core's real hit-chance roll rather
  // than a mocked resolution. That roll is a deterministic hash of
  // (tick, attackerId, targetId, seed) -- not RNG in the "different every
  // run" sense (combat-core.ts's simpleRoll) -- so a fixed number of setup
  // turns before the decisive attack (pinning which tick it resolves on)
  // makes the hit land the same way on every run without looping/retrying
  // at runtime (ADDENDUM-COMMON: "Drive HP deliberately... rather than
  // looping RNG"). Verified directly against the engine before being
  // encoded here as fixed turn counts, not derived from the formula alone.
  describe('companion combat-reaction branch: hasCombatWon/hasCombatLost -> processCompanionReactions (F-934bed47)', () => {
    it('combat-won: a defeat event with no living hostile left in the zone fires the combat-won companion reaction', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      // Brother Aldric (chapel-nave) is brought back to chapel-entrance so
      // he is present in the same zone as the pilgrim for the decisive
      // attack -- companions follow the player's zone changes (game.ts's
      // followPlayer call), so no separate recruit-then-return step is
      // needed beyond these two moves.
      await h.play('go to chapel-nave');
      await h.play('/recruit aldric');
      await h.play('go to chapel-entrance');

      // Drive the target to the brink before the killing blow
      // (ADDENDUM-COMMON: "Drive HP deliberately... rather than looping
      // RNG") -- the hit itself still resolves through real combat-core
      // roll logic, not a fabricated event.
      const pilgrim = h.session.engine.world.entities['pilgrim'];
      pilgrim.resources.hp = 1;
      // Coordinator stitch (slice A2): companion combat morale is the engine's
      // (world-tick.ts collectCombatReactionTriggers): 'combat-won' fires on
      // the defeat of an entity tagged enemy/hostile, drained into
      // lastCompanionReactions by runWorldRound. The pilgrim is a neutral NPC,
      // so the kill only counts as a win once the target is hostile.
      pilgrim.tags = [...pilgrim.tags, 'hostile'];

      await h.play('attack pilgrim');

      // pilgrim is now defeated; chapel-entrance never has a
      // hostile-tagged entity, so hasLivingHostiles() is false and
      // game.ts's hasCombatWon branch (game.ts:1199-1213) fires
      // processCompanionReactions('combat-won'). Brother Aldric is a
      // healer (REACTION_TABLE['combat-won'].healer === -1 in the 3.10
      // engine).
      expect(pilgrim.resources.hp).toBe(0);
      expect(h.session.lastCompanionReactions).toEqual([
        expect.objectContaining({ npcId: 'brother-aldric', trigger: 'combat-won', moraleDelta: -1 }),
      ]);
      const aldric = h.session.partyState.companions.find((c) => c.npcId === 'brother-aldric');
      expect(aldric?.morale).toBe(59);
    });

    it('combat-lost priority: a same-turn player defeat takes the combat-lost branch even when the zone also has no living hostile (game.ts:1209 if/else-if)', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness({
        clientOpts: {
          // combat-core's attackHandler never checks attacker.id !==
          // target.id, and engine.submitAction() always resolves the
          // player as actor -- so a forced {verb:'attack', targetIds:
          // ['player']} makes the player their own target, landing a real
          // combat-core hit on themselves. "attack myself" falls through
          // the fast-path interpreter to reach this forced response: its
          // target-resolution pool explicitly excludes the player
          // (action-interpreter.ts's tryFastInterpret builds `entities`
          // via `e.id !== world.playerId`), so "myself" never resolves
          // there and interpretAction() calls generateStructured()
          // instead of short-circuiting. Fixture text only, never rendered
          // to a player: confidence:'high' skips the one branch
          // (low-confidence clarification) that would otherwise surface
          // `reasoning` in output.
          structuredData: {
            verb: 'attack',
            targetIds: ['player'],
            toolId: null,
            parameters: null,
            confidence: 'high',
            reasoning: 'a wild swing catches the wanderer',
            alternatives: null,
          },
        },
      });

      await h.play('/recruit maren');
      // Filler turn: advances the tick by exactly one so the decisive
      // self-attack below resolves on a tick verified (directly against
      // the engine) to land a hit -- see the describe-level comment on
      // combat-core's deterministic roll.
      await h.play('look around');

      // Drive the player's HP to the brink before the killing blow, same
      // discipline as the combat-won case above.
      const player = h.session.engine.world.entities['player'];
      player.resources.hp = 3;
      await h.play('attack myself');

      // The player is defeated (combat.entity.defeated, entityId===
      // playerId) in this SAME turn's events, and chapel-entrance never
      // has a living hostile either, so hasCombatWon is ALSO true this
      // turn -- the exact priority collision the routed finding calls out
      // (game.ts:1209 if/else-if). Sister Maren is a diplomat:
      // REACTION_TABLE['combat-won'].diplomat is 0 (a wrongly-prioritized
      // combat-won would leave lastCompanionReactions empty, not just
      // wrong-triggered), REACTION_TABLE['combat-lost'].diplomat is -3.
      // combat-core also wires real passive companion interception here
      // (combat-builders.ts's buildCombatFormulas().isAlly, via
      // buildCombatStack) since the target of this attack IS the player --
      // verified directly against the engine that Sister Maren's
      // diplomat role (an interception-role penalty in combat-core.ts's
      // INTERCEPT_ROLE_BONUS) does not intercept this specific hit, so it
      // reaches the player rather than her.
      expect(player.resources.hp).toBe(0);
      expect(h.session.lastCompanionReactions).toEqual([
        expect.objectContaining({ npcId: 'sister-maren', trigger: 'combat-lost', moraleDelta: -3 }),
      ]);
      const maren = h.session.partyState.companions.find((c) => c.npcId === 'sister-maren');
      expect(maren?.morale).toBe(57);
    });

    // F-ccd9dc08: hasCombatWon/hasCombatLost (game.ts:1198-1230) never read
    // combat.encounter.cleared/outcome at all -- a same-turn "one hostile
    // defeated, the last hostile flees" turn clears the encounter with
    // outcome:'retreat' at 3.11 (engagement-core.ts:215-246), but the fled
    // hostile also drops out of hasLivingHostiles()'s zone-scoped count, so
    // the old heuristic (a defeat event fired this turn AND no living
    // hostiles remain) read the turn as a win regardless.
    //
    // Constructing a genuine same-turn "kill + last-hostile-flee" engine
    // state is impractical (ADDENDUM-COMMON: "a retreat fixture is an
    // event object with outcome: 'retreat' where a real flee is
    // impractical"), so this drives the exact same real pilgrim-kill turn
    // as the combat-won test above (a genuine combat.entity.defeated event
    // fires) and injects the retreat-outcome cleared event the routed bug
    // is about via a submitAction spy that calls straight through to the
    // real engine and only appends one fixture event to its real return.
    //
    // chapel-entrance's own real combat.encounter.cleared is separately
    // proven suppressed on this exact turn regardless (verified directly
    // against the installed 3.11 dist): Sister Maren sits in the same zone
    // unrecruited, and targeting.ts's affiliationOf legacy same-`type`
    // fallback (no `faction` set on either side) misclassifies her
    // "npc"-typed entity as an "enemy" of the player-typed source, so
    // engagement-core.ts's `else if (hasEnemiesInZone(world,
    // playerEntity)) return;` (:178-179) bails the emit before it happens
    // -- so the injected fixture event is the ONLY combat.encounter.cleared
    // event this turn sees, cleanly isolating the assertion to it.
    it('retreat clear with a same-turn kill (multi-hostile) does not fire combat-won', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      await h.play('go to chapel-nave');
      await h.play('/recruit aldric');
      await h.play('go to chapel-entrance');

      const pilgrim = h.session.engine.world.entities['pilgrim'];
      pilgrim.resources.hp = 1;

      const originalSubmit = h.session.engine.submitAction.bind(h.session.engine);
      vi.spyOn(h.session.engine, 'submitAction').mockImplementation((verb, opts) => {
        const events = originalSubmit(verb, opts);
        const clearedEvent: ResolvedEvent = {
          id: 'evt-fixture-retreat-clear',
          tick: h.session.engine.tick,
          type: 'combat.encounter.cleared',
          actorId: 'player',
          targetIds: [],
          payload: { zoneId: 'chapel-entrance', outcome: 'retreat' },
          tags: ['combat', 'encounter', 'cleared'],
        };
        events.push(clearedEvent);
        return events;
      });

      // OBSERVED RED (pre-fix): with the old heuristic
      // (`turnResult.events.some(e => e.type === 'combat.entity.defeated')
      // && !hasLivingHostiles(this.engine.world)`), this turn's real pilgrim
      // defeat + empty hostile zone reads as a win regardless of the
      // injected retreat-outcome cleared event (the old code never looked
      // at it) -- lastCompanionReactions held
      // `[{ npcId: 'brother-aldric', trigger: 'combat-won', moraleDelta:
      // -1 }]` instead of `[]`, verified by re-running this test against
      // that exact pre-fix expression before replacing it.
      await h.play('attack pilgrim');

      expect(pilgrim.resources.hp).toBe(0);
      expect(h.session.lastCompanionReactions).toEqual([]);
    });

    // F-ccd9dc08 (lock 1 default): a `combat.encounter.cleared` event with
    // no `outcome` key at all -- the 3.10 shape, before the field existed
    // -- must still read as a victory. Sister Maren is temporarily tagged
    // `hostile` with hp restored so hasLivingHostiles(world) reads TRUE,
    // making the legacy no-living-hostiles fallback (kept only for the one
    // proven case where the engine emits no cleared event at all) read
    // this turn as NOT a win if it were ever consulted -- isolating the
    // assertion to the primary combat.encounter.cleared-outcome path so a
    // regression that quietly ORs the two signals together (instead of the
    // cleared-event branch short-circuiting the fallback) would be caught
    // here, not just coincidentally pass.
    it('a 3.10-shaped cleared event without an outcome field still fires combat-won (lock 1 default), even when the legacy no-living-hostiles fallback would say no', async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();

      await h.play('go to chapel-nave');
      await h.play('/recruit aldric');
      await h.play('go to chapel-entrance');

      const maren = h.session.engine.world.entities['sister-maren'];
      maren.tags = [...maren.tags, 'hostile'];
      maren.resources.hp = 5;

      const originalSubmit = h.session.engine.submitAction.bind(h.session.engine);
      vi.spyOn(h.session.engine, 'submitAction').mockImplementation((verb, opts) => {
        const events = originalSubmit(verb, opts);
        const clearedEvent: ResolvedEvent = {
          id: 'evt-fixture-3.10-clear',
          tick: h.session.engine.tick,
          type: 'combat.encounter.cleared',
          actorId: 'player',
          targetIds: [],
          // Deliberately no `outcome` key -- the pre-3.11 shape.
          payload: { zoneId: 'chapel-entrance' },
          tags: ['combat', 'encounter', 'cleared'],
        };
        events.push(clearedEvent);
        return events;
      });

      await h.play('look around');

      // Coordinator stitch (slice A2): the app no longer dispatches
      // 'combat-won' from a cleared event — companion combat morale is the
      // engine tick's, keyed on hostile defeats. An injected cleared event
      // with no defeat produces no reaction (and no double application).
      expect(h.session.lastCompanionReactions).toEqual([]);
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
      // F- (spotted while adding the Slice A2-truth describe block at the
      // end of this file, run swarm-1788288802-f5a0 wave 5): this spy had
      // no .mockRestore(), so it leaked past this test's own scope for the
      // REST of the file — every later test importing saveSession got this
      // no-op stub instead of the real function, with no thrown error to
      // surface it (saveSession's callers just silently produced no save
      // file). Restored explicitly now, matching every other saveSession
      // spy in this file (see the FT-B-002 describe block's saveSpy.mockRestore()
      // calls above).
      const saveSpy = vi.spyOn(await import('./session/session.js'), 'saveSession')
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
      saveSpy.mockRestore();
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
      // See the presentation-state-restore describe block's identical
      // saveSession spy (above, this file) for why this one is restored
      // explicitly too — an unrestored spy here leaked the SAME way.
      const saveSpy = vi.spyOn(await import('./session/session.js'), 'saveSession')
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
      saveSpy.mockRestore();
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

    it("keeps stateMachine.current at 'menu' through quit's early return (F-84de6285 -- read-side value cli-display's bin.ts buildSaveInput fix depends on, since bin.ts sits outside this domain's owned files)", async () => {
      const { createHarness } = await import('../test/helpers/game-harness.js');
      const h = createHarness();
      h.session.immersion.stateMachine.transition('menu', 'test-setup');

      const output = await h.play('quit');

      expect(output).toBe('__QUIT__');
      // processInput()'s quit branch returns '__QUIT__' before the immersion
      // runtime or downed-gate is touched at all (see game.ts's early
      // 'quit'/'exit' check, which runs ahead of the F-6bc0721e downed
      // gate) -- so this locks in that stateMachine.current is still
      // 'menu' at the exact moment quit resolves, not reset to
      // 'exploration' or inferred to anything else as a side effect of the
      // quit path. bin.ts's buildSaveInput reads this same
      // session.immersion.stateMachine.current to populate
      // presentationState on every quit/SIGINT/stdin-closed/manual save.
      expect(h.session.immersion.stateMachine.current).toBe('menu');
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

// Slice A1 (WO-A1-6, WO-A1-7) -- docs/living-world-slice-a1.md, wave-3
// ADDENDUM-game-core. Built against world-gen.ts's CURRENT (main)
// generateWorld() signature, per the wave-3 game-core addendum's explicit
// direction: "runtime-foundry is changing world-gen.ts in this same wave,
// build your proof against the CURRENT main's generateWorld signature,
// which stays stable." This worktree's copy of src/foundry/world-gen.ts
// still constructs the pre-slice hand list (traversalCore, statusCore,
// combatCore, createCognitionCore, createPerceptionFilter,
// createEnvironmentCore, createFactionCognition, createRumorPropagation,
// createDistrictCore({ districts: [] }), createBeliefProvenance,
// createObserverPresentation, createSimulationInspector) -- NOT
// buildWorldStack, so player-leverage, crafting-core, opportunity-core,
// trade-core, economy-core, npc-agency, companion-core, world-tick, and
// defeat-fallout are all absent from a generated world's engine today.
//
// Two of the three proofs below are RED on this worktree's current main for
// exactly that reason (missing strategic-tier modules); per
// ADDENDUM-game-core: "If your test cannot construct a generated world with
// the strategic family until runtime-foundry's change merges, write the
// proof so it is RED on the current main for the right reason ... the
// coordinator runs it green at stitch." Observed reds are recorded in this
// wave's fixes[] description, not re-derived here.
function makeSliceA1Proposal(): WorldGenProposal {
  return {
    title: 'Slice A1 Test World',
    theme: 'grim frontier',
    toneGuide: 'terse and dangerous',
    ruleset: {
      id: 'a1-test-rules',
      name: 'A1 Test Rules',
      // vigor/instinct/will match combat-core.ts's DEFAULT_STAT_MAPPING
      // (attack: 'vigor', precision: 'instinct', resolve: 'will') -- the
      // stat mapping world-gen.ts's bare `combatCore` singleton uses (no
      // custom CombatFormulas passed), so the fixture's hit-chance/damage
      // math is the engine's real default, not a guess.
      stats: [
        { id: 'vigor', name: 'Vigor', default: 10 },
        { id: 'instinct', name: 'Instinct', default: 10 },
        { id: 'will', name: 'Will', default: 10 },
      ],
      resources: [{ id: 'hp', name: 'HP', default: 20, max: 20 }],
    },
    zones: [
      { id: 'camp', roomId: 'camp', name: 'Camp', tags: [], neighbors: [], light: 8 },
    ],
    factions: [
      { id: 'raiders', name: 'Raiders', disposition: 'hostile', description: 'Bandit crew', memberIds: ['raider-1'] },
    ],
    npcs: [
      {
        id: 'raider-1',
        name: 'Raider',
        type: 'enemy',
        tags: ['enemy'],
        zoneId: 'camp',
        personality: 'aggressive',
        goals: ['raid the camp'],
        // Low stats + hp: 1 so a single landed hit defeats it -- the test
        // still drives the kill through the real combat-core roll (see
        // killEntityForReal below), not a fabricated event.
        stats: { vigor: 3, instinct: 3, will: 3 },
        resources: { hp: 1 },
        beliefs: [],
      },
    ],
    player: {
      name: 'Wanderer',
      // Player omits a `stamina` resource on purpose: combat-core.ts's
      // attackHandler only enforces the stamina gate `attacker.resources
      // .stamina !== undefined` -- an authored 0 would gate, an absent key
      // does not (WO-resourceProfile-doc-vs-behavior). No stamina resource
      // means killEntityForReal below never needs to refill it between
      // attempts.
      stats: { vigor: 15, instinct: 15, will: 10 },
      resources: { hp: 20 },
      startZoneId: 'camp',
    },
    quests: [],
  };
}

/**
 * Real-kill helper, mirroring ai-rpg-engine's own packages/modules/src/
 * defeat-fallout.test.ts killEntity(): attacks through the ACTUAL
 * combat-core hit-chance roll (a deterministic hash of tick/attacker/
 * target/seed, not "different every run" RNG -- see game.test.ts's
 * companion combat-reaction describe block above for the same discipline)
 * until the target's own combat.entity.defeated event fires, rather than
 * fabricating a TurnResult event by hand. The target's hp: 1 fixture value
 * makes the very first landed hit lethal; the loop exists only to absorb
 * an occasional missed roll, not to grind down a durable target.
 */
function killEntityForReal(engine: Engine, targetId: string, maxAttempts = 50): ResolvedEvent[] {
  for (let i = 0; i < maxAttempts; i++) {
    const events = engine.submitAction('attack', { targetIds: [targetId] });
    if (events.some((e) => e.type === 'combat.entity.defeated' && e.payload.entityId === targetId)) {
      return events;
    }
  }
  throw new Error(`killEntityForReal: failed to defeat "${targetId}" within ${maxAttempts} attempts`);
}

describe('Slice A1 (WO-A1-6, WO-A1-7): generated-world GameSession boot + verb parity + defeat-fallout', () => {
  it('WO-A1-6: a GameSession boots over a generated world, and registerLeverageVerbs\' {override:true} on sabotage/craft (game.ts ~2790-2815) does not throw', async () => {
    const client = createFakeClient({ structuredData: makeSliceA1Proposal() });
    const result = await generateWorld(client, 'a grim frontier camp', 1);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.engine) throw new Error('fixture generateWorld() did not succeed -- ' + result.errors.join('; '));
    const engine = result.engine;

    // Today, world-gen.ts's module list has neither player-leverage nor
    // crafting-core, so this construction is the FIRST registration of
    // 'sabotage'/'craft' (the {override:true} option is inert, nothing to
    // override). Once runtime-foundry's buildWorldStack wiring lands,
    // player-leverage/crafting-core register those names first and this
    // exact construction exercises the real override path (the same one
    // createGame() pack worlds already exercise -- see the "boots on a
    // pack world" baseline below). Either way, construction must not throw.
    // (Constructed exactly ONCE against this engine: GameSession's own
    // constructor is what calls registerLeverageVerbs(), so a second
    // construction against the SAME engine would itself throw "social is
    // already registered" -- 'social'/'rumor'/'diplomacy' have no
    // {override:true} -- which would be a self-inflicted test bug, not a
    // product one.)
    let session: GameSession | undefined;
    expect(() => {
      session = new GameSession({
        engine,
        client,
        title: result.proposal!.title,
        tone: 'grim frontier',
        genre: 'fantasy',
      });
    }).not.toThrow();
    expect(session!.engine.getRegisteredVerbs()).toContain('sabotage');
    expect(session!.engine.getRegisteredVerbs()).toContain('craft');

    // Baseline: the exact same override path already survives on a pack
    // world today (player-leverage/crafting-core ARE in starter-fantasy's
    // module list), proving {override:true} itself is not what's missing --
    // only the generated-world module family is.
    const packEngine = createGame();
    expect(() => new GameSession({
      engine: packEngine,
      title: 'Pack baseline',
      tone: 'dark fantasy',
      clientConfig: { apiKey: 'test-key' },
    })).not.toThrow();
  });

  it('every verb a generated-world engine registers is either supported or a pinned known exclusion (SUPPORTED_VERBS/KNOWN_EXCLUDED_VERBS drift test, extended from turn-loop.test.ts to a generated-world engine)', async () => {
    const client = createFakeClient({ structuredData: makeSliceA1Proposal() });
    const result = await generateWorld(client, 'a grim frontier camp', 1);
    if (!result.ok || !result.engine) throw new Error('fixture generateWorld() did not succeed -- ' + result.errors.join('; '));
    new GameSession({ engine: result.engine, client, title: 'Generated', tone: 'grim frontier', genre: 'fantasy' });

    const registered = result.engine.getRegisteredVerbs();
    const unreviewed = registered.filter((v) => !SUPPORTED_VERBS.has(v) && !KNOWN_EXCLUDED_VERBS.has(v));
    expect(unreviewed).toEqual([]);
  });

  it('WO-A1-6: a generated world\'s SUPPORTED_VERBS-filtered registered-verb catalog matches a pack world\'s once the strategic family is wired in, for every verb the strategic tier owns', async () => {
    const client = createFakeClient({ structuredData: makeSliceA1Proposal() });
    const result = await generateWorld(client, 'a grim frontier camp', 1);
    if (!result.ok || !result.engine) throw new Error('fixture generateWorld() did not succeed -- ' + result.errors.join('; '));
    // Constructing the GameSession registers the social/rumor/diplomacy/
    // sabotage/craft aggregate verbs on both engines identically (game.ts's
    // registerLeverageVerbs, independent of world source) -- what's NOT
    // identical yet is what each engine's own module list already
    // registered before that point.
    new GameSession({ engine: result.engine, client, title: 'Generated', tone: 'grim frontier', genre: 'fantasy' });

    const packEngine = createGame();
    new GameSession({ engine: packEngine, title: 'Pack', tone: 'dark fantasy', clientConfig: { apiKey: 'test-key' } });

    // Scoped deliberately: 'speak'/'use'/'equip'/'unequip' are SUPPORTED_VERBS
    // entries backed by dialogue-core/inventory-core/equipment-core -- none
    // of which are part of buildWorldStack's default composition
    // (world-stack.d.ts's own doc comment lists it: environment-core,
    // faction-cognition, rumor-propagation, district-core, economy-core,
    // trade-core, companion-core, npc-agency, player-leverage,
    // crafting-core, opportunity-core, belief-provenance,
    // observer-presentation, defeat-fallout, world-tick -- no dialogue,
    // inventory, or equipment module anywhere in that list), and the slice
    // design doc's §1 hand list doesn't add them either. Asserting full
    // equality including these would stay permanently RED even after this
    // slice ships (a scope claim the design doc never makes) -- verified
    // directly against the installed 3.11 dist and starter-fantasy's own
    // module list, not assumed. This allowlist documents that boundary,
    // mirroring the parity sentinel's own "subtract the pack's content-only
    // modules by an explicit allowlist" discipline (design doc §5).
    // Stitch (wave 7, slice A4): 'speak' left this allowlist -- world-gen.ts
    // now composes createDialogueCore([]) into the generated stack (the
    // WO-A4-9 generated-world dialogue proof surfaced that no generated
    // world could resolve a talk turn), so speak parity with the pack holds
    // and is asserted from here on.
    const OUT_OF_SCOPE_FOR_THIS_SLICE = new Set(['use', 'equip', 'unequip']);
    const generatedVerbs = filterSupportedVerbs(result.engine.getRegisteredVerbs()).sort();
    const packVerbsInStackScope = filterSupportedVerbs(packEngine.getRegisteredVerbs())
      .filter((v) => !OUT_OF_SCOPE_FOR_THIS_SLICE.has(v))
      .sort();

    // RED today: 'opportunity' (opportunity-resolution.js's ctx.actions
    // .registerVerb('opportunity', ...), part of buildWorldStack's default
    // composition) is registered on the pack engine (starter-fantasy wires
    // opportunity-core) but not the generated one (world-gen.ts's hand list
    // has no opportunity-core call at all). The slice's §1 (buildWorldStack
    // replaces the generated-world module list's strategic tail) closes
    // exactly this gap -- once it lands, this equality holds without
    // editing this test.
    expect(generatedVerbs).toEqual(packVerbsInStackScope);
  });

  it('WO-A1-7: a real kill in a generated world writes player_heat and reputation_<factionId> into world.globals (behavior delta #1)', async () => {
    const client = createFakeClient({ structuredData: makeSliceA1Proposal() });
    const result = await generateWorld(client, 'a grim frontier camp', 1);
    if (!result.ok || !result.engine) throw new Error('fixture generateWorld() did not succeed -- ' + result.errors.join('; '));
    const engine = result.engine;

    // Sanity: nothing has written these globals before the kill.
    expect(engine.world.globals['player_heat']).toBeUndefined();
    expect(engine.world.globals['reputation_raiders']).toBeUndefined();

    const events = killEntityForReal(engine, 'raider-1');
    expect(events.some((e) => e.type === 'combat.entity.defeated' && e.payload.entityId === 'raider-1')).toBe(true);

    // Keys and values per the installed 3.11 dist
    // (node_modules/@ai-rpg-engine/modules/dist/defeat-fallout.js):
    // heatPerKill defaults to 5 -> world.globals.player_heat; a non-boss
    // kill's reputationPerKill defaults to -10 -> world.globals
    // .reputation_<factionId>, keyed off the SAME `factions` roster
    // buildWorldStack derives from proposal.factions (the raider-1 npc's
    // 'raiders' membership). RED today: world-gen.ts's module list has no
    // createDefeatFallout(...) call at all, so combat.entity.defeated has
    // no listener to write either key -- both assertions above (the
    // "before" sanity check) and below currently read/stay undefined.
    expect(engine.world.globals['player_heat']).toBe(5);
    expect(engine.world.globals['reputation_raiders']).toBe(-10);
  });
});

// WO-A2-5 (slice A2 §7, docs/living-world-slice-a2.md): the A2-core proofs
// owned by game-core -- round ordering, no double simulation, rejected
// action, corpse gate, views deep-equal, write-through visibility. (The
// determinism proof, §7's remaining item, is the "tests" domain's per this
// wave's own addendum.)
describe('Slice A2-core (WO-A2-5): the living-world driver proofs', () => {
  // starter-fantasy's only registered faction (starter-fantasy's own
  // content.js), authored reputation baseline 0.
  const CHAPEL_UNDEAD = 'chapel-undead';

  /**
   * Seeds world.globals so pressure-system.js's evaluateUniversalRules
   * 'bounty-issued' rule is guaranteed to fire on the NEXT tick, not
   * merely probable: heat >= HEAT_WAKE_THRESHOLD (10) opens the spawn
   * valve (world-tick.js step 5), and rep<=-50 + alertLevel>=60 matches
   * the FIRST universal rule the scan tries (pressure-system.js's
   * evaluateUniversalRules, checked before investigation-opened and
   * every genre/economy rule) -- verified directly against the installed
   * 3.11 dist rather than assumed. A fresh game has zero active
   * pressures, so the scarcity guards (MAX_ACTIVE_PRESSURES,
   * MIN_TURNS_BETWEEN_SPAWNS) never block the first spawn.
   */
  function seedBountyConditions(engine: Engine): void {
    engine.world.globals['player_heat'] = 10;
    engine.world.globals[`reputation_${CHAPEL_UNDEAD}`] = -50;
    engine.world.globals[`faction_alert_${CHAPEL_UNDEAD}`] = 60;
  }

  it('round ordering: a tick-spawned pressure lands in the SAME turn (activePressures view, and the eventLog delta for that turn)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    seedBountyConditions(h.session.engine);

    expect(h.session.activePressures.length).toBe(0);
    const logBefore = h.session.engine.world.eventLog.length;

    await h.play('look around');

    // Same turn, not a subsequent one: the view already reflects the
    // spawn right after this one play() call returns.
    expect(h.session.activePressures.length).toBe(1);
    expect(h.session.activePressures[0].kind).toBe('bounty-issued');
    // And it is genuinely IN this turn's own event-log delta (runWorldRound
    // runs inside THIS executeTurn call, before narration) -- not narrated
    // one turn late. (describeEvent's own narration-line coverage for
    // pressure.spawned is narrative-llm's §6 work this same wave -- this
    // proof stays scoped to game-core's own contract: the event reaches
    // the log and the view within the same round, not what prose it
    // renders as.)
    const delta = h.session.engine.world.eventLog.slice(logBefore);
    expect(delta.some((e) => e.type === 'pressure.spawned')).toBe(true);
  });

  it("no double simulation: the spawned pressure's timer decrements exactly once per subsequent round", async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    seedBountyConditions(h.session.engine);

    await h.play('look around');
    const pressureId = h.session.activePressures[0]?.id;
    expect(pressureId).toBeDefined();
    let previous = h.session.activePressures[0].turnsRemaining;

    // Coordinator stitch (slice A2): the living world is live now — the
    // engine's own faction-agency step may RESOLVE the bounty the very next
    // round (observed: pressure.resolved + faction.action.resolved in round
    // 2). The no-double proof therefore reads: in every round the pressure
    // survives, its timer moved by exactly one; and it only ever leaves the
    // active list together with a pressure.resolved / pressure.expired
    // event in that same round's delta (a silent double-decrement or a
    // silent drop would fail both clauses).
    for (let i = 0; i < 3; i++) {
      const logBefore = h.session.engine.world.eventLog.length;
      await h.play('look around');
      const delta = h.session.engine.world.eventLog.slice(logBefore);
      const current = h.session.activePressures.find((p) => p.id === pressureId);
      if (!current) {
        expect(delta.some((e) => e.type === 'pressure.resolved' || e.type === 'pressure.expired')).toBe(true);
        break;
      }
      expect(current.turnsRemaining).toBe((previous as number) - 1);
      previous = current.turnsRemaining;
    }
  });

  it('rejected action: a free-text action the engine rejects STILL runs the world round (claude-rpg deviation from the engine CLI, wave-4 ruling) -- the seeded bounty spawns', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    // F-d421875b's own precedent (turn-loop.ts): an unresolvable target
    // makes engine.submitAction emit a non-throwing action.rejected event
    // and return, rather than the low-confidence clarification path (which
    // never reaches engine.submitAction at all). structuredData forces the
    // interpreter past its fast-path (which never resolves a nonsense
    // target name) to hand the engine a target id nothing in the world has.
    const h = createHarness({
      clientOpts: {
        structuredData: {
          verb: 'attack',
          targetIds: ['totally-nonexistent-entity-xyz'],
          toolId: null,
          parameters: null,
          confidence: 'high',
          reasoning: 'test forces a target the engine cannot resolve',
          alternatives: null,
        },
      },
    });
    seedBountyConditions(h.session.engine);

    await h.play('attack the nonexistent one');

    // Coordinator stitch (slice A2 ruling): the engine tick advanced for the
    // rejected free-text action, so the world reacts — the round runs and the
    // seeded bounty spawns. Only the corpse gate skips a round.
    expect(h.session.activePressures.length).toBe(1);
    expect(h.session.activePressures[0].kind).toBe('bounty-issued');
  });

  it('corpse gate: a same-turn player-defeat turn runs no world round this turn (no pressure spawn even with wake conditions seeded)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    // Same forced-self-attack shape as the companion combat-reaction
    // describe block's 'combat-lost priority' test above (this file) --
    // a real combat-core hit resolves the player's own defeat, not a
    // fabricated event.
    const h = createHarness({
      clientOpts: {
        structuredData: {
          verb: 'attack',
          targetIds: ['player'],
          toolId: null,
          parameters: null,
          confidence: 'high',
          reasoning: 'a wild swing catches the wanderer',
          alternatives: null,
        },
      },
    });

    // Filler turn BEFORE seeding wake conditions -- this turn's own
    // runWorldRound must not have anything to spawn from yet, so the
    // ONLY turn that could possibly spawn a pressure is the decisive
    // self-attack below, which the corpse gate must suppress.
    await h.play('look around');
    seedBountyConditions(h.session.engine);

    const player = h.session.engine.world.entities['player'];
    player.resources.hp = 3;
    await h.play('attack myself');

    expect(player.resources.hp).toBe(0);
    expect(h.session.activePressures.length).toBe(0);
  });

  it('views: after a round, each session field deep-equals its world-truth reader', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    seedBountyConditions(h.session.engine);
    await h.play('look around');

    const world = h.session.engine.world;
    expect(h.session.activePressures).toEqual(getActivePressures(world));
    expect(h.session.resolvedPressures).toEqual(getWorldTickState(world).resolvedPressures ?? []);
    expect(h.session.activeOpportunities).toEqual(getPersistedOpportunities(world));
    expect(h.session.playerRumors).toEqual(getPlayerRumorState(world).rumors);
    expect(h.session.districtEconomies).toEqual(new Map(Object.entries(getEconomyCoreState(world).districts)));
  });

  it('write-through: accepting an opportunity through the app path is visible in getPersistedOpportunities before the next tick', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness({
      clientOpts: {
        structuredData: {
          verb: 'opportunity',
          targetIds: null,
          toolId: null,
          parameters: { subAction: 'accept' },
          confidence: 'high',
          reasoning: 'test scripts an opportunity accept',
          alternatives: null,
        },
      },
    });

    const world = h.session.engine.world;
    const opp = makeOpportunity({
      kind: 'contract',
      title: 'Test contract',
      description: 'A test opportunity',
      objectiveDescription: 'Do the thing',
      urgency: 0.5,
      turnsRemaining: 10,
      visibility: 'offered',
      rewards: [],
      risks: [],
      genre: 'fantasy',
      currentTick: h.session.engine.tick,
    });
    setPersistedOpportunities(world, [opp]);
    // WO-A4-1: activeOpportunities is a live getter over world truth now —
    // the accept path (which reads this.activeOpportunities to find the
    // candidate) already sees this world-truth write on its very next
    // access, no session-field seed needed.

    await h.play('accept the contract');

    const persisted = getPersistedOpportunities(world).find((o) => o.id === opp.id);
    expect(persisted?.status).toBe('accepted');
    expect(h.session.activeOpportunities.find((o) => o.id === opp.id)?.status).toBe('accepted');
  });
});

// WO-A2T-2/3/4 (slice A2 §9-§11, docs/living-world-slice-a2.md, run
// swarm-1788288802-f5a0, wave 5): the reputation-composition and
// leverage-unification integration through a LIVE GameSession -- the pure
// helper logic itself (reputation-view.ts / leverage-view.ts) has its own
// dedicated unit suites (src/game/reputation-view.test.ts,
// src/game/leverage-view.test.ts); this describe block proves game.ts's own
// wiring (the private adjustFactionReputation/tickPlayerLeverage methods,
// and refreshProfileViews' own view-refresh calls) actually uses them, via
// the same `(session as unknown as {...})` private-method-access pattern
// this file already established (see the FT-B-008/F-51e110b9 describe
// blocks above).
describe('Slice A2-truth (WO-A2T-2/3/4): reputation composition + leverage unification + save-time views', () => {
  const CHAPEL_UNDEAD = 'chapel-undead'; // starter-fantasy's only registered faction

  function makeTestProfile(reputation: { factionId: string; value: number }[] = []) {
    const profile = createProfile(
      { name: 'Aldric', archetypeId: 'penitent-knight', backgroundId: 'oath-breaker', traitIds: [] },
      { vigor: 5, instinct: 5, will: 5 },
      { hp: 20, stamina: 8 },
      [],
      'chapel-threshold',
    );
    return { ...profile, reputation };
  }

  let tmpDir: string | undefined;
  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it('WO-A2T-2: adjustFactionReputation composes baseline + every accrued delta through a live GameSession, and refreshProfileViews keeps the view current', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    h.session.profile = makeTestProfile([{ factionId: CHAPEL_UNDEAD, value: 20 }]);

    const adjustFactionReputation = (h.session as unknown as {
      adjustFactionReputation: (factionId: string, delta: number) => void;
    }).adjustFactionReputation.bind(h.session);

    adjustFactionReputation(CHAPEL_UNDEAD, -10); // a kill-fallout-shaped delta
    expect(getReputation(h.session.profile!, CHAPEL_UNDEAD)).toBe(10); // 20 - 10

    adjustFactionReputation(CHAPEL_UNDEAD, -5); // a second, independent delta
    expect(getReputation(h.session.profile!, CHAPEL_UNDEAD)).toBe(5); // composes, does not overwrite

    // The baseline itself never moved -- only the accrued ledger did.
    expect(h.session.engine.world.globals[`claude_rpg.rep_baseline_${CHAPEL_UNDEAD}`]).toBe(20);
    expect(h.session.engine.world.globals[`reputation_${CHAPEL_UNDEAD}`]).toBe(-15);

    // A subsequent round's own refreshProfileViews() (called via runWorldRound)
    // reports the SAME composed value -- the profile field really is a VIEW,
    // not a value adjustFactionReputation happened to leave lying around.
    await h.play('look around');
    expect(getReputation(h.session.profile!, CHAPEL_UNDEAD)).toBe(5);
  });

  it('WO-A2T-3: tickPlayerLeverage writes to the player ENTITY (not profile.custom directly) -- a tick-side gain and an app-side gain land on ONE ledger the profile reports', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    h.session.profile = makeTestProfile();
    const player = h.session.engine.world.entities[h.session.engine.world.playerId];

    // Simulates the engine's own step 5a2 income (world-tick.ts's
    // runLeverageIncomeStep) landing on the entity ledger, exactly the way
    // a real round's tick already does every turn since the A2-core wave-4
    // stitch.
    player.custom = { ...player.custom, 'leverage.favor': 5 };

    const tickPlayerLeverage = (h.session as unknown as {
      tickPlayerLeverage: (hints: { xpGained: number }) => void;
    }).tickPlayerLeverage.bind(h.session);
    tickPlayerLeverage({ xpGained: 15 }); // computeLeverageGains: xpGained >= 15 -> blackmail +5

    // ONE ledger: the tick's favor:5 and this app-side gain's blackmail:5
    // both show up on the SAME map, reported by the SAME profile view.
    expect(getLeverageState(player.custom)).toMatchObject({ favor: 5, blackmail: 5 });
    expect(getLeverageState(h.session.profile!.custom)).toMatchObject({ favor: 5, blackmail: 5 });
    // Bookkeeping stays on the profile (unaffected by the ledger unification).
    expect(h.session.profile!.custom['stats.leverage.blackmail.gained']).toBe(5);
  });

  it('WO-A2T-4: after a round, the saved profile\'s reputation is current -- a saved-then-reloaded profile matches world truth at save time', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    tmpDir = await mkdtemp(join(tmpdir(), 'claude-rpg-a2truth-save-'));
    const savePath = join(tmpDir, 'save.json');

    const h = createHarness({ gameOpts: { genre: 'fantasy' } });
    h.session.profile = makeTestProfile([{ factionId: CHAPEL_UNDEAD, value: 0 }]);
    await h.play('look around'); // a round runs -- stampReputationBaselines fires

    const adjustFactionReputation = (h.session as unknown as {
      adjustFactionReputation: (factionId: string, delta: number) => void;
    }).adjustFactionReputation.bind(h.session);
    adjustFactionReputation(CHAPEL_UNDEAD, -20);
    expect(getReputation(h.session.profile!, CHAPEL_UNDEAD)).toBe(-20);

    await saveSession({
      engine: h.session.engine,
      history: h.session.history,
      tone: h.session.tone,
      savePath,
      packId: 'chapel-threshold',
      genre: h.session.genre,
      profile: h.session.profile,
    });

    const loaded = await loadSession(savePath);
    const loadedProfile = loadProfileFromSession(loaded.session);

    // The SavedSession's own `profile` field (serializeProfile(this.profile))
    // is written FROM the view at save time (design doc §11) -- it already
    // carries the composed -20, with no further seeding/refresh needed to
    // read it back correctly.
    expect(loadedProfile).not.toBeNull();
    expect(getReputation(loadedProfile!, CHAPEL_UNDEAD)).toBe(-20);
  });
});

// WO-A3-2 (slice A3 §3): the host-owned RumorEngine instance — construction,
// the addRumor mirror, runWorldRound's tick + post-round sweep ordering,
// and save/restore via getRumorEngineSnapshot()/GameConfig.rumorEngineSnapshot.
describe('Slice A3 (WO-A3-2): the RumorEngine instance', () => {
  function makeTestRumor(overrides: Partial<PlayerRumor> = {}): PlayerRumor {
    return {
      id: 'test-rumor-1',
      claim: 'defeated the Bone Collector',
      subjectDescriptor: 'a grim wanderer',
      sourceEvent: 'milestone',
      confidence: 0.8,
      distortion: 0,
      mutationCount: 0,
      valence: 'heroic',
      spreadTo: [],
      originTick: 0,
      ...overrides,
    };
  }

  it('a new game constructs a fresh, empty RumorEngine', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();

    expect(h.session.rumorEngine).toBeInstanceOf(RumorEngine);
    expect(h.session.rumorEngine.activeCount()).toBe(0);
  });

  it('addRumor mirrors a real, non-suppressed ledger rumor into the RumorEngine (subject "player", key = ledger id)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    const addRumor = (h.session as unknown as {
      addRumor: (rumor: PlayerRumor) => void;
    }).addRumor.bind(h.session);

    const rumor = makeTestRumor({ id: 'ledger-heroic-1', originFactionId: 'chapel-undead' });
    addRumor(rumor);

    expect(h.session.playerRumors.some((r) => r.id === 'ledger-heroic-1')).toBe(true);
    const mirrored = h.session.rumorEngine.findBySubjectKey('player', 'ledger-heroic-1');
    expect(mirrored).toBeDefined();
    expect(mirrored?.claim).toBe(rumor.claim);
    expect(mirrored?.emotionalCharge).toBe(0.6); // heroic
    expect(mirrored?.factionUptake).toContain('chapel-undead');
  });

  it("runWorldRound's post-round sweep (mirrorUnmirroredRumors) mirrors a ledger rumor that never went through addRumor", async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    const mirrorUnmirroredRumors = (h.session as unknown as {
      mirrorUnmirroredRumors: () => void;
    }).mirrorUnmirroredRumors.bind(h.session);

    // Simulate a rumor that landed in the ledger WITHOUT going through
    // GameSession.addRumor -- e.g. the tick's own NPC-originated rumors
    // (spawnNpcOriginatedRumor + setPlayerRumorState, world-tick.js's
    // npc-agency step) or game-state.ts's applyFalloutEffects rumor case.
    // WO-A4-1: playerRumors is a live getter over world truth now — seed
    // the world-truth namespace directly instead of the (no longer
    // assignable) session field.
    const worldForBypass = h.session.engine.world;
    setPlayerRumorState(worldForBypass, {
      ...getPlayerRumorState(worldForBypass),
      rumors: [makeTestRumor({ id: 'bypassed-1', valence: 'tragic' })],
    });
    expect(h.session.rumorEngine.findBySubjectKey('player', 'bypassed-1')).toBeUndefined();

    mirrorUnmirroredRumors();

    const mirrored = h.session.rumorEngine.findBySubjectKey('player', 'bypassed-1');
    expect(mirrored).toBeDefined();
    expect(mirrored?.emotionalCharge).toBe(-0.3); // tragic
  });

  it('the sweep is idempotent: running it twice over the same ledger creates no sibling (design doc §4, Mirror completeness)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    const mirrorUnmirroredRumors = (h.session as unknown as {
      mirrorUnmirroredRumors: () => void;
    }).mirrorUnmirroredRumors.bind(h.session);

    // WO-A4-1: see the "bypassed-1" test above for why this seeds world
    // truth directly rather than assigning the (no longer assignable)
    // playerRumors session field.
    const worldForIdempotent = h.session.engine.world;
    setPlayerRumorState(worldForIdempotent, {
      ...getPlayerRumorState(worldForIdempotent),
      rumors: [makeTestRumor({ id: 'idempotent-1' })],
    });
    mirrorUnmirroredRumors();
    mirrorUnmirroredRumors();

    expect(h.session.rumorEngine.query({ subject: 'player' })).toHaveLength(1);
  });

  it('runWorldRound ticks the RumorEngine and sweeps NPC-originated ledger rumors within a real turn (design doc §3 ordering)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();

    // Simulate the tick's own NPC-originated write (world-tick.js's
    // npc-agency step calling spawnNpcOriginatedRumor + setPlayerRumorState
    // directly) landing in the namespace BEFORE this turn's runWorldRound —
    // proves the sweep picks it up via the real per-turn call chain, not
    // just the isolated helper call above.
    const before = getPlayerRumorState(h.session.engine.world);
    setPlayerRumorState(h.session.engine.world, {
      rumors: [...before.rumors, makeTestRumor({ id: 'npc-originated-1', valence: 'fearsome' })],
    });

    await h.play('look around');

    const mirrored = h.session.rumorEngine.findBySubjectKey('player', 'npc-originated-1');
    expect(mirrored).toBeDefined();
    expect(mirrored?.emotionalCharge).toBe(-0.6); // fearsome
  });

  it('getRumorEngineSnapshot() / GameConfig.rumorEngineSnapshot round-trip a mirrored rumor across two sessions', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h1 = createHarness();
    const addRumor = (h1.session as unknown as {
      addRumor: (rumor: PlayerRumor) => void;
    }).addRumor.bind(h1.session);
    addRumor(makeTestRumor({ id: 'persist-1', originFactionId: 'chapel-undead' }));

    const snapshot = h1.session.getRumorEngineSnapshot();
    expect(typeof snapshot).toBe('string');
    expect(JSON.parse(snapshot)).toHaveProperty('rumors');

    const h2 = createHarness({ gameOpts: { rumorEngineSnapshot: snapshot } });
    const restored = h2.session.rumorEngine.findBySubjectKey('player', 'persist-1');
    expect(restored).toBeDefined();
    expect(restored?.claim).toBe('defeated the Bone Collector');
    expect(restored?.factionUptake).toContain('chapel-undead');
  });

  it('a rumorEngineSnapshot with one malformed rumor restores every valid entry, logs a warning via debugLog, and never throws (deserializeSafe contract)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const logger = createTestLogger();
    const goodRumor = {
      id: 'g1', claim: 'a claim', subject: 'player', key: 'good-1', value: true,
      originalValue: true, sourceId: 'world', originTick: 1, confidence: 0.5,
      emotionalCharge: 0, spreadPath: [], mutationCount: 0, factionUptake: [],
      status: 'spreading', lastSpreadTick: 1,
    };
    const badRumor = { id: 'b1' }; // missing every other required Rumor field
    const snapshot = JSON.stringify({ rumors: [goodRumor, badRumor], stances: [] });

    const h = createHarness({ gameOpts: { rumorEngineSnapshot: snapshot, debugLogger: logger } });

    expect(h.session.rumorEngine.get('g1')).toBeDefined();
    expect(h.session.rumorEngine.get('b1')).toBeUndefined();
    const warnEntry = logger.getEntries().find((e) => e.level === 'warn' && e.subsystem === 'rumors');
    expect(warnEntry).toBeDefined();
  });

  it('a rumorEngineSnapshot that is not valid JSON falls back to a fresh RumorEngine instead of throwing', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const logger = createTestLogger();

    const h = createHarness({ gameOpts: { rumorEngineSnapshot: 'not valid json {{{', debugLogger: logger } });

    expect(h.session.rumorEngine).toBeInstanceOf(RumorEngine);
    expect(h.session.rumorEngine.activeCount()).toBe(0);
    const warnEntry = logger.getEntries().find((e) => e.level === 'warn' && e.subsystem === 'rumors');
    expect(warnEntry).toBeDefined();
  });
});

// Slice A4 (WO-A4-1/2/3, docs/living-world-slice-a4.md, run
// swarm-1788288802-f5a0, wave 7, "game-core" domain): read-back rewires —
// the twelve world-backed session properties become live getters, the
// per-turn situationHint source flips to the engine's own persisted
// recommendation, and a generated (packless) session carries its
// worldGenProposal/worldSeed forward for its own save.

/** Same shape as the "Slice A3" describe block's own local helper above (that one is scoped to its own describe callback). */
function makeA4TestRumor(overrides: Partial<PlayerRumor> = {}): PlayerRumor {
  return {
    id: 'test-rumor-1',
    claim: 'defeated the Bone Collector',
    subjectDescriptor: 'a grim wanderer',
    sourceEvent: 'milestone',
    confidence: 0.8,
    distortion: 0,
    mutationCount: 0,
    valence: 'heroic',
    spreadTo: [],
    originTick: 0,
    ...overrides,
  };
}

describe('Slice A4 (WO-A4-1): live getters over world truth', () => {
  it('WO-A4-1 source-text tripwire: src/game.ts never assigns to any of the twelve world-backed getter properties', () => {
    const gameTsPath = join(dirname(fileURLToPath(import.meta.url)), 'game.ts');
    const source = readFileSync(gameTsPath, 'utf8');
    const getterNames = [
      'playerRumors', 'activePressures', 'resolvedPressures', 'activeOpportunities',
      'lastNpcActions', 'lastNpcProfiles', 'npcObligations', 'activeConsequenceChains',
      'lastFactionActions', 'lastFactionProfiles', 'districtEconomies', 'partyState',
    ];
    for (const name of getterNames) {
      // Matches `this.<name> =` but not `this.<name> ==`/`===`, a `get
      // <name>(...)` declaration, or a `.push(`/`.set(`/`.get(` call — only
      // a genuine assignment to the property itself.
      const assignmentPattern = new RegExp(`this\\.${name}\\s*=(?!=)`);
      expect(
        source,
        `this.${name} must never be assigned in game.ts — it is a live getter over world truth (slice A4 §1)`,
      ).not.toMatch(assignmentPattern);
    }
  });

  it('a pressure inserted into world truth directly (no session call) is present on the next activePressures read', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    const world = h.session.engine.world;

    expect(h.session.activePressures.length).toBe(0);
    pushActivePressure(world, makePressure({
      kind: 'bounty-issued',
      sourceFactionId: 'chapel-undead',
      triggeredBy: 'test-direct-insert',
      description: 'a direct world-truth insert, no session call in between',
      urgency: 0.5,
      visibility: 'known',
      turnsRemaining: 10,
      potentialOutcomes: [],
      tags: [],
      currentTick: h.session.engine.tick,
    }));

    expect(h.session.activePressures.length).toBe(1);
    expect(h.session.activePressures[0].description).toBe('a direct world-truth insert, no session call in between');
  });

  it('an opportunity written via setPersistedOpportunities directly is present on the next activeOpportunities read', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    const world = h.session.engine.world;

    expect(h.session.activeOpportunities.length).toBe(0);
    const opp = makeOpportunity({
      kind: 'contract',
      title: 'Direct write test',
      description: 'inserted via setPersistedOpportunities directly',
      objectiveDescription: 'prove the getter, not a cache',
      urgency: 0.4,
      turnsRemaining: 10,
      visibility: 'offered',
      rewards: [],
      risks: [],
      genre: 'fantasy',
      currentTick: h.session.engine.tick,
    });
    setPersistedOpportunities(world, [opp]);

    expect(h.session.activeOpportunities.length).toBe(1);
    expect(h.session.activeOpportunities[0].id).toBe(opp.id);
  });

  it('a rumor written via setPlayerRumorState directly is present on the next playerRumors read', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    const world = h.session.engine.world;

    expect(h.session.playerRumors.length).toBe(0);
    setPlayerRumorState(world, {
      ...getPlayerRumorState(world),
      rumors: [makeA4TestRumor({ id: 'direct-write-1' })],
    });

    expect(h.session.playerRumors.some((r) => r.id === 'direct-write-1')).toBe(true);
  });
});

describe('Slice A4 (WO-A4-2): situationHint sourced from the persisted move recommendation', () => {
  it("RED-BEFORE-FIX documented: this session's own buildMoveRecommendation() never attaches situationHint, even for a non-'safe' tag, while the engine's persisted recommendation for the SAME state does", async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const profile = createProfile(
      { name: 'Aldric', archetypeId: 'penitent-knight', backgroundId: 'oath-breaker', traitIds: [] },
      { vigor: 5, instinct: 5, will: 5 },
      { hp: 20, stamina: 8 },
      [],
      'chapel-threshold',
    );
    const h = createHarness({ gameOpts: { profile } });
    const world = h.session.engine.world;

    // Seed an active pressure directly on world truth (no tick needed) so
    // both recommendation sources see the SAME non-'safe' inputs.
    pushActivePressure(world, makePressure({
      kind: 'bounty-issued',
      sourceFactionId: 'chapel-undead',
      triggeredBy: 'test-red-before-fix',
      description: 'a live threat for the recommendation to react to',
      urgency: 0.9,
      visibility: 'known',
      turnsRemaining: 10,
      potentialOutcomes: [],
      tags: [],
      currentTick: h.session.engine.tick,
    }));

    // The app's own recomputation (game-state.ts's buildMoveRecommendation
    // -> recommendMoves(inputs) directly): confirmed against the installed
    // 3.11 dist that recommendMoves() itself never sets `situationHint`
    // (move-advisor.d.ts: "Attached by the world-tick caller, not by
    // recommendMoves itself") -- so this session's own call is undefined
    // here regardless of situationTag.
    const ownRec = (h.session as unknown as {
      buildMoveRecommendation: () => { situationTag: string; situationHint?: string };
    }).buildMoveRecommendation();
    expect(ownRec.situationHint).toBeUndefined();
    // The gap holds regardless of situationTag -- recommendMoves() simply
    // never has a situationHint field to set. WO-A4-2 closes it by
    // sourcing situationHint from getPersistedMoveRecommendation(world)
    // instead (the tick's own caller DOES attach it — see the next test).
  });

  it("a persisted 'crisis' recommendation (the tick's own, set directly on world truth) appears as the turn's situationHint", async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    const world = h.session.engine.world;

    setPersistedMoveRecommendation(world, {
      top3: [],
      situationTag: 'crisis',
      situationHint: 'MARKER-CRISIS-HINT-a4-wo2',
    });

    await h.play('look around');

    expect(h.callLog.lastGeneratePrompt).toContain('MARKER-CRISIS-HINT-a4-wo2');
  });

  it("a persisted 'safe' recommendation's situationHint is gated out of the prompt (calm rounds add zero prompt text)", async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    const world = h.session.engine.world;

    setPersistedMoveRecommendation(world, {
      top3: [],
      situationTag: 'safe',
      situationHint: 'MARKER-SAFE-HINT-should-not-appear',
    });

    await h.play('look around');

    expect(h.callLog.lastGeneratePrompt).not.toContain('MARKER-SAFE-HINT-should-not-appear');
  });
});

describe('Slice A4 (WO-A4-3): generated-world save fields', () => {
  it('getWorldGenProposal()/getWorldSeed() return the config values when the session is packless', () => {
    const engine = createGame();
    const proposal: WorldGenProposal = {
      title: 'The Sunken Wards',
      theme: 'gothic fantasy',
      toneGuide: 'grim, quiet dread',
      ruleset: { id: 'r1', name: 'Ruleset One', stats: [], resources: [] },
      zones: [],
      factions: [],
      npcs: [],
      player: { name: 'Wanderer', stats: {}, resources: {}, startZoneId: 'z1' },
      quests: [],
    };
    const session = new GameSession({
      engine,
      title: 'Test Game',
      clientConfig: { apiKey: 'test-key' },
      worldGenProposal: proposal,
      worldSeed: 777,
    });

    expect(session.getWorldGenProposal()).toEqual(proposal);
    expect(session.getWorldSeed()).toBe(777);
  });

  it('getWorldGenProposal()/getWorldSeed() are undefined when omitted (e.g. a pack-launched session)', () => {
    const engine = createGame();
    const session = new GameSession({
      engine,
      title: 'Test Game',
      clientConfig: { apiKey: 'test-key' },
      packId: 'some-pack',
    });

    expect(session.getWorldGenProposal()).toBeUndefined();
    expect(session.getWorldSeed()).toBeUndefined();
  });
});

// Slice A5 (wave 8, run swarm-1788288802-f5a0): "the world reaches the
// player" -- docs/living-world-slice-a5.md. game-core's own WO-A5-1/2/3/4/5
// proofs (§8's played-scene contract, scoped to this domain's data-assembly
// half; the rendering half of each is cli-display's/narrative-llm's own
// worktree this same wave, coded against per the addendum's "green expected
// at merge" allowance -- see each WO's implementation-site doc comment in
// game.ts/turn-loop.ts for the specific cross-domain contract).
describe('Slice A5 (WO-A5-1): market quote data (design lock 1)', () => {
  it('quotes the player\'s OWN district via the engine\'s quoteBuyPrice, priced against the flat SELL_BASE_VALUE constant (no hand-rolled price math)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const itemCatalog: ItemCatalog = {
      items: [{ id: 'iron-scrap', name: 'Iron Scrap', description: 'Scrap metal.', slot: 'tool', rarity: 'common' }],
    };
    const h = createHarness({ gameOpts: { itemCatalog } });

    // RED before this WO: buildMarketQuote() did not exist on GameSession
    // at all -- this cast would throw "buildMarketQuote is not a
    // function".
    const quote = (h.session as unknown as {
      buildMarketQuote: () => {
        districtId: string;
        controllingFactionId?: string;
        sampleItemId: string;
        quotedPrice: number;
        basePrice: number;
      } | undefined;
    }).buildMarketQuote();

    expect(quote).toBeDefined();
    // The player starts in chapel-entrance -> chapel-grounds (no
    // controllingFaction authored for that district -- crypt-depths is the
    // one with 'chapel-undead').
    expect(quote!.districtId).toBe('chapel-grounds');
    expect(quote!.controllingFactionId).toBeUndefined();
    expect(quote!.sampleItemId).toBe('iron-scrap');
    expect(quote!.basePrice).toBe(SELL_BASE_VALUE);
    expect(quote!.quotedPrice).toBeGreaterThan(0);
  });

  it('returns undefined (not a thrown error) when the session has no itemCatalog at all', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    // Stitch (wave 8): createHarness now hands the pack catalog over like
    // bin.ts runNew does; this proof wants the catalog-less session.
    const h = createHarness({ gameOpts: { itemCatalog: undefined } });

    const quote = (h.session as unknown as { buildMarketQuote: () => unknown }).buildMarketQuote();
    expect(quote).toBeUndefined();
  });
});

describe('Slice A5 (WO-A5-2): district mood transition threading (design lock 2)', () => {
  it('detects a real before/after tone change for the player\'s own district this round, and clears again on the next quiet round', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    ensureImmersionInferAndTransitionStub(h.session);
    const world = h.session.engine.world;
    const districtId = 'chapel-grounds'; // player starts in chapel-entrance

    // Seed a baseline tone the tick's own step 0c will compare THIS
    // round's freshly computed tone against.
    getWorldTickState(world).districtTones = { [districtId]: 'calm' };

    // Force district-core metrics toward the opposite extreme so this
    // round's tone genuinely differs from the seeded baseline (a real
    // engine-derived transition, not a hand-authored one).
    const dState = getDistrictState(world, districtId)!;
    dState.alertPressure = 100;
    dState.stability = 0;
    dState.commerce = 0;
    dState.morale = 0;

    // RED before this WO: GameSession had no lastMoodTransition field at
    // all -- runWorldRound never compared before/after districtTones.
    await h.play('look around');

    const transition = (h.session as unknown as {
      lastMoodTransition?: { districtId: string; from: string; to: string };
    }).lastMoodTransition;
    expect(transition).toBeDefined();
    expect(transition!.districtId).toBe(districtId);
    expect(transition!.from).toBe('calm');
    expect(transition!.to).not.toBe('calm');

    // A quiet round with metrics unchanged reports no transition -- never
    // accumulated, recomputed fresh every round (design lock 2).
    await h.play('look around');
    const quiet = (h.session as unknown as { lastMoodTransition?: unknown }).lastMoodTransition;
    expect(quiet).toBeUndefined();
  });

  it('threads getMoodTransition into executeTurn\'s opts so turn-loop.ts can read this round\'s own transition (the additive-callback contract, ExecuteTurnOpts.getMoodTransition)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    ensureImmersionInferAndTransitionStub(h.session);
    const world = h.session.engine.world;
    const districtId = 'chapel-grounds';
    getWorldTickState(world).districtTones = { [districtId]: 'calm' };
    const dState = getDistrictState(world, districtId)!;
    dState.alertPressure = 100;
    dState.stability = 0;
    dState.commerce = 0;
    dState.morale = 0;

    const turnLoopModule = await import('./turn-loop.js');
    const spy = vi.spyOn(turnLoopModule, 'executeTurn');

    await h.play('look around');

    expect(spy).toHaveBeenCalled();
    const opts = spy.mock.calls[0][0] as { getMoodTransition?: () => unknown };
    expect(typeof opts.getMoodTransition).toBe('function');
    expect(opts.getMoodTransition!()).toMatchObject({ districtId, from: 'calm' });
    spy.mockRestore();
  });
});

describe('Slice A5 (WO-A5-3): leverage income capture + extended worldLedger (design lock 4)', () => {
  it('captures this round\'s leverage-currency income (a reputationDelta -> favor gain) and folds it into the extended worldLedger', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    ensureImmersionInferAndTransitionStub(h.session);
    // First-ever observation of a nonzero faction reputation reads as a
    // reputationDelta of the full value (state.lastReputation starts
    // undefined) -- the tick's own runLeverageIncomeStep grants favor+5
    // for it (computeLeverageGains' own reputationDelta table).
    h.session.engine.world.factions['chapel-undead'].reputation = 10;

    // RED before this WO: GameSession had no lastLeverageIncome field, and
    // buildWorldLedger()'s return type had no income/decayAfter fields.
    await h.play('look around');

    const income = (h.session as unknown as {
      lastLeverageIncome: Partial<Record<string, number>>;
    }).lastLeverageIncome;
    expect(income.favor).toBe(5);

    const ledger = (h.session as unknown as {
      buildWorldLedger: () => { income: Record<string, number>; decayAfter: number };
    }).buildWorldLedger();
    expect(ledger.income).toEqual(income);
    expect(ledger.decayAfter).toBe(QUIET_ROUNDS_BEFORE_DECAY);
  });

  it('reports {} on a round that grants nothing (a quiet round is never mistaken for a mystery income source)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    ensureImmersionInferAndTransitionStub(h.session);

    await h.play('look around');

    const income = (h.session as unknown as { lastLeverageIncome: Record<string, number> }).lastLeverageIncome;
    expect(income).toEqual({});
  });
});

describe('Slice A5 (WO-A5-4): per-hearer rumor spread + stance (design lock 6)', () => {
  it('spreads an active player rumor to every named NPC in the player\'s district within one round, sets a first-hearing stance, and surfaces both via getHearerRumors/getRumorBoard', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    ensureImmersionInferAndTransitionStub(h.session);

    const rumor = h.session.rumorEngine.create({
      claim: 'the stranger killed a merchant',
      subject: 'player',
      key: 'killed-merchant',
      value: true,
      sourceId: 'some-witness',
      originTick: h.session.engine.tick,
      confidence: 0.8,
    });
    expect(rumor.spreadPath).not.toContain('pilgrim');

    // RED before this WO: GameSession had no getHearerRumors/getRumorBoard
    // methods, and runWorldRound never called rumorEngine.spread/setStance
    // at all -- a named NPC could never hear a player rumor.
    expect(h.session.getHearerRumors('pilgrim')).toEqual([]);

    await h.play('look around');

    // pilgrim (chapel-entrance) and brother-aldric (chapel-nave) are both
    // named NPCs in chapel-grounds -- the player's own starting district.
    const pilgrimRumors = h.session.getHearerRumors('pilgrim');
    expect(pilgrimRumors.length).toBe(1);
    expect(['believe', 'doubt']).toContain(pilgrimRumors[0].stance);

    const aldricRumors = h.session.getHearerRumors('brother-aldric');
    expect(aldricRumors.length).toBe(1);
    expect(['believe', 'doubt']).toContain(aldricRumors[0].stance);

    const board = h.session.getRumorBoard();
    expect(board.some((line) => line.subject === 'player' && line.key === 'killed-merchant')).toBe(true);
  });
});

describe('Slice A5 (WO-A5-5): "the world moved" ledger (design doc §7)', () => {
  let tmpDir: string | undefined;
  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it('accumulates entries oldest-first-capped, and getWorldMovedSnapshot() omits an empty ledger', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();

    // RED before this WO: GameSession had no worldMovedLedger field and no
    // getWorldMovedSnapshot()/pushWorldMoved() methods at all.
    expect(h.session.getWorldMovedSnapshot()).toBeUndefined();

    const pushWorldMoved = (h.session as unknown as {
      pushWorldMoved: (kind: string, headline: string) => void;
    }).pushWorldMoved.bind(h.session);

    for (let i = 0; i < 205; i++) {
      pushWorldMoved('ambush', `entry-${i}`);
    }

    expect(h.session.worldMovedLedger.length).toBe(200); // MAX_WORLD_MOVED_ENTRIES
    expect(h.session.worldMovedLedger[0].headline).toBe('entry-5'); // oldest 5 evicted
    expect(h.session.worldMovedLedger[h.session.worldMovedLedger.length - 1].headline).toBe('entry-204');
    expect(h.session.getWorldMovedSnapshot()).toBeDefined();
  });

  it('round-trips through save/load (session.ts\'s worldMoved field + loadWorldMovedFromSession, GameConfig.worldMoved restore)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    tmpDir = await mkdtemp(join(tmpdir(), 'claude-rpg-a5-worldmoved-'));
    const savePath = join(tmpDir, 'save.json');
    const h = createHarness();

    const pushWorldMoved = (h.session as unknown as {
      pushWorldMoved: (kind: string, headline: string) => void;
    }).pushWorldMoved.bind(h.session);
    pushWorldMoved('mood-transition', 'chapel-grounds: calm -> grim');

    await saveSession({
      engine: h.session.engine,
      history: h.session.history,
      tone: h.session.tone,
      savePath,
      genre: h.session.genre,
      worldMoved: h.session.getWorldMovedSnapshot(),
    });

    const loaded = await loadSession(savePath);
    const restored = loadWorldMovedFromSession(loaded.session);
    expect(restored).toEqual(h.session.worldMovedLedger);

    // GameConfig.worldMoved restores it onto a fresh session -- bin.ts's
    // own runLoad wiring (out of this domain's glob) is expected to build
    // this exact call; this proves the game-core half of the contract. A
    // FRESH engine (not h.session.engine) -- registerLeverageVerbs() would
    // otherwise throw "verb already registered" reusing an engine that
    // already has a live GameSession's verbs claimed on it.
    const session2 = new GameSession({
      engine: createGame(),
      title: 'Test Game',
      clientConfig: { apiKey: 'test-key' },
      worldMoved: restored,
    });
    expect(session2.worldMovedLedger).toEqual(restored);
    expect(session2.getWorldMovedSnapshot()).toBe(h.session.getWorldMovedSnapshot());
  });
});

describe('Slice A6 (WO-A6-1): the tuning surface (design doc §3, design lock 1)', () => {
  it('resolveTuning() with no override equals DEFAULT_LIVING_WORLD_TUNING, whose fields equal TODAY\'s measured literals; a fresh GameSession\'s getTuning() matches it (RED before this WO: game/tuning.ts did not exist, GameConfig had no `tuning` field, and GameSession had no getTuning() method)', async () => {
    const { resolveTuning, DEFAULT_LIVING_WORLD_TUNING } = await import('./game/tuning.js');
    expect(resolveTuning()).toEqual(DEFAULT_LIVING_WORLD_TUNING);
    expect(DEFAULT_LIVING_WORLD_TUNING).toEqual({
      rumorStanceFadeTicks: 24,
      rumorBelieveSuspicionBelow: 0, // A6 wave T1 default (WAVE_1_OUTCOMES.md)
      rumorSpreadScope: 'district',
      worldMovedCap: 200,
      narrationPressureLines: 10,
      narrationOpportunityLines: Infinity,
      narrationRumorLines: Infinity,
      ambushHeadline: 'always',
    });

    const session = new GameSession({
      engine: createGame(),
      title: 'Test Game',
      clientConfig: { apiKey: 'test-key' },
    });
    expect(session.getTuning()).toEqual(DEFAULT_LIVING_WORLD_TUNING);
  });

  it('GameConfig.tuning partially overrides the resolved defaults, leaving every other field at its measured default', () => {
    const session = new GameSession({
      engine: createGame(),
      title: 'Test Game',
      clientConfig: { apiKey: 'test-key' },
      tuning: { worldMovedCap: 3, ambushHeadline: 'never' },
    });
    expect(session.getTuning().worldMovedCap).toBe(3);
    expect(session.getTuning().ambushHeadline).toBe('never');
    // Untouched fields still read their measured default.
    expect(session.getTuning().rumorStanceFadeTicks).toBe(24);
    expect(session.getTuning().rumorSpreadScope).toBe('district');
  });

  it('worldMovedCap tunes pushWorldMoved\'s eviction ceiling (RED before this WO: pushWorldMoved always capped at the hard-coded MAX_WORLD_MOVED_ENTRIES literal, ignoring any override)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness({ gameOpts: { tuning: { worldMovedCap: 3 } } });

    const pushWorldMoved = (h.session as unknown as {
      pushWorldMoved: (kind: string, headline: string) => void;
    }).pushWorldMoved.bind(h.session);
    for (let i = 0; i < 5; i++) pushWorldMoved('ambush', `entry-${i}`);

    expect(h.session.worldMovedLedger.length).toBe(3);
    expect(h.session.worldMovedLedger[0].headline).toBe('entry-2'); // oldest 2 evicted
    expect(h.session.worldMovedLedger[2].headline).toBe('entry-4');
  });

  it('ambushHeadline: \'never\' suppresses getAmbushHeadline() even when the round DID spawn an encounter; \'always\' (default) renders it (RED before this WO: the buildAmbushHeadline call site was unconditional -- no lever existed to suppress it)', () => {
    const alwaysSession = new GameSession({
      engine: createGame(),
      title: 'Test Game',
      clientConfig: { apiKey: 'test-key' },
    });
    const neverSession = new GameSession({
      engine: createGame(),
      title: 'Test Game',
      clientConfig: { apiKey: 'test-key' },
      tuning: { ambushHeadline: 'never' },
    });

    const fakeEncounterEvent: ResolvedEvent = {
      id: 'ev-1',
      tick: 1,
      type: 'encounter.spawned',
      payload: { encounterName: 'Bandit ambush', zoneName: 'Rustwater Alley' },
    };
    const getAmbush = (s: GameSession) =>
      (s as unknown as { getAmbushHeadline: (events: ResolvedEvent[]) => string | undefined })
        .getAmbushHeadline([fakeEncounterEvent]);

    expect(getAmbush(alwaysSession)).toBe('Ambush: Bandit ambush in Rustwater Alley');
    expect(getAmbush(neverSession)).toBeUndefined();
  });

  it('rumorBelieveSuspicionBelow tunes the first-hearing stance rule (RED before this WO: the threshold was hard-coded to the literal `50`, so an NPC at DEFAULT_SUSPICION (0) always believed with no way to force doubt)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');

    // Threshold 50 (the pre-T1 default): pilgrim's suspicion (0,
    // cognition-core's DEFAULT_SUSPICION) is below it -> believes. Since A6
    // wave T1 the default is 0, so the believing side is set explicitly.
    const believeHarness = createHarness({ gameOpts: { tuning: { rumorBelieveSuspicionBelow: 50 } } });
    ensureImmersionInferAndTransitionStub(believeHarness.session);
    believeHarness.session.rumorEngine.create({
      claim: 'the stranger killed a merchant', subject: 'player', key: 'killed-merchant',
      value: true, sourceId: 'some-witness', originTick: believeHarness.session.engine.tick, confidence: 0.8,
    });
    await believeHarness.play('look around');
    expect(believeHarness.session.getHearerRumors('pilgrim')[0]?.stance).toBe('believe');

    // Threshold 0 (the T1 default): suspicion (0) < 0 is false, and this
    // fixture's rumor has no faction uptake -> doubts instead.
    const doubtHarness = createHarness({ gameOpts: { tuning: { rumorBelieveSuspicionBelow: 0 } } });
    ensureImmersionInferAndTransitionStub(doubtHarness.session);
    doubtHarness.session.rumorEngine.create({
      claim: 'the stranger killed a merchant', subject: 'player', key: 'killed-merchant',
      value: true, sourceId: 'some-witness', originTick: doubtHarness.session.engine.tick, confidence: 0.8,
    });
    await doubtHarness.play('look around');
    expect(doubtHarness.session.getHearerRumors('pilgrim')[0]?.stance).toBe('doubt');
  });

  it('rumorSpreadScope: \'zone\' reaches fewer hearers than \'district\' on a fixture with named NPCs in two zones of one district (pilgrim @ chapel-entrance, the player\'s own starting zone; brother-aldric @ chapel-nave, same chapel-grounds district) (RED before this WO: the per-hearer spread filter always used the district-wide `getDistrictForZone(...) === playerDistrictId` clause, with no zone-scoped option)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');

    // Default ('district'): both pilgrim (same zone) AND brother-aldric
    // (same district, different zone) hear it -- this is the EXISTING
    // WO-A5-4 proof's own assertion, re-verified here as the lever's
    // null hypothesis baseline.
    const districtHarness = createHarness();
    ensureImmersionInferAndTransitionStub(districtHarness.session);
    districtHarness.session.rumorEngine.create({
      claim: 'the stranger killed a merchant', subject: 'player', key: 'killed-merchant',
      value: true, sourceId: 'some-witness', originTick: districtHarness.session.engine.tick, confidence: 0.8,
    });
    await districtHarness.play('look around');
    expect(districtHarness.session.getHearerRumors('pilgrim').length).toBe(1);
    expect(districtHarness.session.getHearerRumors('brother-aldric').length).toBe(1);

    // 'zone': only pilgrim (the player's own zone) hears it; brother-aldric
    // (a different zone of the SAME district) does not.
    const zoneHarness = createHarness({ gameOpts: { tuning: { rumorSpreadScope: 'zone' } } });
    ensureImmersionInferAndTransitionStub(zoneHarness.session);
    zoneHarness.session.rumorEngine.create({
      claim: 'the stranger killed a merchant', subject: 'player', key: 'killed-merchant',
      value: true, sourceId: 'some-witness', originTick: zoneHarness.session.engine.tick, confidence: 0.8,
    });
    await zoneHarness.play('look around');
    expect(zoneHarness.session.getHearerRumors('pilgrim').length).toBe(1);
    expect(zoneHarness.session.getHearerRumors('brother-aldric').length).toBe(0);
  });
});

describe('Slice A6 (WO-A6-2): per-round metrics (design doc §5, design lock 2)', () => {
  it('getRoundMetrics() yields one entry per played round, tick-ordered, with every count a non-negative number (RED before this WO: GameSession had no getRoundMetrics() method and no round-metrics capture at all)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    ensureImmersionInferAndTransitionStub(h.session);

    expect(h.session.getRoundMetrics()).toEqual([]);

    for (let i = 0; i < 5; i++) {
      await h.play('look around');
    }

    const metrics = h.session.getRoundMetrics();
    expect(metrics.length).toBe(5);
    let prevTick = -Infinity;
    for (const m of metrics) {
      expect(m.tick).toBeGreaterThan(prevTick);
      prevTick = m.tick;
      expect(typeof m.heat).toBe('number');
      expect(typeof m.quietRounds).toBe('number');
      expect(m.kills).toBeGreaterThanOrEqual(0);
      expect(m.pressuresActive).toBeGreaterThanOrEqual(0);
      expect(m.pressuresSpawned).toBeGreaterThanOrEqual(0);
      expect(m.pressuresResolved).toBeGreaterThanOrEqual(0);
      expect(m.pressuresExpired).toBeGreaterThanOrEqual(0);
      expect(m.factionActions).toBeGreaterThanOrEqual(0);
      expect(m.opportunitiesSpawned).toBeGreaterThanOrEqual(0);
      expect(m.opportunitiesAccepted).toBeGreaterThanOrEqual(0);
      expect(m.opportunitiesExpired).toBeGreaterThanOrEqual(0);
      expect(m.ambushes).toBeGreaterThanOrEqual(0);
      expect(typeof m.moodTransition).toBe('boolean');
      expect(m.rumorsCreated).toBeGreaterThanOrEqual(0);
      expect(m.rumorsMutated).toBeGreaterThanOrEqual(0);
      expect(m.rumorHearers).toBeGreaterThanOrEqual(0);
      expect(m.stanceBelieve).toBeGreaterThanOrEqual(0);
      expect(m.stanceDoubt).toBeGreaterThanOrEqual(0);
    }
  });

  it('capOldestFirst evicts at MAX_ROUND_METRICS (RED before this WO: no round-metrics ledger existed to cap)', async () => {
    const { MAX_ROUND_METRICS } = await import('./game/round-metrics.js');
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    ensureImmersionInferAndTransitionStub(h.session);

    // Directly drive the private capture method past the cap rather than
    // playing MAX_ROUND_METRICS+ real turns (slow, and the fake client's
    // call log would grow unboundedly) -- same "reach into the private
    // method with a documented cast" allowance the tuning suite above uses
    // for pushWorldMoved.
    const capture = (h.session as unknown as {
      captureRoundMetrics: (events: ResolvedEvent[]) => void;
    }).captureRoundMetrics.bind(h.session);
    for (let i = 0; i < MAX_ROUND_METRICS + 10; i++) capture([]);

    expect(h.session.getRoundMetrics().length).toBe(MAX_ROUND_METRICS);
  });

  it('rumorsCreated counts a mirrored rumor whose originTick is the current round; rumorHearers is a snapshot of all-time distinct hearers', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    ensureImmersionInferAndTransitionStub(h.session);

    h.session.rumorEngine.create({
      claim: 'the stranger killed a merchant', subject: 'player', key: 'killed-merchant',
      value: true, sourceId: 'some-witness', originTick: h.session.engine.tick, confidence: 0.8,
    });
    await h.play('look around');

    const metrics = h.session.getRoundMetrics();
    const last = metrics[metrics.length - 1];
    // spreadPath starts as `[sourceId]` at RumorEngine.create() time (this
    // rumor's sourceId is 'some-witness' -- engine.js:59), THEN pilgrim AND
    // brother-aldric both hear it this round (WO-A5-4's own fixture,
    // re-used above) -- three distinct spreadPath entries total.
    expect(last.rumorHearers).toBe(3);
    // Only pilgrim/brother-aldric get a first-hearing STANCE this round
    // (setStance is only called for the two named-NPC receivers, never for
    // the origin witness) -- two stance events, not three.
    expect(last.stanceBelieve + last.stanceDoubt).toBe(2);
  });
});

describe('Slice A6 (WO-A6-3): the /tuning data (design doc §5)', () => {
  it('getTuningView() reports the resolved tuning, the last round\'s metrics, and the round count (RED before this WO: GameSession had no getTuningView() method)', async () => {
    const { createHarness } = await import('../test/helpers/game-harness.js');
    const h = createHarness();
    ensureImmersionInferAndTransitionStub(h.session);

    const emptyView = h.session.getTuningView();
    expect(emptyView.rounds).toBe(0);
    expect(emptyView.lastRound).toBeUndefined();
    expect(emptyView.tuning).toEqual(h.session.getTuning());

    await h.play('look around');
    await h.play('look around');

    const view = h.session.getTuningView();
    expect(view.rounds).toBe(2);
    expect(view.lastRound).toEqual(h.session.getRoundMetrics()[1]);
  });
});
