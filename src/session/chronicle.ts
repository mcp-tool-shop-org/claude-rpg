// Chronicle integration: derive CampaignRecord entries from game events
// v0.8: campaign chronicle — structured event derivation, salience scoring, memory compaction
// v0.9: faction-action chronicle events

import type { CampaignJournal, CampaignRecord, RecordCategory } from '@ai-rpg-engine/campaign-memory';
import type { ResolvedEvent } from '@ai-rpg-engine/core';
import type { PressureFallout, PlayerRumor, FactionAction } from '@ai-rpg-engine/modules';
import type { ProfileUpdateHints } from '../turn-loop.js';

// --- Event Source Types ---

export type ChronicleEventSource =
  | { kind: 'turn'; events: ResolvedEvent[]; hints: ProfileUpdateHints; tick: number; zoneId: string }
  | { kind: 'pressure-resolved'; fallout: PressureFallout; tick: number }
  | { kind: 'title-change'; oldTitle: string | undefined; newTitle: string; tick: number }
  | { kind: 'rumor-spawned'; rumor: PlayerRumor; tick: number }
  | { kind: 'faction-action'; action: FactionAction; tick: number };

// --- Compaction Types ---

export type EraSummary = {
  fromTick: number;
  toTick: number;
  label: string;
  eventCount: number;
  topEvents: string[];
};

export type CompactedChronicle = {
  canonicalEvents: CampaignRecord[];
  eraSummaries: EraSummary[];
  totalRecords: number;
};

// --- Significance Scoring ---

const BASE_SIGNIFICANCE: Record<RecordCategory, number> = {
  death: 1.0,
  betrayal: 0.9,
  kill: 0.8,
  rescue: 0.8,
  alliance: 0.7,
  discovery: 0.6,
  theft: 0.5,
  combat: 0.4,
  debt: 0.4,
  gift: 0.3,
  insult: 0.3,
  action: 0.2,
};

export function computeSignificance(
  category: RecordCategory,
  hints: ProfileUpdateHints,
): number {
  let sig = BASE_SIGNIFICANCE[category] ?? 0.2;

  if (hints.milestoneTriggered) sig += 0.1;
  if (hints.milestoneTriggered?.tags.includes('boss-kill')) sig += 0.1;
  if (hints.reputationDelta && Math.abs(hints.reputationDelta.delta) >= 10) sig += 0.05;

  return Math.min(1, sig);
}

// --- Event Derivation ---

/**
 * Derive CampaignRecord entries from a game event source.
 * Most turns produce 0-1 records; only significant events are recorded.
 */
export function deriveChronicleEvents(
  source: ChronicleEventSource,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  switch (source.kind) {
    case 'turn':
      return deriveTurnEvents(source, playerId);
    case 'pressure-resolved':
      return derivePressureResolved(source, playerId);
    case 'title-change':
      return deriveTitleChange(source, playerId);
    case 'rumor-spawned':
      return deriveRumorSpawned(source, playerId);
    case 'faction-action':
      return deriveFactionActionEvent(source);
  }
}

function deriveTurnEvents(
  source: Extract<ChronicleEventSource, { kind: 'turn' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  const records: Omit<CampaignRecord, 'id'>[] = [];
  const { events, hints, tick, zoneId } = source;

  // Kill events
  for (const event of events) {
    if (event.type === 'combat.entity.defeated') {
      const targetId = event.payload.entityId as string | undefined;
      const targetName = event.payload.entityName as string | undefined;
      records.push({
        tick,
        category: 'kill',
        actorId: playerId,
        targetId,
        zoneId,
        description: targetName
          ? `Defeated ${targetName}`
          : 'Defeated an enemy',
        significance: computeSignificance('kill', hints),
        witnesses: extractWitnesses(events),
        data: { eventType: event.type },
      });
      break; // One kill record per turn max
    }
  }

  // Discovery events (zone entered with landmark/boss-lair tags)
  for (const event of events) {
    if (event.type === 'world.zone.entered') {
      const zoneName = event.payload.zoneName as string | undefined;
      const zoneTags = event.payload.tags as string[] | undefined;
      if (zoneTags?.includes('landmark') || zoneTags?.includes('boss-lair')) {
        records.push({
          tick,
          category: 'discovery',
          actorId: playerId,
          zoneId: (event.payload.zoneId as string) ?? zoneId,
          description: zoneName
            ? `Discovered ${zoneName}`
            : 'Discovered a new location',
          significance: computeSignificance('discovery', hints),
          witnesses: [],
          data: { tags: zoneTags },
        });
        break;
      }
    }
  }

  // Milestone-triggered events (if not already covered by kill/discovery)
  if (hints.milestoneTriggered && records.length === 0) {
    const tags = hints.milestoneTriggered.tags;
    const category: RecordCategory = tags.includes('combat')
      ? 'combat'
      : tags.includes('boss-kill')
        ? 'kill'
        : tags.includes('exploration')
          ? 'discovery'
          : 'action';

    records.push({
      tick,
      category,
      actorId: playerId,
      zoneId,
      description: hints.milestoneTriggered.label,
      significance: computeSignificance(category, hints),
      witnesses: extractWitnesses(events),
      data: {
        milestone: true,
        tags: hints.milestoneTriggered.tags,
      },
    });
  }

  // Reputation shifts (significant only, delta >= 10)
  if (hints.reputationDelta && Math.abs(hints.reputationDelta.delta) >= 10 && records.length === 0) {
    const isPositive = hints.reputationDelta.delta > 0;
    const category: RecordCategory = isPositive ? 'alliance' : 'betrayal';
    records.push({
      tick,
      category,
      actorId: playerId,
      targetId: hints.reputationDelta.factionId,
      zoneId,
      description: isPositive
        ? `Earned favor with ${hints.reputationDelta.factionId}`
        : `Angered ${hints.reputationDelta.factionId}`,
      significance: computeSignificance(category, hints),
      witnesses: [],
      data: { delta: hints.reputationDelta.delta },
    });
  }

  return records;
}

function derivePressureResolved(
  source: Extract<ChronicleEventSource, { kind: 'pressure-resolved' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  const { fallout, tick } = source;
  const resolution = fallout.resolution;

  const category: RecordCategory =
    resolution.resolutionType === 'resolved-by-player' ? 'combat'
    : resolution.resolutionType === 'failed' ? 'death'
    : 'action';

  return [{
    tick,
    category,
    actorId: resolution.resolvedBy === 'player' ? playerId : resolution.resolvedBy,
    description: fallout.summary,
    significance: resolution.resolutionType === 'resolved-by-player' ? 0.8 : 0.5,
    witnesses: [],
    data: {
      pressureKind: resolution.pressureKind,
      resolutionType: resolution.resolutionType,
      effectCount: fallout.effects.length,
    },
  }];
}

function deriveTitleChange(
  source: Extract<ChronicleEventSource, { kind: 'title-change' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'action',
    actorId: playerId,
    description: source.oldTitle
      ? `Title evolved: "${source.oldTitle}" → "${source.newTitle}"`
      : `Earned title: "${source.newTitle}"`,
    significance: 0.7,
    witnesses: [],
    data: { oldTitle: source.oldTitle, newTitle: source.newTitle },
  }];
}

function deriveRumorSpawned(
  source: Extract<ChronicleEventSource, { kind: 'rumor-spawned' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'action',
    actorId: playerId,
    description: `Rumor: "${source.rumor.claim}"`,
    significance: 0.2,
    witnesses: [],
    data: { rumorId: source.rumor.id, valence: source.rumor.valence },
  }];
}

function deriveFactionActionEvent(
  source: Extract<ChronicleEventSource, { kind: 'faction-action' }>,
): Omit<CampaignRecord, 'id'>[] {
  const { action, tick } = source;

  const category: RecordCategory =
    action.verb === 'retaliate' ? 'combat'
    : action.verb === 'bribe' ? 'alliance'
    : action.verb === 'sanction' ? 'betrayal'
    : 'action';

  const significance =
    action.verb === 'retaliate' ? 0.7
    : action.verb === 'declare-claim' ? 0.6
    : action.verb === 'sanction' ? 0.5
    : 0.3;

  return [{
    tick,
    category,
    actorId: action.factionId,
    description: action.description,
    significance,
    witnesses: [],
    data: { verb: action.verb, factionAction: true },
  }];
}

function extractWitnesses(events: ResolvedEvent[]): string[] {
  const witnesses = new Set<string>();
  for (const event of events) {
    if (event.targetIds) {
      for (const id of event.targetIds) {
        witnesses.add(id);
      }
    }
  }
  return Array.from(witnesses).slice(0, 5);
}

// --- Memory Compaction ---

const DEFAULT_RECENT_WINDOW = 20;
const DEFAULT_MAX_CANONICAL = 15;
const ERA_SIZE = 10;

/**
 * Compact a full journal into a token-efficient representation.
 * Recent events stay canonical. Older events are grouped into era summaries.
 */
export function compactChronicle(
  journal: CampaignJournal,
  currentTick: number,
  recentWindow = DEFAULT_RECENT_WINDOW,
  maxCanonical = DEFAULT_MAX_CANONICAL,
): CompactedChronicle {
  const allRecords = journal.serialize(); // sorted by tick
  if (allRecords.length === 0) {
    return { canonicalEvents: [], eraSummaries: [], totalRecords: 0 };
  }

  const recentThreshold = currentTick - recentWindow;
  const canonical: CampaignRecord[] = [];
  const older: CampaignRecord[] = [];

  for (const record of allRecords) {
    // Always keep high-significance events regardless of age
    if (record.significance >= 0.7) {
      canonical.push(record);
    } else if (record.tick >= recentThreshold && record.significance >= 0.3) {
      canonical.push(record);
    } else {
      older.push(record);
    }
  }

  // Trim canonical to max limit (keep highest significance)
  canonical.sort((a, b) => b.significance - a.significance);
  const trimmed = canonical.slice(0, maxCanonical);
  // Re-sort by tick for display
  trimmed.sort((a, b) => a.tick - b.tick);

  // Group older events into eras
  const eraSummaries = buildEraSummaries(older);

  return {
    canonicalEvents: trimmed,
    eraSummaries,
    totalRecords: allRecords.length,
  };
}

function buildEraSummaries(records: CampaignRecord[]): EraSummary[] {
  if (records.length === 0) return [];

  const eras: EraSummary[] = [];
  let i = 0;

  while (i < records.length) {
    const eraStart = records[i].tick;
    const eraEnd = eraStart + ERA_SIZE;
    const eraRecords: CampaignRecord[] = [];

    while (i < records.length && records[i].tick < eraEnd) {
      eraRecords.push(records[i]);
      i++;
    }

    // Get top 3 most significant events for the summary
    const sorted = [...eraRecords].sort((a, b) => b.significance - a.significance);
    const topEvents = sorted.slice(0, 3).map((r) => r.description);

    eras.push({
      fromTick: eraStart,
      toTick: eraRecords[eraRecords.length - 1].tick,
      label: `Ticks ${eraStart}–${eraRecords[eraRecords.length - 1].tick}`,
      eventCount: eraRecords.length,
      topEvents,
    });
  }

  return eras;
}

// --- Context Builder ---

/**
 * Build a compact chronicle context string for Claude narration prompts.
 * Target: ~100 tokens max. Returns undefined if no notable events.
 */
export function buildChronicleContext(
  journal: CampaignJournal,
  currentTick: number,
): string | undefined {
  const allRecords = journal.serialize();
  if (allRecords.length === 0) return undefined;

  // Get top 5 most significant events
  const sorted = [...allRecords].sort((a, b) => b.significance - a.significance);
  const top = sorted.slice(0, 5);
  // Re-sort by tick
  top.sort((a, b) => a.tick - b.tick);

  const span = currentTick - (allRecords[0]?.tick ?? currentTick);
  const header = `Chronicle: [${allRecords.length} events over ${span} turns]`;
  const events = top.map((r) => r.description).join('. ');

  return `${header} ${events}.`;
}
