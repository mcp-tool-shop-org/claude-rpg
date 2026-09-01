// Build perception-filtered scene context for the narrator

import type { WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import {
  getPerceptionLog,
  presentForObserver,
  type ObserverPresentedEvent,
} from '@ai-rpg-engine/modules';
import type { SceneNarrationInput } from '../prompts/narrate-scene.js';

export type SceneContext = {
  narrationInput: SceneNarrationInput;
  perceivedEvents: ObserverPresentedEvent[];
};

/** Build the narrator's perception-constrained view of the current scene. */
export function buildSceneContext(
  world: WorldState,
  recentEvents: ResolvedEvent[],
  tone: string,
  recentNarration: string[],
  previousLocationId?: string,
  characterPresence?: string,
  activePressures?: string[],
  districtDescriptor?: string,
  partyPresence?: string,
  economyContext?: string,
  craftingContext?: string,
  opportunityContext?: string,
  arcContext?: string,
  endgameContext?: string,
  situationHint?: string,
): SceneContext {
  const zone = world.zones[world.locationId];
  const player = world.entities[world.playerId];
  const isNewZone = previousLocationId !== world.locationId;

  // Get entities in zone, filtered by perception
  const zoneEntities = Object.values(world.entities).filter(
    (e) => e.zoneId === world.locationId && e.id !== world.playerId,
  );

  const perceptions = getPerceptionLog(world, world.playerId);

  const visibleEntities = zoneEntities.map((entity) => {
    const entityPerceptions = perceptions.filter(
      (p) => p.entityId === entity.id,
    );
    const clarity = entityPerceptions.length > 0
      ? Math.max(...entityPerceptions.map((p) => p.clarity))
      : 0.5; // Default: partial visibility

    return {
      name: clarity >= 0.5 ? entity.name : 'a shadowy figure',
      type: entity.type,
      clarity,
      description: undefined as string | undefined,
    };
  });

  // Run events through observer presentation
  const perceivedEvents = recentEvents.map((event) => {
    try {
      return presentForObserver(event, world.playerId, world);
    } catch {
      // If observer presentation fails, return event as-is with observer metadata
      return {
        ...event,
        _observerId: world.playerId,
        _clarity: 1.0,
        _appliedRules: [],
      } as ObserverPresentedEvent;
    }
  });

  // Map events to human-readable strings
  const eventDescriptions = perceivedEvents.map((pe) => describeEvent(pe));

  // Map atmosphere
  const light = zone?.light ?? 5;
  const noise = zone?.noise ?? 3;
  const stability = zone?.stability ?? 8;

  // F-2218267d + coordinator ruling (b) (wave-13
  // RULING-persisted-namespaces.md): the persisted-namespace read
  // (getPersistedMoveRecommendation) was removed — claude-rpg never
  // populates world.modules['move-advisor'] and GameSession state is the
  // declared source of truth this cycle. The hint arrives as a threaded
  // param instead, computed live by game.ts's own buildMoveRecommendation
  // wrapper and pre-gated to 'pressured'/'crisis' at the producer.

  const narrationInput: SceneNarrationInput = {
    zoneName: zone?.name ?? 'unknown',
    zoneTags: zone?.tags ?? [],
    atmosphere: {
      light: light <= 2 ? 'dim' : light <= 5 ? 'normal' : 'bright',
      noise: noise <= 2 ? 'quiet' : noise <= 5 ? 'moderate' : 'noisy',
      stability: stability >= 7 ? 'stable' : stability >= 4 ? 'uneasy' : 'unstable',
    },
    visibleEntities,
    recentEvents: eventDescriptions,
    playerState: {
      hp: player?.resources?.hp ?? 0,
      maxHp: (player?.resources as Record<string, unknown>)?.maxHp as number | undefined
        ?? (player?.custom?.maxHp as number | undefined)
        ?? undefined,
      statuses: (player?.statuses ?? []).map((s) => s.statusId),
    },
    exits: (zone?.neighbors ?? [])
      .map((id) => world.zones[id]?.name ?? id)
      .filter(Boolean),
    tone,
    recentNarration,
    isNewZone,
    characterPresence,
    activePressures,
    districtDescriptor,
    partyPresence,
    economyContext,
    craftingContext,
    opportunityContext,
    arcContext,
    endgameContext,
    situationHint,
  };

  return { narrationInput, perceivedEvents };
}

function describeEvent(event: ResolvedEvent): string {
  const p = event.payload;
  switch (event.type) {
    case 'combat.contact.hit':
      return `Hit ${p.targetId ?? 'a target'}`;
    case 'combat.contact.miss':
      return `Missed ${p.targetId ?? 'a target'}`;
    case 'combat.damage.applied':
      return `${p.damage ?? '?'} damage dealt`;
    case 'combat.entity.defeated':
      return `${p.entityId ?? 'An entity'} defeated`;
    case 'combat.encounter.cleared': {
      // F-88c8848b: new in engine 3.10 (engagement-core.ts:296-312), fired
      // when the last hostile in the player's zone is defeated. Payload-
      // driven with a sensible fallback, matching combat.entity.defeated's
      // house style above.
      //
      // F-3e09c128: engine 3.11 (engagement-core.ts:192-197 victory branch
      // vs :225-272 retreat branches) added `outcome: 'victory' | 'retreat'`
      // to this same payload. Absent outcome means victory (3.10-shaped
      // events/fixtures stay valid — design lock 1, wave-2 ADDENDUM-COMMON).
      // Retreat is never rendered as a defeat: the last-hostile-flee branch
      // (engagement-core.ts:258-272) populates finalOpponent.name with the
      // FLEEING entity's own name, so reusing the victory wording here would
      // read as factually backwards ("<Name> defeated" for an entity that
      // fled, not died).
      const participants = p.participants as
        | { finalOpponent?: { name?: string } }
        | undefined;
      const name = participants?.finalOpponent?.name;
      const outcome = (p as { outcome?: string }).outcome ?? 'victory';
      if (outcome === 'retreat') {
        return name ? `Encounter ended: ${name} withdrew` : 'Encounter ended without a kill';
      }
      return name ? `Encounter cleared: ${name} defeated` : 'Encounter cleared';
    }
    case 'world.zone.entered': {
      // F-45574e0a: engine 3.11 (traversal-core.ts:242-252 zoneMoodFields,
      // attached at :140,217,300) carries an optional `moodHint` district-
      // mood aside on this payload — the engine's own CLI renderer surfaces
      // it (packages/terminal-ui/src/renderer.ts:874-875). Append it in the
      // same truthy-gated style the engine itself uses; byte-identical
      // output when the zone is unmapped (moodHint absent).
      const moodHint = (p as { moodHint?: string }).moodHint;
      const zoneLabel = p.zoneName ?? p.zoneId ?? 'a new area';
      return moodHint ? `Entered ${zoneLabel} — ${moodHint}` : `Entered ${zoneLabel}`;
    }
    case 'resource.changed':
      return `${p.resourceId}: ${p.oldValue} → ${p.newValue}`;
    case 'dialogue.choice.selected':
      return `Said: "${p.text ?? '...'}"`;
    case 'inventory.item.received':
      return `Received ${p.itemId ?? 'an item'}`;
    default:
      return event.type.split('.').pop() ?? event.type;
  }
}
