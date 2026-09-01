import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { setPersistedNpcState, type NpcProfile } from '@ai-rpg-engine/modules';
import { buildNpcProfilesForDirector } from './agency.js';

// WO-A2-7 (slice A2-core §5, design-doc lock 11): tickNpcAgency() and
// applyNpcEffects() were DELETED this wave — runWorldTick's own step 5a
// (world-tick.ts's runNpcAgencyStep) now runs the tick AND applies every
// returned NpcEffect itself (reputation/alert → world.globals, chains →
// makePressure, opportunities → setPersistedOpportunities, belief/memory →
// setBelief/addMemory, zone-change → direct mutation, morale/departure →
// companion-core, npc-rumor → spawnNpcOriginatedRumor), then persists
// profiles/last-actions/obligations to world.modules['npc-agency']. Every
// test that used to exercise applyNpcEffects's own dispatch logic (BR-007
// null-cognition guards, PBR-005 alert null guard, F-8d11d865 reputation/
// rumor/structural effects) tested a function that no longer exists — that
// coverage is superseded by the engine's own npc-agency.ts unit tests
// (packages/modules/src/npc-agency.ts, which this app now trusts as the
// sole applier) and by world-tick.ts's own runNpcAgencyStep tests. This file
// now covers the ONE function that survives from src/npc/agency.ts:
// buildNpcProfilesForDirector, reduced to a view adapter over the engine's
// own getPersistedNpcProfiles (design doc §3).
describe('buildNpcProfilesForDirector (WO-A2-7 — view adapter over getPersistedNpcProfiles)', () => {
  it('returns [] for a fresh engine — no named NPC has ever existed (SEED-0)', () => {
    const engine = createGame();

    expect(buildNpcProfilesForDirector(engine)).toEqual([]);
  });

  it('returns exactly what world-tick persisted — a pure view, not an independent recomputation', () => {
    const engine = createGame();
    const profile: NpcProfile = {
      npcId: 'npc-mira',
      name: 'Mira',
      factionId: 'the-watch',
      goals: [],
      relationship: { trust: 10, fear: 0, greed: 0, loyalty: 20 },
      breakpoint: 'favorable',
      dominantAxis: 'trust',
      leverageAngle: 'none',
      knownRumors: [],
      underPressure: false,
    };
    setPersistedNpcState(engine.world, [profile], [], new Map());

    expect(buildNpcProfilesForDirector(engine)).toEqual([profile]);
  });

  it('reflects a round-over-round change to the persisted namespace (no stale cache)', () => {
    const engine = createGame();
    const first: NpcProfile = {
      npcId: 'npc-toran',
      name: 'Toran',
      factionId: null,
      goals: [],
      relationship: { trust: 0, fear: 0, greed: 0, loyalty: 0 },
      breakpoint: 'favorable',
      dominantAxis: 'trust',
      leverageAngle: 'none',
      knownRumors: [],
      underPressure: false,
    };
    setPersistedNpcState(engine.world, [first], [], new Map());
    expect(buildNpcProfilesForDirector(engine)).toEqual([first]);

    const second: NpcProfile = { ...first, underPressure: true };
    setPersistedNpcState(engine.world, [second], [], new Map());

    expect(buildNpcProfilesForDirector(engine)).toEqual([second]);
  });
});
