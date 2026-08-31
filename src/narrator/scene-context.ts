// Build perception-filtered scene context for the narrator

import type { WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import {
  getPerceptionLog,
  presentForObserver,
  getPersistedMoveRecommendation,
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

  // F-2218267d: non-attaching read of the engine's own per-round strategic
  // hint -- zero new computation, explicitly re-read here rather than
  // recomputed (mirrors traversal-core.ts's own 'inspect' verb call site, per
  // its comment: exactly one buildStrategicMap call per round). Gated to
  // 'pressured'/'crisis' only, matching this domain's other hint fields'
  // urgency-gated absence contract -- 'safe' and 'opportunity' rounds render
  // nothing here, leaving the director's on-demand /map-style screen as the
  // only place to see a non-urgent recommendation.
  //
  // NOTE (verified, not assumed): getPersistedMoveRecommendation(world)
  // reads world.modules['move-advisor'], which claude-rpg never populates
  // today -- game-state.ts calls recommendMoves() directly for the director
  // /map-style screen but never setPersistedMoveRecommendation(), and
  // nothing in this app calls the engine's runWorldTick driver (the function
  // whose per-round step is documented as the production writer of this
  // namespace). This wiring is correct, additive, and byte-identical-when-
  // absent infrastructure; it activates for free the moment a future
  // game-core fix populates the namespace (or this app adopts runWorldTick).
  const moveRecommendation = getPersistedMoveRecommendation(world);
  const situationHint = moveRecommendation?.situationHint
    && (moveRecommendation.situationTag === 'pressured' || moveRecommendation.situationTag === 'crisis')
    ? moveRecommendation.situationHint
    : undefined;

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
