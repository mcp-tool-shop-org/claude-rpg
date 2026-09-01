// Build perception-filtered scene context for the narrator

import type { WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import {
  getPerceptionLog,
  presentForObserver,
  formatPressureForNarrator,
  type ObserverPresentedEvent,
  type WorldPressure,
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

    // ── WO-A2-6 (slice A2-core §6): describeEvent coverage of every event
    // runWorldTick (packages/modules/src/world-tick.ts) and its called
    // modules emit into the SAME eventLog delta this round's narration
    // reads, once the driver replaces the hand-tickers. Found by grepping
    // `emit(` in world-tick.ts, encounter-spawn.ts, economy-core.ts,
    // district-core.ts, npc-agency.ts, faction-agency.ts, opportunity-
    // core.ts, player-leverage.ts per the design doc — economy-core.ts,
    // district-core.ts, npc-agency.ts, faction-agency.ts and player-
    // leverage.ts emit no ResolvedEvents directly; every event below is
    // emitted centrally from world-tick.ts itself (or, for
    // encounter.spawned, from encounter-spawn.ts, which world-tick calls at
    // step 0). Two categories the design doc names ("economy shift events",
    // "district mood transition events") have NO distinct event type to
    // switch on: economy-shift fallout effects ride inside pressure.expired
    // / pressure.resolved / opportunity.expired's own `effects` array
    // (already rendered by those cases below), and a district mood
    // transition (step 0c) never emits its own event — it only queues onto
    // reactionTriggers and surfaces as a companion.reaction (also below).
    // Reported here rather than silently gapped.

    case 'pressure.spawned': {
      // world-tick.ts:1759 (a spawn-pressure NpcEffect chain), :2555/:2573
      // (fallout-chain spawn) and :2641 (the heat-gated spawn valve, step
      // 5). Reuses formatPressureForNarrator: the payload
      // (pressurePayload()) always carries exactly the three fields the
      // formatter reads (kind, description, urgency), so the payload-only
      // cast below is runtime-safe even though its shape is narrower than
      // the full WorldPressure type formatPressureForNarrator declares.
      // "surfaced" (not "spawned") names the subject — F-262c3f65's
      // three-events-render-as-'spawned' collision (pressure.spawned /
      // opportunity.spawned / encounter.spawned all fell through to the
      // same bare default-arm text "spawned" before these cases existed).
      return `Pressure surfaced: ${formatPressureForNarrator(p as unknown as WorldPressure)}`;
    }
    case 'pressure.revealed':
      // world-tick.ts:2527 — a HIDDEN pressure crosses to visible this
      // round (the moment the player learns of it); distinct wording from
      // pressure.spawned above so the two are never confused.
      return `Pressure revealed: ${formatPressureForNarrator(p as unknown as WorldPressure)}`;
    case 'pressure.escalated': {
      // world-tick.ts:2615 — urgency crossed a narrator band (the same
      // 0.4/0.7 bands formatPressureForNarrator itself uses).
      const band = (p as { band?: string }).band;
      return `Pressure escalating: ${formatPressureForNarrator(p as unknown as WorldPressure)}${band ? ` [${band}]` : ''}`;
    }
    case 'pressure.expired':
      // world-tick.ts:2555 — the natural-expiry branch (always stamps
      // 'expired-ignored'; the player-resolved path is pressure.resolved
      // below, per design doc §4).
      return `Pressure expired: ${formatPressureForNarrator(p as unknown as WorldPressure)}`;
    case 'pressure.resolved':
      // world-tick.ts:2070 — a faction action closed a pressure directly
      // (runFactionAgencyTick's own resolution branch).
      return `Pressure resolved: ${formatPressureForNarrator(p as unknown as WorldPressure)}`;

    case 'opportunity.spawned': {
      // world-tick.ts:1849 (npc-agency's direct-offer NpcEffect) and :2794
      // (evaluateOpportunities' own spawn valve) — same payload shape:
      // {opportunityId, kind, title, reason, urgency}, no `turnsRemaining`.
      // formatOpportunityForNarrator's deadline suffix guards on
      // `turnsRemaining !== null`, so an ABSENT (undefined) field would
      // read as "not null" and render "undefined turns left" — the
      // formatter was built for the full OpportunityState, not this
      // payload. Rendered from payload fields only instead (the addendum's
      // own fallback for exactly this mismatch), noted here rather than
      // forcing a reuse that would produce a wrong string.
      const title = typeof p.title === 'string' ? p.title : 'An opportunity';
      return `Opportunity offered: ${title}`;
    }
    case 'opportunity.expired': {
      // world-tick.ts:2735 — natural-expiry fallout (Phase-9 remediation);
      // same payload-shape mismatch as opportunity.spawned above (no
      // `urgency`, no `turnsRemaining`), same fallback.
      const title = typeof p.title === 'string' ? p.title : 'An opportunity';
      return `Opportunity expired: ${title}`;
    }

    case 'encounter.spawned': {
      // encounter-spawn.ts:667 — the zone-entry ambush check (world-tick's
      // step 0), the ONE renderable event on the encounter-spawn path.
      const name = typeof p.encounterName === 'string' ? p.encounterName : 'An encounter';
      const zoneName = typeof p.zoneName === 'string' ? p.zoneName : 'the area';
      return `Ambush: ${name} in ${zoneName}`;
    }

    case 'npc.action.resolved': {
      // world-tick.ts:1880 — every resolved NPC-agency action
      // (npc-agency.ts's runNpcAgencyTick), one per acting named NPC per
      // round. narratorHint is authored per-verb specifically for this
      // purpose (npc-agency.ts:825-1128); description is the fallback for
      // any verb branch that leaves narratorHint blank.
      const hint = typeof p.narratorHint === 'string' && p.narratorHint.length > 0 ? p.narratorHint : undefined;
      const description = typeof p.description === 'string' ? p.description : undefined;
      return hint ?? description ?? 'An NPC acted';
    }
    case 'npc.betrayal.witnessed': {
      // world-tick.ts:1867 — the 'betray' verb specifically, emitted
      // immediately BEFORE that same round's npc.action.resolved.
      const npcName = typeof p.npcName === 'string' ? p.npcName : 'Someone';
      const description = typeof p.description === 'string' ? p.description : 'betrayed you';
      return `Betrayal: ${npcName} — ${description}`;
    }
    case 'faction.action.resolved': {
      // world-tick.ts:2094 — runFactionAgencyTick's per-round resolved
      // faction action. Same narratorHint-first, description-fallback
      // house style as npc.action.resolved above (faction-agency.ts:469-662
      // authors narratorHint per verb).
      const hint = typeof p.narratorHint === 'string' && p.narratorHint.length > 0 ? p.narratorHint : undefined;
      const description = typeof p.description === 'string' ? p.description : undefined;
      return hint ?? description ?? 'A faction acted';
    }

    case 'companion.reaction': {
      // world-tick.ts:955 (the round-callback's own reactions) and the
      // tick's internal applyCompanionReactions (world-tick.ts:930-992,
      // dispatched from combat, pressure-resolution, AND district-mood-
      // transition triggers at step 0c/3c — the design doc's "district
      // mood transition events" category has no event of its own; it
      // surfaces here). narratorHint is authored per-trigger for exactly
      // this purpose (companion-reactions.ts:311).
      const hint = typeof p.narratorHint === 'string' && p.narratorHint.length > 0 ? p.narratorHint : undefined;
      return hint ?? 'A companion reacts';
    }
    case 'companion.departed': {
      // world-tick.ts:971 (the round-callback's own departure) and :1808
      // (npc-agency's companion-departure NpcEffect) — a companion leaves
      // the party.
      const npcName = typeof p.npcName === 'string' ? p.npcName : 'A companion';
      const reason = typeof p.reason === 'string' ? p.reason : 'left the party';
      return `${npcName} has left the party: ${reason}`;
    }

    case 'world.zone.state.changed': {
      // zone-state.ts:278 ("the moat bridge") — NOT one of design doc §6's
      // named grep targets (world-tick.ts, encounter-spawn.ts, economy-
      // core.ts, district-core.ts, npc-agency.ts, faction-agency.ts,
      // opportunity-core.ts, player-leverage.ts), but its step runs INSIDE
      // runWorldTick (step 0b) and its event enters the SAME eventLog
      // delta this round's narration reads — exactly the gap §6 exists to
      // close. Added as coverage beyond the literal file list; flagged
      // here for coordinator review rather than silently included.
      const zoneName = typeof p.zoneName === 'string' ? p.zoneName : 'The area';
      const to = typeof p.to === 'string' ? p.to : 'a new state';
      return `${zoneName} has changed: now ${to}`;
    }

    default:
      return event.type.split('.').pop() ?? event.type;
  }
}
