import { createProfile, type CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { LivingWorldTuning } from '../../src/game/tuning.js';
// WO-P9-1 (Phase 9 §1, docs/living-world-slice-a6-phase9.md, run
// swarm-1788288802-f5a0, wave 9, "tests" domain, ADDENDUM-COMMON design
// lock #4): the composed-proof matrix runner. Boots a world (a starter
// pack, or the generated fixture), plays a fixed 30-round deterministic
// script over it, and reduces the run to the design doc §1 metrics-sheet
// row plus the raw evidence the six living-world links (§1 items 1-6) are
// checked against.
//
// HONESTY-FLOOR NOTE on `session.getRoundMetrics()` (game-core WO-A6-2,
// ADDENDUM-COMMON design lock #2): this file calls it (see
// `pollRoundMetrics` below) and carries whatever it returns on
// `WorldRunResult.roundMetrics`, exactly as the addendum directs ("collect
// per-round metrics from session.getRoundMetrics() ... code against lock
// 2's shape, green expected at merge"). Verified on THIS worktree
// (`grep -n "getRoundMetrics" ../../src/game.ts` => no matches, dated
// 2026-09-01): game-core's own isolated worktree for this wave adds it, so
// today the call resolves to `undefined` and `roundMetrics` stays `[]`
// with `roundMetricsGap` set -- the correct red, not a bug in this file.
// Rather than let the ENTIRE metrics row go dark until that merge (which
// would make this proof and the tuning program's T0 baseline both
// unusable this wave), every column below is ALSO derived independently,
// test-side, from GameSession surfaces that already exist today
// (worldMovedLedger, the live world-truth getters, the RumorEngine, the
// raw event log, and quoteBuyPrice mirrored from buildMarketQuote's own
// private computation) -- the same test-side-measurement discipline the
// design doc already prescribes for narration prompt sizes ("measured
// TEST-SIDE from the fake client's call log ... not by game-core").
// `roundMetrics`/`roundMetricsGap` stay on the result so a future wave can
// cross-check or replace the test-side computation once game-core's shape
// is confirmed at merge; deleting the fallback then is a mechanical
// follow-up, not a redesign.

import type { Engine, WorldState, EntityState } from '@ai-rpg-engine/core';
import {
  HEAT_KEY,
  getDistrictForZone,
  inferSupplyCategory,
  getBuyableStock,
  quoteBuyPrice,
  getAvailableOpportunities,
} from '@ai-rpg-engine/modules';
import type { OpportunityState } from '@ai-rpg-engine/modules';
import { GameSession } from '../../src/game.js';
import { FALLBACK_NARRATION, FALLBACK_NARRATION_REPEATED } from '../../src/narrator/narrator.js';
import type { WorldGenProposal } from '../../src/foundry/world-gen.js';
import type { PackInfo } from '../../src/character/packs.js';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import {
  createHarness,
  createGeneratedHarness,
  type GameHarness,
  type WorldStackTuningMirror,
} from './game-harness.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** The one seed every world in the matrix is played with (design doc §1: "the same seed per pack"). */
export const MATRIX_SEED = 91173;

/** How many scripted rounds the composed proof plays per world (design doc §1). */
export const MATRIX_ROUNDS = 30;

/**
 * Mirrors game-core's not-yet-landed `RoundMetrics` (ADDENDUM-COMMON design
 * lock #2) field-for-field, so `WorldRunResult.roundMetrics` is ready to
 * carry the real shape unchanged once game-core's worktree merges in. See
 * this file's own header comment for why the matrix's row is NOT derived
 * from this today.
 */
export type RoundMetricsLike = {
  tick: number;
  heat: number;
  quietRounds: number;
  kills: number;
  pressuresActive: number;
  pressuresSpawned: number;
  pressuresResolved: number;
  pressuresExpired: number;
  factionActions: number;
  opportunitiesSpawned: number;
  opportunitiesAccepted: number;
  opportunitiesExpired: number;
  ambushes: number;
  moodTransition: boolean;
  rumorsCreated: number;
  rumorsMutated: number;
  rumorHearers: number;
  stanceBelieve: number;
  stanceDoubt: number;
  priceQuote?: number;
};

/** One kind of scripted input the deterministic script can choose per round. */
export type ScriptedActionKind = 'look' | 'move' | 'attack' | 'talk' | 'accept';

/** Per-world evidence for the six living-world links (design doc §1 items 1-6). */
export type LinkEvidence = {
  /** Item 1: a kill raises heat; a pressure spawns once heat wakes; a later round resolves/expires it (or heat escalates further). */
  killHeatPressureLifecycle: boolean;
  /** Item 2: a district economy tick moves a quoted price. */
  economyPriceMove: boolean;
  /** Item 3: a named NPC acts (a non-empty `lastNpcActions` round). */
  namedNpcActed: boolean;
  /** Item 4: an opportunity spawns and is accepted or expires with fallout. */
  opportunityLifecycle: boolean;
  /** Item 5: a zone entry spawns an encounter. */
  zoneEncounterSpawn: boolean;
  /**
   * Item 6, the structural half (coordinator ruling, wave 9 stitch): the
   * world produced a rumor about the player (a milestone rumor spawned).
   * Reach (`rumorReachesHearer`) and stance DIVERGENCE (`rumorTwoStances`)
   * are measured on the sheet and tuned in A6: the default stance rule
   * (believe when faction uptake includes the hearer's faction OR suspicion
   * is below 50; DEFAULT_SUSPICION is 0) makes every hearer believe, and the
   * fixed script often leaves the player in a district with no named NPC
   * after the milestone, so both are lever targets, not structural links.
   */
  rumorCreated: boolean;
  /** Item 6, the reach half (measured, tuned in A6): the rumor reached at least one NPC hearer holding a stance. */
  rumorReachesHearer: boolean;
  /** Item 6, the divergence half: a rumor about the player reaches two NPCs with two different stances. */
  rumorTwoStances: boolean;
};

/** design doc §1's per-world metrics-sheet row. */
export type MatrixSheetRow = {
  label: string;
  rounds: number;
  kills: number;
  heatMax: number;
  /** 1-based round index of the first observed heat decrease, or null if heat never fell. */
  heatDecayOnsetRound: number | null;
  pressuresSpawned: number;
  pressuresResolved: number;
  pressuresExpired: number;
  /** Median ticks-alive across resolved+expired pressures (FIFO-paired against spawns), or null with none paired. */
  pressureMedianSurvivalTicks: number | null;
  factionActions: number;
  opportunitiesSpawned: number;
  opportunitiesAccepted: number;
  opportunitiesExpired: number;
  ambushes: number;
  /** Largest absolute round-over-round swing in the player-district sample quote, or null if never priced. */
  maxPriceDelta: number | null;
  /**
   * WO-B1F-6 (design doc lock 6): the 1-based round index the scripted
   * walker's own hp first reached 0 this run, or null if it never did.
   * Read from the player entity's live `resources.hp` at the END of each
   * round's processing (same "1-based round the thing was first observed"
   * convention `heatDecayOnsetRound` above already uses), not from any
   * event -- a downed player produces no dedicated event of its own on this
   * engine (verified: `combat.entity.defeated` fires only for the DEFEATED
   * side's own entity id, and the installed hostile-turn round-stop
   * discipline (src/game/hostile-turn.ts's own `break` on `hp <= 0`) leaves
   * the player entity's hp at exactly 0, not negative or removed).
   */
  playerDowned: number | null;
  /**
   * WO-B1F-6: count of `combat.damage.applied` events across the whole run
   * whose `targetId` is the player -- i.e. every hostile hit the walker
   * actually took, regardless of source (the hostile turn today; any future
   * source of player damage tomorrow, without this column needing a
   * rewrite). Always 0 at `enemyAggression: 'off'` (the tuning matrix's own
   * default, `buildHarnessForWorld`'s "off" pin): `runHostileTurn`
   * returns `NO_ACTION` before any hostile ever acts, so no such event can
   * exist against the player. Populated once a caller overrides the
   * default (`LIVING_WORLD_TUNING_JSON='{"enemyAggression":"telegraphed"}'`
   * or `opts.tuning`), which is the entire point of this column existing on
   * the tuning-sheet: the coordinator's A6 lever T3 (`enemyDamageScale`)
   * needs a measured "how many hits actually land" baseline to scale
   * against.
   */
  enemyHitsTaken: number;
  moodTransitions: number;
  rumorsCreated: number;
  rumorsMutated: number;
  rumorHearers: number;
  stanceBelieveCount: number;
  stanceDoubtCount: number;
  narrationPromptCharsMax: number;
  narrationPromptCharsMedian: number;
  narrationFallbacks: number;
};

export type MatrixSheet = {
  label: string;
  rows: MatrixSheetRow[];
};

export type WorldRunResult = {
  label: string;
  seed: number;
  rounds: number;
  /** The verb-kind actually chosen each round (after availability fallback -- see decideScriptedInput). */
  scriptedKinds: ScriptedActionKind[];
  /** The literal text sent to session.processInput() each round, same length/order as scriptedKinds. */
  scriptedInputs: string[];
  /** session.getRoundMetrics() output, if game-core's worktree has landed on this tree -- see file header. */
  roundMetrics: RoundMetricsLike[];
  roundMetricsGap?: string;
  linkEvidence: LinkEvidence;
  row: MatrixSheetRow;
};

export type MatrixWorldInput =
  | { kind: 'pack'; label: string; pack: PackInfo }
  | {
      kind: 'generated';
      label: string;
      proposal: WorldGenProposal;
      itemCatalog?: ItemCatalog;
      stackTuning?: WorldStackTuningMirror;
      /**
       * Every starter pack's OWN authored content already gives the
       * universal bounty-issued pressure rule (pressure-system.js's
       * evaluateUniversalRules, the first branch evaluatePressures scans --
       * same rule `living-world-driver.test.ts` seeds) a faction to fire
       * against once heat wakes -- verified live: `iron-colosseum`'s own
       * matrix run spawns 3 pressures off its authored gladiator-genre
       * content with no extra seeding. A freshly generated world's sole
       * authored faction starts at neutral reputation/zero alert (this
       * fixture's own `makePhase9WorldGenProposal` included), so heat
       * alone reaching `HEAT_WAKE_THRESHOLD` is not enough -- verified
       * live: `generated-phase9-fixture` reached `heatMax: 10` with
       * `pressuresSpawned: 0` before this field existed. Mirrors
       * `living-world-driver.test.ts`'s own recipe (`reputation_<faction>
       * = -60`, `faction_alert_<faction> = 70`) directly onto the built
       * engine's globals right after construction, giving the generated
       * world the SAME structural opportunity a pack world gets from its
       * own authored content -- not a balance value this wave touches (R5
       * gate), just parity for a proof gate the pack worlds already clear
       * for free.
       */
      seedFactionPressure?: { factionId: string; reputation: number; alertLevel: number };
    };

/** median of a non-empty number[]; NaN semantics avoided by callers checking length first. */
function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Deterministic JSON.stringify with recursively sorted object keys (arrays keep their order) -- the "sorted keys" half of ADDENDUM-tests WO-P9-1's write contract. */
export function stableStringify(value: unknown): string {
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        out[key] = sortKeys((v as Record<string, unknown>)[key]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(sortKeys(value), null, 2);
}

/**
 * Builds the harness for one matrix world. Packs go through `createHarness`
 * over `pack.createGame(seed)` (ADDENDUM-tests WO-P9-1); the generated
 * fixture goes through `createGeneratedHarness(proposal, { seed })`
 * (WO-P9-3 threads `stackTuning` when supplied -- green expected at merge,
 * see game-harness.ts's own doc comment on that option).
 */
/**
 * Coordinator stitch (wave 9): every world boots WITH a character profile,
 * the way a real session does (bin.ts runNew always builds one). Player
 * rumors spawn from profile milestones (game.ts applyProfileHints ->
 * spawnPlayerRumor), so a profile-less session can never produce design
 * doc §1 item 6 -- the wave-9 matrix measured rumorsCreated = 0 on 12 of
 * 13 worlds for exactly this reason. The build is the pack's own first
 * archetype and background (deterministic), stats and resources copied
 * from the engine's player entity so the profile never contradicts the
 * world it plays in.
 */
function buildMatrixProfile(engine: Engine, packId: string, catalog?: { archetypes?: Array<{ id: string }>; backgrounds?: Array<{ id: string }> }): CharacterProfile {
  const player = engine.world.entities[engine.world.playerId];
  return createProfile(
    {
      name: 'Matrix',
      archetypeId: catalog?.archetypes?.[0]?.id ?? 'wanderer',
      backgroundId: catalog?.backgrounds?.[0]?.id ?? 'unknown',
      traitIds: [],
    },
    { ...(player?.stats ?? {}) },
    { ...(player?.resources ?? {}) },
    [],
    packId,
  );
}

async function buildHarnessForWorld(input: MatrixWorldInput, seed: number, tuningIn?: Partial<LivingWorldTuning>): Promise<GameHarness> {
  // Wave-10 stitch: the matrix's fixed 30-round script predates slice B1's
  // hostile turn (enemies now telegraph and land hits), and its scripted
  // walker neither flees nor heals, so at the defaults it is downed before
  // the kill-driven links can fire on 9 of 13 worlds (measured 2026-09-02:
  // 19 reds at defaults, 4 with aggression off). This proof measures the
  // six living-world LINKS, not survival; the hostile turn has its own
  // proof (test/integration/reactive-street.test.ts). Aggression is
  // therefore pinned off here unless a caller's tuning names it.
  const tuning: Partial<LivingWorldTuning> = { enemyAggression: 'off', ...(tuningIn ?? {}) };
  if (input.kind === 'pack') {
    const engine = input.pack.createGame(seed);
    return createHarness({
      gameOpts: {
        engine,
        profile: buildMatrixProfile(engine, input.pack.meta.id, input.pack.buildCatalog as never),
        tuning,
        itemCatalog: input.pack.itemCatalog,
        genre: input.pack.meta.genres?.[0] ?? 'fantasy',
        title: input.pack.meta.name,
        tone: input.pack.meta.narratorTone ?? 'dark fantasy',
      },
    });
  }
  const harness = await createGeneratedHarness(input.proposal, {
    seed,
    stackTuning: input.stackTuning,
    gameOpts: {
      ...(input.itemCatalog ? { itemCatalog: input.itemCatalog } : {}),
      // The generated fixture has no pack catalog; a fantasy build stands in
      // (the profile's pack id only names the catalog the build came from).
      profile: undefined,
      tuning,
    },
  });
  harness.session.profile = buildMatrixProfile(harness.session.engine, 'chapel-threshold', undefined);
  if (input.seedFactionPressure) {
    const { factionId, reputation, alertLevel } = input.seedFactionPressure;
    harness.session.engine.world.globals[`reputation_${factionId}`] = reputation;
    harness.session.engine.world.globals[`faction_alert_${factionId}`] = alertLevel;
  }
  return harness;
}

/**
 * Decide this round's scripted input (design doc §1's script: "look, move
 * along the pack's zone graph, attack the nearest hostile when one shares
 * the zone, talk to the nearest named NPC, accept the first offered
 * opportunity"). A pure function of world state plus the runner's own
 * visited-zone/talked-to sets -- reproducible given identical world state,
 * per ADDENDUM-COMMON design lock #4 ("implement it as a pure function of
 * the world state so the script is reproducible").
 *
 * A strict PRIORITY order, re-evaluated fresh every round, not a
 * round-robin rotation: an early cut of this runner round-robinned through
 * the five kinds by round index, which scheduled 'attack' on only 1 round
 * in 5 -- against a hostile with more than one hit's worth of HP (every
 * authored `type: 'enemy'` entity checked across all 12 packs), the
 * intervening 'move' rounds walked the player away before a second hit
 * ever landed, so no pack ever produced a kill in a 30-round run (observed
 * red, `test/integration/_debug-phase9.test.ts`, a throwaway trace this
 * wave, deleted before commit). "Attack the nearest hostile WHEN one
 * shares the zone" reads correctly as an every-round trigger, not a
 * scheduled slot: hostiles present outrank everything else, so the player
 * keeps attacking the same target round after round until it's dead
 * (matching how a real player would actually clear a fight instead of
 * wandering off mid-combat). Priority: attack > accept (a discovered,
 * not-yet-accepted opportunity) > talk (each named NPC once --
 * `talkedTo`, mutated here as `visitedZones` already was, avoids an
 * infinite same-NPC loop) > move (prefers an unvisited neighbor; once
 * every neighbor is seen, cycles through them by `roundIndex` so the
 * script keeps circulating rather than parking, giving late-round systems
 * -- economy ticks, rumor spread, repeat encounters -- more chances to
 * fire) > look (the true fallback: a single zone with no neighbors and
 * nothing left to do in it).
 */
export function decideScriptedInput(
  world: WorldState,
  activeOpportunities: OpportunityState[],
  visitedZones: Set<string>,
  talkedTo: Set<string>,
  roundIndex: number,
): { kind: ScriptedActionKind; input: string } {
  const currentZoneId = world.locationId;
  visitedZones.add(currentZoneId);
  const zone = world.zones[currentZoneId];
  const here = Object.values(world.entities).filter(
    (e): e is EntityState => e.zoneId === currentZoneId && e.id !== world.playerId,
  );
  // A defeated entity stays in world.entities (defeat-fallout does not
  // remove it -- confirmed via `_debug-phase9.test.ts`'s throwaway trace
  // this wave: `resources.hp` drops to 0 but `type`/`tags` are untouched),
  // so without the hp filter below the script kept "attacking" a corpse
  // for the rest of the run once the one hostile in a single-enemy zone
  // died -- burning every remaining round on a no-op input instead of
  // moving on.
  const hostiles = here
    .filter((e) => e.type === 'enemy' && (e.resources?.hp === undefined || e.resources.hp > 0))
    .sort((a, b) => a.id.localeCompare(b.id));
  const npcs = here.filter((e) => e.type === 'npc').sort((a, b) => a.id.localeCompare(b.id));
  const available = getAvailableOpportunities(activeOpportunities);

  if (hostiles.length > 0) {
    return { kind: 'attack', input: `attack ${hostiles[0].name}` };
  }
  if (available.length > 0) {
    return { kind: 'accept', input: 'accept job' };
  }
  const untalked = npcs.find((n) => !talkedTo.has(n.id));
  if (untalked) {
    talkedTo.add(untalked.id);
    return { kind: 'talk', input: `talk to ${untalked.name}` };
  }
  const neighbors = zone?.neighbors ?? [];
  if (neighbors.length > 0) {
    const unvisited = neighbors.find((n) => !visitedZones.has(n));
    const dest = unvisited ?? neighbors[roundIndex % neighbors.length];
    return { kind: 'move', input: `go to ${dest}` };
  }
  return { kind: 'look', input: 'look' };
}

/** Reads `session.getRoundMetrics()` if game-core's worktree has landed it -- see file header. */
function pollRoundMetrics(session: GameSession): RoundMetricsLike[] | undefined {
  const widened = session as unknown as { getRoundMetrics?: () => RoundMetricsLike[] };
  return typeof widened.getRoundMetrics === 'function' ? widened.getRoundMetrics() : undefined;
}

/**
 * Mirrors GameSession's private `buildMarketQuote()` (src/game.ts ~916),
 * test-side, over the PUBLIC surfaces it's built from
 * (`session.districtEconomies`, `session.itemCatalog`, `session.genre`,
 * `quoteBuyPrice`) -- see this file's own header comment on why the
 * matrix's price column is computed test-side rather than waiting on
 * game-core's RoundMetrics.priceQuote. Returns undefined exactly when
 * buildMarketQuote's own doc comment says it would (no district, no
 * catalog, nothing priceable in the player's current district).
 */
function mirrorMarketQuote(session: GameSession): number | undefined {
  const world = session.engine.world;
  const player = world.entities[world.playerId];
  const zoneId = player?.zoneId;
  const districtId = zoneId ? getDistrictForZone(world, zoneId) : undefined;
  if (!districtId) return undefined;
  const economy = session.districtEconomies.get(districtId);
  const itemCatalog = session.itemCatalog;
  if (!economy || !itemCatalog || itemCatalog.items.length === 0) return undefined;

  let sampleItemId: string | undefined;
  for (const item of itemCatalog.items) {
    const category = inferSupplyCategory(item.id);
    if (getBuyableStock(economy, category, session.genre).includes(item.id)) {
      sampleItemId = item.id;
      break;
    }
  }
  sampleItemId ??= itemCatalog.items[0]?.id;
  if (!sampleItemId) return undefined;
  return quoteBuyPrice(world, sampleItemId, session.genre);
}

/** Plays one world through the fixed deterministic script and reduces it to a WorldRunResult. */
async function playWorld(input: MatrixWorldInput, rounds: number, seed: number, tuning?: Partial<LivingWorldTuning>): Promise<WorldRunResult> {
  const harness = await buildHarnessForWorld(input, seed, tuning);
  const session = harness.session;

  const visitedZones = new Set<string>();
  const talkedTo = new Set<string>();
  const scriptedKinds: ScriptedActionKind[] = [];
  const scriptedInputs: string[] = [];

  // Link-1 (kill/heat/pressure lifecycle) tracking.
  let killCount = 0;
  let sawHeatWake = false;
  let heatMax = 0;
  const heatSeries: number[] = [];
  // `factionActions` row tracking: `session.lastFactionActions` is a
  // PERSISTED "most recent action per faction" snapshot (game.ts's getter
  // reads `getPersistedFactionLastActions` -- a world-namespace value, not
  // a per-round event list), so it stays populated long after the round it
  // actually happened on. Summing `.length` every round would count the
  // SAME cached action once per round for as long as that faction stays
  // quiet -- `FactionActionResult`/`FactionAction` (node_modules/
  // @ai-rpg-engine/modules/dist/faction-agency.d.ts) carry no tick field to
  // detect staleness directly, so this tracks each faction's last-seen
  // serialized action and only counts a change.
  const lastSeenFactionAction = new Map<string, string>();
  // Link-2 (economy) tracking.
  const priceSeries: number[] = [];
  // Link-4 (opportunity) tracking.
  let acceptSucceeded = false;
  // Link-6 (rumor) tracking.
  const seenRumorIds = new Set<string>();
  let rumorsCreated = 0;
  // Link-3 (named NPC acts) tracking.
  let sawNamedNpcAction = false;
  // WO-B1F-6 tracking: the downed-metric and the damage lever's own hits count.
  let playerDowned: number | null = null;
  let enemyHitsTaken = 0;

  // worldMovedLedger is cumulative across the session; poll its length each
  // round and slice the delta, mirroring how this same ledger already
  // drives the /recap surface (src/character/session-recap.ts).
  let ledgerCursor = 0;
  let pressuresSpawned = 0;
  let pressuresResolved = 0;
  let pressuresExpired = 0;
  let opportunitiesSpawned = 0;
  let opportunitiesExpired = 0;
  let ambushes = 0;
  let moodTransitions = 0;
  let rumorsMutated = 0;
  let factionActions = 0;
  // FIFO pairing for pressure survival: push the tick a pressure spawned,
  // pop (oldest first) on every resolve/expire. Ledger entries carry no
  // pressure id (WorldMovedEntry is `{tick,kind,headline}` only), so this
  // assumes pressures clear roughly in spawn order -- documented, not
  // asserted as a general engine guarantee.
  const pressureSpawnQueue: number[] = [];
  const pressureSurvivals: number[] = [];

  let narrationFallbacks = 0;

  for (let round = 0; round < rounds; round++) {
    const { kind, input: text } = decideScriptedInput(
      session.engine.world,
      session.activeOpportunities,
      visitedZones,
      talkedTo,
      round,
    );
    scriptedKinds.push(kind);
    scriptedInputs.push(text);

    const beforeEventLogLength = session.engine.world.eventLog.length;
    const output = await harness.play(text);

    if (output.includes(FALLBACK_NARRATION) || output.includes(FALLBACK_NARRATION_REPEATED)) {
      narrationFallbacks++;
    }
    if (kind === 'accept' && !output.includes('No opportunity is available to accept')) {
      acceptSucceeded = true;
    }

    // Kills this round: non-player combat.entity.defeated events in the delta.
    const newEvents = session.engine.world.eventLog.slice(beforeEventLogLength);
    for (const ev of newEvents) {
      if (ev.type === 'combat.entity.defeated' && (ev.payload as { entityId?: string }).entityId !== session.engine.world.playerId) {
        killCount++;
      }
      // WO-B1F-6: every combat.damage.applied event landed against the
      // player this round, regardless of source (today: only the hostile
      // turn, src/game/hostile-turn.ts -- always 0 at enemyAggression:
      // 'off', the matrix's own default; see MatrixSheetRow.enemyHitsTaken's
      // own doc comment).
      if (ev.type === 'combat.damage.applied' && (ev.payload as { targetId?: string }).targetId === session.engine.world.playerId) {
        enemyHitsTaken++;
      }
    }

    // WO-B1F-6: the round the scripted walker's own hp first reached 0
    // (1-based, same convention heatDecayOnsetRound below already uses).
    // Checked once per round, after this round's turn has fully processed,
    // so a hit that lands and downs the player mid-round is captured on
    // the SAME round it happened, not the next one.
    if (playerDowned === null) {
      const playerHpNow = session.engine.world.entities[session.engine.world.playerId]?.resources.hp ?? 0;
      if (playerHpNow <= 0) playerDowned = round + 1;
    }

    const heat = Number(session.engine.world.globals[HEAT_KEY] ?? 0);
    heatSeries.push(heat);
    if (heat > heatMax) heatMax = heat;
    if (!sawHeatWake && killCount > 0 && heat > 0) sawHeatWake = true;

    const price = mirrorMarketQuote(session);
    if (price !== undefined) priceSeries.push(price);

    for (const result of session.lastFactionActions) {
      const serialized = JSON.stringify(result.action);
      if (lastSeenFactionAction.get(result.action.factionId) !== serialized) {
        lastSeenFactionAction.set(result.action.factionId, serialized);
        factionActions++;
      }
    }
    if (session.lastNpcActions.length > 0) sawNamedNpcAction = true;

    // worldMovedLedger delta for this round.
    const ledger = session.worldMovedLedger;
    for (; ledgerCursor < ledger.length; ledgerCursor++) {
      const entry = ledger[ledgerCursor];
      switch (entry.kind) {
        case 'pressure-spawned':
          pressuresSpawned++;
          pressureSpawnQueue.push(entry.tick);
          break;
        case 'pressure-resolved':
          pressuresResolved++;
          if (pressureSpawnQueue.length > 0) pressureSurvivals.push(entry.tick - pressureSpawnQueue.shift()!);
          break;
        case 'pressure-expired':
          pressuresExpired++;
          if (pressureSpawnQueue.length > 0) pressureSurvivals.push(entry.tick - pressureSpawnQueue.shift()!);
          break;
        case 'opportunity-offered':
          opportunitiesSpawned++;
          break;
        case 'opportunity-expired':
          opportunitiesExpired++;
          break;
        case 'ambush':
          ambushes++;
          break;
        case 'mood-transition':
          moodTransitions++;
          break;
        case 'rumor-mutated':
          rumorsMutated++;
          break;
      }
    }

    // Rumor creation + hearer/stance snapshot (cumulative -- recomputed
    // fully at the end below, but rumorsCreated needs the round the rumor
    // FIRST appeared, so tracked incrementally here).
    for (const rumor of session.rumorEngine.query({ subject: 'player' })) {
      if (!seenRumorIds.has(rumor.id)) {
        seenRumorIds.add(rumor.id);
        rumorsCreated++;
      }
    }
  }

  // Drain any pressures still spawned-but-uncleared: no survival sample
  // (never resolved/expired within the 30 rounds) -- left out of the
  // median rather than guessed.
  const pressureMedianSurvivalTicks = pressureSurvivals.length > 0 ? median(pressureSurvivals) : null;

  let heatDecayOnsetRound: number | null = null;
  for (let i = 1; i < heatSeries.length; i++) {
    if (heatSeries[i] < heatSeries[i - 1]) {
      heatDecayOnsetRound = i + 1; // 1-based round index
      break;
    }
  }

  let maxPriceDelta: number | null = null;
  for (let i = 1; i < priceSeries.length; i++) {
    const delta = Math.abs(priceSeries[i] - priceSeries[i - 1]);
    if (maxPriceDelta === null || delta > maxPriceDelta) maxPriceDelta = delta;
  }

  // Final rumor hearer/stance census across every rumor about the player.
  let rumorHearers = 0;
  let stanceBelieveCount = 0;
  let stanceDoubtCount = 0;
  let rumorTwoStances = false;
  {
    const hearerIds = new Set<string>();
    for (const rumor of session.rumorEngine.query({ subject: 'player' })) {
      const stancesForRumor = new Set<string>();
      for (const hearerId of rumor.spreadPath) {
        // Coordinator stitch (wave 9): a spread path opens with the
        // WITNESSING FACTION's id (spawnPlayerRumor's witnessedBy); only
        // NPC entities are hearers for the sheet's reach metrics.
        if (session.engine.world.entities[hearerId]?.type !== 'npc') continue;
        hearerIds.add(hearerId);
        const stance = session.rumorEngine.stanceOf(hearerId, rumor.id);
        if (stance === 'believe') {
          stanceBelieveCount++;
          stancesForRumor.add('believe');
        } else if (stance === 'doubt') {
          stanceDoubtCount++;
          stancesForRumor.add('doubt');
        }
      }
      if (stancesForRumor.size >= 2) rumorTwoStances = true;
    }
    rumorHearers = hearerIds.size;
  }

  const promptLengths = harness.callLog.promptLengths;
  const narrationPromptCharsMax = promptLengths.length > 0 ? Math.max(...promptLengths) : 0;
  const narrationPromptCharsMedian = promptLengths.length > 0 ? median(promptLengths) : 0;

  const roundMetrics = pollRoundMetrics(session);

  const row: MatrixSheetRow = {
    label: input.label,
    rounds,
    kills: killCount,
    heatMax,
    heatDecayOnsetRound,
    pressuresSpawned,
    pressuresResolved,
    pressuresExpired,
    pressureMedianSurvivalTicks,
    factionActions,
    opportunitiesSpawned,
    opportunitiesAccepted: acceptSucceeded ? 1 : 0,
    opportunitiesExpired,
    ambushes,
    maxPriceDelta,
    playerDowned,
    enemyHitsTaken,
    moodTransitions,
    rumorsCreated,
    rumorsMutated,
    rumorHearers,
    stanceBelieveCount,
    stanceDoubtCount,
    narrationPromptCharsMax,
    narrationPromptCharsMedian,
    narrationFallbacks,
  };

  const linkEvidence: LinkEvidence = {
    killHeatPressureLifecycle:
      killCount > 0 &&
      sawHeatWake &&
      pressuresSpawned > 0 &&
      (pressuresResolved > 0 || pressuresExpired > 0 || heatMax > heatSeries[0]),
    economyPriceMove: maxPriceDelta !== null && maxPriceDelta > 0,
    namedNpcActed: sawNamedNpcAction,
    opportunityLifecycle: opportunitiesSpawned > 0 && (acceptSucceeded || opportunitiesExpired > 0),
    zoneEncounterSpawn: ambushes > 0,
    rumorCreated: rumorsCreated >= 1,
    rumorReachesHearer: rumorHearers >= 1 && stanceBelieveCount + stanceDoubtCount >= 1,
    rumorTwoStances,
  };

  return {
    label: input.label,
    seed,
    rounds,
    scriptedKinds,
    scriptedInputs,
    roundMetrics: roundMetrics ?? [],
    ...(roundMetrics === undefined
      ? {
          roundMetricsGap:
            'session.getRoundMetrics() is not defined on this worktree (game-core WO-A6-2, ADDENDUM-COMMON ' +
            'design lock #2, not yet merged in) -- every other column on this row is computed test-side ' +
            'instead (see this file\'s header comment); green expected once game-core\'s worktree lands.',
        }
      : {}),
    linkEvidence,
    row,
  };
}

/**
 * Runs the fixed 30-round scripted matrix over every supplied world and
 * reduces each to a `MatrixSheetRow`, sorted by label for determinism
 * regardless of input order (ADDENDUM-tests WO-P9-1/WO-P9-2: "the whole
 * sheet is byte-identical across two full runs").
 */
export async function runLivingWorldMatrix(
  worlds: MatrixWorldInput[],
  opts: { rounds?: number; label?: string; seed?: number; tuning?: Partial<LivingWorldTuning> } = {},
): Promise<{ sheet: MatrixSheet; worlds: WorldRunResult[] }> {
  const rounds = opts.rounds ?? MATRIX_ROUNDS;
  // A6 tuning waves (coordinator, wave T1+): one lever per wave, passed as
  // `opts.tuning` or `LIVING_WORLD_TUNING_JSON` (a Partial<LivingWorldTuning>
  // object); absent -> the resolved defaults, byte-identical to the baseline.
  const tuning: Partial<LivingWorldTuning> | undefined =
    opts.tuning ?? (process.env.LIVING_WORLD_TUNING_JSON ? (JSON.parse(process.env.LIVING_WORLD_TUNING_JSON) as Partial<LivingWorldTuning>) : undefined);
  const seed = opts.seed ?? MATRIX_SEED;
  const label = opts.label ?? process.env.LIVING_WORLD_MATRIX_LABEL ?? 'baseline';

  const results: WorldRunResult[] = [];
  for (const world of worlds) {
    results.push(await playWorld(world, rounds, seed, tuning));
  }
  results.sort((a, b) => a.label.localeCompare(b.label));

  const sheet: MatrixSheet = {
    label,
    rows: results.map((r) => r.row),
  };

  return { sheet, worlds: results };
}

/**
 * Writes the metrics sheet to `dogfood/tuning/matrix-<label>.json`
 * (ADDENDUM-tests WO-P9-1: "pretty JSON, sorted keys, trailing newline"),
 * gated by the composed proof's own `LIVING_WORLD_MATRIX_WRITE === '1'`
 * check (design doc §1) -- this function itself always writes when called;
 * the gate is the CALLER's job, matching the addendum's own phrasing
 * ("writeMatrixSheet(sheet, label) ... called by the proof only when...").
 */
export async function writeMatrixSheet(sheet: MatrixSheet, label: string): Promise<string> {
  const outPath = join(process.cwd(), 'dogfood', 'tuning', `matrix-${label}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, stableStringify(sheet) + '\n', 'utf8');
  return outPath;
}
