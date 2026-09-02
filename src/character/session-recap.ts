// Unified 5-section session recap
// v0.8: character + world + faction + rumor + "what people are saying"

import type { SessionDelta } from './recap-delta.js';
import type { WorldDelta } from './world-delta.js';
import type { PlayerRumor, PressureFallout, NpcRecapEntry, CompanionRole, PartyState, DistrictEconomy, OpportunityState, OpportunityFallout } from '@ai-rpg-engine/modules';
import { deriveEconomyDescriptor, type SupplyCategory } from '@ai-rpg-engine/modules';
import { getTerminalWidth } from '../display/play-renderer.js';
import { dim } from '../cli/colors.js';

// F-4b8a3a39: DIVIDER/HEAVY_DIVIDER used to be hardcoded 60-char module constants,
// unlike play-renderer.ts's own dividers (PFE-005) and this file's five
// sibling files (recap.ts, recap-delta.ts, sheet.ts, chronicle-renderer.ts,
// world-delta.ts — all already fixed under F-e475c46d/F-38eb3dec). Computed
// per call (not a module-level constant) so it tracks the real terminal
// width, matching play-renderer.ts's makeDivider()/makeThinDivider() pattern.
// F-8e8ac939: both also wrapped in dim() -- colors.ts documents dim as the
// semantic choice for "dividers and secondary text", and the reference
// implementation this comment already claims to match
// (play-renderer.ts's makeDivider()/makeThinDivider(), and this same
// six-file family's own chronicle-renderer.ts sibling) both wrap every
// divider in dim(). This file rendered its rules bright/undimmed until now
// -- this end-of-session SESSION SUMMARY screen is shown after every play
// session ends, one of the two or three most-seen screens in the app.
function divider(): string {
  return dim('─'.repeat(getTerminalWidth()));
}
function heavyDivider(): string {
  return dim('═'.repeat(getTerminalWidth()));
}

// --- Types ---

export type FactionDelta = {
  factionId: string;
  /**
   * F-bbcef54a: resolved display name, mirroring WhatPeopleAreSaying's own
   * factionName field. Optional so a hand-built FactionDelta literal (tests,
   * or any future caller) that omits it still type-checks and still renders
   * — renderFullRecap falls back to factionId when this is absent, same as
   * before this fix.
   */
  factionName?: string;
  reputationBefore: number;
  reputationAfter: number;
  pressuresFrom: number;
  rumorsKnownBefore: number;
  rumorsKnownAfter: number;
};

export type RumorDelta = {
  spawned: number;
  mutated: number;
  totalSpread: number;
  mostWidespread?: string;
};

export type WhatPeopleAreSaying = {
  factionId: string;
  factionName: string;
  sentiment: 'hostile' | 'wary' | 'neutral' | 'friendly' | 'admiring';
  latestRumor?: string;
};

export type DistrictDelta = {
  districtId: string;
  districtName: string;
  moodBefore: string;
  moodAfter: string;
  changed: boolean;
  keyShifts: string[];
};

export type CompanionRecapEntry = {
  npcId: string;
  name: string;
  role: CompanionRole;
  event: 'joined' | 'departed' | 'betrayed' | 'died' | 'shifted-breakpoint' | 'saved-player';
  detail?: string;
};

export type ItemRecapEntry = {
  itemId: string;
  name: string;
  event: 'acquired' | 'lost' | 'milestone-reached' | 'recognized';
  detail?: string;
};

export type EconomyRecapEntry = {
  districtId: string;
  districtName: string;
  changes: string[];
};

export type CraftingRecapEntry = {
  action: 'crafted' | 'salvaged' | 'modified' | 'repaired';
  itemName: string;
  detail?: string;
};

export type OpportunityRecapEntry = {
  opportunityId: string;
  title: string;
  kind: string;
  event: 'spawned' | 'accepted' | 'completed' | 'failed' | 'abandoned' | 'betrayed' | 'expired' | 'declined';
  detail?: string;
};

/**
 * WO-A5-9 (slice A5 §7): the eight kinds of round-ledger entries the design
 * doc names for the "The world moved" recap section — pressures spawned/
 * resolved/expired, opportunities offered/expired, ambushes, district mood
 * transitions, rumors mutated. One entry per occurrence; `headline` is
 * mechanical-register prose describing that one occurrence (e.g. "bounty-
 * issued: The Chapel Guard puts a price on your head", "Ambush: Bone
 * Collector in the Sunken Docks", "Chapel Undead: calm -> grim").
 */
export type WorldMovedEventKind =
  | 'pressure-spawned'
  | 'pressure-resolved'
  | 'pressure-expired'
  | 'opportunity-offered'
  | 'opportunity-expired'
  | 'ambush'
  | 'mood-transition'
  | 'rumor-mutated'
  | 'ask-offered'
  | 'ask-helped'
  | 'ask-revealed'
  | 'ask-ignored'
  | 'deed-recognized'
  | 'gratitude-repaid'
  /**
   * WO-B1-10 (slice B1 §5, design lock 8): a genuine ask the player helped —
   * headline is game-core's same-round recognitionLine text (or an
   * equivalent past-tense recap of it), never invented here.
   */
  | 'ask-helped'
  /**
   * WO-B1-10 (slice B1 §5, design lock 8): a predatory ask's sting, or a
   * genuine ask's ignored-consequence, landing several rounds after the
   * offer — headline is produced by scene-context.ts's describeAskReveal
   * (WO-B1-11), naming the planted cues.
   */
  | 'ask-revealed';

export type WorldMovedEvent = {
  kind: WorldMovedEventKind;
  headline: string;
};

/**
 * WO-A5-9: game-core's `this.worldMovedLedger` (ADDENDUM-game-core.md
 * WO-A5-5) — accumulated per round, capped oldest-first at the source. This
 * file only reads it; it never mutates or caps it further.
 */
export type WorldMovedLedger = {
  events: WorldMovedEvent[];
};

/**
 * Fixed render order — NOT the ledger's own (chronological) event order.
 * Determinism (this cycle's byte-identical living-world-driver proof)
 * requires the section's kind-to-kind ordering to be independent of which
 * kind happened to occur first in a given session, so this is a constant
 * array walked in order rather than a Map built from insertion order.
 */
const WORLD_MOVED_KIND_ORDER: readonly WorldMovedEventKind[] = [
  'pressure-spawned',
  'pressure-resolved',
  'pressure-expired',
  'opportunity-offered',
  'opportunity-expired',
  'ambush',
  'mood-transition',
  'rumor-mutated',
  // WO-B1-10: appended after the pre-existing eight — never reorders them,
  // preserving this cycle's determinism proof for every session that
  // predates slice B1.
  'ask-helped',
  'ask-revealed',
  // Stitch (wave 10): game-core's WorldMovedKind also carries the two
  // ask kinds below; appended after narrative-llm's pair, same rule.
  'ask-offered',
  'ask-ignored',
  'deed-recognized',
  'gratitude-repaid',
];

const WORLD_MOVED_KIND_LABELS: Record<WorldMovedEventKind, string> = {
  'pressure-spawned': 'Pressures spawned',
  'pressure-resolved': 'Pressures resolved',
  'pressure-expired': 'Pressures expired',
  'opportunity-offered': 'Opportunities offered',
  'opportunity-expired': 'Opportunities expired',
  'ambush': 'Ambushes',
  'mood-transition': 'Mood transitions',
  'rumor-mutated': 'Rumors mutated',
  // WO-B1-10 (slice B1 §5, design lock 8): draft labels, listed verbatim
  // per ADDENDUM-narrative-llm.md — coordinator ratifies at stitch.
  'ask-helped': 'Deeds remembered',
  'ask-revealed': 'Marks the street left on you',
  'ask-offered': 'Asks made of you',
  'ask-ignored': 'Help left ungiven',
  'deed-recognized': 'Deeds recognized',
  'gratitude-repaid': 'Gratitude repaid',
};

// --- Computation ---

export function computeFactionDeltas(
  beforeReputation: { factionId: string; value: number }[],
  afterReputation: { factionId: string; value: number }[],
  rumors: PlayerRumor[],
  resolvedPressures: PressureFallout[],
  sessionStartTick: number,
  // F-bbcef54a: optional id->display-name map, same shape and same
  // ?? id-fallback convention as deriveWhatPeopleAreSaying's factionNames
  // param below. Optional and trailing so the pre-existing 5-arg call sites
  // (bin.ts, this file's own tests) keep compiling unchanged.
  factionNames: Record<string, string> = {},
): FactionDelta[] {
  const deltas: FactionDelta[] = [];
  const factionIds = new Set<string>();

  for (const rep of afterReputation) factionIds.add(rep.factionId);
  for (const rep of beforeReputation) factionIds.add(rep.factionId);

  for (const factionId of factionIds) {
    const before = beforeReputation.find((r) => r.factionId === factionId)?.value ?? 0;
    const after = afterReputation.find((r) => r.factionId === factionId)?.value ?? 0;

    // Count pressures from this faction resolved this session
    // F-5ddf0503: removed a dead `resolvedPressures.indexOf(f) >= 0` clause —
    // f is drawn from resolvedPressures by this very .filter(), so indexOf(f)
    // (reference equality) always found it; the clause had no effect on output.
    const pressuresFrom = resolvedPressures.filter(
      (f) => f.resolution.resolvedBy !== 'expiry',
    ).filter((f) => {
      // Check fallout effects for this faction
      return f.effects.some(
        (e) => (e.type === 'reputation' && e.factionId === factionId) ||
          (e.type === 'alert' && e.factionId === factionId),
      );
    }).length;

    // Count rumors known by this faction before/after session
    const rumorsKnownBefore = rumors.filter(
      (r) => r.spreadTo.includes(factionId) && r.originTick < sessionStartTick,
    ).length;
    const rumorsKnownAfter = rumors.filter(
      (r) => r.spreadTo.includes(factionId),
    ).length;

    // Only include factions where something changed
    if (before !== after || pressuresFrom > 0 || rumorsKnownAfter > rumorsKnownBefore) {
      deltas.push({
        factionId,
        factionName: factionNames[factionId] ?? factionId,
        reputationBefore: before,
        reputationAfter: after,
        pressuresFrom,
        rumorsKnownBefore,
        rumorsKnownAfter,
      });
    }
  }

  return deltas.sort((a, b) => {
    const aDiff = Math.abs(a.reputationAfter - a.reputationBefore);
    const bDiff = Math.abs(b.reputationAfter - b.reputationBefore);
    return bDiff - aDiff;
  });
}

export function computeRumorDelta(
  beforeCount: number,
  afterRumors: PlayerRumor[],
): RumorDelta {
  const spawned = afterRumors.length - beforeCount;

  // Count mutations across all rumors
  const mutated = afterRumors.reduce((sum, r) => sum + r.mutationCount, 0);

  // Total faction-reaches
  const totalSpread = afterRumors.reduce((sum, r) => sum + r.spreadTo.length, 0);

  // Most widespread rumor
  let mostWidespread: string | undefined;
  let maxSpread = 0;
  for (const rumor of afterRumors) {
    if (rumor.spreadTo.length > maxSpread) {
      maxSpread = rumor.spreadTo.length;
      mostWidespread = rumor.claim;
    }
  }

  return { spawned, mutated, totalSpread, mostWidespread };
}

export function deriveWhatPeopleAreSaying(
  rumors: PlayerRumor[],
  reputation: { factionId: string; value: number }[],
  factionNames: Record<string, string>,
): WhatPeopleAreSaying[] {
  const results: WhatPeopleAreSaying[] = [];

  for (const rep of reputation) {
    const sentiment: WhatPeopleAreSaying['sentiment'] =
      rep.value <= -50 ? 'hostile'
      : rep.value <= -20 ? 'wary'
      : rep.value >= 50 ? 'admiring'
      : rep.value >= 20 ? 'friendly'
      : 'neutral';

    // Find the most recent rumor this faction has heard
    const factionRumors = rumors
      .filter((r) => r.spreadTo.includes(rep.factionId))
      .sort((a, b) => b.originTick - a.originTick);

    const latestRumor = factionRumors[0]?.claim;

    // Only include factions with non-neutral sentiment or known rumors
    if (sentiment !== 'neutral' || latestRumor) {
      results.push({
        factionId: rep.factionId,
        factionName: factionNames[rep.factionId] ?? rep.factionId,
        sentiment,
        latestRumor,
      });
    }
  }

  return results;
}

export function computeDistrictDeltas(
  beforeMoods: { districtId: string; districtName: string; descriptor: string; metrics: { commerce: number; morale: number; alertPressure: number; stability: number } }[],
  afterMoods: { districtId: string; districtName: string; descriptor: string; metrics: { commerce: number; morale: number; alertPressure: number; stability: number } }[],
): DistrictDelta[] {
  const deltas: DistrictDelta[] = [];

  for (const after of afterMoods) {
    const before = beforeMoods.find((b) => b.districtId === after.districtId);
    if (!before) continue;

    const keyShifts: string[] = [];
    const THRESHOLD = 15;

    const commerceDiff = after.metrics.commerce - before.metrics.commerce;
    if (Math.abs(commerceDiff) >= THRESHOLD) {
      keyShifts.push(commerceDiff > 0 ? 'commerce recovered' : 'commerce declined');
    }
    const moraleDiff = after.metrics.morale - before.metrics.morale;
    if (Math.abs(moraleDiff) >= THRESHOLD) {
      keyShifts.push(moraleDiff > 0 ? 'morale lifted' : 'morale fell sharply');
    }
    const alertDiff = after.metrics.alertPressure - before.metrics.alertPressure;
    if (Math.abs(alertDiff) >= THRESHOLD) {
      keyShifts.push(alertDiff > 0 ? 'alertPressure rose sharply' : 'alertPressure eased');
    }
    const stabDiff = after.metrics.stability - before.metrics.stability;
    if (Math.abs(stabDiff) >= 2) {
      keyShifts.push(stabDiff > 0 ? 'stability improved' : 'stability deteriorated');
    }

    const changed = before.descriptor !== after.descriptor || keyShifts.length > 0;
    deltas.push({
      districtId: after.districtId,
      districtName: after.districtName,
      moodBefore: before.descriptor,
      moodAfter: after.descriptor,
      changed,
      keyShifts,
    });
  }

  return deltas;
}

export function computeCompanionRecapEntries(
  beforeParty: PartyState | undefined,
  afterParty: PartyState | undefined,
  companionNames: Record<string, string>,
): CompanionRecapEntry[] {
  const entries: CompanionRecapEntry[] = [];
  const beforeIds = new Set((beforeParty?.companions ?? []).map((c) => c.npcId));
  const afterIds = new Set((afterParty?.companions ?? []).map((c) => c.npcId));

  // Joined: in after but not before
  for (const comp of afterParty?.companions ?? []) {
    if (!beforeIds.has(comp.npcId)) {
      entries.push({
        npcId: comp.npcId,
        name: companionNames[comp.npcId] ?? comp.npcId,
        role: comp.role,
        event: 'joined',
      });
    }
  }

  // Departed: in before but not after
  for (const comp of beforeParty?.companions ?? []) {
    if (!afterIds.has(comp.npcId)) {
      entries.push({
        npcId: comp.npcId,
        name: companionNames[comp.npcId] ?? comp.npcId,
        role: comp.role,
        event: 'departed',
      });
    }
  }

  return entries;
}

export function computeItemRecapEntries(
  beforeChronicle: Record<string, import('@ai-rpg-engine/equipment').ItemChronicleEntry[]>,
  afterChronicle: Record<string, import('@ai-rpg-engine/equipment').ItemChronicleEntry[]>,
  itemNames: Record<string, string>,
): ItemRecapEntry[] {
  const entries: ItemRecapEntry[] = [];
  const allItemIds = new Set([...Object.keys(beforeChronicle), ...Object.keys(afterChronicle)]);

  for (const itemId of allItemIds) {
    const before = beforeChronicle[itemId] ?? [];
    const after = afterChronicle[itemId] ?? [];

    // New item acquired this session
    if (before.length === 0 && after.length > 0) {
      const acqEvent = after.find((e) => e.event === 'acquired');
      entries.push({
        itemId,
        name: itemNames[itemId] ?? itemId,
        event: 'acquired',
        detail: acqEvent?.detail,
      });
    }

    // Item lost (had entries before, now has a 'lost' event)
    const newLost = after.filter((e) => e.event === 'lost' && !before.some((b) => b.tick === e.tick));
    if (newLost.length > 0) {
      entries.push({
        itemId,
        name: itemNames[itemId] ?? itemId,
        event: 'lost',
        detail: newLost[0].detail,
      });
    }

    // Recognized this session
    const newRecognitions = after.filter((e) => e.event === 'recognized' && !before.some((b) => b.tick === e.tick));
    if (newRecognitions.length > 0) {
      entries.push({
        itemId,
        name: itemNames[itemId] ?? itemId,
        event: 'recognized',
        detail: `${newRecognitions.length} time${newRecognitions.length > 1 ? 's' : ''}`,
      });
    }
  }

  return entries;
}

export function computeEconomyRecapEntries(
  beforeEconomies: Map<string, DistrictEconomy> | undefined,
  afterEconomies: Map<string, DistrictEconomy>,
  districtNames: Record<string, string>,
): EconomyRecapEntry[] {
  const entries: EconomyRecapEntry[] = [];
  const THRESHOLD = 15;

  for (const [districtId, afterEcon] of afterEconomies) {
    const beforeEcon = beforeEconomies?.get(districtId);
    if (!beforeEcon) continue;

    const changes: string[] = [];
    const afterDesc = deriveEconomyDescriptor(afterEcon);
    const beforeDesc = deriveEconomyDescriptor(beforeEcon);

    // Check for new scarcities
    for (const s of afterDesc.scarcities) {
      if (!beforeDesc.scarcities.some((bs) => bs.category === s.category)) {
        changes.push(`${s.category} became scarce`);
      }
    }

    // Check for resolved scarcities
    for (const s of beforeDesc.scarcities) {
      if (!afterDesc.scarcities.some((as) => as.category === s.category)) {
        changes.push(`${s.category} scarcity resolved`);
      }
    }

    // Check significant supply shifts
    for (const cat of Object.keys(afterEcon.supplies) as SupplyCategory[]) {
      const diff = afterEcon.supplies[cat].level - beforeEcon.supplies[cat].level;
      if (Math.abs(diff) >= THRESHOLD) {
        changes.push(`${cat} ${diff > 0 ? 'recovered' : 'declined'} (${diff > 0 ? '+' : ''}${Math.round(diff)})`);
      }
    }

    // Black market state change
    if (!beforeEcon.blackMarketActive && afterEcon.blackMarketActive) {
      changes.push('black market opened');
    } else if (beforeEcon.blackMarketActive && !afterEcon.blackMarketActive) {
      changes.push('black market shut down');
    }

    if (changes.length > 0) {
      entries.push({
        districtId,
        districtName: districtNames[districtId] ?? districtId,
        changes,
      });
    }
  }

  return entries;
}

export function computeCraftingRecapEntries(
  beforeCustom: Record<string, string | number | boolean>,
  afterCustom: Record<string, string | number | boolean>,
): { entries: CraftingRecapEntry[], materialChanges: { category: string; before: number; after: number }[] } {
  const entries: CraftingRecapEntry[] = [];

  // Derive crafting actions from item chronicle changes in profile.custom
  // Crafting events are tracked as materials.crafted.*, materials.salvaged.*, etc.
  // But simpler: we scan for material changes — material deltas imply crafting activity
  const materialChanges: { category: string; before: number; after: number }[] = [];
  const categories = new Set<string>();
  for (const key of Object.keys(afterCustom)) {
    if (key.startsWith('materials.')) categories.add(key.replace('materials.', ''));
  }
  for (const key of Object.keys(beforeCustom)) {
    if (key.startsWith('materials.')) categories.add(key.replace('materials.', ''));
  }
  for (const cat of categories) {
    const before = Number(beforeCustom[`materials.${cat}`] ?? 0);
    const after = Number(afterCustom[`materials.${cat}`] ?? 0);
    if (before !== after) {
      materialChanges.push({ category: cat, before, after });
    }
  }

  return { entries, materialChanges };
}

export function computeCraftingRecapFromJournal(
  journal: { query(filters: { category?: string; afterTick?: number }): { description: string; data: Record<string, unknown> }[] },
  sessionStartTick: number,
): CraftingRecapEntry[] {
  const entries: CraftingRecapEntry[] = [];

  const records = journal.query({ category: 'item-transformed', afterTick: sessionStartTick });
  for (const r of records) {
    const action = r.data?.craftAction as string | undefined;
    const itemName = r.data?.itemName as string ?? 'unknown';
    if (action === 'crafted' || action === 'salvaged' || action === 'modified' || action === 'repaired') {
      entries.push({ action, itemName, detail: r.description });
    }
  }

  return entries;
}

export function computeOpportunityRecapEntries(
  beforeOpportunities: OpportunityState[],
  afterOpportunities: OpportunityState[],
  resolvedOpportunities: OpportunityFallout[],
): OpportunityRecapEntry[] {
  const entries: OpportunityRecapEntry[] = [];
  const beforeIds = new Set(beforeOpportunities.map((o) => o.id));

  // New opportunities spawned this session
  for (const opp of afterOpportunities) {
    if (!beforeIds.has(opp.id)) {
      entries.push({
        opportunityId: opp.id,
        title: opp.title,
        kind: opp.kind,
        event: opp.status === 'accepted' ? 'accepted' : 'spawned',
      });
    }
  }

  // Accepted: was available before, now accepted
  for (const opp of afterOpportunities) {
    if (beforeIds.has(opp.id) && opp.status === 'accepted') {
      const before = beforeOpportunities.find((o) => o.id === opp.id);
      if (before && before.status === 'available') {
        entries.push({
          opportunityId: opp.id,
          title: opp.title,
          kind: opp.kind,
          event: 'accepted',
        });
      }
    }
  }

  // Resolved opportunities
  for (const fallout of resolvedOpportunities) {
    const res = fallout.resolution;
    const event = res.resolutionType as OpportunityRecapEntry['event'];
    entries.push({
      opportunityId: res.opportunityId,
      title: `${res.opportunityKind} opportunity`,
      kind: res.opportunityKind,
      event,
      detail: fallout.summary,
    });
  }

  return entries;
}

/**
 * WO-A5-9 (slice A5 §7): render "counts + the headline of each" (design
 * doc's own words) — one line per kind that occurred at least once this
 * session, showing the count and the MOST RECENT occurrence's headline
 * (last in the ledger's chronological array), not every individual
 * occurrence. Returns [] (renders nothing) when the ledger is absent or
 * empty, per WO-A5-9's "absent when empty" contract.
 */
function renderWorldMovedLines(ledger?: WorldMovedLedger): string[] {
  if (!ledger || ledger.events.length === 0) return [];

  const byKind = new Map<WorldMovedEventKind, WorldMovedEvent[]>();
  for (const event of ledger.events) {
    const list = byKind.get(event.kind);
    if (list) list.push(event);
    else byKind.set(event.kind, [event]);
  }

  const lines: string[] = [];
  for (const kind of WORLD_MOVED_KIND_ORDER) {
    const events = byKind.get(kind);
    if (!events || events.length === 0) continue;
    const mostRecent = events[events.length - 1];
    lines.push(`  ${WORLD_MOVED_KIND_LABELS[kind]}: ${events.length} — "${mostRecent.headline}"`);
  }
  return lines;
}

// --- Rendering ---

export type ArcRecapData = {
  dominantArc: string | null;
  momentum: string;
  endgameTriggers: { resolutionClass: string; reason: string }[];
};

export function renderFullRecap(
  characterDelta: SessionDelta,
  worldDelta: WorldDelta,
  factionDeltas: FactionDelta[],
  rumorDelta: RumorDelta,
  whatPeopleAreSaying: WhatPeopleAreSaying[],
  npcRecapEntries?: NpcRecapEntry[],
  districtDeltas?: DistrictDelta[],
  companionRecapEntries?: CompanionRecapEntry[],
  itemRecapEntries?: ItemRecapEntry[],
  economyRecapEntries?: EconomyRecapEntry[],
  craftingData?: { entries: CraftingRecapEntry[]; materialChanges: { category: string; before: number; after: number }[] },
  opportunityRecapEntries?: OpportunityRecapEntry[],
  arcRecapData?: ArcRecapData,
  /**
   * WO-A5-9 (slice A5 §7): game-core's `worldMovedLedger` — see this file's
   * WorldMovedLedger doc comment for the full contract. Additive trailing
   * param; omitted (or empty), the "THE WORLD MOVED" section renders
   * nothing, byte-identical to before this wave.
   */
  worldMovedLedger?: WorldMovedLedger,
): string {
  // F-579e70a8: hoisted so the "nothing happened" gate below can reuse the exact
  // same conditions that gate each individual section, instead of a hand-maintained
  // field subset that silently drops sections it doesn't know about (e.g. a session
  // with only a companion departure or an item loss used to render as fully empty).
  const changedDistricts = districtDeltas?.filter((d) => d.changed) ?? [];
  const hasCraftingData = !!craftingData &&
    (craftingData.entries.length > 0 || craftingData.materialChanges.length > 0);
  const worldMovedLines = renderWorldMovedLines(worldMovedLedger);

  const hasAnyContent =
    characterDelta.turnsPlayed > 0 ||
    characterDelta.xpGained > 0 ||
    (!!characterDelta.titleAfter && characterDelta.titleAfter !== characterDelta.titleBefore) ||
    characterDelta.newMilestones > 0 ||
    characterDelta.newInjuries > 0 ||
    worldDelta.pressuresSpawned > 0 ||
    worldDelta.pressuresResolved > 0 ||
    changedDistricts.length > 0 ||
    (economyRecapEntries?.length ?? 0) > 0 ||
    factionDeltas.length > 0 ||
    rumorDelta.spawned > 0 ||
    rumorDelta.totalSpread > 0 ||
    whatPeopleAreSaying.length > 0 ||
    (npcRecapEntries?.length ?? 0) > 0 ||
    (companionRecapEntries?.length ?? 0) > 0 ||
    (itemRecapEntries?.length ?? 0) > 0 ||
    hasCraftingData ||
    (opportunityRecapEntries?.length ?? 0) > 0 ||
    !!(arcRecapData && (arcRecapData.dominantArc || arcRecapData.endgameTriggers.length > 0)) ||
    worldMovedLines.length > 0;

  // Nothing to show if no section would actually render.
  if (!hasAnyContent) {
    return '';
  }

  const lines: string[] = [];

  lines.push('');
  lines.push(heavyDivider());
  lines.push('  SESSION SUMMARY');
  lines.push(heavyDivider());

  // Section 1: Character Changes
  lines.push('');
  lines.push(`  ${divider()}`);
  lines.push('  CHARACTER CHANGES');
  lines.push(`  ${divider()}`);
  lines.push('');

  const xpStr = characterDelta.xpGained > 0
    ? characterDelta.levelAfter > characterDelta.levelBefore
      ? ` | +${characterDelta.xpGained} XP (Level ${characterDelta.levelBefore} → ${characterDelta.levelAfter})`
      : ` | +${characterDelta.xpGained} XP`
    : '';
  lines.push(`  Turns played: ${characterDelta.turnsPlayed}${xpStr}`);

  if (characterDelta.titleAfter && characterDelta.titleAfter !== characterDelta.titleBefore) {
    lines.push(`  Title: ${characterDelta.titleBefore ?? '(none)'} → "${characterDelta.titleAfter}"`);
  }

  if (characterDelta.newMilestones > 0) {
    lines.push(`  ${characterDelta.newMilestones} new milestone${characterDelta.newMilestones > 1 ? 's' : ''}`);
  }

  if (characterDelta.newInjuries > 0) {
    lines.push(`  ${characterDelta.newInjuries} new injur${characterDelta.newInjuries > 1 ? 'ies' : 'y'}`);
  }

  // Section 2: World Changes
  if (worldDelta.pressuresSpawned > 0 || worldDelta.pressuresResolved > 0) {
    lines.push('');
    lines.push(`  ${divider()}`);
    lines.push('  WORLD CHANGES');
    lines.push(`  ${divider()}`);
    lines.push('');

    if (worldDelta.pressuresSpawned > 0) {
      lines.push(`  Pressures spawned: ${worldDelta.pressuresSpawned}`);
    }
    if (worldDelta.pressuresResolved > 0) {
      lines.push(`  Pressures resolved: ${worldDelta.pressuresResolved}`);
      for (const summary of worldDelta.resolutionSummaries) {
        lines.push(`    - ${summary}`);
      }
    }
    if (worldDelta.chainReactions > 0) {
      lines.push(`  Chain reactions: ${worldDelta.chainReactions}`);
    }
  }

  // Section 3: District Changes
  if (changedDistricts.length > 0) {
    lines.push('');
    lines.push(`  ${divider()}`);
    lines.push('  DISTRICT CHANGES');
    lines.push(`  ${divider()}`);
    lines.push('');

    for (const dd of changedDistricts) {
      if (dd.moodBefore !== dd.moodAfter) {
        lines.push(`  ${dd.districtName}: "${dd.moodBefore}" → "${dd.moodAfter}"`);
      } else {
        lines.push(`  ${dd.districtName}: "${dd.moodAfter}"`);
      }
      if (dd.keyShifts.length > 0) {
        lines.push(`    ${dd.keyShifts.join(', ')}`);
      }
    }
  }

  // Section: Economy Changes
  if (economyRecapEntries && economyRecapEntries.length > 0) {
    lines.push('');
    lines.push(`  ${divider()}`);
    lines.push('  ECONOMY CHANGES');
    lines.push(`  ${divider()}`);
    lines.push('');

    for (const entry of economyRecapEntries) {
      lines.push(`  ${entry.districtName}:`);
      for (const change of entry.changes) {
        lines.push(`    - ${change}`);
      }
    }
  }

  // Section 4: Faction Shifts
  if (factionDeltas.length > 0) {
    lines.push('');
    lines.push(`  ${divider()}`);
    lines.push('  FACTION SHIFTS');
    lines.push(`  ${divider()}`);
    lines.push('');

    for (const fd of factionDeltas) {
      const repChange = fd.reputationAfter - fd.reputationBefore;
      const sign = repChange > 0 ? '+' : '';
      const rumorInfo = fd.rumorsKnownAfter > fd.rumorsKnownBefore
        ? ` | ${fd.rumorsKnownAfter - fd.rumorsKnownBefore} new rumor${fd.rumorsKnownAfter - fd.rumorsKnownBefore > 1 ? 's' : ''} about you`
        : '';
      // F-bbcef54a: prefer the resolved display name (matches this same
      // screen's District Changes / Economy Changes / What People Are Saying
      // sections); fall back to the raw id when a caller hasn't populated it.
      const factionLabel = fd.factionName ?? fd.factionId;
      if (repChange !== 0) {
        lines.push(`  ${factionLabel}: ${sign}${repChange} (now ${fd.reputationAfter > 0 ? '+' : ''}${fd.reputationAfter})${rumorInfo}`);
      } else if (rumorInfo) {
        lines.push(`  ${factionLabel}:${rumorInfo}`);
      }
    }
  }

  // Section 4: Rumor Network
  if (rumorDelta.spawned > 0 || rumorDelta.totalSpread > 0) {
    lines.push('');
    lines.push(`  ${divider()}`);
    lines.push('  RUMOR NETWORK');
    lines.push(`  ${divider()}`);
    lines.push('');

    const parts: string[] = [];
    if (rumorDelta.spawned > 0) parts.push(`${rumorDelta.spawned} new rumor${rumorDelta.spawned > 1 ? 's' : ''}`);
    if (rumorDelta.totalSpread > 0) parts.push(`${rumorDelta.totalSpread} faction-reaches`);
    if (parts.length > 0) lines.push(`  ${parts.join(' | ')}`);

    if (rumorDelta.mostWidespread) {
      const truncated = rumorDelta.mostWidespread.length > 60
        ? rumorDelta.mostWidespread.slice(0, 57) + '...'
        : rumorDelta.mostWidespread;
      lines.push(`  Most widespread: "${truncated}"`);
    }
  }

  // Section 5: What People Are Saying
  if (whatPeopleAreSaying.length > 0) {
    lines.push('');
    lines.push(`  ${divider()}`);
    lines.push('  WHAT PEOPLE ARE SAYING');
    lines.push(`  ${divider()}`);
    lines.push('');

    for (const wps of whatPeopleAreSaying) {
      if (wps.latestRumor) {
        const truncated = wps.latestRumor.length > 50
          ? wps.latestRumor.slice(0, 47) + '...'
          : wps.latestRumor;
        lines.push(`  ${wps.factionName} (${wps.sentiment}): "${truncated}"`);
      } else {
        lines.push(`  ${wps.factionName} (${wps.sentiment})`);
      }
    }
  }

  // Section 6: Notable Characters
  if (npcRecapEntries && npcRecapEntries.length > 0) {
    lines.push('');
    lines.push(`  ${divider()}`);
    lines.push('  NOTABLE CHARACTERS');
    lines.push(`  ${divider()}`);
    lines.push('');

    for (const entry of npcRecapEntries) {
      const shiftStr = entry.shifted && entry.previousBreakpoint
        ? ` [was: ${entry.previousBreakpoint}]`
        : '';
      const shiftMark = entry.shifted ? ' [shifted!]' : '';
      lines.push(`  ${entry.name} (${entry.factionId}) — ${entry.breakpoint}${shiftStr}${shiftMark} | ${entry.dominantAxis}-driven`);

      const parts: string[] = [];
      if (entry.obligationSummary !== 'none') parts.push(entry.obligationSummary);
      if (entry.activeChainKind) parts.push(`Active: ${entry.activeChainKind} chain`);
      const detailStr = parts.length > 0 ? parts.join(' | ') + ' | ' : '';
      lines.push(`    ${detailStr}"${entry.leverageAngle}"`);
    }
  }

  // Section: Companion Changes
  if (companionRecapEntries && companionRecapEntries.length > 0) {
    lines.push('');
    lines.push(`  ${divider()}`);
    lines.push('  COMPANION CHANGES');
    lines.push(`  ${divider()}`);
    lines.push('');

    for (const entry of companionRecapEntries) {
      const detail = entry.detail ? `: ${entry.detail}` : '';
      lines.push(`  ${entry.name} (${entry.role}): ${entry.event}${detail}`);
    }
  }

  // Section: Equipment Changes
  if (itemRecapEntries && itemRecapEntries.length > 0) {
    lines.push('');
    lines.push(`  ${divider()}`);
    lines.push('  EQUIPMENT CHANGES');
    lines.push(`  ${divider()}`);
    lines.push('');

    for (const entry of itemRecapEntries) {
      const detail = entry.detail ? ` — ${entry.detail}` : '';
      lines.push(`  ${entry.name}: ${entry.event}${detail}`);
    }
  }

  // Section: Crafting Activity (v1.8)
  if (hasCraftingData) {
    lines.push('');
    lines.push(`  ${divider()}`);
    lines.push('  CRAFTING ACTIVITY');
    lines.push(`  ${divider()}`);
    lines.push('');

    if (craftingData!.entries.length > 0) {
      for (const entry of craftingData!.entries) {
        const detail = entry.detail ? ` — ${entry.detail}` : '';
        lines.push(`  ${entry.action}: ${entry.itemName}${detail}`);
      }
    }

    if (craftingData!.materialChanges.length > 0) {
      const parts: string[] = [];
      for (const mc of craftingData!.materialChanges) {
        const diff = mc.after - mc.before;
        const sign = diff > 0 ? '+' : '';
        parts.push(`${mc.category} ${sign}${diff}`);
      }
      lines.push(`  Materials: ${parts.join(', ')}`);
    }
  }

  // Section: Opportunities & Contracts (v1.9)
  if (opportunityRecapEntries && opportunityRecapEntries.length > 0) {
    lines.push('');
    lines.push(`  ${divider()}`);
    lines.push('  OPPORTUNITIES & CONTRACTS');
    lines.push(`  ${divider()}`);
    lines.push('');

    for (const entry of opportunityRecapEntries) {
      const detail = entry.detail ? ` — ${entry.detail}` : '';
      lines.push(`  ${entry.title} (${entry.kind}): ${entry.event}${detail}`);
    }
  }

  // Section: Campaign Arc (v2.0)
  if (arcRecapData && (arcRecapData.dominantArc || arcRecapData.endgameTriggers.length > 0)) {
    lines.push('');
    lines.push(`  ${divider()}`);
    lines.push('  CAMPAIGN ARC');
    lines.push(`  ${divider()}`);
    lines.push('');

    if (arcRecapData.dominantArc) {
      lines.push(`  Dominant arc: ${arcRecapData.dominantArc} (${arcRecapData.momentum})`);
    }
    for (const trigger of arcRecapData.endgameTriggers) {
      lines.push(`  Turning point: ${trigger.resolutionClass} — ${trigger.reason}`);
    }
  }

  // Section: The World Moved (WO-A5-9, slice A5 §7)
  if (worldMovedLines.length > 0) {
    lines.push('');
    lines.push(`  ${divider()}`);
    lines.push('  THE WORLD MOVED');
    lines.push(`  ${divider()}`);
    lines.push('');
    lines.push(...worldMovedLines);
  }

  lines.push('');
  lines.push(heavyDivider());
  lines.push('');

  return lines.join('\n');
}
