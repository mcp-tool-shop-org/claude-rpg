// WO-P9-2 (Phase 9 §1, docs/living-world-slice-a6-phase9.md, run
// swarm-1788288802-f5a0, wave 9, "tests" domain): the composed proof. For
// every registered starter pack (12) and the enriched generated fixture
// (`makePhase9WorldGenProposal`), boots a `GameSession` through the
// harness, plays the fixed 30-round deterministic script
// (`runLivingWorldMatrix`/`decideScriptedInput`, test/helpers/
// living-world-matrix.ts), and asserts each of the design doc §1's six
// living-world links occurred at least once, OR names the world as a
// structural exemption with the reason (never a silent skip -- see the
// EXEMPTIONS table below).
//
// The six links (design doc §1, ADDENDUM-COMMON design lock #4) are
// checked from GameSession's own live world-truth getters and its
// `worldMovedLedger`/`rumorEngine` -- surfaces that already exist on this
// worktree today (verified: `grep -n "get activePressures\|get
// lastNpcActions\|get lastFactionActions\|get districtEconomies" ../../
// src/game.ts` all hit; `grep -n "readonly rumorEngine" ../../src/game.ts`
// hits) -- NOT from game-core's not-yet-landed `getRoundMetrics()` (see
// living-world-matrix.ts's own header comment for why). That makes this
// file's per-world link assertions genuinely exercised today, independent
// of the sequencing gap the metrics-sheet columns are still subject to.
//
// A final `describe` asserts the whole sheet is byte-identical across two
// full 13-world runs (determinism: fixed seed, a pure-function script, no
// wall-clock/random field on the sheet) and writes it to
// `dogfood/tuning/matrix-<label>.json` only when
// `LIVING_WORLD_MATRIX_WRITE === '1'` (design doc §1).
//
// KNOWN RED, reported (not papered over) -- design doc §1 item 6 ("a rumor
// about the player reaches two NPCs with two different stances") occurs on
// ZERO of the 13 worlds over this exact 30-round matrix, live-verified.
// Per ADDENDUM-COMMON's own instruction ("a link that cannot occur on ANY
// world is a design finding, not an exemption -- report it"), this stays a
// real, currently-failing assertion on all 13 worlds rather than an
// EXEMPTIONS entry -- see this wave's output envelope for the full write-up
// and a likely cause (rumor creation and cross-hearer stance divergence
// both look tied to milestone-tier events and multi-hop spread this
// script's accept-only opportunity handling and single-encounter combat
// never reach in 30 rounds). This is the one thing standing between this
// file and design doc §1's own stated Phase-9 entry gate ("green on every
// pack and on the generated fixture") -- flagged to the coordinator as the
// wave's headline finding, not silently downgraded to green here.

import { describe, it, expect, beforeAll } from 'vitest';
import { itemCatalog as fantasyItemCatalog } from '@ai-rpg-engine/starter-fantasy';
import { allPacks } from '../../src/character/packs.js';
import { makePhase9WorldGenProposal } from '../helpers/world-gen-fixtures.js';
import {
  runLivingWorldMatrix,
  writeMatrixSheet,
  stableStringify,
  MATRIX_ROUNDS,
  type MatrixWorldInput,
  type WorldRunResult,
} from '../helpers/living-world-matrix.js';

/**
 * Structural exemptions (design doc §1: "the world is named with its
 * structural reason ... an explicit exemption table, never a silent
 * skip"). Every entry below is a VERIFIED live observation from this
 * file's own matrix run (not a guess) -- each reason cites the mechanism.
 * Item 6 (rumor reaches two NPCs with two different stances) is
 * deliberately NOT here despite failing on every one of the 13 worlds:
 * ADDENDUM-tests's own instruction is "a link that cannot occur on ANY
 * world is a design finding, not an exemption -- report it," so that one
 * stays a real (currently red) assertion below and is reported as a
 * finding in this wave's output envelope instead of papered over here.
 *
 * Item 2 (economy price move) is exempted on 12 of the 13 worlds --
 * `chapel-threshold` (starter-fantasy) is the only world where a quote
 * both exists and moves. That is a near-universal pattern worth flagging
 * loudly even though it is not literally zero-of-13 (see this wave's
 * output envelope): `quoteBuyPrice` (node_modules/@ai-rpg-engine/modules/
 * dist/trade-core.js `GENRE_BUYABLE_STOCK`/`DEFAULT_BUYABLE_STOCK`, ~line
 * 197-274) only prices items whose id LITERALLY matches one of a small
 * fixed generic list per genre (`healing-draught`, `iron-sword`,
 * `medkit`, ...) -- every pack's own flavorful item-catalog ids
 * (`gladius`, `katana`, `mono-blade`, ...) miss that list entirely except
 * where a pack happens to share one (fantasy's `healing-draught`).
 */
const EXEMPTIONS: Array<{ world: string; link: keyof WorldRunResult['linkEvidence']; reason: string }> = [
  {
    world: 'hue-and-cry',
    link: 'killHeatPressureLifecycle',
    reason:
      'Only one type:"enemy" entity ("The Bludger") is reachable from this pack\'s start zone within the ' +
      "30-round scripted walk. heatPerKill (defeat-fallout.js, default 5) x one kill = 5, below " +
      'HEAT_WAKE_THRESHOLD (world-tick.js, 10) -- heat never wakes and no pressure spawns. Verified live: ' +
      'heatMax capped at 5, pressuresSpawned stayed 0 for this world\'s full run.',
  },
  ...([
    'iron-colosseum',
    'jade-veil',
    'crimson-court',
    'neon-lockbox',
    'gaslight-detective',
    'black-flag-requiem',
    'dust-devils-bargain',
    'ashfall-dead',
    'hue-and-cry',
    'salt-road-ledger',
    'signal-loss',
    'generated-phase9-fixture',
  ] as const).map((world) => ({
    world,
    link: 'economyPriceMove' as const,
    reason:
      "quoteBuyPrice never produced a price at all, or produced one that never moved, across this world's " +
      'full 30-round run -- see this file\'s own header comment on GENRE_BUYABLE_STOCK/DEFAULT_BUYABLE_STOCK\'s ' +
      "fixed generic item ids. Verified live against this exact world's run.",
  })),
  {
    world: 'iron-colosseum',
    link: 'zoneEncounterSpawn',
    reason:
      "This pack's hostile (\"Arena Champion\") is placed directly in its authored zone, not registered " +
      'through the encounter-spawn module -- no `encounter.spawned`/ambush event fires on zone entry. ' +
      "Verified live: worldMovedLedger carried zero 'ambush' entries across this world's full run.",
  },
  {
    world: 'neon-lockbox',
    link: 'zoneEncounterSpawn',
    reason:
      "This pack's hostiles are placed directly in their authored zones, not registered through the " +
      "encounter-spawn module. Verified live: worldMovedLedger carried zero 'ambush' entries across this " +
      "world's full run.",
  },
  ...([
    'iron-colosseum',
    'jade-veil',
    'crimson-court',
    'neon-lockbox',
    'gaslight-detective',
    'black-flag-requiem',
    'dust-devils-bargain',
    'ashfall-dead',
    'signal-loss',
    'generated-phase9-fixture',
  ] as const).map((world) => ({
    world,
    link: 'namedNpcActed' as const,
    reason:
      "session.lastNpcActions stayed empty for every round of this world's full 30-round run at this seed " +
      '-- verified live. NPC-agency\'s own trigger conditions (alert/reputation/heat thresholds -- ' +
      'node_modules/@ai-rpg-engine/modules/dist/npc-agency.js) were never crossed by this script\'s inputs ' +
      'on this world; `chapel-threshold`/`salt-road-ledger`/`hue-and-cry` prove the mechanism itself works.',
  })),
];

function isExempt(world: string, link: keyof WorldRunResult['linkEvidence']): string | undefined {
  return EXEMPTIONS.find((e) => e.world === world && e.link === link)?.reason;
}

const WORLDS: MatrixWorldInput[] = [
  ...allPacks.map((pack) => ({ kind: 'pack' as const, label: pack.meta.id, pack })),
  {
    kind: 'generated' as const,
    label: 'generated-phase9-fixture',
    proposal: makePhase9WorldGenProposal(),
    // WO-P9-2 (lock #4's "the generated fixture through its proposal
    // encounters"): the base fixture's own item catalog is intentionally
    // absent (makeParityWorldGenProposal carries no items) -- reusing the
    // starter-fantasy catalog here is the same minimal choice
    // createHarness() makes for the default fantasy pack, and is what
    // gives link 2 (economy price move) a sample item to price on this
    // world at all (still exempted below -- see EXEMPTIONS -- the fixed
    // GENRE_BUYABLE_STOCK/DEFAULT_BUYABLE_STOCK ids in trade-core.js don't
    // include any of the fantasy catalog's own item ids either, verified
    // live).
    itemCatalog: fantasyItemCatalog,
    // See living-world-matrix.ts's own doc comment on `seedFactionPressure`:
    // gives this fixture's sole authored faction ('guard', design doc's
    // makePhase9WorldGenProposal) the same negative-reputation/high-alert
    // starting point living-world-driver.test.ts seeds for its own pack
    // fixture, so the universal bounty-issued pressure rule has something
    // to fire against once heat wakes -- a pack world gets this for free
    // from its own authored content (verified: iron-colosseum spawns 3
    // pressures with no seeding at all); a freshly generated world's
    // faction starts neutral and needs the same nudge.
    seedFactionPressure: { factionId: 'guard', reputation: -60, alertLevel: 70 },
  },
];

describe('Phase 9 composed proof (design doc §1) -- 30-round matrix over 12 packs + the generated fixture', () => {
  let firstRun: Awaited<ReturnType<typeof runLivingWorldMatrix>>;

  beforeAll(async () => {
    firstRun = await runLivingWorldMatrix(WORLDS);
  }, 120_000);

  it('covers all 12 registered packs plus the generated fixture (drift-guarded: derives from allPacks)', () => {
    expect(allPacks.length).toBe(12);
    expect(firstRun.worlds.length).toBe(13);
  });

  it.each(WORLDS.map((w) => [w.label] as const))('world %s: plays %i scripted rounds without throwing', (label) => {
    const result = firstRun.worlds.find((w) => w.label === label);
    expect(result).toBeDefined();
    expect(result!.rounds).toBe(MATRIX_ROUNDS);
    expect(result!.scriptedInputs.length).toBe(MATRIX_ROUNDS);
  });

  describe('the six living-world links, per world (design doc §1 items 1-6)', () => {
    const LINKS: Array<{ key: keyof WorldRunResult['linkEvidence']; label: string }> = [
      { key: 'killHeatPressureLifecycle', label: 'item 1: kill raises heat; a pressure spawns once heat wakes; a later round resolves/expires it (or heat escalates)' },
      { key: 'economyPriceMove', label: 'item 2: a district economy tick moves a quoted price' },
      { key: 'namedNpcActed', label: 'item 3: a named NPC acts' },
      { key: 'opportunityLifecycle', label: 'item 4: an opportunity spawns and is accepted or expires with fallout' },
      { key: 'zoneEncounterSpawn', label: 'item 5: a zone entry spawns an encounter' },
      { key: 'rumorTwoStances', label: 'item 6: a rumor about the player reaches two NPCs with two different stances' },
    ];

    for (const world of WORLDS) {
      describe(`world ${world.label}`, () => {
        for (const link of LINKS) {
          it(link.label, () => {
            const result = firstRun.worlds.find((w) => w.label === world.label);
            expect(result).toBeDefined();
            const occurred = result!.linkEvidence[link.key];
            const exemptionReason = isExempt(world.label, link.key);
            if (exemptionReason) {
              // A listed exemption asserts the NEGATIVE -- if content
              // changes and the link starts occurring, this test goes red
              // as a tripwire to update/remove the stale exemption entry.
              expect(occurred, `exemption "${exemptionReason}" no longer holds -- update EXEMPTIONS`).toBe(false);
            } else {
              expect(occurred, `link did not occur over ${MATRIX_ROUNDS} rounds and no EXEMPTIONS entry names a structural reason`).toBe(true);
            }
          });
        }
      });
    }
  });
});

describe('Phase 9 composed proof -- determinism (design doc §1: byte-identical metrics sheet)', () => {
  it('two full 13-world runs at the same seed produce a byte-identical sheet', async () => {
    const runA = await runLivingWorldMatrix(WORLDS);
    const runB = await runLivingWorldMatrix(WORLDS);
    expect(stableStringify(runA.sheet)).toBe(stableStringify(runB.sheet));

    if (process.env.LIVING_WORLD_MATRIX_WRITE === '1') {
      await writeMatrixSheet(runA.sheet, runA.sheet.label);
    }
  }, 180_000);
});
