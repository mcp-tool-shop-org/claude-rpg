// WO-A2-11 (slice A2-core, run swarm-1788288802-f5a0, wave 4, "tests"
// domain): determinism + no-double-simulation proofs for the living-world
// driver (design doc docs/living-world-slice-a2.md §7, "Determinism" and
// "No double simulation"). Once game-core wires GameSession.runWorldRound's
// `onResolved` hook into `executeTurn` (design doc §1-§2) and deletes the
// hand-tickers in favor of the engine's `runWorldTick` (§5), a played round
// runs the tick exactly once per non-rejected round over the session's own
// engine -- so two sessions built from the identical seed and driven with
// the identical scripted inputs must produce byte-identical event logs, and
// a live pressure's timer must fall by exactly 1 per round: never 0 (the
// tick silently skipped) and never 2 (a surviving hand-ticker double-ticking
// the same pressure alongside the driver -- exactly the "simulate every
// system twice on two disagreeing ledgers" failure the design doc's opening
// section names as the reason the driver and the deletions must land
// together).
//
// RED on this worktree TODAY (2026-09-01), and this is the CORRECT red per
// ADDENDUM-COMMON's isolation contract, not a defect in this file: this
// worktree forks from BEFORE game-core's round-callback change lands (its
// own isolated worktree), so `grep -rn "runWorldTick" src/` on this tree
// returns nothing -- GameSession.processInput never calls runWorldTick, and
// `getActivePressures(engine.world)` (the world-tick module's OWN persisted
// namespace, read via the installed 3.11 dist) stays `[]` turn after turn no
// matter how the globals below are seeded, because nothing ever calls
// `evaluatePressures` against that namespace. Observed red, verified via a
// scoped run against the main repo's install
// (`npx vitest run test/integration/living-world-driver.test.ts`): both
// `expect(getActivePressures(...).some(...)).toBe(true)` assertions fail
// with an empty array, and the decrement-loop's `expect(pressure).toBeDefined()`
// fails the same way. Goes green once the coordinator stitches game-core's
// change in -- verified independently against the raw installed engine
// (bypassing GameSession entirely) that this exact seed/global recipe
// deterministically spawns the pressure on round 1 at turnsRemaining: 12 and
// decrements it by exactly 1 every subsequent tick, and that two engines
// built from the same seed and driven with the same tick count produce
// byte-identical event logs -- so the only missing piece is game-core's own
// wiring, not this test's assumptions about engine behavior.

import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { HEAT_KEY, HEAT_WAKE_THRESHOLD, getActivePressures } from '@ai-rpg-engine/modules';
import { createHarness } from '../helpers/game-harness.js';

const SEED = 4242;
// starter-fantasy's sole authored faction (world.factions) -- reputation 0
// baseline, so the deltas below land exactly on the values named.
const BOUNTY_FACTION = 'chapel-undead';

/**
 * Seeds the universal bounty-issued rule (pressure-system.js's
 * evaluateUniversalRules, the first branch evaluatePressures scans) so the
 * SAME first tick that opens the spawn valve (heat >= HEAT_WAKE_THRESHOLD,
 * world-tick.js step 5's gate) also guarantees evaluatePressures returns
 * non-null, deterministically -- no genre-specific rule and no RNG draw
 * involved. buildPressureInputs (world-tick.js:749-773, verified against the
 * installed 3.11 dist) merges the authored baseline
 * (world.factions[BOUNTY_FACTION].reputation, 0 for a fresh starter-fantasy
 * world) with the accrued `reputation_<id>` global delta, and takes
 * alertLevel as the max of the `faction_alert_<id>` global and
 * faction-cognition's own reading (0 for a fresh, NPC-agency-untouched
 * world) -- both read straight off world.globals, so setting them directly
 * before any turn plays is sufficient and does not depend on any app-level
 * write-through.
 *
 * Verified directly against the raw installed engine (createGame + a bare
 * runWorldTick call, no GameSession involved): this exact recipe spawns
 * 'bounty-issued' at turnsRemaining: 12 on the very first tick and
 * decrements it by exactly 1 on every subsequent tick, ten ticks running,
 * with two independently-built engines from the same seed producing
 * byte-identical event logs throughout.
 */
function seedGuaranteedBountySpawn(engine: ReturnType<typeof createGame>): void {
  // Opens the spawn valve (world-tick.js step 5's `heat >= HEAT_WAKE_THRESHOLD` gate).
  engine.world.globals[HEAT_KEY] = HEAT_WAKE_THRESHOLD;
  // <= -50 (evaluateUniversalRules' bounty-issued branch).
  engine.world.globals[`reputation_${BOUNTY_FACTION}`] = -60;
  // >= 60 (the same branch's alertLevel condition).
  engine.world.globals[`faction_alert_${BOUNTY_FACTION}`] = 70;
}

// A benign, always-legal action repeated every round: never REJECTED (no
// unknown verb, no invalid target -- so the hook never hits the design
// doc's "skip on action.rejected" gate), never combat (no player-defeat
// corpse gate to route around). 'look' is the same verb Phase-9's composed
// proof (test/integration/phase9-composed-proof.test.ts) and this repo's
// other harness tests already lean on for exactly this reason.
const ROUNDS = 10;
const SCRIPTED_INPUTS = Array(ROUNDS).fill('look');
const CANNED_NARRATION = 'The street holds its breath, waiting to see what the player does next.';

describe('WO-A2-11: living-world driver -- determinism + no-double-simulation (design doc §7)', () => {
  it('two sessions from the same seed and the same scripted inputs produce byte-identical event logs over 10 rounds, with the tick actually firing', async () => {
    const engine1 = createGame(SEED);
    const engine2 = createGame(SEED);
    seedGuaranteedBountySpawn(engine1);
    seedGuaranteedBountySpawn(engine2);

    const h1 = createHarness({
      gameOpts: { engine: engine1 },
      clientOpts: { narration: CANNED_NARRATION },
    });
    const h2 = createHarness({
      gameOpts: { engine: engine2 },
      clientOpts: { narration: CANNED_NARRATION },
    });

    for (const input of SCRIPTED_INPUTS) {
      await h1.play(input);
      await h2.play(input);
    }

    // Byte-identical: a JSON round-trip strips nothing engine-relevant here
    // (every ResolvedEvent field -- id/tick/type/actorId/targetIds/payload/
    // tags/visibility/presentation/causedBy -- is JSON-safe), and it also
    // catches property-order drift a bare deepEqual could paper over.
    expect(JSON.stringify(h1.session.engine.world.eventLog)).toBe(
      JSON.stringify(h2.session.engine.world.eventLog),
    );

    // The scenario this file exists to prove must have actually fired: at
    // least one pressure landed in the tick's OWN persisted namespace (not
    // merely this test's seeded globals) -- otherwise "byte-identical over
    // ten rounds" would be true vacuously, because the driver never ran at
    // all. This is the assertion that is RED today (see file header).
    expect(
      getActivePressures(h1.session.engine.world).some((p) => p.kind === 'bounty-issued'),
    ).toBe(true);
  });

  it("a live pressure's timer decrements exactly once per round -- no double simulation from a surviving hand-ticker", async () => {
    const engine = createGame(SEED);
    seedGuaranteedBountySpawn(engine);
    const h = createHarness({
      gameOpts: { engine },
      clientOpts: { narration: CANNED_NARRATION },
    });

    // Round 1: the tick's own heat-gated spawn step creates the
    // bounty-issued pressure with turnsRemaining: 12 (pressure-system.js's
    // evaluateUniversalRules literal) -- verified directly against the raw
    // engine above the fixture's own docstring.
    await h.play('look');
    const afterSpawn = getActivePressures(h.session.engine.world).find(
      (p) => p.kind === 'bounty-issued',
    );
    // OBSERVED RED on this worktree today: `afterSpawn` is `undefined` here
    // -- see the file-header note. Expected green once the coordinator
    // stitches game-core's round-callback change in.
    expect(afterSpawn).toBeDefined();
    const turnsAtSpawn = afterSpawn!.turnsRemaining!;

    // Nine more rounds, one non-combat action apiece: pin the EXACT
    // per-round delta, not just "eventually decremented" -- a hand-ticker
    // still running alongside the driver would decrement twice a round (the
    // double-simulation this proof exists to catch), which this loop would
    // catch on the very first iteration.
    // Coordinator stitch (slice A2): the living world is live — the engine's
    // faction-agency step may resolve the bounty the next round. So: in
    // every round the pressure survives its timer moved by exactly one, and
    // it only leaves the active list together with a pressure.resolved /
    // pressure.expired event in that round's delta.
    let expected = turnsAtSpawn;
    for (let round = 1; round <= ROUNDS - 1; round++) {
      const logBefore = h.session.engine.world.eventLog.length;
      await h.play('look');
      const delta = h.session.engine.world.eventLog.slice(logBefore);
      const pressure = getActivePressures(h.session.engine.world).find(
        (p) => p.kind === 'bounty-issued',
      );
      if (!pressure) {
        expect(delta.some((e) => e.type === 'pressure.resolved' || e.type === 'pressure.expired')).toBe(true);
        break;
      }
      expected -= 1;
      expect(pressure.turnsRemaining).toBe(expected);
    }
  });
});
