// F-8c64ade6 (SLATE-5e, wave 18 tests domain): interpreted.reasoning's
// wire-vs-delete decision on the successful-interpretation path.
//
// Coordinator Brief ruling (R3, binding): branch A -- wire into --debug
// output. Build the debug-mode assertion pair: present under --debug,
// absent without. The more important negative assertion (per the routed
// finding's own text) protects the 99% non-debug case from new noise.
//
// debugMode wiring: GameSession sets `this.immersion.debugMode =
// this.debugLog.enabled` at construction (game.ts:473), and debugLog comes
// from GameConfig.debugLogger (auto-detected from --debug/CLAUDE_RPG_DEBUG
// otherwise). createDebugLogger(true) (src/game/debug-logger.ts) gives an
// enabled logger without touching process.argv/env, so this doesn't leak
// state across tests the way mutating process.env would.

import { describe, it, expect } from 'vitest';
import { createHarness } from '../helpers/game-harness.js';
import { createDebugLogger, createTestLogger } from '../../src/game/debug-logger.js';

describe('interpreted.reasoning wire-into---debug (F-8c64ade6, Coordinator Brief R3 = branch A)', () => {
  it('a successful high-confidence action surfaces interpreted.reasoning through the debug logger when --debug is on', async () => {
    // Coordinator stitch (wave 18): the approved design (F-8c64ade6 branch A)
    // routes reasoning through DebugLogger.debug('interpret', ...) -- stderr
    // diagnostics, NOT an in-output trailer -- so the proof reads the
    // captured entries via createTestLogger(), not the rendered screen.
    const logger = createTestLogger();
    const h = createHarness({ gameOpts: { debugLogger: logger } });
    // Fast-path reasoning for a bare "look around" with no target
    // (action-interpreter.ts:121): reasoning = 'Look around'.
    await h.play('look around');
    const entry = logger
      .getEntries()
      .find((e) => e.subsystem === 'interpret' && e.message === 'action-reasoning');
    expect(entry).toBeDefined();
    expect(entry?.data?.reasoning).toBe('Look around');
  });

  it('the more important negative case: the same successful action shows NO reasoning trailer when debug mode is off, protecting the non-debug case from new noise', async () => {
    const h = createHarness(); // no debugLogger configured -> NoopLogger -> immersion.debugMode stays false
    const output = await h.play('look around');
    expect(output).not.toContain('Look around');
  });

  it('regression guard: the existing low-confidence clarification path (F-e8262ed1) keeps surfacing interpreted.reasoning unconditionally even with --debug on, so the two consumers of `reasoning` cannot silently drift apart', async () => {
    const h = createHarness({
      gameOpts: { debugLogger: createDebugLogger(true) },
      clientOpts: { structuredFailure: 'timeout' },
    });
    // "xyzzy" matches no fast-path pattern -> slow path -> generateStructured()
    // fails -> PB-007's API-failure reasoning, mirroring the existing
    // (cross-domain) precedent in test/integration/game-turn-loop.test.ts's
    // "interpretation failure (structured) resolves to the in-fiction
    // clarification" case, here specifically WITH debug mode on.
    const output = await h.play('xyzzy');
    expect(output).toContain("I'm not sure what you mean");
    expect(output).toContain('interpretation service unavailable');
  });
});
