// WO-B1-4 (slice B1 §4, design lock 7, ADDENDUM-COMMON): the asks ledger --
// requests NPCs and petitioners make of the player, engine-authored and
// deterministic, with a hidden truth (genuine vs predatory) the surface text
// never reveals. Stored as JSON in `world.globals['claude_rpg.asks']` so it
// rides every save with no schema bump (matches the app's existing
// world-moved/gratitude convention of persisting app-level ledgers as a
// single JSON global rather than a bespoke session field).
//
// Research grounding (dispatch-b1.md): finding 23 (humans detect lies at
// 54%, strong truth bias -- no tell the player is "supposed" to read),
// finding 28 (fair play needs clues present but not obvious, so the reveal
// produces retrospective recognition), finding 25 (players accept
// falsehoods read as intentional -- every con here is engine-authored,
// never improvised by the narrator), finding 29 (Papers, Please: no signal
// whether a petitioner is truthful; consequences compound over time, no
// trustworthiness meter).

import type { WorldState, EntityState } from '@ai-rpg-engine/core';
import { genId } from '@ai-rpg-engine/core';
import { getPlayerDistrictId } from './game-state.js';
import { getDistrictForZone } from '@ai-rpg-engine/modules';
import type { LivingWorldTuning } from './tuning.js';

export type AskKind = 'carry' | 'lend' | 'guide' | 'hold' | 'vouch';
export type AskTruth = 'genuine' | 'predatory';
export type AskStatus = 'open' | 'helped' | 'ignored' | 'revealed' | 'expired';
export type CueKind = 'rumor' | 'faction-tie' | 'contradiction';

/** One of an ask's 2-3 pre-planted, re-inspectable details (design doc §4). */
export type Cue = {
  kind: CueKind;
  detail: string;
  /** Set only for kind 'rumor' -- the RumorEngine rumor id it was planted as (game.ts creates it). */
  rumorId?: string;
};

export type Ask = {
  id: string;
  /** Set when the ask comes from an already-named, persistent NPC. */
  npcId?: string;
  /** Set when the ask comes from a transient petitioner the world tick seats (design doc §4). */
  petitioner?: { id: string; name: string; zoneId: string; factionId?: string };
  kind: AskKind;
  surface: string;
  truth: AskTruth;
  stake: number;
  offeredTick: number;
  status: AskStatus;
  revealTick?: number;
  cues: Cue[];
  /** 'guide' asks only: the destination zone the petitioner wants escorted to. */
  destinationZoneId?: string;
};

const ASKS_GLOBAL_KEY = 'claude_rpg.asks';

/** The subject entity id this ask is authored by/about -- npcId if named, else the petitioner's own id. */
export function askSubjectId(ask: Ask): string {
  return ask.npcId ?? ask.petitioner?.id ?? '';
}

export function askSubjectName(ask: Ask, world: WorldState): string {
  if (ask.petitioner) return ask.petitioner.name;
  if (ask.npcId) return world.entities[ask.npcId]?.name ?? ask.npcId;
  return 'someone';
}

export function askSubjectZoneId(ask: Ask, world: WorldState): string | undefined {
  if (ask.petitioner) return ask.petitioner.zoneId;
  if (ask.npcId) return world.entities[ask.npcId]?.zoneId;
  return undefined;
}

// --- Ledger access ---

function readLedger(world: WorldState): Ask[] {
  const raw = world.globals[ASKS_GLOBAL_KEY];
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Ask[]) : [];
  } catch {
    return [];
  }
}

function writeLedger(world: WorldState, asks: Ask[]): void {
  world.globals[ASKS_GLOBAL_KEY] = JSON.stringify(asks);
}

/** Every ask ever offered this session, in offer order. */
export function getAllAsks(world: WorldState): Ask[] {
  return readLedger(world);
}

export function getOpenAsks(world: WorldState): Ask[] {
  return readLedger(world).filter((a) => a.status === 'open');
}

export function getAsk(world: WorldState, id: string): Ask | undefined {
  return readLedger(world).find((a) => a.id === id);
}

/**
 * WO-B1-3 (design lock 4): resolve the open ask (if any) a player-typed
 * "help <name>" is answering -- the fast-path alias's own lookup, and the
 * one place action-interpreter.ts (game-core, same domain) reaches into
 * this ledger. Matches by the subject entity id.
 */
export function findOpenAskForEntity(world: WorldState, entityId: string): Ask | undefined {
  return getOpenAsks(world).find((a) => askSubjectId(a) === entityId);
}

function updateAsk(world: WorldState, id: string, patch: Partial<Ask>): Ask | undefined {
  const asks = readLedger(world);
  const idx = asks.findIndex((a) => a.id === id);
  if (idx === -1) return undefined;
  asks[idx] = { ...asks[idx], ...patch };
  writeLedger(world, asks);
  return asks[idx];
}

// --- Deterministic truth ---

/**
 * Deterministic hash of a string to [0, 1) -- FNV-1a over the UTF-16 code
 * units, normalized against 2^32. No literal `hashRoll` exists in the
 * installed engine (verified: @ai-rpg-engine/modules and /core export
 * `simpleRoll`/`spawnRoll`/`stateHash`/`canonicalStateHash`, none of which
 * hash an arbitrary string to a unit float) -- design doc §4's own
 * "hashRoll-style" phrasing is illustrative, not a named API this app must
 * call. Identity-based (ask id + world seed), not the engine's own
 * sequential RNG stream, so an ask's truth is stable and independently
 * recomputable regardless of how many OTHER RNG draws happen the same
 * round (narration seeds, ambient-dialogue seeds, hostile-turn combat
 * rolls) -- reordering unrelated draws elsewhere never perturbs an ask's
 * truth.
 */
function hashToUnit(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Unsigned 32-bit, normalized to [0, 1).
  return (hash >>> 0) / 0x100000000;
}

/** Deterministic per-ask truth roll (design doc §4, `tuning.askPredatorRatio`). */
export function chooseAskTruth(askId: string, worldSeed: number, predatorRatio: number): AskTruth {
  return hashToUnit(`${askId}:${worldSeed}`) < predatorRatio ? 'predatory' : 'genuine';
}

// --- Cue planning ---

/**
 * Design doc §4: "each predator carries two or three pre-planted,
 * re-inspectable details." Returns descriptors only -- the actual
 * RumorEngine.create() call (a rumor cue) happens in game.ts, which owns
 * the RumorEngine instance; this function is pure so it stays unit-testable
 * without a live rumor engine. `lastNpcActions`-derived contradictions are
 * likewise described here and matched against real data by the caller
 * (game.ts already carries `this.lastNpcActions`).
 */
export function planAskCues(kind: AskKind, subjectName: string, truth: AskTruth): Cue[] {
  const cues: Cue[] = [
    {
      kind: 'faction-tie',
      detail: `${subjectName}'s faction ties are visible in /npc.`,
    },
  ];
  if (truth === 'predatory') {
    cues.push({
      kind: 'rumor',
      detail: `A rumor on the board describes someone matching ${subjectName}'s story.`,
    });
    cues.push({
      kind: 'contradiction',
      detail: `${subjectName}'s recent actions (see /people) don't match what they just told you.`,
    });
  }
  return cues;
}

// --- Offer generation ---

export type AskOfferInput = {
  world: WorldState;
  tick: number;
  worldSeed: number;
  tuning: LivingWorldTuning;
  /** A candidate name pool for a fresh transient petitioner (design doc §4's own examples). */
  petitionerNamePool?: string[];
};

const DEFAULT_PETITIONER_NAMES = [
  'a woman at the chapel door',
  'a courier on the vestry stair',
  'a shivering pilgrim',
  'a one-armed veteran',
];

const ASK_KINDS: AskKind[] = ['carry', 'lend', 'guide', 'hold', 'vouch'];

const ASK_SURFACES: Record<AskKind, string> = {
  carry: 'Would you carry this to the district for me? I can\'t make the trip myself.',
  lend: 'Could you lend me a little coin? My child is sick and I have nothing left.',
  guide: 'Would you guide me below? I don\'t know these tunnels and I\'m afraid to go alone.',
  hold: 'Would you hold this for me a while? I can\'t risk carrying it myself right now.',
  vouch: 'Would you vouch for me to the Guard? They won\'t hear me out on my own.',
};

/**
 * At most one open ask per district (WO-B1-4). Seats a transient petitioner
 * in the PLAYER'S CURRENT zone (a narrower scope than "the district" the
 * design doc's prose describes) so the ask is immediately reachable without
 * this app needing a district-wide reachable-zone picker -- a deliberate,
 * documented simplification (see this function's own inline note) rather
 * than an attempt at full district-wide petitioner placement. Returns
 * `undefined` (no offer) when the player has no district, a district ask is
 * already open, or the per-round offer roll misses.
 *
 * Pure -- reads the ledger and the world's RNG-relevant fields but writes
 * NOTHING (no ledger append, no entity insert). The caller (game.ts's
 * processAsks) persists both. Kept side-effect-free so a caller can safely
 * call this to "probe" whether an offer would fire on a given tick without
 * corrupting the world for a subsequent real call -- see asks.test.ts's own
 * `findEligibleTick` helper.
 */
export function maybeOfferAsk(input: AskOfferInput): { ask: Ask; petitionerEntity: EntityState } | undefined {
  const { world, tick, worldSeed, tuning } = input;
  const districtId = getPlayerDistrictId(world);
  if (!districtId) return undefined;

  const existing = getAllAsks(world).filter((a) => {
    if (a.status !== 'open') return false;
    const zoneId = askSubjectZoneId(a, world);
    return zoneId !== undefined && getDistrictForZone(world, zoneId) === districtId;
  });
  if (existing.length > 0) return undefined;

  // Deterministic per-(district, tick) offer roll -- no tuning lever names
  // ask FREQUENCY (only `askPredatorRatio`/`askRevealRounds`, ADDENDUM-
  // COMMON design lock 7), so this app declares its own measured-free
  // default (0.2 per round when eligible) rather than guessing a doc value
  // that was never specified. Documented here, not hidden.
  const offerRoll = hashToUnit(`ask-offer:${districtId}:${tick}:${worldSeed}`);
  if (offerRoll >= 0.2) return undefined;

  const playerZoneId = world.locationId;
  const id = genId(world, 'ask');
  const kindIdx = Math.floor(hashToUnit(`ask-kind:${id}:${worldSeed}`) * ASK_KINDS.length);
  const kind = ASK_KINDS[Math.min(kindIdx, ASK_KINDS.length - 1)];
  const truth = chooseAskTruth(id, worldSeed, tuning.askPredatorRatio);

  const namePool = input.petitionerNamePool ?? DEFAULT_PETITIONER_NAMES;
  const nameIdx = Math.floor(hashToUnit(`ask-name:${id}:${worldSeed}`) * namePool.length);
  const name = namePool[Math.min(nameIdx, namePool.length - 1)];

  const petitionerEntity: EntityState = {
    id,
    blueprintId: 'petitioner',
    type: 'npc',
    name,
    tags: ['npc', 'named', 'petitioner'],
    stats: {},
    resources: { hp: 1, maxHp: 1 },
    statuses: [],
    zoneId: playerZoneId,
  };

  // Reputation stake scales with stake magnitude, small at the game's start
  // (design doc §4: "while the player's highest faction reputation is low,
  // predatory asks cost little"). A flat measured default here; the
  // standing-scaled escalation is applied by the caller (game.ts), which
  // alone knows the player's current reputation composition.
  const stake = 5;

  const destinationZoneId = kind === 'guide'
    ? world.zones[playerZoneId]?.neighbors?.[0]
    : undefined;

  // A faction tie for the petitioner -- design lock 7's own cue list names
  // "a faction tie visible in /npc" as one of the planted cues, so a
  // predatory 'hold'/'vouch' ask needs one to pin its consequence to. Picked
  // deterministically from the world's known factions when any exist; a
  // fresh/factionless world (or a genuine ask, which never needs one) leaves
  // it unset.
  const factionIds = Object.keys(world.factions ?? {});
  const factionId = truth === 'predatory' && factionIds.length > 0
    ? factionIds[Math.floor(hashToUnit(`ask-faction:${id}:${worldSeed}`) * factionIds.length) % factionIds.length]
    : undefined;

  const ask: Ask = {
    id,
    petitioner: { id, name, zoneId: playerZoneId, ...(factionId ? { factionId } : {}) },
    kind,
    surface: ASK_SURFACES[kind],
    truth,
    stake,
    offeredTick: tick,
    status: 'open',
    cues: planAskCues(kind, name, truth),
    ...(destinationZoneId ? { destinationZoneId } : {}),
  };

  return { ask, petitionerEntity };
}

// --- Help / ignore / reveal ---

/**
 * The verb (and, for 'guide', the destination zone) that WOULD count as
 * helping this ask through its most literal mechanic. NOT currently wired
 * into any real detection path: action-interpreter.ts's `help <name>`
 * fast-path always resolves to `speak` + a `helpAskId` parameter (see that
 * fast-path's own doc comment for why -- `give` needs a real carried item
 * this pack has no coin-item to model 'lend' with, and 'move'-as-escort has
 * no in-fiction distinction from ordinary travel the interpreter could
 * detect without the player already having said "help"). Exported and unit
 * tested as the documented target mapping for a future natural-verb
 * detection pass (typing "give coin to the woman" without saying "help"
 * first), not dead code -- but genuinely unconsumed by game.ts today; do
 * not assume it gates anything at runtime.
 */
export function expectedAskHelp(ask: Ask): { verb: 'speak' | 'give' | 'move'; targetId: string } {
  const subjectId = askSubjectId(ask);
  if (ask.kind === 'guide' && ask.destinationZoneId) {
    return { verb: 'move', targetId: ask.destinationZoneId };
  }
  if (ask.kind === 'carry' || ask.kind === 'lend') {
    return { verb: 'give', targetId: subjectId };
  }
  // 'hold' / 'vouch': a dialogue commitment, not an item/escort transfer.
  return { verb: 'speak', targetId: subjectId };
}

export function markAskHelped(world: WorldState, id: string): Ask | undefined {
  return updateAsk(world, id, { status: 'helped' });
}

export function markAskIgnored(world: WorldState, id: string): Ask | undefined {
  return updateAsk(world, id, { status: 'ignored' });
}

export function markAskRevealed(world: WorldState, id: string, tick: number): Ask | undefined {
  return updateAsk(world, id, { status: 'revealed', revealTick: tick });
}

export function markAskExpired(world: WorldState, id: string): Ask | undefined {
  return updateAsk(world, id, { status: 'expired' });
}

/** Predatory asks helped and not yet revealed, whose reveal window has elapsed. */
export function dueReveals(world: WorldState, tick: number, revealRounds: number): Ask[] {
  return getAllAsks(world).filter(
    (a) => a.truth === 'predatory' && a.status === 'helped' && tick - a.offeredTick >= revealRounds,
  );
}

// --- Consequences (design lock 7: "via EXISTING levers only") ---

export type AskConsequence =
  | { kind: 'coin-lost'; amount: number }
  | { kind: 'ambush'; zoneId: string }
  | { kind: 'faction-pin'; factionId: string; delta: number }
  | { kind: 'standing-burn'; factionId: string; delta: number }
  | { kind: 'none' };

/**
 * What a revealed predatory ask does to the player, described declaratively
 * -- game.ts (the only place with the engine, RumorEngine, and
 * adjustFactionReputation) applies it. Falls back to `coin-lost` whenever a
 * more specific lever (an ambush-capable destination zone, a faction tie)
 * isn't available for this particular ask, so every predatory ask has SOME
 * real cost rather than silently resolving to nothing.
 */
export function resolveAskConsequence(ask: Ask): AskConsequence {
  switch (ask.kind) {
    case 'lend':
      return { kind: 'coin-lost', amount: ask.stake };
    case 'carry':
      return { kind: 'coin-lost', amount: Math.round(ask.stake / 2) };
    case 'guide':
      return ask.destinationZoneId
        ? { kind: 'ambush', zoneId: ask.destinationZoneId }
        : { kind: 'coin-lost', amount: ask.stake };
    case 'hold':
      return ask.petitioner?.factionId
        ? { kind: 'faction-pin', factionId: ask.petitioner.factionId, delta: -ask.stake }
        : { kind: 'coin-lost', amount: ask.stake };
    case 'vouch':
      return ask.petitioner?.factionId
        ? { kind: 'standing-burn', factionId: ask.petitioner.factionId, delta: -ask.stake }
        : { kind: 'coin-lost', amount: ask.stake };
  }
}
