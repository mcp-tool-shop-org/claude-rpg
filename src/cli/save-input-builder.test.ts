// save-input-builder.test.ts — WO-A3-4 (slice A3, run swarm-1788288802-f5a0)
//
// Proves buildSaveInput's real logic directly (mirrors save-listing.test.ts /
// save-selection.test.ts's precedent of testing an extracted bin.ts helper).
//
// Bin-level shape proof for design doc §2/§3: a session saved through this
// exact function (a) never emits the ten legacy world-truth keys, (b) still
// carries resolvedOpportunities (session HISTORY, not world truth — design
// doc §1), and (c) carries the new rumorEngine snapshot.
import { describe, it, expect } from 'vitest';
import { buildSaveInput } from './save-input-builder.js';
import { createHarness } from '../../test/helpers/game-harness.js';

// WO-A3-4 (design doc §2, ADDENDUM-COMMON design lock 2): the ten legacy
// world-truth stores a v3 SaveSessionInput must never carry. npcAgencySnapshot
// is built at save time from the npcProfiles/npcActions inputs, so both of
// those input keys are pinned here too — a stale caller passing either would
// silently resurrect the field this slice removes.
const LEGACY_KEYS = [
  'playerRumors', 'activePressures', 'resolvedPressures', 'npcAgencySnapshot',
  'npcObligations', 'consequenceChains', 'partyState', 'districtEconomies',
  'activeOpportunities', 'leverageSnapshot', 'npcProfiles', 'npcActions',
] as const;

describe('buildSaveInput (WO-A3-4, slice A3)', () => {
  it('never passes any of the ten legacy world-truth stores', () => {
    // RED (observed on this worktree before game-core's WO-A3-1/2/3 land):
    // GameSession has no getRumorEngineSnapshot() method yet on this branch
    // (CURRENT_SCHEMA_VERSION is still 2, SavedSession/SaveSessionInput carry
    // no rumorEngine field) -- this test throws
    // "session.getRumorEngineSnapshot is not a function" until the
    // coordinator merges game-core's half of this slice into the same tree.
    // Per ADDENDUM-cli-display.md WO-A3-4 / ADDENDUM-COMMON's parallel-wave
    // contract, this is coded against docs/living-world-slice-a3.md §2/§3
    // now and is "green expected at merge", not a bug in this file.
    const { session } = createHarness();
    const input = buildSaveInput(session, '/tmp/wo-a3-4-test-save.json', 'test-pack');

    for (const key of LEGACY_KEYS) {
      expect(input).not.toHaveProperty(key);
    }
  });

  it('still carries resolvedOpportunities (session HISTORY, not world truth)', () => {
    const { session } = createHarness();
    const input = buildSaveInput(session, '/tmp/wo-a3-4-test-save.json', 'test-pack');

    expect(input).toHaveProperty('resolvedOpportunities');
    expect(input.resolvedOpportunities).toEqual(session.resolvedOpportunities);
  });

  it('carries the RumorEngine snapshot (design doc §3)', () => {
    const { session } = createHarness();
    const input = buildSaveInput(session, '/tmp/wo-a3-4-test-save.json', 'test-pack');

    expect(input).toHaveProperty('rumorEngine');
  });
});

// WO-A4-7 (slice A4, run swarm-1788288802-f5a0, wave 7): generated-world
// resume (design doc §4). buildSaveInput passes worldGenProposal/worldSeed
// straight through from the session accessors game-core lands this same
// wave (WO-A4-3) -- the identical pass-through discipline as rumorEngine
// above (WO-A3-4).
describe('buildSaveInput worldGenProposal/worldSeed pass-through (WO-A4-7)', () => {
  it('carries whatever getWorldGenProposal()/getWorldSeed() report', () => {
    // RED (observed on this worktree before game-core's WO-A4-3 lands):
    // GameSession has no getWorldGenProposal()/getWorldSeed() methods yet
    // on this branch -- this test throws "session.getWorldGenProposal is
    // not a function" until the coordinator merges game-core's half of
    // this slice into the same tree. Per ADDENDUM-cli-display.md WO-A4-7 /
    // ADDENDUM-COMMON's parallel-wave contract, this is coded against
    // docs/living-world-slice-a4.md §4 now and is "green expected at
    // merge", not a bug in this file.
    const { session } = createHarness();
    const input = buildSaveInput(session, '/tmp/wo-a4-7-test-save.json');

    expect(input.worldGenProposal).toBe(session.getWorldGenProposal());
    expect(input.worldSeed).toBe(session.getWorldSeed());
  });
});
