// WO-B1-5 (slice B1 §5, design lock 8, ADDENDUM-COMMON): recognition for
// good deeds -- witnessed, named, immediate, per-faction, materially
// unpaid. Helping a genuine ask (game/asks.ts) produces, the same round: an
// acknowledgment line naming the deed, a per-faction reputation delta
// (never an aggregate bar), a witnessed rumor (spread by the existing
// RumorEngine), and a gratitude state that repays later at real cost.
//
// Research grounding (dispatch-b1.md): finding 30 (relatedness predicts
// enjoyment independently of competence/autonomy -- recognition routed
// through named NPCs/factions, not a global virtue score), finding 31
// (positive feedback helps; EXPECTED tangible rewards undermine intrinsic
// motivation -- acknowledgment is informational, payouts stay unannounced),
// finding 32 (a morality meter is ignored on clear choices -- no aggregate
// goodness bar), finding 34 (a purely symbolic award raised performance
// ~12% -- honorifics are sufficient reward on their own), finding 35
// (prosocial effort is far higher when public -- the deed is witnessed
// through the rumor system), finding 36 (an immediate acknowledgment line
// carries felt consequence; gratitude drives costly helping and dies when
// made explicit -- no NPC ever names the debt aloud).

import type { WorldState } from '@ai-rpg-engine/core';
import type { Ask, AskKind } from './asks.js';

const GRATITUDE_GLOBAL_KEY = 'claude_rpg.gratitude';

export type Gratitude = {
  npcId: string;
  deedId: string;
  owed: boolean;
  spilloverFactionId?: string;
};

function readGratitudeLedger(world: WorldState): Record<string, Gratitude> {
  const raw = world.globals[GRATITUDE_GLOBAL_KEY];
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Gratitude>) : {};
  } catch {
    return {};
  }
}

function writeGratitudeLedger(world: WorldState, ledger: Record<string, Gratitude>): void {
  world.globals[GRATITUDE_GLOBAL_KEY] = JSON.stringify(ledger);
}

/** Grant (or refresh) a gratitude debt on `npcId` for helping deed `deedId`. Never announced to the player. */
export function grantGratitude(world: WorldState, npcId: string, deedId: string, spilloverFactionId?: string): void {
  const ledger = readGratitudeLedger(world);
  ledger[npcId] = { npcId, deedId, owed: true, spilloverFactionId: spilloverFactionId };
  writeGratitudeLedger(world, ledger);
}

export function isGratitudeOwed(world: WorldState, npcId: string): boolean {
  return readGratitudeLedger(world)[npcId]?.owed === true;
}

export function getGratitudeLedger(world: WorldState): Gratitude[] {
  return Object.values(readGratitudeLedger(world));
}

function clearGratitude(world: WorldState, npcId: string): void {
  const ledger = readGratitudeLedger(world);
  if (ledger[npcId]) {
    ledger[npcId] = { ...ledger[npcId], owed: false };
    writeGratitudeLedger(world, ledger);
  }
}

/**
 * Repay trigger 1 of 3 (design lock 8): a warning the round an ambush would
 * spawn. Consumes ONE owed gratitude entry (first found, id order) and
 * returns its warning line, or `undefined` if nobody owed the player
 * anything this round. Honesty-floor scoping note: the installed engine's
 * encounter-spawn step (packages/modules/src/encounter-spawn.ts) resolves
 * and spawns an ambush inside runWorldTick with no pre-spawn hook the app
 * can intercept -- `SpawnedEncounterReport` carries no faction id to match
 * against a specific gratitude's `spilloverFactionId` either. So this warns
 * the SAME round the ambush actually lands (not a true one-round-ahead
 * interception, which would need an engine-side change out of this wave's
 * scope) and matches on "any gratitude owed", not faction-specific --
 * documented deviation from the design doc's literal "the round before an
 * ambush" phrasing, called out here rather than silently narrowed.
 */
export function checkAmbushGratitudeWarning(world: WorldState, npcNameOf: (npcId: string) => string): string | undefined {
  const owed = getGratitudeLedger(world).find((g) => g.owed);
  if (!owed) return undefined;
  clearGratitude(world, owed.npcId);
  return `${npcNameOf(owed.npcId)} sends word just in time — trouble is waiting for you ahead.`;
}

/**
 * Repay trigger 2 of 3 (design lock 8): a merchant quote discount. Pure
 * price transform -- honesty floor: this app has no existing "quote" call
 * site to hook (verified: no function named quote/getQuote/buildQuote
 * exists anywhere in game.ts or game/**), so wiring this into an actual
 * buy/sell flow is NOT done this wave (see this domain's skipped[] entry).
 * Exported now so that wiring is a single call-site change once a quote
 * path exists, not a redesign.
 */
export function applyGratitudeDiscount(world: WorldState, npcId: string, basePrice: number): number {
  if (!isGratitudeOwed(world, npcId)) return basePrice;
  clearGratitude(world, npcId);
  return Math.max(0, Math.round(basePrice * 0.9));
}

/**
 * Repay trigger 3 of 3 (design lock 8): "intervene" = resolve one pressure
 * of the grateful NPC's spillover faction. Returns the pressure id to
 * resolve (game.ts's own `resolvePressure` is the only caller with engine
 * access) or `undefined` when nobody's gratitude has a spillover faction
 * with an active pressure to resolve.
 */
export function findGratitudeIntervention(
  world: WorldState,
  activePressureIds: Array<{ id: string; sourceFactionId: string }>,
): { npcId: string; pressureId: string } | undefined {
  for (const g of getGratitudeLedger(world)) {
    if (!g.owed || !g.spilloverFactionId) continue;
    const pressure = activePressureIds.find((p) => p.sourceFactionId === g.spilloverFactionId);
    if (pressure) return { npcId: g.npcId, pressureId: pressure.id };
  }
  return undefined;
}

export function markGratitudeInterventionSpent(world: WorldState, npcId: string): void {
  clearGratitude(world, npcId);
}

// --- Acknowledgment + reputation ---

const ASK_DEED_PHRASES: Record<AskKind, string> = {
  carry: 'carried the load',
  lend: 'carried the coin',
  guide: 'walked the dark path',
  hold: 'kept faith with what was given',
  vouch: 'stood up for a stranger',
};

/** The acknowledgment line for a genuine ask just helped (design doc §5). */
export function recognitionLineFor(subjectName: string, kind: AskKind): string {
  return `${subjectName} will remember who ${ASK_DEED_PHRASES[kind]}.`;
}

/** Small, stake-scaled reputation delta (design doc §5: never an aggregate bar, per-faction only). */
export function recognitionReputationDelta(stake: number): number {
  return Math.max(3, Math.round(stake));
}

/** The rumor claim text for a witnessed good deed (RumorEngine subject = 'player'). */
export function recognitionRumorClaim(subjectName: string, kind: AskKind): string {
  return `${subjectName} says a stranger ${ASK_DEED_PHRASES[kind]} for them.`;
}

// --- Honorific ---

/**
 * Design doc §5: standing above `tuning.honorificAt` earns an honorific the
 * street uses in dialogue and `/leverage` shows under the ledger --
 * symbolic only, never a listed material reward.
 */
export function getHonorific(world: WorldState, factionId: string, honorificAt: number): string | undefined {
  const rep = world.globals[`reputation_${factionId}`];
  const value = typeof rep === 'number' ? rep : 0;
  if (value < honorificAt) return undefined;
  const factionName = world.factions[factionId]?.name ?? factionId;
  return `Friend of the ${factionName}`;
}

/** Every faction where the player currently holds an honorific -- `/leverage`'s own ledger section. */
export function getAllHonorifics(world: WorldState, honorificAt: number): Array<{ factionId: string; honorific: string }> {
  const out: Array<{ factionId: string; honorific: string }> = [];
  for (const factionId of Object.keys(world.factions ?? {})) {
    const honorific = getHonorific(world, factionId, honorificAt);
    if (honorific) out.push({ factionId, honorific });
  }
  return out;
}

/** Type re-export convenience for callers that only need the Ask shape alongside this module. */
export type { Ask };
