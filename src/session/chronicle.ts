// Chronicle integration: derive CampaignRecord entries from game events
// v0.8: campaign chronicle — structured event derivation, salience scoring, memory compaction
// v0.9: faction-action chronicle events

import type { CampaignJournal, CampaignRecord, RecordCategory } from '@ai-rpg-engine/campaign-memory';
import type { ResolvedEvent } from '@ai-rpg-engine/core';
import type { PressureFallout, PlayerRumor, FactionAction, NpcAction, NpcObligation, OpportunityState, OpportunityFallout } from '@ai-rpg-engine/modules';
import type { ProfileUpdateHints } from '../turn-loop.js';

// --- Event Source Types ---

export type ChronicleEventSource =
  | { kind: 'turn'; events: ResolvedEvent[]; hints: ProfileUpdateHints; tick: number; zoneId: string }
  | { kind: 'pressure-resolved'; fallout: PressureFallout; tick: number }
  | { kind: 'title-change'; oldTitle: string | undefined; newTitle: string; tick: number }
  | { kind: 'rumor-spawned'; rumor: PlayerRumor; tick: number }
  | { kind: 'faction-action'; action: FactionAction; tick: number }
  | { kind: 'npc-action'; action: NpcAction; npcName: string; tick: number }
  | { kind: 'obligation-created'; obligation: NpcObligation; npcName: string; tick: number }
  | { kind: 'companion-joined'; npcId: string; npcName: string; role: string; tick: number }
  | { kind: 'companion-departed'; npcId: string; npcName: string; reason: string; tick: number }
  | { kind: 'companion-betrayed'; npcId: string; npcName: string; tick: number }
  | { kind: 'companion-saved-player'; npcId: string; npcName: string; tick: number }
  | { kind: 'companion-died'; npcId: string; npcName: string; tick: number }
  | { kind: 'item-acquired'; itemId: string; itemName: string; source: string; tick: number }
  | { kind: 'item-lost'; itemId: string; itemName: string; reason: string; tick: number }
  | { kind: 'item-recognized'; itemId: string; itemName: string; recognizedBy: string; tick: number }
  | { kind: 'item-transformed'; itemId: string; itemName: string; transformation: string; tick: number }
  | { kind: 'supply-crisis'; districtId: string; category: string; level: number; tick: number }
  | { kind: 'trade-completed'; districtId: string; category: string; delta: number; cause: string; tick: number }
  | { kind: 'black-market-opened'; districtId: string; tick: number }
  // Crafting (v1.8)
  | { kind: 'item-crafted'; itemId: string; itemName: string; recipeId: string; districtId: string; tick: number }
  | { kind: 'item-salvaged'; itemId: string; itemName: string; districtId: string; tick: number }
  | { kind: 'item-modified'; itemId: string; itemName: string; modKind: string; districtId: string; tick: number }
  | { kind: 'item-repaired'; itemId: string; itemName: string; districtId: string; tick: number }
  // Opportunities (v1.9)
  | { kind: 'opportunity-accepted'; opportunity: OpportunityState; tick: number }
  | { kind: 'opportunity-completed'; opportunity: OpportunityState; tick: number }
  | { kind: 'opportunity-failed'; opportunity: OpportunityState; tick: number }
  | { kind: 'opportunity-abandoned'; opportunity: OpportunityState; tick: number }
  | { kind: 'opportunity-betrayed'; opportunity: OpportunityState; tick: number }
  | { kind: 'opportunity-expired'; opportunity: OpportunityState; tick: number };

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
  'companion-joined': 0.6,
  'companion-departed': 0.7,
  'companion-betrayed': 0.9,
  'companion-saved-player': 0.8,
  'companion-died': 1.0,
  'item-acquired': 0.4,
  'item-lost': 0.5,
  'item-recognized': 0.3,
  'item-transformed': 0.7,
  'opportunity-accepted': 0.4,
  'opportunity-completed': 0.7,
  'opportunity-failed': 0.6,
  'opportunity-abandoned': 0.5,
  'endgame-detected': 0.9,
  'campaign-concluded': 1.0,
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
    case 'npc-action':
      return deriveNpcActionEvent(source);
    case 'obligation-created':
      return deriveObligationEvent(source);
    case 'companion-joined':
      return deriveCompanionJoined(source);
    case 'companion-departed':
      return deriveCompanionDeparted(source);
    case 'companion-betrayed':
      return deriveCompanionBetrayed(source);
    case 'companion-saved-player':
      return deriveCompanionSavedPlayer(source);
    case 'companion-died':
      return deriveCompanionDied(source);
    case 'item-acquired':
      return deriveItemAcquired(source, playerId);
    case 'item-lost':
      return deriveItemLost(source, playerId);
    case 'item-recognized':
      return deriveItemRecognized(source, playerId);
    case 'item-transformed':
      return deriveItemTransformed(source, playerId);
    case 'supply-crisis':
      return deriveSupplyCrisis(source);
    case 'trade-completed':
      return deriveTradeCompleted(source);
    case 'black-market-opened':
      return deriveBlackMarketOpened(source);
    case 'item-crafted':
      return deriveItemCrafted(source, playerId);
    case 'item-salvaged':
      return deriveItemSalvaged(source, playerId);
    case 'item-modified':
      return deriveItemModified(source, playerId);
    case 'item-repaired':
      return deriveItemRepaired(source, playerId);
    case 'opportunity-accepted':
      return deriveOpportunityAccepted(source, playerId);
    case 'opportunity-completed':
      return deriveOpportunityCompleted(source, playerId);
    case 'opportunity-failed':
      return deriveOpportunityFailed(source, playerId);
    case 'opportunity-abandoned':
      return deriveOpportunityAbandoned(source, playerId);
    case 'opportunity-betrayed':
      return deriveOpportunityBetrayed(source, playerId);
    case 'opportunity-expired':
      return deriveOpportunityExpired(source);
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

function deriveNpcActionEvent(
  source: Extract<ChronicleEventSource, { kind: 'npc-action' }>,
): Omit<CampaignRecord, 'id'>[] {
  const { action, npcName, tick } = source;

  const category: RecordCategory =
    action.verb === 'accuse' ? 'betrayal'
    : action.verb === 'betray' ? 'betrayal'
    : action.verb === 'recruit' ? 'alliance'
    : action.verb === 'bargain' ? 'alliance'
    : action.verb === 'flee' ? 'action'
    : 'action';

  const significance =
    action.verb === 'betray' ? 0.8
    : action.verb === 'accuse' ? 0.6
    : action.verb === 'recruit' ? 0.5
    : action.verb === 'warn' ? 0.4
    : action.verb === 'flee' ? 0.4
    : 0.3;

  return [{
    tick,
    category,
    actorId: action.npcId,
    description: `${npcName}: ${action.description}`,
    significance,
    witnesses: [],
    data: { verb: action.verb, npcAction: true },
  }];
}

function deriveObligationEvent(
  source: Extract<ChronicleEventSource, { kind: 'obligation-created' }>,
): Omit<CampaignRecord, 'id'>[] {
  const { obligation, npcName, tick } = source;

  const category: RecordCategory =
    obligation.kind === 'betrayed' ? 'betrayal'
    : obligation.kind === 'saved' ? 'rescue'
    : obligation.kind === 'bribed' ? 'alliance'
    : 'debt';

  const dirLabel =
    obligation.direction === 'npc-owes-player' ? 'owes you'
    : obligation.direction === 'player-owes-npc' ? 'you owe'
    : 'between NPCs';

  return [{
    tick,
    category,
    actorId: obligation.npcId,
    description: `${npcName}: ${obligation.kind} (${dirLabel}, mag ${obligation.magnitude})`,
    significance: obligation.magnitude >= 5 ? 0.6 : 0.3,
    witnesses: [],
    data: { kind: obligation.kind, direction: obligation.direction, magnitude: obligation.magnitude },
  }];
}

function deriveCompanionJoined(
  source: Extract<ChronicleEventSource, { kind: 'companion-joined' }>,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'companion-joined',
    actorId: source.npcId,
    description: `${source.npcName} joined the party as ${source.role}`,
    significance: 0.6,
    witnesses: [],
    data: { role: source.role },
  }];
}

function deriveCompanionDeparted(
  source: Extract<ChronicleEventSource, { kind: 'companion-departed' }>,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'companion-departed',
    actorId: source.npcId,
    description: `${source.npcName} left the party: ${source.reason}`,
    significance: 0.7,
    witnesses: [],
    data: { reason: source.reason },
  }];
}

function deriveCompanionBetrayed(
  source: Extract<ChronicleEventSource, { kind: 'companion-betrayed' }>,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'companion-betrayed',
    actorId: source.npcId,
    description: `${source.npcName} turned against the party`,
    significance: 0.9,
    witnesses: [],
    data: {},
  }];
}

function deriveCompanionSavedPlayer(
  source: Extract<ChronicleEventSource, { kind: 'companion-saved-player' }>,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'companion-saved-player',
    actorId: source.npcId,
    description: `${source.npcName} intercepted a blow meant for you`,
    significance: 0.8,
    witnesses: [],
    data: {},
  }];
}

function deriveCompanionDied(
  source: Extract<ChronicleEventSource, { kind: 'companion-died' }>,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'companion-died',
    actorId: source.npcId,
    description: `${source.npcName} fell in battle`,
    significance: 1.0,
    witnesses: [],
    data: {},
  }];
}

function deriveItemAcquired(
  source: Extract<ChronicleEventSource, { kind: 'item-acquired' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'item-acquired',
    actorId: playerId,
    description: `Acquired ${source.itemName}: ${source.source}`,
    significance: 0.4,
    witnesses: [],
    data: { itemId: source.itemId },
  }];
}

function deriveItemLost(
  source: Extract<ChronicleEventSource, { kind: 'item-lost' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'item-lost',
    actorId: playerId,
    description: `Lost ${source.itemName}: ${source.reason}`,
    significance: 0.5,
    witnesses: [],
    data: { itemId: source.itemId },
  }];
}

function deriveItemRecognized(
  source: Extract<ChronicleEventSource, { kind: 'item-recognized' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'item-recognized',
    actorId: playerId,
    description: `${source.itemName} recognized by ${source.recognizedBy}`,
    significance: 0.3,
    witnesses: [],
    data: { itemId: source.itemId, recognizedBy: source.recognizedBy },
  }];
}

function deriveItemTransformed(
  source: Extract<ChronicleEventSource, { kind: 'item-transformed' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'item-transformed',
    actorId: playerId,
    description: `${source.itemName}: ${source.transformation}`,
    significance: 0.7,
    witnesses: [],
    data: { itemId: source.itemId },
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

// --- Economy Chronicle Events (v1.7) ---

function deriveSupplyCrisis(
  source: Extract<ChronicleEventSource, { kind: 'supply-crisis' }>,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'discovery' as RecordCategory,
    actorId: 'world',
    zoneId: source.districtId,
    description: `${source.category} supply crisis in ${source.districtId} (level ${source.level})`,
    significance: 0.6,
    witnesses: [],
    data: { category: source.category, level: source.level },
  }];
}

function deriveTradeCompleted(
  source: Extract<ChronicleEventSource, { kind: 'trade-completed' }>,
): Omit<CampaignRecord, 'id'>[] {
  const verb = source.delta > 0 ? 'supplied' : 'drained';
  return [{
    tick: source.tick,
    category: 'action' as RecordCategory,
    actorId: 'player',
    zoneId: source.districtId,
    description: `${source.cause} ${verb} ${source.category} in ${source.districtId}`,
    significance: 0.3,
    witnesses: [],
    data: { category: source.category, delta: source.delta },
  }];
}

function deriveBlackMarketOpened(
  source: Extract<ChronicleEventSource, { kind: 'black-market-opened' }>,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'discovery' as RecordCategory,
    actorId: 'world',
    zoneId: source.districtId,
    description: `Black market opened in ${source.districtId}`,
    significance: 0.5,
    witnesses: [],
    data: {},
  }];
}

// --- Crafting Chronicle Events (v1.8) ---

function deriveItemCrafted(
  source: Extract<ChronicleEventSource, { kind: 'item-crafted' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'item-transformed' as RecordCategory,
    actorId: playerId,
    zoneId: source.districtId,
    description: `Crafted ${source.itemName}`,
    significance: 0.5,
    witnesses: [],
    data: { itemId: source.itemId, recipeId: source.recipeId },
  }];
}

function deriveItemSalvaged(
  source: Extract<ChronicleEventSource, { kind: 'item-salvaged' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'action' as RecordCategory,
    actorId: playerId,
    zoneId: source.districtId,
    description: `Salvaged ${source.itemName} for materials`,
    significance: 0.3,
    witnesses: [],
    data: { itemId: source.itemId },
  }];
}

function deriveItemModified(
  source: Extract<ChronicleEventSource, { kind: 'item-modified' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'item-transformed' as RecordCategory,
    actorId: playerId,
    zoneId: source.districtId,
    description: `Modified ${source.itemName} (${source.modKind})`,
    significance: 0.5,
    witnesses: [],
    data: { itemId: source.itemId, modKind: source.modKind },
  }];
}

function deriveItemRepaired(
  source: Extract<ChronicleEventSource, { kind: 'item-repaired' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  return [{
    tick: source.tick,
    category: 'action' as RecordCategory,
    actorId: playerId,
    zoneId: source.districtId,
    description: `Repaired ${source.itemName}`,
    significance: 0.2,
    witnesses: [],
    data: { itemId: source.itemId },
  }];
}

// --- Opportunity Chronicle Events (v1.9) ---

function deriveOpportunityAccepted(
  source: Extract<ChronicleEventSource, { kind: 'opportunity-accepted' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  const opp = source.opportunity;
  return [{
    tick: source.tick,
    category: 'opportunity-accepted' as RecordCategory,
    actorId: playerId,
    description: `Accepted ${opp.kind}: "${opp.title}"`,
    significance: 0.4,
    witnesses: [],
    data: { opportunityId: opp.id, kind: opp.kind },
  }];
}

function deriveOpportunityCompleted(
  source: Extract<ChronicleEventSource, { kind: 'opportunity-completed' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  const opp = source.opportunity;
  return [{
    tick: source.tick,
    category: 'opportunity-completed' as RecordCategory,
    actorId: playerId,
    description: `Completed ${opp.kind}: "${opp.title}"`,
    significance: 0.7,
    witnesses: [],
    data: { opportunityId: opp.id, kind: opp.kind },
  }];
}

function deriveOpportunityFailed(
  source: Extract<ChronicleEventSource, { kind: 'opportunity-failed' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  const opp = source.opportunity;
  return [{
    tick: source.tick,
    category: 'opportunity-failed' as RecordCategory,
    actorId: playerId,
    description: `Failed ${opp.kind}: "${opp.title}"`,
    significance: 0.6,
    witnesses: [],
    data: { opportunityId: opp.id, kind: opp.kind },
  }];
}

function deriveOpportunityAbandoned(
  source: Extract<ChronicleEventSource, { kind: 'opportunity-abandoned' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  const opp = source.opportunity;
  return [{
    tick: source.tick,
    category: 'opportunity-abandoned' as RecordCategory,
    actorId: playerId,
    description: `Abandoned ${opp.kind}: "${opp.title}"`,
    significance: 0.5,
    witnesses: [],
    data: { opportunityId: opp.id, kind: opp.kind },
  }];
}

function deriveOpportunityBetrayed(
  source: Extract<ChronicleEventSource, { kind: 'opportunity-betrayed' }>,
  playerId: string,
): Omit<CampaignRecord, 'id'>[] {
  const opp = source.opportunity;
  return [{
    tick: source.tick,
    // Use 'betrayal' category to distinguish from simple abandonment — higher significance
    category: 'betrayal' as RecordCategory,
    actorId: playerId,
    description: `Betrayed ${opp.kind}: "${opp.title}"`,
    significance: 0.7,
    witnesses: [],
    data: { opportunityId: opp.id, kind: opp.kind, betrayal: true },
  }];
}

function deriveOpportunityExpired(
  source: Extract<ChronicleEventSource, { kind: 'opportunity-expired' }>,
): Omit<CampaignRecord, 'id'>[] {
  const opp = source.opportunity;
  return [{
    tick: source.tick,
    category: 'opportunity-failed' as RecordCategory,
    actorId: 'world',
    description: `Expired ${opp.kind}: "${opp.title}"`,
    significance: 0.3,
    witnesses: [],
    data: { opportunityId: opp.id, kind: opp.kind, expired: true },
  }];
}
