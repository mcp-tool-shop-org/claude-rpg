// WO-A1-8 / WO-A1-9 (slice A1, run swarm-1788288802-f5a0, wave 3, "tests"
// domain): the module-family parity sentinel + the quests-reach-engine
// proof. Design doc (LAW for this wave): docs/living-world-slice-a1.md.
//
// §1 of the design doc makes generateWorld() spread buildWorldStack(...)'s
// modules into the generated-world Engine in place of its own hand-list of
// the same strategic family a pack world (e.g. starter-fantasy) wires via
// the SAME buildWorldStack call. WO-A1-8 proves the two engines end up with
// an IDENTICAL strategic module-id set once an explicit, documented
// allowlist of pack-only CONTENT modules (abilities, equipment,
// dialogue-core, progression, inventory, boss-phase listeners, and
// buildCombatStack's tactical-tier extras beyond the bare combat-core/
// cognition-core the generated-world hand list registers) is subtracted.
//
// SEQUENCING (ADDENDUM-COMMON, "honesty floor" + ADDENDUM-tests): the
// runtime-foundry domain lands the buildWorldStack adoption in world-gen.ts
// in this SAME wave, in an isolated worktree this domain cannot see. Until
// that merges, the "generated vs pack" comparison below is RED on this
// worktree's checked-out src/foundry/world-gen.ts (today's hand list omits
// economy-core, trade-core, companion-core, npc-agency, faction-agency,
// player-leverage, crafting-core, opportunity-core, and world-tick
// entirely) -- that is the CORRECT red per ADDENDUM-tests's own sequencing
// note, not a bug in this test. It goes green once the coordinator stitches
// runtime-foundry's change in. The allowlist-sanity test further down
// (buildFakeGeneratedEngine) proves the allowlist itself is correctly
// scoped against the INSTALLED engine right now, independent of that
// pending change.
import { describe, it, expect, afterEach } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import type { RulesetDefinition } from '@ai-rpg-engine/core';
import {
  traversalCore,
  statusCore,
  combatCore,
  createCognitionCore,
  createPerceptionFilter,
  createSimulationInspector,
  buildWorldStack,
  getQuestDefinitions,
  unregisterQuestContent,
} from '@ai-rpg-engine/modules';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { generateWorld } from '../../src/foundry/world-gen.js';
import { createFakeClient } from '../helpers/fake-claude-client.js';
import { createTestLogger } from '../../src/game/debug-logger.js';
import { makeParityWorldGenProposal } from '../helpers/world-gen-fixtures.js';

// ---------------------------------------------------------------------------
// The documented allowlist (WO-A1-8's explicit requirement).
// ---------------------------------------------------------------------------

/**
 * Pack-only CONTENT modules: registered by starter-fantasy's setup.ts
 * OUTSIDE of buildWorldStack, authoring per-pack content (abilities,
 * equipment, dialogue, progression, inventory) that a generated world has no
 * equivalent proposal shape for in this slice, PLUS buildCombatStack's
 * tactical-tier extras beyond the bare `combatCore`/`createCognitionCore()`
 * the generated-world hand list registers directly (design doc §1) --
 * engagement-core/combat-review/combat-tactics/combat-intent/
 * combat-recovery/combat-state-narration are wiring buildCombatStack adds
 * that the generated-world hand list deliberately does not adopt.
 *
 * `encounter-spawn`/`quest-core` are buildWorldStack's own presence-optional
 * members (world-stack.js's file-header contract: included only when a
 * world's own authored content configures them) -- starter-fantasy always
 * authors both, so they always appear on the pack side. Whether a GENERATED
 * world's own authored content produces them is exercised separately below
 * (WO-A1-9, quest-core specifically, per R2) rather than folded into this
 * set-equality proof, so this fixture's minimal proposal (empty `quests`,
 * no `encounters`) stays a fair, presence-optional-neutral comparison.
 *
 * Every id here is read off the INSTALLED 3.11 dist (verified against
 * node_modules/@ai-rpg-engine/modules/dist/*.js's own `id: '...'` literals
 * and combat-builders.js's module list for a no-resourceProfile pack, which
 * is starter-fantasy's exact shape) -- not a hand-typed guess.
 */
const PACK_ONLY_CONTENT_MODULE_IDS = new Set<string>([
  'inventory-core',
  'dialogue-core',
  'progression-core',
  'equipment-core',
  'ability-core',
  'ability-effects',
  'ability-review',
  'engagement-core',
  'combat-review',
  'combat-tactics',
  'combat-intent',
  'combat-recovery',
  'combat-state-narration',
  'encounter-spawn',
  'quest-core',
]);

/** createBossPhaseListener's id is `boss-phase:${entityId}` (combat-roles.js) -- a dynamic per-boss id, so matched by prefix rather than an exact-string allowlist entry. */
function isPackOnlyContentModule(id: string): boolean {
  return PACK_ONLY_CONTENT_MODULE_IDS.has(id) || id.startsWith('boss-phase:');
}

/** The strategic module-id set WO-A1-8 asserts parity over: every registered module id, minus pack-only content. */
function strategicModuleIds(engine: Engine): Set<string> {
  return new Set(
    engine.moduleManager
      .getModules()
      .map((m) => m.id)
      .filter((id) => !isPackOnlyContentModule(id)),
  );
}

// ---------------------------------------------------------------------------
// A hand-built "fake generated-world engine" using ONLY installed engine
// APIs (no dependency on src/foundry/world-gen.ts at all) -- lets the
// allowlist-sanity and negative-proof tests run TODAY, independent of
// runtime-foundry's pending change in this wave.
// ---------------------------------------------------------------------------

const FAKE_RULESET: RulesetDefinition = {
  id: 'fake-parity-rules',
  name: 'Fake Parity Rules',
  version: '1.0.0',
  stats: [{ id: 'str', name: 'Strength', min: 0, max: 100, default: 10 }],
  resources: [{ id: 'hp', name: 'HP', min: 0, max: 100, default: 100 }],
  verbs: [{ id: 'move', name: 'Move' }],
  formulas: [],
  defaultModules: [],
  progressionModels: [],
};

/**
 * Builds an engine with EXACTLY the module family design doc §1 prescribes
 * for a generated world: the six-module common front (traversal/status/
 * combat/cognition/perception-filter/simulation-inspector, in order, ahead
 * of the stack) plus buildWorldStack's own modules. `omitModuleId` drops one
 * strategic id post-hoc, simulating "a fake engine missing one strategic
 * module" for the negative proof below.
 */
function buildFakeGeneratedEngine(omitModuleId?: string): Engine {
  const stack = buildWorldStack({
    playerId: 'player',
    factions: [{ factionId: 'fake-faction', entityIds: [], cohesion: 0.5 }],
    districts: [{ id: 'fake-district', name: 'Fake District', zoneIds: ['fake-zone'], tags: [] }],
  });
  const allModules = [
    traversalCore,
    statusCore,
    combatCore,
    createCognitionCore({ decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 } }),
    createPerceptionFilter(),
    createSimulationInspector(),
    ...stack.modules,
  ];
  const modules = omitModuleId ? allModules.filter((m) => m.id !== omitModuleId) : allModules;
  return new Engine({
    manifest: {
      id: 'fake-generated-world',
      title: 'Fake Generated World',
      version: '1.0.0',
      engineVersion: '>=3.9.0 <4.0.0',
      ruleset: FAKE_RULESET.id,
      modules: [],
      contentPacks: [],
    },
    seed: 1,
    ruleset: FAKE_RULESET,
    modules,
  });
}

describe('WO-A1-8: world-source module-family parity sentinel', () => {
  it('allowlist sanity: a correctly-composed fake generated-world engine already matches the pack\'s strategic set today (no dependency on world-gen.ts)', () => {
    const packEngine = createGame(7);
    const fakeEngine = buildFakeGeneratedEngine();
    expect(strategicModuleIds(fakeEngine)).toEqual(strategicModuleIds(packEngine));
  });

  it('negative proof: a fake engine missing one strategic module (opportunity-core) trips the sentinel', () => {
    // opportunity-core has no `dependsOn` declared against it anywhere in the
    // installed dist (verified: `grep dependsOn` across every strategic
    // module file names only cognition-core/environment-core/district-core
    // as depended-upon ids) -- omitting it lets Engine construction succeed
    // so the comparison itself is what trips, rather than the engine's own
    // dependency guard throwing first (as district-core's omission does,
    // since defeat-fallout declares `dependsOn: ['district-core']`).
    const packEngine = createGame(7);
    const brokenFakeEngine = buildFakeGeneratedEngine('opportunity-core');

    expect(strategicModuleIds(brokenFakeEngine).has('opportunity-core')).toBe(false);
    expect(strategicModuleIds(packEngine).has('opportunity-core')).toBe(true);
    expect(strategicModuleIds(brokenFakeEngine)).not.toEqual(strategicModuleIds(packEngine));
  });

  it('negative proof: omitting a module a strategic peer depends on (district-core) fails even louder -- Engine construction itself throws', () => {
    // defeat-fallout declares dependsOn: ['district-core'], so a "fake
    // engine" missing district-core never gets far enough to compare module
    // sets at all -- the engine's own dependency contract refuses to
    // construct it. Documents that this failure mode exists distinctly from
    // the silent-mismatch case above.
    expect(() => buildFakeGeneratedEngine('district-core')).toThrow(/district-core/);
  });

  // RED on current main -- see the file-header sequencing note. Goes green
  // once runtime-foundry's world-gen.ts adopts buildWorldStack (design doc
  // §1) at stitch.
  it('a real generated world and a real pack world register the identical strategic module-id set', async () => {
    const packEngine = createGame(7);
    const client = createFakeClient({ structuredData: makeParityWorldGenProposal({ title: 'Real Parity World' }) });
    const result = await generateWorld(client, 'A real parity test world', 11);

    expect(result.ok).toBe(true);
    const generatedEngine = result.engine!;

    expect(strategicModuleIds(generatedEngine)).toEqual(strategicModuleIds(packEngine));
  });
});

describe('WO-A1-9: generated quests reach engine state (R2)', () => {
  const registeredGameIds: string[] = [];
  afterEach(() => {
    for (const gameId of registeredGameIds.splice(0)) unregisterQuestContent(gameId);
  });

  // RED on current main -- world-gen.ts does not yet map proposal.quests
  // into a QuestCoreConfig passed to buildWorldStack (design doc §3), so no
  // quest-core module registers and getQuestDefinitions() returns []. Goes
  // green once runtime-foundry lands §3's mapping+validation.
  it('registers the mapped quest definitions in the engine quest registry after construction', async () => {
    const proposal = makeParityWorldGenProposal({
      title: 'Quest Reaches Engine World',
      quests: [
        {
          id: 'q-parity-reaches-engine',
          name: 'Parity Quest',
          description: 'Investigate the market square disturbance and report back to the guard captain',
          stages: [{ id: 's1', description: 'Investigate the disturbance' }],
        },
      ],
    });
    const client = createFakeClient({ structuredData: proposal });

    const result = await generateWorld(client, 'quest reaches engine world', 21);
    expect(result.ok).toBe(true);
    registeredGameIds.push(result.engine!.world.meta.gameId);

    const defs = getQuestDefinitions(result.engine!.world);
    expect(defs.map((d) => d.id)).toEqual(['q-parity-reaches-engine']);
  });

  // RED on current main for the same reason as above (no mapping yet exists
  // to validate or drop). Goes green at stitch.
  it('drops a quest that fails validateQuestDefinition with a logger warning, and the world still boots', async () => {
    const proposal = makeParityWorldGenProposal({
      title: 'Invalid Quest World',
      quests: [
        {
          id: 'q-parity-valid',
          name: 'Valid Parity Quest',
          description: 'A quest that should survive validation',
          stages: [{ id: 's1', description: 'Do the valid thing' }],
        },
        {
          // Empty id fails content-schema's validateQuestDefinition
          // (reqStr(c, v, 'id')) -- the first-problem the design doc's §3
          // drop-with-warning contract must name.
          id: '',
          name: 'Broken Parity Quest',
          description: 'A quest that should be dropped, not crash world creation',
          stages: [{ id: 's1', description: 'Never offered' }],
        } as WorldGenProposalQuest,
      ],
    });
    const logger = createTestLogger();
    const client = createFakeClient({ structuredData: proposal });

    const result = await generateWorld(client, 'invalid quest world', 22, { logger });
    expect(result.ok).toBe(true);
    registeredGameIds.push(result.engine!.world.meta.gameId);

    const defs = getQuestDefinitions(result.engine!.world);
    expect(defs.map((d) => d.id)).toEqual(['q-parity-valid']);
    expect(logger.getEntries()).toContainEqual(
      expect.objectContaining({ level: 'warn', subsystem: 'world-gen' }),
    );
  });
});

// Local alias so the invalid-quest fixture above can be typed without
// depending on runtime-foundry's own test file (src/foundry/world-gen.test.ts
// is outside this domain's owned globs). Structurally identical to
// WorldGenProposal['quests'][number] as of this wave's design doc §3.
type WorldGenProposalQuest = {
  id: string;
  name: string;
  description: string;
  stages: Array<{ id: string; description: string }>;
};
