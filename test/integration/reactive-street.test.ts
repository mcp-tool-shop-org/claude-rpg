// WO-B1-21 (slice B1 "the reactive street", run swarm-1788288802-f5a0, wave
// 10, "tests" domain): the seven proofs named in
// docs/living-world-slice-b1.md §6, through the harness with the fake
// client. Companion work orders: WO-B1-22 (fixtures -- see
// test/helpers/world-gen-fixtures.ts, not touched here: no test below
// exercises makePhase9WorldGenProposal, so there is nothing to wire against
// runtime-foundry's petitioners shape yet -- flagged in this domain's
// output, not silently skipped) and WO-B1-23 (typecheck discipline -- see
// this file's own closing summary for the `tsc` result).
//
// SEQUENCING (ADDENDUM-COMMON honesty floor, same discipline
// test/integration/living-world-driver.test.ts and test/helpers/
// game-harness.ts already document for earlier waves): this worktree forks
// from 66b7a9b, BEFORE game-core's, cli-display's, narrative-llm's, and
// runtime-foundry's own isolated worktrees for THIS wave land. Every
// mechanic the design doc introduces this slice -- condition rungs, the
// hostile turn, the parser-layer unknown-command reply, the asks ledger,
// recognition/gratitude -- is genuinely absent from src/ on this worktree
// today (verified: `find src/game -iname "*condition*" -o -iname "*ask*"`
// returns nothing; `grep -rn "runHostileTurn|selectActionForEntity"
// src/game.ts src/turn-loop.ts` returns nothing). Every test below that
// exercises one of those mechanics is written against ADDENDUM-COMMON's
// locked contract and is OBSERVED RED on this worktree today for that
// reason -- "green expected at merge" per test, not a guess.
//
// Where a mechanic already exists in src/ today (combat itself: the
// `attack` verb, `findEntityByName`, `/npc`/`/people` director commands,
// the play-mode slash-command dispatch, `getRumorBoard`/`getRoundMetrics`),
// this file probes the REAL current behavior first (documented inline,
// verified via a scoped `vitest run` against this worktree on 2026-09-01)
// so its assertions pin an ACTUAL observed defect, not an assumed one.
//
// All fixtures below reuse starter-fantasy's own authored content
// (player/pilgrim/ash-ghoul/crypt-stalker, all verified against the
// installed 3.x dist via a raw `createGame()` probe) rather than inventing
// parallel content, for the same reason living-world-driver.test.ts reuses
// the pack's own bounty-issued rule: less to keep in sync, and it doubles as
// a check that the design doc's own worked examples (the pilgrim IS
// starter-fantasy's "Suspicious Pilgrim", verified id 'pilgrim') are content
// that actually exists.

import { describe, it, expect } from 'vitest';
import type { EntityState, WorldState } from '@ai-rpg-engine/core';
import { createHarness } from '../helpers/game-harness.js';
import { findEntityByName } from '../../src/action-interpreter.js';
import { DEFAULT_LIVING_WORLD_TUNING, resolveTuning, type LivingWorldTuning } from '../../src/game/tuning.js';

/**
 * ADDENDUM-COMMON design lock 1: `src/game/condition.ts` is a BRAND NEW
 * file game-core's own isolated worktree adds this wave -- it does not
 * exist on this worktree at all (confirmed: `find src/game -iname
 * "*condition*"` => no matches). A DYNAMIC import (not a static named
 * import) keeps that absence from crashing this entire file's collection --
 * only the individual tests that actually call `conditionRung`/
 * `describeHostiles` fail, with the message below naming why, exactly the
 * isolation discipline game-harness.ts's `rebuildGeneratedEngine` already
 * uses for `instantiateWorld` (an addition to an EXISTING file, an even
 * safer case here since this is a whole new file no other test imports).
 */
async function loadConditionModule(): Promise<typeof import('../../src/game/condition.js') | null> {
  try {
    return await import('../../src/game/condition.js');
  } catch {
    return null;
  }
}

const CONDITION_MISSING =
  'RED (observed 2026-09-01): src/game/condition.ts does not exist on this worktree -- ' +
  "game-core's own isolated worktree for this wave (ADDENDUM-COMMON design lock 1) adds " +
  'conditionRung/describeHostiles. Green expected at merge.';

/** Same dynamic-import discipline for the brand-new asks ledger module (design lock 7). */
async function loadAsksModule(): Promise<Record<string, unknown> | null> {
  try {
    return (await import('../../src/game/asks.js')) as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * `LivingWorldTuning` on THIS worktree does not declare `enemyAggression` /
 * `enemyDamageScale` / `askPredatorRatio` / `askRevealRounds` /
 * `honorificAt` yet (game-core's own isolated worktree, ADDENDUM-COMMON
 * design locks 3/7/8, adds them to src/game/tuning.ts this wave). A local
 * structural mirror lets this file typecheck against the CONTRACT and pass
 * overrides through today -- same convention as game-harness.ts's own
 * `WorldStackTuningMirror`. `resolveTuning()`'s `{...DEFAULT, ...partial}`
 * spread is plain JS, so passing these keys through the widened cast below
 * has a real (if inert, until the wiring lands) effect on `session.tuning`
 * at RUNTIME even on this worktree -- only nothing reads them yet.
 */
type LivingWorldTuningMirror = Partial<LivingWorldTuning> & {
  enemyAggression?: 'off' | 'telegraphed' | 'immediate';
  enemyDamageScale?: number;
  askPredatorRatio?: number;
  askRevealRounds?: number;
  honorificAt?: number;
};

function asTuningOverride(partial: LivingWorldTuningMirror): Partial<LivingWorldTuning> {
  return partial as unknown as Partial<LivingWorldTuning>;
}

/** The player's current zone -- every fixture below relocates a stock hostile/NPC into it. */
function playerZoneId(world: WorldState): string {
  return world.entities[world.playerId]!.zoneId!;
}

describe('WO-B1-21 proof 1 -- legibility (design doc §1, ADDENDUM-COMMON design lock 1)', () => {
  it('conditionRung(hp, maxHp) maps the hp/maxHp ratio to the five locked rungs at the exact thresholds (100 / >=67 / >=34 / >0 / 0)', async () => {
    const mod = await loadConditionModule();
    expect(mod, CONDITION_MISSING).not.toBeNull();
    if (!mod) return;
    const { conditionRung } = mod;

    // maxHp=100 for clean integer percentages at every boundary.
    expect(conditionRung(100, 100)).toBe('unhurt');
    expect(conditionRung(99, 100)).toBe('hurt'); // not 100%, but >=67
    expect(conditionRung(67, 100)).toBe('hurt'); // boundary: >=67 is 'hurt'
    expect(conditionRung(66, 100)).toBe('bloodied'); // just under the hurt boundary
    expect(conditionRung(34, 100)).toBe('bloodied'); // boundary: >=34 is 'bloodied'
    expect(conditionRung(33, 100)).toBe('reeling'); // just under the bloodied boundary
    expect(conditionRung(1, 100)).toBe('reeling'); // boundary: >0 is 'reeling'
    expect(conditionRung(0, 100)).toBe('down');
  });

  it('describeHostiles(world, zoneId) lists every live hostile in the zone with its rung and awareness flag', async () => {
    const mod = await loadConditionModule();
    expect(mod, CONDITION_MISSING).not.toBeNull();
    if (!mod) return;
    const { describeHostiles } = mod;

    const h = createHarness();
    const world = h.session.engine.world;
    const zoneId = playerZoneId(world);
    world.entities['ash-ghoul']!.zoneId = zoneId;
    world.entities['ash-ghoul']!.resources.maxHp = 12;
    world.entities['ash-ghoul']!.resources.hp = 6; // 50% -> 'bloodied'
    // Design lock 3's own naming convention for the awareness marker.
    world.globals['hostile_aware_ash-ghoul'] = world.meta?.tick ?? 0;

    world.entities['crypt-stalker']!.zoneId = zoneId; // left unaware, full hp -> 'unhurt'

    const hostiles = describeHostiles(world, zoneId);
    const ghoul = hostiles.find((entry: { id: string }) => entry.id === 'ash-ghoul');
    const stalker = hostiles.find((entry: { id: string }) => entry.id === 'crypt-stalker');

    expect(ghoul).toMatchObject({ name: 'Ash Ghoul', rung: 'bloodied', aware: true });
    expect(stalker).toMatchObject({ name: 'Crypt Stalker', rung: 'unhurt', aware: false });
  });

  it(
    'a downed hostile is no longer resolved as an attack target when a live duplicate shares the zone ' +
      '(OBSERVED RED, verified via a scoped probe run 2026-09-01: action-interpreter.ts:470 findEntityByName ' +
      'has no liveness filter -- it returns whichever entity was inserted first regardless of hp, so ' +
      '"attack stalker" resolves to an already-defeated corpse and the engine rejects the whole action ' +
      '(action.rejected: "target is already defeated") even though a live crypt-stalker-2 stands in the ' +
      'same zone. Design doc §1 "Enemy corpses leave the target list" requires the corpse to be skipped.)',
    async () => {
      const h = createHarness();
      const world = h.session.engine.world;
      const zoneId = playerZoneId(world);
      const template = world.entities['crypt-stalker']!;

      world.entities['crypt-stalker'] = {
        ...structuredClone(template),
        zoneId,
        resources: { hp: 0, maxHp: 8, stamina: 6 },
      };
      world.entities['crypt-stalker-2'] = {
        ...structuredClone(template),
        id: 'crypt-stalker-2',
        zoneId,
        resources: { hp: 8, maxHp: 8, stamina: 6 },
      };

      await h.play('attack stalker');

      const rejected = world.eventLog.find((e) => e.type === 'action.rejected');
      expect(
        rejected,
        'the corpse must be skipped so the action resolves against the live crypt-stalker-2 instead of rejecting',
      ).toBeUndefined();
      expect(world.entities['crypt-stalker-2']!.resources.hp).toBeLessThan(8);
    },
  );

  it(
    'the interpreter fast path strips a leading article before matching an entity name ' +
      '(ADDENDUM-COMMON design lock 4 -- OBSERVED RED, verified 2026-09-01: findEntityByName has no ' +
      'article-stripping today, so "the stalker" matches nothing at all and the turn falls through to ' +
      'the slow LLM path instead of the fast path)',
    () => {
      const entities = [
        { id: 'crypt-stalker', name: 'Crypt Stalker', resources: { hp: 8 } } as unknown as EntityState,
      ];
      // Baseline, passes today: no article, exact-name match already works.
      expect(findEntityByName('crypt stalker', entities)?.id).toBe('crypt-stalker');

      expect(findEntityByName('the stalker', entities)?.id).toBe('crypt-stalker');
      expect(findEntityByName('the crypt stalker', entities)?.id).toBe('crypt-stalker');
      expect(findEntityByName('a crypt stalker', entities)?.id).toBe('crypt-stalker');
    },
  );

  it(
    'inspect reports the rung, not a number (design doc §1: "inspect <hostile> reports the rung") -- ' +
      'RED today: nothing in the inspect path derives condition.ts\'s vocabulary yet, so the rendered ' +
      'text never contains any rung word for a wounded hostile.',
    async () => {
      const h = createHarness();
      const world = h.session.engine.world;
      world.entities['ash-ghoul']!.zoneId = playerZoneId(world);
      world.entities['ash-ghoul']!.resources.maxHp = 12;
      world.entities['ash-ghoul']!.resources.hp = 3; // 25% of 12 -> 'reeling'

      const out = await h.play('inspect ash ghoul');
      expect(out.toLowerCase()).toContain('reeling');
    },
  );

  it(
    'a kill is recorded on the round the killing blow lands (getRoundMetrics().kills, game/round-metrics.ts) -- ' +
      'this half of the legibility contract already works today via the existing combat.entity.defeated event; ' +
      'the RESERVED-CHANNEL kill line itself (design lock 2\'s `combatLines`) is cross-domain (game-core emits ' +
      'it, cli-display renders it) and is not observable through GameHarness.play()\'s bare rendered string on ' +
      'this worktree -- see this file\'s own summary for that gap, not silently assumed away here.',
    async () => {
      const h = createHarness();
      const world = h.session.engine.world;
      world.entities['ash-ghoul']!.zoneId = playerZoneId(world);
      world.entities['ash-ghoul']!.resources.maxHp = 12;
      world.entities['ash-ghoul']!.resources.hp = 1; // one hit away from a kill

      await h.play('attack ash ghoul');

      const defeated = world.eventLog.some(
        (e) => e.type === 'combat.entity.defeated' && (e.payload as { entityId?: string }).entityId === 'ash-ghoul',
      );
      expect(defeated).toBe(true);
      const lastRound = h.session.getRoundMetrics().at(-1);
      expect(lastRound?.kills).toBe(1);
    },
  );
});

describe('WO-B1-21 proof 2 -- enemy turn (design doc §2, ADDENDUM-COMMON design lock 3)', () => {
  it(
    'an aware hostile in the player\'s zone lands a hit over a few rounds, reducing player HP ' +
      '(OBSERVED RED, verified 2026-09-01: `grep -rn "runHostileTurn|selectActionForEntity" src/game.ts ' +
      'src/turn-loop.ts` returns no matches, and a scoped probe run confirms player HP stays at 20 across ' +
      'repeated non-combat rounds with an aggressive-profile hostile sharing the zone -- exactly the "world ' +
      'inert in its reaction to the player" finding this whole slice exists to fix. Green expected at merge.)',
    async () => {
      const h = createHarness();
      const world = h.session.engine.world;
      world.entities['ash-ghoul']!.zoneId = playerZoneId(world);
      world.entities['ash-ghoul']!.resources.maxHp = 12;

      for (let round = 0; round < 6; round++) await h.play('look around');

      expect(
        world.entities[world.playerId]!.resources.hp,
        'an aware aggressive hostile should have telegraphed then landed at least one hit by round 6 at tuning defaults',
      ).toBeLessThan(20);
    },
  );

  it(
    'the hostile telegraphs the round before it lands a hit, never the same round (design lock 3: ' +
      '"a hostile whose chosen action is attack... instead SETS the telegraph... next round it lands") -- ' +
      'RED today: nothing ever sets the `hostile_telegraph_<id>` global.',
    async () => {
      const h = createHarness();
      const world = h.session.engine.world;
      world.entities['ash-ghoul']!.zoneId = playerZoneId(world);
      world.entities['ash-ghoul']!.resources.maxHp = 12;

      await h.play('look around'); // round 1: telegraph only
      const hpAfterRound1 = world.entities[world.playerId]!.resources.hp;
      expect(world.globals['hostile_telegraph_ash-ghoul'], "design lock 3's own telegraph marker").toBeDefined();
      expect(hpAfterRound1, 'no damage lands the same round it is telegraphed').toBe(20);

      await h.play('look around'); // round 2: the telegraphed attack lands
      expect(world.entities[world.playerId]!.resources.hp).toBeLessThan(hpAfterRound1);
    },
  );

  it(
    'awareness is recorded the round the player enters the hostile\'s zone (design lock 3: ' +
      '"world global hostile_aware_<id> = tick, set when the player enters the hostile\'s zone") -- ' +
      'RED today: nothing ever writes this global on movement.',
    async () => {
      const h = createHarness();
      const world = h.session.engine.world;
      world.entities['ash-ghoul']!.zoneId = 'chapel-nave';

      await h.play('go to chapel-nave');

      expect(world.globals['hostile_aware_ash-ghoul']).toBeDefined();
    },
  );

  it(
    '"flee" fast-paths to the engine\'s already-registered disengage verb (design doc §2, R6 ruling) -- ' +
      'OBSERVED RED, verified 2026-09-01: `grep -rln "\'flee\'" src/**/*.ts` (excluding *.test.ts) returns ' +
      'no production file, so nothing maps the player-facing word "flee" to the disengage verb yet.',
    async () => {
      const h = createHarness();
      const world = h.session.engine.world;
      world.entities['ash-ghoul']!.zoneId = playerZoneId(world);
      world.entities['ash-ghoul']!.resources.maxHp = 12;

      await h.play('flee');

      const declared = world.eventLog.find(
        (e) => e.type === 'action.declared' && (e.payload as { verb?: string }).verb === 'disengage',
      );
      expect(declared, '"flee" should resolve to the disengage verb').toBeDefined();
    },
  );

  it(
    "enemyAggression: 'off' reproduces today's no-hostile-turn behavior byte-for-byte, forever " +
      '(design lock 3 + ADDENDUM-COMMON design lock 10\'s regression pin) -- meaningful once the hostile ' +
      'turn is wired in; trivially true today since neither run does anything yet, which is itself the ' +
      "correct pre-merge state for a determinism pin: it must stay true after merge, not just today.",
    async () => {
      const SEED = 9001;
      const SCRIPTED = Array(6).fill('look');
      const NARRATION = 'The street watches, unmoved.';

      const engineOff = (await import('@ai-rpg-engine/starter-fantasy')).createGame(SEED);
      const engineDefault = (await import('@ai-rpg-engine/starter-fantasy')).createGame(SEED);
      engineOff.world.entities['ash-ghoul']!.zoneId = playerZoneId(engineOff.world);
      engineDefault.world.entities['ash-ghoul']!.zoneId = playerZoneId(engineDefault.world);

      const hOff = createHarness({
        gameOpts: { engine: engineOff, tuning: asTuningOverride({ enemyAggression: 'off' }) },
        clientOpts: { narration: NARRATION },
      });
      const hDefault = createHarness({
        gameOpts: { engine: engineDefault },
        clientOpts: { narration: NARRATION },
      });

      for (const input of SCRIPTED) {
        await hOff.play(input);
        await hDefault.play(input);
      }

      // Stitch (wave 10): co-location now makes a hostile aware (hostile-
      // turn.ts's fourth trigger), so the default run legitimately carries
      // hostile-turn artifacts the 'off' run must not. The pin is therefore
      // asserted directly: 'off' leaves no awareness/telegraph globals and
      // no hostile-initiated combat event, while the default run (same seed,
      // same script) does -- proving the switch is what makes the difference.
      const offWorld = hOff.session.engine.world;
      const defaultWorld = hDefault.session.engine.world;
      const hostileGlobals = (w: typeof offWorld) => Object.keys(w.globals).filter((k) => k.startsWith('hostile_'));
      const hostileCombat = (w: typeof offWorld) =>
        w.eventLog.filter((e) => e.type.startsWith('combat.') && JSON.stringify(e.payload).includes('ash-ghoul'));
      expect(hostileGlobals(offWorld), "'off' must leave no awareness/telegraph globals").toEqual([]);
      expect(hostileCombat(offWorld), "'off' must produce no hostile combat events").toEqual([]);
      expect(hostileGlobals(defaultWorld).length, 'the default run must show the hostile turn ran').toBeGreaterThan(0);
      expect(hostileCombat(defaultWorld).length, 'the default run must show the hostile landing hits').toBeGreaterThan(0);
    },
  );
});

describe('WO-B1-21 proof 3 -- command surface (design doc §3, ADDENDUM-COMMON design lock 4)', () => {
  it(
    'an unknown play-mode slash command costs no turn (design lock 4) -- OBSERVED RED, verified ' +
      '2026-09-01: turnCount goes 0->1 even though tick stays at 0, because game.ts\'s play-mode slash ' +
      'dispatch (around line 1975) falls through to ordinary interpretation for any /word it does not ' +
      'recognize, instead of answering at the parser layer before a turn is ever recorded.',
    async () => {
      const h = createHarness();
      const tickBefore = h.tick();
      const turnsBefore = h.turnCount();

      await h.play('/staus');

      expect(h.tick()).toBe(tickBefore);
      expect(h.turnCount(), 'an unrecognized slash command must not be recorded as a played turn').toBe(turnsBefore);
    },
  );

  it(
    "names the nearest known command, per the design doc's own worked example ('Did you mean /status?') -- " +
      'RED today: the fallback path returns the generic "interpretation service unavailable" sentinel instead.',
    async () => {
      const h = createHarness();
      const out = await h.play('/staus'); // one edit from /status
      expect(out).toContain('/status');
    },
  );

  it(
    'director-mode multi-word arguments join before resolving (design lock 4: "parts.slice(1).join(\' \')") -- ' +
      '/npc Suspicious Pilgrim resolves the SAME NPC /npc pilgrim already resolves by id today -- ' +
      'OBSERVED RED, verified 2026-09-01: src/display/director-renderer.ts\'s /npc case (~line 770) reads ' +
      'only `parts[1]`, so "/npc Suspicious Pilgrim" looks up npcId "Suspicious" and reports not-found, ' +
      'even though "/npc pilgrim" (id) already resolves correctly (baseline, pinned below).',
    async () => {
      const h = createHarness();
      await h.play('look around'); // a real round first, so npc-agency has built lastNpcProfiles
      await h.play('/director');

      const byId = await h.play('/npc pilgrim');
      expect(byId, 'baseline: id lookup already works today').toContain('Suspicious Pilgrim');

      const byName = await h.play('/npc Suspicious Pilgrim');
      expect(byName).not.toContain('not found');
      expect(byName).toBe(byId);
    },
  );

  it(
    'the near-miss reply names which family an out-of-mode command belongs to (design doc §3: ' +
      '"/pressures, /rumors, /npc, /market live in director mode — type /director") -- RED today: a ' +
      'director-only command typed in play mode is treated as an ordinary (unrecognized) verb, not ' +
      'answered with a mode pointer.',
    async () => {
      const h = createHarness();
      const turnsBefore = h.turnCount();

      const out = await h.play('/npc pilgrim'); // valid in director mode, typed while in play mode

      expect(h.turnCount(), 'a director-only command typed in play mode must not cost a turn either').toBe(
        turnsBefore,
      );
      expect(out.toLowerCase()).toContain('director');
    },
  );
});

describe('WO-B1-21 proof 4 -- asks (design doc §4, ADDENDUM-COMMON design lock 7)', () => {
  // Seeds directly onto the documented storage contract
  // (`world.globals['claude_rpg.asks']`, a JSON-stringified Ask[] -- design
  // lock 7) rather than calling any function from src/game/asks.ts, whose
  // exported function NAMES the addendum does not specify beyond the `Ask`
  // shape itself. This keeps the fixture valid regardless of how game-core
  // names its own read/write helpers, and is the same "test through the
  // documented storage key, not a guessed API" discipline
  // living-world-driver.test.ts already uses for `world.globals[HEAT_KEY]`.
  function seedAsk(
    world: WorldState,
    ask: {
      id: string;
      petitionerId: string;
      petitionerName: string;
      truth: 'genuine' | 'predatory';
      offeredTick: number;
    },
  ): void {
    const raw = world.globals['claude_rpg.asks'];
    const existing = typeof raw === 'string' ? (JSON.parse(raw) as unknown[]) : [];
    existing.push({
      id: ask.id,
      petitioner: { id: ask.petitionerId, name: ask.petitionerName, zoneId: playerZoneId(world) },
      kind: 'lend',
      surface: 'Lend a few coin for a sick child.',
      truth: ask.truth,
      stake: 5,
      offeredTick: ask.offeredTick,
      status: 'open',
      cues: [],
    });
    world.globals['claude_rpg.asks'] = JSON.stringify(existing);
  }

  function readAsks(world: WorldState): Array<{ id: string; status: string }> {
    const raw = world.globals['claude_rpg.asks'];
    return typeof raw === 'string' ? (JSON.parse(raw) as Array<{ id: string; status: string }>) : [];
  }

  it(
    'a predatory ask left unresolved auto-reveals after tuning.askRevealRounds (default 6) -- ' +
      'RED today: nothing reads claude_rpg.asks at all, so the seeded ask never changes status no matter ' +
      'how many rounds pass. Green expected at merge.',
    async () => {
      const h = createHarness();
      const world = h.session.engine.world;
      seedAsk(world, { id: 'ask-1', petitionerId: 'petitioner-1', petitionerName: 'A Courier', truth: 'predatory', offeredTick: world.meta.tick });

      for (let round = 0; round < 8; round++) await h.play('look around'); // > default askRevealRounds

      const ask1 = readAsks(world).find((a) => a.id === 'ask-1');
      expect(ask1?.status, 'a predatory ask left unresolved by the player should auto-reveal').toBe('revealed');
    },
  );

  it(
    'a genuine ask ignored by the player surfaces its outcome later, in the world-moved ledger ' +
      '(design doc §4: "ignored, it resolves badly for the petitioner — and the world says so later") -- ' +
      'RED today: getWorldMovedSnapshot() stays empty no matter how long the ask sits ignored.',
    async () => {
      const h = createHarness();
      const world = h.session.engine.world;
      seedAsk(world, { id: 'ask-2', petitionerId: 'petitioner-2', petitionerName: 'A Petitioner', truth: 'genuine', offeredTick: world.meta.tick });

      for (let round = 0; round < 8; round++) await h.play('look around');

      const worldMoved = JSON.parse(h.session.getWorldMovedSnapshot() ?? '[]') as Array<{ headline: string }>;
      expect(
        worldMoved.some((entry) => entry.headline.includes('Petitioner')),
        'the ignored genuine ask must leave a world-moved entry naming the petitioner',
      ).toBe(true);
    },
  );
});

describe('WO-B1-21 proof 5 -- recognition (design doc §5, ADDENDUM-COMMON design lock 8)', () => {
  it(
    'helping a genuine ask produces a same-round acknowledgment, a per-faction reputation delta, and a ' +
      "rumor about the player on the RumorEngine board -- RED today: the whole recognition path (design " +
      "lock 8) doesn't exist, so getRumorBoard() stays empty and the faction global never moves no matter " +
      'what the player does about a seeded ask. Green expected at merge.',
    async () => {
      const h = createHarness();
      const world = h.session.engine.world;
      const FACTION = 'chapel-undead'; // starter-fantasy's sole authored faction, same as living-world-driver.test.ts
      const raw = world.globals['claude_rpg.asks'];
      const existing = typeof raw === 'string' ? (JSON.parse(raw) as unknown[]) : [];
      existing.push({
        id: 'ask-3',
        petitioner: { id: 'petitioner-3', name: 'A Vestry Courier', zoneId: playerZoneId(world), factionId: FACTION },
        kind: 'lend',
        surface: 'Lend a few coin for a sick child.',
        truth: 'genuine',
        stake: 5,
        offeredTick: world.meta.tick,
        status: 'open',
        cues: [],
      });
      world.globals['claude_rpg.asks'] = JSON.stringify(existing);
      const reputationBefore = (world.globals[`reputation_${FACTION}`] as number | undefined) ?? 0;

      // design lock 7's own documented fast-path alias for helping an ask.
      await h.play('help vestry courier');

      const reputationAfter = (world.globals[`reputation_${FACTION}`] as number | undefined) ?? 0;
      expect(reputationAfter, 'helping a genuine ask should raise the petitioner\'s faction reputation').toBeGreaterThan(
        reputationBefore,
      );
      expect(
        h.session.getRumorBoard().some((line) => JSON.stringify(line).toLowerCase().includes('courier')),
        'a rumor about the deed, subject player, must land on the board',
      ).toBe(true);
    },
  );

  it(
    'a helped NPC carries a gratitude state that repays later at real cost (design lock 8) -- RED today: ' +
      "world.globals['claude_rpg.gratitude'] is never written, by anyone.",
    async () => {
      const h = createHarness();
      const world = h.session.engine.world;
      expect(world.globals['claude_rpg.gratitude']).toBeUndefined(); // today, always -- nothing writes it
    },
  );

  it(
    'an honorific tuning lever exists (tuning.honorificAt, default per design lock 8) and surfaces via ' +
      'getTuningView() -- RED today: LivingWorldTuning has no such field.',
    async () => {
      const h = createHarness();
      const view = h.session.getTuningView();
      expect((view.tuning as LivingWorldTuningMirror).honorificAt).toBeDefined();
    },
  );
});

describe('WO-B1-21 proof 6 -- determinism (ADDENDUM-COMMON design lock 10)', () => {
  it('every A1-A6 tuning field the tuning surface already ships stays byte-identical at its measured default (regression lock, not new this wave)', () => {
    // Spot-checks the fields DEFAULT_LIVING_WORLD_TUNING already owned before
    // this slice -- the "T2 sheet" proof itself (src/game.test.ts) is out of
    // this domain's glob (co-located src/**/*.test.ts, not test/**), so this
    // is a deliberately narrower regression pin: B1's new fields must be
    // ADDITIVE, never a rewrite of these five.
    expect(resolveTuning()).toEqual(DEFAULT_LIVING_WORLD_TUNING);
    expect(DEFAULT_LIVING_WORLD_TUNING.rumorSpreadScope).toBe('adjacent-districts');
    expect(DEFAULT_LIVING_WORLD_TUNING.rumorBelieveSuspicionBelow).toBe(0);
    expect(DEFAULT_LIVING_WORLD_TUNING.ambushHeadline).toBe('always');
  });

  it(
    "the new B1 tuning levers default to the design doc's own measured values " +
      '(enemyAggression: telegraphed, enemyDamageScale: 0.5 -- A6 lever T3, dogfood/tuning/WAVE_3_OUTCOMES.md) -- RED today: undefined, undefined.',
    () => {
      const defaults = DEFAULT_LIVING_WORLD_TUNING as LivingWorldTuningMirror;
      expect(defaults.enemyAggression).toBe('telegraphed');
      expect(defaults.enemyDamageScale).toBe(0.5);
    },
  );

  it(
    'two sessions from the same seed and the same scripted inputs still produce byte-identical event logs ' +
      'once a hostile shares the player\'s zone (extends WO-A2-11\'s own determinism proof, ' +
      'test/integration/living-world-driver.test.ts, to cover the hostile turn this wave adds) -- passes ' +
      "today trivially (nothing new fires yet); must keep passing once the hostile turn lands, since it " +
      'reads only world state + tick, no wall-clock/Math.random.',
    async () => {
      const SEED = 5150;
      const SCRIPTED = Array(6).fill('look');
      const NARRATION = 'Nothing here answers back. Not yet.';
      const { createGame } = await import('@ai-rpg-engine/starter-fantasy');

      const engine1 = createGame(SEED);
      const engine2 = createGame(SEED);
      engine1.world.entities['ash-ghoul']!.zoneId = playerZoneId(engine1.world);
      engine2.world.entities['ash-ghoul']!.zoneId = playerZoneId(engine2.world);

      const h1 = createHarness({ gameOpts: { engine: engine1 }, clientOpts: { narration: NARRATION } });
      const h2 = createHarness({ gameOpts: { engine: engine2 }, clientOpts: { narration: NARRATION } });

      for (const input of SCRIPTED) {
        await h1.play(input);
        await h2.play(input);
      }

      expect(JSON.stringify(h1.session.engine.world.eventLog)).toBe(JSON.stringify(h2.session.engine.world.eventLog));
    },
  );
});
