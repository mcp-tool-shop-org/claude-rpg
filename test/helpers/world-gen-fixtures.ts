// Shared WorldGenProposal fixture for slice A1 integration tests (run
// swarm-1788288802-f5a0, wave 3, domain "tests"):
//   - test/integration/world-source-parity.test.ts (WO-A1-8, WO-A1-9)
//   - test/integration/engine-composition.test.ts  (WO-A1-10)
//
// Mirrors src/foundry/world-gen.test.ts's makeValidProposal() pattern (that
// file is runtime-foundry's, not ours to import from -- test/** is this
// domain's only owned glob), kept minimal: two zones, one faction with one
// member, one player. `quests` defaults to an EMPTY array on purpose --
// buildWorldStack's quests config is presence-optional (design doc §5 /
// ADDENDUM-COMMON design lock #2, "optional means optional"): an empty
// proposal.quests must produce no quest-core module, exactly like a pack
// with no authored quest content. Pass `quests` via `overrides` to opt into
// quest content for WO-A1-9's proofs.
import type { WorldGenProposal } from '../../src/foundry/world-gen.js';

export function makeParityWorldGenProposal(
  overrides: Partial<WorldGenProposal> = {},
): WorldGenProposal {
  return {
    title: 'Parity Test World',
    theme: 'fantasy',
    toneGuide: 'even-handed and testable',
    ruleset: {
      id: 'parity-rules',
      name: 'Parity Rules',
      stats: [{ id: 'str', name: 'Strength', default: 10 }],
      resources: [{ id: 'hp', name: 'HP', default: 100, max: 100 }],
    },
    zones: [
      { id: 'town-square', roomId: 'town-square', name: 'Town Square', tags: [], neighbors: ['market'], light: 7 },
      { id: 'market', roomId: 'market', name: 'Market', tags: [], neighbors: ['town-square'], light: 5 },
    ],
    factions: [
      { id: 'guard', name: 'Town Guard', disposition: 'neutral', description: 'Protectors', memberIds: ['guard-1'] },
    ],
    npcs: [
      {
        id: 'guard-1',
        name: 'Guard Captain',
        type: 'npc',
        tags: ['guard'],
        zoneId: 'town-square',
        personality: 'stern',
        goals: ['protect the town'],
        stats: { str: 12 },
        resources: { hp: 80 },
        beliefs: [],
      },
    ],
    player: {
      name: 'Hero',
      stats: { str: 10 },
      resources: { hp: 100 },
      startZoneId: 'town-square',
    },
    quests: [],
    ...overrides,
  };
}

/**
 * WO-P9-2 (Phase 9 §1, run swarm-1788288802-f5a0, wave 9, "tests" domain,
 * ADDENDUM-COMMON design lock #4): `makeParityWorldGenProposal` enriched
 * with the content the composed proof's six links need the generated
 * fixture to structurally support — a hostile in a reachable zone (so
 * "attack the nearest hostile sharing the zone" has a target and the
 * kill/heat/pressure link (§1 item 1) can fire), an authored encounter
 * table over that hostile (so "a zone entry spawns an encounter", §1 item
 * 5, has something to spawn), a district with a controlling faction (the
 * generated-world parity for the pack worlds' authored `controllingFaction`
 * districts), and two named NPCs in the start district (so "talk to the
 * nearest named NPC" and the named-NPC-acts link, §1 item 3, have targets).
 *
 * `brigand-1` is `type: 'enemy'` — the ONLY type `mapEncountersFromProposal`
 * accepts for an encounter's `hostiles[].npcId` (src/foundry/world-gen.ts:
 * 473, "does not name a proposal NPC of type 'enemy' -- skipped"); placing
 * it in `market` (a neighbor of the base fixture's `town-square` start
 * zone, already on `proposal.zones`) keeps it reachable within the
 * composed proof's zone-graph traversal without adding new zones. The
 * `market-ambush` encounter's `zoneIds: ['market']` is what makes entering
 * that zone spawn the encounter (encounter-spawn's own zone-entry gate);
 * `town-district`'s `controllingFaction: 'guard'` reuses the base
 * fixture's sole authored faction (`guard`, membership `['guard-1']`) so
 * this fixture adds no faction of its own. `town-crier` is the second named
 * NPC (`guard-1`/"Guard Captain" from the base fixture is the first), both
 * in `town-square` — the start district (`town-district` covers both
 * zones) — so a fresh session's very first round already has two named
 * NPCs to talk to without a move first.
 */
export function makePhase9WorldGenProposal(
  overrides: Partial<WorldGenProposal> = {},
): WorldGenProposal {
  const base = makeParityWorldGenProposal();
  return {
    ...base,
    npcs: [
      ...base.npcs,
      {
        id: 'town-crier',
        name: 'Town Crier',
        type: 'npc',
        tags: ['crier'],
        zoneId: 'town-square',
        personality: 'gregarious',
        goals: ['spread news of the town'],
        stats: { str: 8 },
        resources: { hp: 60 },
        beliefs: [],
      },
      {
        // WO-P9-2 follow-up (observed live, run swarm-1788288802-f5a0, wave
        // 9): the fixed 30-round script's fake-client combat lands roughly
        // 3hp of damage per `attack` turn against this ruleset's stats --
        // verified live via this fixture's own matrix run. `hp: 40` (this
        // field's ORIGINAL value) needed ~13 attack turns to clear ONE
        // hostile, leaving no budget for a second inside 30 rounds once the
        // 4 non-combat rounds (talk/accept/talk/move) the script spends
        // reaching `market` are subtracted -- lowered to 15 (~5 attack
        // turns) so both hostiles below can die inside the run.
        id: 'brigand-1',
        name: 'Brigand',
        type: 'enemy',
        tags: ['hostile'],
        zoneId: 'market',
        personality: 'hostile',
        goals: ['rob travelers'],
        stats: { str: 11 },
        resources: { hp: 15 },
        beliefs: [],
      },
      {
        // WO-P9-2 follow-up (observed live, run swarm-1788288802-f5a0, wave
        // 9): a single hostile caps the kill-driven heat/pressure link
        // (design doc §1 item 1) at ONE kill -- `heatPerKill` (defeat-
        // fallout.js, 5) never reaches `HEAT_WAKE_THRESHOLD` (world-tick.js,
        // 10) off one kill alone, verified live via this fixture's own
        // 30-round matrix run before this second hostile existed (heat
        // capped at 5, no pressure ever spawned). A second hostile in the
        // SAME encounter gives the composed proof's script two kills in
        // one `market` visit; see `brigand-1`'s own comment for why `hp`
        // is 15, not the original 40.
        id: 'brigand-2',
        name: 'Second Brigand',
        type: 'enemy',
        tags: ['hostile'],
        zoneId: 'market',
        personality: 'hostile',
        goals: ['rob travelers'],
        stats: { str: 11 },
        resources: { hp: 15 },
        beliefs: [],
      },
    ],
    districts: [
      {
        id: 'town-district',
        name: 'Town District',
        zoneIds: ['town-square', 'market'],
        tags: [],
        controllingFaction: 'guard',
      },
    ],
    encounters: [
      {
        id: 'market-ambush',
        name: 'Market Ambush',
        zoneIds: ['market'],
        hostiles: [
          { npcId: 'brigand-1', count: 1 },
          { npcId: 'brigand-2', count: 1 },
        ],
      },
    ],
    // Stitch (wave 10, slice B1 §4, lock 7): two petitioners in the
    // proposal shape runtime-foundry's mapPetitionersFromProposal reads --
    // genuine/predatory is decided at instantiation by askPredatorRatio,
    // never here (no at-a-glance tell).
    petitioners: [
      { name: 'Weary Pilgrim', zoneId: 'town-square', kind: 'carry' },
      { name: 'Widow Anselm', zoneId: 'market', factionId: 'guard', kind: 'lend' },
    ],
    ...overrides,
  };
}
