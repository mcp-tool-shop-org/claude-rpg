// Lawful session and chronicle fixtures for Sprint B tests.
// These represent story state, not test trivia.

import { CampaignJournal } from '@ai-rpg-engine/campaign-memory';
import type { ChronicleEventSource } from '../../src/session/chronicle.js';
import { deriveChronicleEvents } from '../../src/session/chronicle.js';

const PLAYER = 'player';

// ─── Chronicle Event Sources ──────────────────────────────────

/** A turn where the player looked around — minimal, no combat. */
export function lookTurnSource(tick: number): ChronicleEventSource {
  return {
    kind: 'turn',
    events: [{ type: 'world.zone.inspected', payload: { zoneId: 'chapel-entrance' } }],
    hints: { xpGained: 0 },
    tick,
    zoneId: 'chapel-entrance',
  };
}

/** A turn where the player moved to a new zone. */
export function moveTurnSource(tick: number, toZone: string): ChronicleEventSource {
  return {
    kind: 'turn',
    events: [{ type: 'world.zone.entered', payload: { zoneId: toZone, zoneName: toZone, previousZoneId: 'chapel-entrance', tags: [] } }],
    hints: { xpGained: 5, milestoneTriggered: { label: `Entered ${toZone}`, description: `Discovered ${toZone}`, tags: ['exploration'] } },
    tick,
    zoneId: toZone,
  };
}

/** A turn with combat — entity defeated. */
export function combatTurnSource(tick: number, defeatedId: string, defeatedName: string): ChronicleEventSource {
  return {
    kind: 'turn',
    events: [
      { type: 'combat.contact.hit', payload: { attackerId: PLAYER, targetId: defeatedId, roll: 85, hitChance: 60 } },
      { type: 'combat.damage.applied', payload: { entityId: defeatedId, damage: 15 } },
      { type: 'combat.entity.defeated', payload: { entityId: defeatedId } },
    ],
    hints: {
      xpGained: 15,
      milestoneTriggered: { label: `Defeated ${defeatedName}`, description: `Slew ${defeatedName} in combat.`, tags: ['combat', 'boss-kill'] },
      reputationDelta: { factionId: 'guardians', delta: -15 },
    },
    tick,
    zoneId: 'crypt-chamber',
  };
}

/** A pressure resolved event. */
export function pressureResolvedSource(tick: number): ChronicleEventSource {
  return {
    kind: 'pressure-resolved',
    fallout: {
      resolution: {
        pressureId: 'p-bounty-1',
        pressureKind: 'bounty-issued',
        resolutionType: 'resolved-by-player',
        resolvedBy: 'player',
      },
      summary: 'The bounty on your head has been lifted.',
      effects: [],
    } as any,
    tick,
  };
}

/** Title change event. */
export function titleChangeSource(tick: number): ChronicleEventSource {
  return { kind: 'title-change', oldTitle: 'Wanderer', newTitle: 'the Bloodied', tick };
}

/** Companion joined event. */
export function companionJoinedSource(tick: number): ChronicleEventSource {
  return { kind: 'companion-joined', npcId: 'pilgrim', npcName: 'Suspicious Pilgrim', role: 'scout', tick };
}

/** Item acquired event. */
export function itemAcquiredSource(tick: number): ChronicleEventSource {
  return { kind: 'item-acquired', itemId: 'blade-1', itemName: 'Broken Blade', source: 'found', tick };
}

/** Opportunity completed event. */
export function opportunityCompletedSource(tick: number): ChronicleEventSource {
  return {
    kind: 'opportunity-completed',
    opportunity: {
      id: 'opp-1',
      title: 'Clear the Crypt',
      kind: 'bounty',
      description: 'Clear the crypt of undead.',
      status: 'completed',
      offeredByFactionId: 'guardians',
      createdAtTick: tick - 5,
    } as any,
    tick,
  };
}

// ─── Journal Builders ─────────────────────────────────────────

/** Build a journal from chronicle sources. */
export function buildJournal(sources: ChronicleEventSource[]): CampaignJournal {
  const journal = new CampaignJournal();
  for (const source of sources) {
    const records = deriveChronicleEvents(source, PLAYER);
    for (const record of records) {
      journal.record(record);
    }
  }
  return journal;
}

/** Empty journal. */
export function emptyJournal(): CampaignJournal {
  return new CampaignJournal();
}

/** Journal with a multi-turn session: look → move → combat → loot → title. */
export function multiTurnJournal(): CampaignJournal {
  return buildJournal([
    lookTurnSource(1),
    moveTurnSource(2, 'chapel-nave'),
    combatTurnSource(3, 'ash-ghoul', 'Ash Ghoul'),
    itemAcquiredSource(4),
    titleChangeSource(5),
    companionJoinedSource(6),
    pressureResolvedSource(7),
    opportunityCompletedSource(8),
  ]);
}

/** Long journal with 30 events across many ticks. */
export function longSessionJournal(): CampaignJournal {
  const sources: ChronicleEventSource[] = [];
  for (let tick = 1; tick <= 30; tick++) {
    if (tick % 5 === 0) {
      sources.push(combatTurnSource(tick, `enemy-${tick}`, `Enemy ${tick}`));
    } else if (tick % 3 === 0) {
      sources.push(moveTurnSource(tick, `zone-${tick}`));
    } else {
      sources.push(lookTurnSource(tick));
    }
  }
  return buildJournal(sources);
}
