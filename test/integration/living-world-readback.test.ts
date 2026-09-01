// WO-A4-9 (slice A4, run swarm-1788288802-f5a0, wave 7, "tests" domain):
// the read-back proofs (design doc §5, docs/living-world-slice-a4.md --
// LAW for this wave). Design lock 1 (ADDENDUM-COMMON): the eleven
// world-truth session fields become `get` accessors reading the engine on
// every access -- no refresh step, no stale window. This file proves that
// directly (§5 "Live getters": a value written straight into world truth is
// visible through the session getter with NO session call in between --
// impossible for a plain field that only updates on the next
// refreshWorldViews() call), and proves the three hint sources this WO
// names (§5 "Hint sources" + "situationHint from the persisted
// recommendation").
//
// SEQUENCING (ADDENDUM-COMMON honesty floor + ADDENDUM-tests): game-core's
// isolated worktree for THIS wave lands the getter conversion in
// src/game.ts; this worktree cannot see that change until the coordinator
// merges it in. The three "live getter" tests below are RED on this
// worktree today -- `this.activePressures` etc. are still plain fields on
// src/game.ts, populated only by `refreshWorldViews()` (called from
// `runWorldRound()`, itself only invoked mid-turn), so a value pushed
// straight into world truth with NO turn played in between is invisible to
// a direct field read (grep -n "activePressures: WorldPressure\[\] = \[\];"
// src/game.ts confirms the plain-field declaration; this is read from
// source, not from an observed test run -- this wave's serial-final-verify
// discipline forbids a per-agent scoped run from this worktree, per
// ADDENDUM-tests's own verification-discipline note). Goes green once the
// coordinator merges game-core's getter change in.
//
// The "situationHint from the persisted recommendation" test is RED for
// the same reason via a different call site: src/game.ts's processInput
// still computes situationHint via `this.buildMoveRecommendation()` (a
// fresh per-turn simulation), never `getPersistedMoveRecommendation(world)`
// -- confirmed by reading src/game.ts's current `situationHint: (() => {...
// this.buildMoveRecommendation() ...})()` block. That live simulation can
// never independently produce this file's distinctive marker string, so
// the assertion is a clean readback proof regardless: it fails today
// because the source is still the per-turn duplicate, and passes once
// game-core's change lands (design doc §2, ADDENDUM-COMMON design lock 3).
//
// The two "hint sources" tests for a world-inserted PRESSURE (narration
// prompt, and a faction-member NPC's dialogue prompt) are NOT expected to
// flip red->green at this merge: `refreshWorldViews()` (landed at A2-core)
// already reads `getActivePressures(world)`/the other listed readers once
// per round, before both narration and dialogue (turn-loop.ts calls
// `onResolved` -- `runWorldRound()` -- at line ~530, well before Step 5's
// dialogue generation at line ~678), so a pressure pushed into world truth
// before a turn is played already reaches both prompts on TODAY's source.
// Kept here anyway as floor proofs for design lock 3's table (dialogueHint/
// pressureHint/worldPressureHint sources), per the honesty floor: stated
// plainly rather than mis-labeled RED to match the file's other proofs.
//
// starter-fantasy's own NPCs (pilgrim, brother-aldric) carry no faction
// membership (`grep -n "chapel-undead" node_modules/@ai-rpg-engine/
// starter-fantasy/dist/setup.js` shows only ash-ghoul/crypt-warden as
// members) -- neither is speakable-to as a member of a faction, so the
// dialogue-hint-for-an-NPC's-own-faction proof uses a small generated world
// (this domain's own makeParityWorldGenProposal fixture, whose single NPC
// "guard-1" is a member of faction "guard") instead of the starter pack.

import { describe, it, expect } from 'vitest';
import { createProfile } from '@ai-rpg-engine/character-profile';
import {
  getWorldTickState,
  getPersistedOpportunities,
  setPersistedOpportunities,
  setPlayerRumorState,
  setPersistedMoveRecommendation,
  type WorldPressure,
  type OpportunityState,
  type PlayerRumor,
} from '@ai-rpg-engine/modules';
import { createHarness, createGeneratedHarness } from '../helpers/game-harness.js';
import { makeParityWorldGenProposal } from '../helpers/world-gen-fixtures.js';

/** Minimal, fully-shaped WorldPressure fixture -- every field the type declares as required, overridable per test. */
function makePressure(overrides: Partial<WorldPressure> & { id: string }): WorldPressure {
  return {
    kind: 'bounty-issued',
    sourceFactionId: 'guard',
    description: 'a default test pressure',
    triggeredBy: 'test-fixture',
    urgency: 0.5,
    visibility: 'known',
    turnsRemaining: 10,
    potentialOutcomes: [],
    tags: [],
    createdAtTick: 0,
    ...overrides,
  };
}

/** Minimal, fully-shaped OpportunityState fixture. */
function makeOpportunity(overrides: Partial<OpportunityState> & { id: string }): OpportunityState {
  return {
    kind: 'contract',
    status: 'available',
    title: 'a default test opportunity',
    description: 'a default test opportunity',
    objectiveDescription: 'do the thing',
    linkedRumorIds: [],
    linkedNpcIds: [],
    tags: [],
    rewards: [],
    risks: [],
    visibility: 'known',
    urgency: 0.5,
    turnsRemaining: 10,
    createdAtTick: 0,
    genre: 'fantasy',
    ...overrides,
  };
}

/** Minimal, fully-shaped PlayerRumor fixture. */
function makeRumor(overrides: Partial<PlayerRumor> & { id: string }): PlayerRumor {
  return {
    claim: 'a default test claim',
    subjectDescriptor: 'the stranger',
    sourceEvent: 'test-fixture',
    confidence: 0.8,
    distortion: 0,
    mutationCount: 0,
    valence: 'mysterious',
    spreadTo: [],
    originTick: 0,
    ...overrides,
  };
}

describe('WO-A4-9: live getters read world truth with no session call in between (design doc §1, §5)', () => {
  it('a pressure pushed directly into world truth is visible via session.activePressures immediately', () => {
    const h = createHarness();
    const pressure = makePressure({ id: 'wp-readback-1', description: 'READBACK_PRESSURE_MARKER' });

    getWorldTickState(h.session.engine.world).pressures.push(pressure);

    // No h.play(), no explicit refresh call -- design doc §1's whole point:
    // a getter reads the engine on every access, so there is no "next
    // refresh" to wait for.
    expect(h.session.activePressures.some((p) => p.id === 'wp-readback-1')).toBe(true);
  });

  it('an opportunity written via setPersistedOpportunities is visible via session.activeOpportunities immediately', () => {
    const h = createHarness();
    const world = h.session.engine.world;
    const opp = makeOpportunity({ id: 'opp-readback-1', description: 'READBACK_OPPORTUNITY_MARKER' });

    setPersistedOpportunities(world, [...getPersistedOpportunities(world), opp]);

    expect(h.session.activeOpportunities.some((o) => o.id === 'opp-readback-1')).toBe(true);
  });

  it('a rumor written via setPlayerRumorState is visible via session.playerRumors immediately', () => {
    const h = createHarness();
    const world = h.session.engine.world;
    const rumor = makeRumor({ id: 'rumor-readback-1', claim: 'READBACK_RUMOR_MARKER' });

    setPlayerRumorState(world, { rumors: [rumor] });

    expect(h.session.playerRumors.some((r) => r.id === 'rumor-readback-1')).toBe(true);
  });
});

describe('WO-A4-9: hint sources read the engine readers (design doc §2, §5)', () => {
  it("a pressure inserted into world truth appears in the next turn's narration prompt", async () => {
    const h = createHarness();
    const pressure = makePressure({
      id: 'wp-narration-1',
      description: 'NARRATION_PRESSURE_MARKER_e8f1',
      urgency: 0.8,
    });
    getWorldTickState(h.session.engine.world).pressures.push(pressure);

    await h.play('look');

    expect(h.callLog.lastGeneratePrompt).toContain('NARRATION_PRESSURE_MARKER_e8f1');
  });

  it("a pressure inserted for an NPC's own faction appears in that NPC's dialogue prompt (generated world, faction-member NPC)", async () => {
    const proposal = makeParityWorldGenProposal({ title: 'Readback Dialogue World' });
    const h = await createGeneratedHarness(proposal, { seed: 909 });

    const pressure = makePressure({
      id: 'wp-dialogue-1',
      sourceFactionId: 'guard', // makeParityWorldGenProposal's one faction; guard-1 is its sole member.
      description: 'DIALOGUE_PRESSURE_MARKER_c72a',
      urgency: 0.9,
    });
    getWorldTickState(h.session.engine.world).pressures.push(pressure);

    await h.play('talk to guard captain'); // guard-1's authored name (see world-gen-fixtures.ts).

    expect(h.callLog.lastGeneratePrompt).toContain('DIALOGUE_PRESSURE_MARKER_c72a');
  });
});

describe('WO-A4-9: situationHint reads the persisted move recommendation (design doc §2, §5)', () => {
  it("a persisted 'crisis' recommendation shows as the situation hint in the next turn's prompt", async () => {
    const profile = createProfile(
      { name: 'Readback Test Character', archetypeId: 'penitent-knight', backgroundId: 'oath-breaker', traitIds: [] },
      { vigor: 5, instinct: 5, will: 5 },
      { hp: 20, stamina: 8 },
      [],
      'chapel-threshold',
    );
    const h = createHarness({ gameOpts: { profile } });

    setPersistedMoveRecommendation(h.session.engine.world, {
      top3: [],
      situationTag: 'crisis',
      situationHint: 'CRISIS_SITUATION_MARKER_9f31',
    });

    await h.play('look');

    expect(h.callLog.lastGeneratePrompt).toContain('CRISIS_SITUATION_MARKER_9f31');
  });
});
