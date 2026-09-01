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
