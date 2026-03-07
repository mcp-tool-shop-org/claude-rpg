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
): SceneContext {
  const zone = world.zones[world.locationId];
  const player = world.entities[world.playerId];
  const isNewZone = previousLocationId !== world.locationId;

  // Get entities in zone, filtered by perception
  const zoneEntities = Object.values(world.entities).filter(
    (e) => e.zoneId === world.locationId && e.id !== world.playerId,
  );

  const visibleEntities = zoneEntities.map((entity) => {
    const perceptions = getPerceptionLog(world, world.playerId);
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
      maxHp: undefined,
      statuses: (player?.statuses ?? []).map((s) => s.statusId),
    },
    exits: (zone?.neighbors ?? [])
      .map((id) => world.zones[id]?.name ?? id)
      .filter(Boolean),
    tone,
    recentNarration,
    isNewZone,
    characterPresence,
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
    case 'world.zone.entered':
      return `Entered ${p.zoneName ?? p.zoneId ?? 'a new area'}`;
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
