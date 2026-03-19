// game-state.ts: Pure deterministic state logic extracted from GameSession.
// No client calls. No console IO. No file IO. No presentation strings.
// These functions consume session state and return canonical mutations.

import type { Engine, WorldState } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { ItemCatalog, ItemDefinition } from '@ai-rpg-engine/equipment';
import { EQUIPMENT_SLOTS, recordItemEvent } from '@ai-rpg-engine/equipment';
import {
  evaluateItemRecognition,
  shouldRecognize,
  createDistrictEconomy,
  tickDistrictEconomy,
  applyEconomyShift,
  deriveEconomyDescriptor,
  formatEconomyForNarrator,
  formatAllDistrictEconomiesForDirector,
  type DistrictEconomy,
  type SupplyCategory,
  getMaterialInventory,
  applyMaterialDeltas,
  hasMaterials,
  salvageItem,
  getAvailableRecipes,
  getRecipeById,
  canCraft,
  resolveCraft,
  resolveRepair,
  resolveModify,
  type CraftEffect,
  type CraftingContext,
  formatMaterialsCompact,
  evaluateOpportunities,
  tickOpportunities,
  getAvailableOpportunities,
  getAcceptedOpportunities,
  formatOpportunityListForDirector,
  type OpportunityState,
  type OpportunityInputs,
  computeOpportunityFallout,
  type OpportunityFallout,
  type OpportunityFalloutEffect,
  type OpportunityResolutionType,
  buildArcSnapshot,
  formatArcForDirector,
  formatArcForNarrator,
  type ArcSnapshot,
  type ArcInputs,
  evaluateEndgame,
  formatEndgameForDirector,
  formatEndgameForNarrator,
  type EndgameTrigger,
  type EndgameInputs,
} from '@ai-rpg-engine/modules';
import { CampaignJournal, buildFinaleOutline, type FinaleOutline, type FinaleNpcInput, type FinaleFactionInput, type FinaleDistrictInput } from '@ai-rpg-engine/campaign-memory';
import {
  grantXp,
  addInjury,
  incrementTurns,
  adjustReputation,
  recordMilestone,
  getReputation,
} from '@ai-rpg-engine/character-profile';
import {
  evolveTitle,
  type TitleEvolution,
  spawnPlayerRumor,
  spawnReputationRumor,
  propagateRumor,
  getRumorsKnownToFaction,
  type PlayerRumor,
  evaluatePressures,
  tickPressures,
  getVisiblePressures,
  makePressure,
  type WorldPressure,
  type PressureInputs,
  computeFallout,
  type ResolutionType,
  type PressureFallout,
  type FalloutEffect,
  modifyDistrictMetric,
} from '@ai-rpg-engine/modules';
import {
  getDistrictForZone,
  getEntityFaction,
  getFactionCognition,
  runFactionAgencyTick,
  buildFactionProfile,
  formatFactionAgencyForNarrator,
  formatNpcAgencyForNarrator,
  generateNpcTextures,
  type FactionActionResult,
  type FactionProfile,
  tickObligations,
  type NpcActionResult,
  type NpcProfile,
  type NpcObligationLedger,
  getLeverageState,
  applyLeverageDeltas,
  isCooldownReady,
  setCooldown,
  isPlayerSocialVerb,
  isPlayerRumorVerb,
  isPlayerDiplomacyVerb,
  isPlayerSabotageVerb,
  resolveSocialAction,
  resolveRumorAction,
  resolveDiplomacyAction,
  resolveSabotageAction,
  tickLeverage,
  computeLeverageGains,
  formatLeverageForDirector,
  formatLeverageActionForNarrator,
  formatLeverageStatus,
  buildStrategicMap,
  formatStrategicMapForDirector,
  type StrategicMap,
  recommendMoves,
  type MoveRecommendation,
  type AdvisorInputs,
  spawnIntentionalRumor,
  denyRumor,
  buryRumor,
  type LeverageResolution,
  type LeverageEffect,
  computeRelationshipModifiers,
  getNetObligationWeight,
  createObligation,
  addObligation,
  evaluateConsequenceChainTrigger,
  buildConsequenceChain,
  shouldResolveChainStep,
  resolveConsequenceChainStep,
  tickConsequenceChain,
  type LoyaltyBreakpoint,
  type ConsequenceChain,
  getDistrictState,
  getDistrictDefinition,
  getAllDistrictIds,
  computeDistrictMood,
  computeDistrictModifiers,
  formatDistrictMoodForNarrator,
} from '@ai-rpg-engine/modules';
import {
  isCompanion,
  adjustCompanionMorale,
  type PartyState,
  type CompanionRole,
  evaluateCompanionReactions,
  type CompanionReaction,
  computePartyAbilities,
  computeAbilityModifiers,
  formatPartyStatusLine,
  formatPartyPresence,
} from '@ai-rpg-engine/modules';
import { buildPresence, buildNPCStancePresence, buildStatusData, type StatusData } from '../character/presence.js';
import type { ChronicleEventSource } from '../session/chronicle.js';
import type { ProfileUpdateHints, TurnResult } from '../turn-loop.js';

// ─── Types ───────────────────────────────────────────────────

/** Side effects produced by applyProfileHints (chronicle sources, title changes, rumors, etc.) */
export type ProfileHintResult = {
  profile: CharacterProfile;
  leveledUp: boolean;
  newLevel?: number;
  titleChanged: boolean;
  oldTitle?: string;
  newTitle?: string;
  chronicleSources: ChronicleEventSource[];
  rumorsSpawned: PlayerRumor[];
  pressureResolved?: { pressure: WorldPressure; resolutionType: ResolutionType };
};

/** Side effects from pressure resolution. */
export type PressureResolutionResult = {
  fallout: PressureFallout;
  chronicleSources: ChronicleEventSource[];
  companionReactionTrigger?: string;
};

/** Side effects from opportunity resolution. */
export type OpportunityResolutionResult = {
  fallout: OpportunityFallout;
  chronicleSources: ChronicleEventSource[];
};

/** Side effects from faction agency tick. */
export type FactionAgencyResult = {
  actions: FactionActionResult[];
  profiles: FactionProfile[];
  chronicleSources: ChronicleEventSource[];
};

/** Side effects from leverage action processing. */
export type LeverageActionResult = {
  resolution: LeverageResolution | null;
  profile: CharacterProfile;
  playerRumors: PlayerRumor[];
  chronicleSources: ChronicleEventSource[];
};

// ─── Title Evolutions ────────────────────────────────────────

/** Universal title evolutions based on milestone tags. */
export function getTitleEvolutions(): TitleEvolution[] {
  return [
    { requiredTags: ['boss-kill'], minCount: 3, prefix: 'Legendary' },
    { requiredTags: ['combat'], minCount: 5, suffix: 'the Bloodied' },
    { requiredTags: ['exploration'], minCount: 3, suffix: 'the Wanderer' },
  ];
}

// ─── Context Derivation (pure reads) ─────────────────────────

/** Get the district ID the player is currently in. */
export function getPlayerDistrictId(world: WorldState): string | undefined {
  return getDistrictForZone(world, world.locationId);
}

/** Get a compact district mood descriptor for the narrator. */
export function getDistrictDescriptor(world: WorldState): string | undefined {
  const districtId = getPlayerDistrictId(world);
  if (!districtId) return undefined;
  const dState = getDistrictState(world, districtId);
  const dDef = getDistrictDefinition(world, districtId);
  if (!dState || !dDef) return undefined;
  const mood = computeDistrictMood(dState, dDef.tags);
  return formatDistrictMoodForNarrator(mood, dDef.name);
}

/** Get a compact party presence string for the narrator. */
export function getPartyPresence(world: WorldState, partyState: PartyState): string | undefined {
  if (!partyState || partyState.companions.length === 0) return undefined;
  const companionNames: Record<string, string> = {};
  for (const comp of partyState.companions) {
    companionNames[comp.npcId] = world.entities[comp.npcId]?.name ?? comp.npcId;
  }
  return formatPartyPresence(partyState, companionNames) ?? undefined;
}

/** Get economy context for narrator (~10-15 tokens). */
export function getEconomyContext(
  world: WorldState,
  districtEconomies: Map<string, DistrictEconomy>,
): string | undefined {
  const districtId = getPlayerDistrictId(world);
  if (!districtId) return undefined;
  const economy = districtEconomies.get(districtId);
  if (!economy) return undefined;
  const descriptor = deriveEconomyDescriptor(economy);
  return formatEconomyForNarrator(descriptor);
}

/** Build crafting context string describing notable crafted/modified gear. */
export function getCraftingContext(
  profile: CharacterProfile | null,
  itemCatalog: ItemCatalog | null,
): string | undefined {
  if (!profile || !itemCatalog) return undefined;
  const parts: string[] = [];
  for (const slot of ['weapon', 'armor', 'tool', 'accessory', 'trinket'] as const) {
    const itemId = profile.loadout.equipped[slot];
    if (!itemId) continue;
    const item = itemCatalog.items.find((i) => i.id === itemId);
    if (!item?.provenance?.flags?.length) continue;
    const flags = item.provenance.flags;
    const notable = flags.filter((f) =>
      ['makeshift', 'blessed', 'cursed', 'contraband', 'faction-marked'].includes(f),
    );
    if (notable.length > 0) {
      const factionNote = item.provenance.factionId ? ` (${item.provenance.factionId})` : '';
      parts.push(`${item.name}: ${notable.join(', ')}${factionNote}`);
    }
  }
  return parts.length > 0 ? parts.join('; ') : undefined;
}

/** Get the faction that controls the player's current zone. */
export function getPlayerZoneFaction(world: WorldState): string | undefined {
  for (const entity of Object.values(world.entities)) {
    if (entity.zoneId === world.locationId && entity.ai) {
      const factionId = getEntityFaction(world, entity.id);
      if (factionId) return factionId;
    }
  }
  return undefined;
}

/** Get presence data from current profile state. */
export function getPresenceData(
  profile: CharacterProfile | null,
  itemCatalog: ItemCatalog | null,
): { narrator?: string; npc?: string } {
  if (!profile || !itemCatalog) return {};
  const presence = buildPresence(profile, itemCatalog);
  return { narrator: presence.narratorSummary, npc: presence.npcPerception };
}

/** Get status data for enhanced status bar. */
export function getStatusDataFromProfile(
  profile: CharacterProfile | null,
  itemCatalog: ItemCatalog | null,
): StatusData | null {
  if (!profile || !itemCatalog) return null;
  return buildStatusData(profile, itemCatalog);
}

/** Get compact opportunity context string for narrator. */
export function getOpportunityContext(activeOpportunities: OpportunityState[]): string | undefined {
  const accepted = getAcceptedOpportunities(activeOpportunities);
  if (accepted.length === 0) return undefined;
  const opp = accepted[0];
  const deadline = opp.turnsRemaining != null ? ` (${opp.turnsRemaining} turns left)` : '';
  return `Active ${opp.kind}: ${opp.title}${deadline}`;
}

/** Get compact arc context for narrator. */
export function getArcContext(arcSnapshot: ArcSnapshot | null): string | undefined {
  if (!arcSnapshot) return undefined;
  const text = formatArcForNarrator(arcSnapshot);
  return text || undefined;
}

/** Get endgame turning-point context for narrator. */
export function getEndgameContext(endgameTriggers: EndgameTrigger[]): string | undefined {
  if (endgameTriggers.length === 0) return undefined;
  const latest = endgameTriggers[endgameTriggers.length - 1];
  if (latest.acknowledged) return undefined;
  return formatEndgameForNarrator(latest);
}

// ─── Visible Pressure Context ────────────────────────────────

/** Format visible pressures + faction agency hints for narrator prompt injection. */
export function getVisiblePressureContext(
  activePressures: WorldPressure[],
  lastFactionActions: FactionActionResult[],
  lastNpcActions: NpcActionResult[],
  lastNpcProfiles: NpcProfile[],
  world: WorldState,
  playerId: string,
  lastLeverageResolution: LeverageResolution | null,
): string[] | undefined {
  const hints: string[] = [];

  const visible = getVisiblePressures(activePressures).slice(0, 2);
  for (const p of visible) {
    const urgency = p.urgency >= 0.7 ? 'urgent' : p.urgency >= 0.4 ? 'growing' : 'distant';
    hints.push(`${p.kind}: ${p.description} (${urgency})`);
  }

  const agencyHints = formatFactionAgencyForNarrator(lastFactionActions);
  hints.push(...agencyHints);

  const npcHints = formatNpcAgencyForNarrator(lastNpcActions);
  hints.push(...npcHints);

  const textureHints = generateNpcTextures(lastNpcProfiles, world, playerId);
  hints.push(...textureHints);

  if (lastLeverageResolution?.success && lastLeverageResolution.narratorHint) {
    hints.push(formatLeverageActionForNarrator(lastLeverageResolution));
  }

  return hints.length > 0 ? hints : undefined;
}

// ─── Rumor Propagation ───────────────────────────────────────

/** Propagate existing rumors to new factions (max 3 per turn, scaled). */
export function propagateRumors(
  playerRumors: PlayerRumor[],
  world: WorldState,
  partyState: PartyState,
): PlayerRumor[] {
  const factionIds = Object.keys(world.factions);
  if (factionIds.length <= 1) return playerRumors;

  let rumorSpreadScale = 1.0;
  const playerDist = getPlayerDistrictId(world);
  if (playerDist) {
    const dState = getDistrictState(world, playerDist);
    const dDef = getDistrictDefinition(world, playerDist);
    if (dState && dDef) {
      const mood = computeDistrictMood(dState, dDef.tags);
      const mods = computeDistrictModifiers(mood);
      rumorSpreadScale = mods.rumorSpreadScale;
    }
  }

  if (partyState.companions.length > 0) {
    const partyAbilities = computePartyAbilities(partyState);
    if (partyAbilities.length > 0) {
      const abilityMods = computeAbilityModifiers(partyAbilities);
      rumorSpreadScale *= abilityMods.rumorSpreadScale;
    }
  }

  const MAX_PER_TURN = Math.round(3 * rumorSpreadScale);
  let propagations = 0;
  const updated = [...playerRumors];

  for (let i = 0; i < updated.length && propagations < MAX_PER_TURN; i++) {
    const rumor = updated[i];
    if (rumor.confidence <= 0.3) continue;
    const eligible = factionIds.filter((f) => !rumor.spreadTo.includes(f));
    if (eligible.length === 0) continue;
    const target = eligible[propagations % eligible.length];
    updated[i] = propagateRumor(rumor, target);
    propagations++;
  }

  return updated;
}

/** Add a rumor, applying companion rumor-suppression if applicable. */
export function addRumor(
  rumor: PlayerRumor,
  playerRumors: PlayerRumor[],
  partyState: PartyState,
  tick: number,
): PlayerRumor[] {
  if ((rumor.valence === 'fearsome' || rumor.valence === 'tragic') && partyState.companions.length > 0) {
    const partyAbilities = computePartyAbilities(partyState);
    if (partyAbilities.length > 0) {
      const abilityMods = computeAbilityModifiers(partyAbilities);
      if (abilityMods.rumorSuppressionChance > 0) {
        const roll = simpleHashNum(rumor.id + tick) % 100;
        if (roll < abilityMods.rumorSuppressionChance * 100) {
          return playerRumors; // suppressed
        }
      }
    }
  }
  return [...playerRumors, rumor];
}

// ─── Pressure System ─────────────────────────────────────────

/** Build PressureInputs from current session state. */
export function buildPressureInputs(
  world: WorldState,
  profile: CharacterProfile | null,
  playerRumors: PlayerRumor[],
  activePressures: WorldPressure[],
  genre: string,
  tick: number,
  districtEconomies: Map<string, DistrictEconomy>,
): PressureInputs {
  const factionIds = Object.keys(world.factions);
  const reputation = factionIds.map((factionId) => ({
    factionId,
    value: profile ? getReputation(profile, factionId) : 0,
  }));
  const factionStates: Record<string, { alertLevel: number; cohesion: number }> = {};
  for (const factionId of factionIds) {
    const fcog = getFactionCognition(world, factionId);
    if (fcog) {
      const state = fcog as Record<string, unknown>;
      factionStates[factionId] = {
        alertLevel: (state.alertLevel as number) ?? 0,
        cohesion: (state.cohesion as number) ?? 1,
      };
    } else {
      factionStates[factionId] = { alertLevel: 0, cohesion: 1 };
    }
  }
  const milestones = (profile?.milestones ?? []).map((m) => ({ label: m.label, tags: m.tags }));
  const districtIds = getAllDistrictIds(world);
  const districtMetrics: Record<string, { alertPressure: number; rumorDensity: number; stability: number }> = {};
  for (const dId of districtIds) {
    const dState = getDistrictState(world, dId);
    if (dState) {
      districtMetrics[dId] = {
        alertPressure: dState.alertPressure,
        rumorDensity: dState.rumorDensity,
        stability: dState.stability,
      };
    }
  }
  return {
    playerRumors,
    reputation,
    milestones,
    factionStates,
    districtMetrics: Object.keys(districtMetrics).length > 0 ? districtMetrics : undefined,
    playerLevel: profile?.progression.level ?? 1,
    totalTurns: profile?.totalTurns ?? 0,
    activePressures,
    genre,
    currentTick: tick,
    districtEconomies: districtEconomies.size > 0 ? districtEconomies : undefined,
  };
}

/** Apply structured fallout effects to session state. Returns updated profile. */
export function applyFalloutEffects(
  fallout: PressureFallout,
  profile: CharacterProfile | null,
  world: WorldState,
  playerRumors: PlayerRumor[],
  activePressures: WorldPressure[],
  partyState: PartyState,
  districtEconomies: Map<string, DistrictEconomy>,
  genre: string,
  tick: number,
): {
  profile: CharacterProfile | null;
  playerRumors: PlayerRumor[];
  activePressures: WorldPressure[];
  titleChanged?: { oldTitle?: string; newTitle: string };
} {
  let updatedProfile = profile;
  let updatedRumors = playerRumors;
  let updatedPressures = activePressures;
  let titleChanged: { oldTitle?: string; newTitle: string } | undefined;

  for (const effect of fallout.effects) {
    switch (effect.type) {
      case 'reputation':
        if (updatedProfile) {
          updatedProfile = adjustReputation(updatedProfile, effect.factionId, effect.delta);
        }
        break;

      case 'district':
        modifyDistrictMetric(
          world,
          effect.districtId,
          effect.metric as 'alertPressure' | 'rumorDensity' | 'intruderLikelihood' | 'surveillance' | 'stability',
          effect.delta,
        );
        break;

      case 'rumor':
        if (updatedProfile) {
          const newRumor = spawnPlayerRumor(
            { label: effect.claim, description: effect.claim, tags: [effect.valence] },
            updatedProfile,
            effect.spreadTo[0],
            getPlayerDistrictId(world),
            tick,
          );
          updatedRumors = addRumor(newRumor, updatedRumors, partyState, tick);
        }
        break;

      case 'spawn-pressure': {
        const MAX_ACTIVE = 3;
        if (updatedPressures.length < MAX_ACTIVE) {
          const chainPressure = makePressure({
            kind: effect.kind,
            sourceFactionId: effect.sourceFactionId,
            description: effect.description,
            triggeredBy: `chain:${fallout.resolution.pressureKind}`,
            urgency: effect.urgency,
            visibility: fallout.resolution.resolutionVisibility,
            turnsRemaining: 10,
            potentialOutcomes: [],
            tags: effect.tags,
            currentTick: tick,
          });
          (chainPressure as WorldPressure & { chainedFrom?: string }).chainedFrom =
            fallout.resolution.pressureId;
          updatedPressures = [...updatedPressures, chainPressure];
        }
        break;
      }

      case 'alert':
      case 'milestone-tag':
        break;

      case 'title-trigger':
        if (updatedProfile) {
          const allTags = [
            ...updatedProfile.milestones.flatMap((m) => m.tags),
            effect.tag,
          ];
          const newTitle = evolveTitle(
            updatedProfile.custom.title as string | undefined,
            allTags,
            getTitleEvolutions(),
          );
          if (newTitle && newTitle !== updatedProfile.custom.title) {
            titleChanged = {
              oldTitle: updatedProfile.custom.title as string | undefined,
              newTitle,
            };
            updatedProfile = {
              ...updatedProfile,
              custom: { ...updatedProfile.custom, title: newTitle },
            };
          }
        }
        break;

      case 'economy-shift':
        applyEconomyShiftToMap(districtEconomies, effect.districtId, effect.category, effect.delta, effect.cause);
        break;
    }
  }

  return { profile: updatedProfile, playerRumors: updatedRumors, activePressures: updatedPressures, titleChanged };
}

// ─── Economy ─────────────────────────────────────────────────

/** Initialize district economies from genre + district tags. */
export function initializeDistrictEconomies(world: WorldState, genre: string): Map<string, DistrictEconomy> {
  const economies = new Map<string, DistrictEconomy>();
  const districtIds = getAllDistrictIds(world);
  for (const districtId of districtIds) {
    const def = getDistrictDefinition(world, districtId);
    const tags = def?.tags ?? [];
    economies.set(districtId, createDistrictEconomy(genre, tags));
  }
  return economies;
}

/** Tick all district economies — baseline-seeking decay, stability modulation. */
export function tickDistrictEconomies(
  districtEconomies: Map<string, DistrictEconomy>,
  world: WorldState,
  tick: number,
): void {
  for (const [districtId, economy] of districtEconomies) {
    const dState = getDistrictState(world, districtId);
    if (!dState) continue;
    const updated = tickDistrictEconomy(economy, dState.commerce, dState.stability, tick);
    districtEconomies.set(districtId, updated);
  }
}

/** Apply an economy-shift effect to a district's economy map. */
export function applyEconomyShiftToMap(
  districtEconomies: Map<string, DistrictEconomy>,
  districtId: string,
  category: string,
  delta: number,
  cause: string,
): void {
  const economy = districtEconomies.get(districtId);
  if (!economy) return;
  const updated = applyEconomyShift(economy, {
    districtId,
    category: category as SupplyCategory,
    delta,
    cause,
  });
  districtEconomies.set(districtId, updated);
}

// ─── Arc Detection & Endgame ─────────────────────────────────

/** Build ArcInputs from current session state. */
export function buildArcInputs(
  world: WorldState,
  profile: CharacterProfile | null,
  activePressures: WorldPressure[],
  lastNpcProfiles: NpcProfile[],
  npcObligations: Map<string, NpcObligationLedger>,
  partyState: PartyState,
  districtEconomies: Map<string, DistrictEconomy>,
  activeOpportunities: OpportunityState[],
  resolvedPressures: PressureFallout[],
  resolvedOpportunities: OpportunityFallout[],
  tick: number,
  fastMode: boolean,
): ArcInputs {
  const factionIds = Object.keys(world.factions);
  const factionStates = factionIds.map((factionId) => {
    const fcog = getFactionCognition(world, factionId);
    const state = fcog as Record<string, unknown> | undefined;
    return {
      factionId,
      alertLevel: (state?.alertLevel as number) ?? 0,
      cohesion: (state?.cohesion as number) ?? 1,
    };
  });
  const playerReputations = factionIds.map((fid) => ({
    factionId: fid,
    value: profile ? getReputation(profile, fid) : 0,
  }));
  const player = world.entities[world.playerId];
  const leverage = profile ? getLeverageState(profile.custom) : { favor: 0, debt: 0, blackmail: 0, influence: 0, heat: 0, legitimacy: 0 };
  const totalTurns = profile?.totalTurns ?? 0;

  const turnScale = fastMode ? 2 : 1;
  const leverageScale = fastMode ? 1.5 : 1;

  return {
    factionStates,
    playerReputations: fastMode
      ? playerReputations.map((r) => ({ ...r, value: Math.round(r.value * leverageScale) }))
      : playerReputations,
    playerLeverage: fastMode
      ? {
          favor: Math.round(leverage.favor * leverageScale),
          debt: Math.round(leverage.debt * leverageScale),
          blackmail: Math.round(leverage.blackmail * leverageScale),
          influence: Math.round(leverage.influence * leverageScale),
          heat: leverage.heat,
          legitimacy: Math.round(leverage.legitimacy * leverageScale),
        }
      : leverage,
    activePressures,
    npcProfiles: lastNpcProfiles,
    npcObligations,
    companions: partyState.companions,
    districtEconomies,
    activeOpportunities,
    resolvedPressures,
    resolvedOpportunities,
    playerHp: player?.resources?.hp,
    playerMaxHp: player?.resources?.maxHp,
    playerLevel: profile?.progression.level ?? 1,
    totalTurns: totalTurns * turnScale,
    currentTick: tick * turnScale,
  };
}

/** Build the finale outline from current campaign state. */
export function buildFinaleFromState(
  world: WorldState,
  profile: CharacterProfile | null,
  journal: CampaignJournal,
  arcSnapshot: ArcSnapshot | null,
  endgameTriggers: EndgameTrigger[],
  partyState: PartyState,
  lastNpcProfiles: NpcProfile[],
  districtEconomies: Map<string, DistrictEconomy>,
  tick: number,
): FinaleOutline {
  const resolutionClass = endgameTriggers.length > 0
    ? endgameTriggers[endgameTriggers.length - 1].resolutionClass
    : 'quiet-retirement';
  const dominantArc = arcSnapshot?.dominantArc ?? null;

  const npcs: FinaleNpcInput[] = lastNpcProfiles.map((p) => ({
    npcId: p.npcId,
    name: p.name,
    breakpoint: p.breakpoint,
    isCompanion: isCompanion(partyState, p.npcId),
  }));

  const factionIds = Object.keys(world.factions);
  const factions: FinaleFactionInput[] = factionIds.map((fid) => {
    const fcog = getFactionCognition(world, fid);
    const state = fcog as Record<string, unknown> | undefined;
    return {
      factionId: fid,
      playerReputation: profile ? getReputation(profile, fid) : 0,
      alertLevel: (state?.alertLevel as number) ?? 0,
      cohesion: (state?.cohesion as number) ?? 1,
    };
  });

  const districtIds = getAllDistrictIds(world);
  const districts: FinaleDistrictInput[] = districtIds.map((did) => {
    const dState = getDistrictState(world, did);
    const dDef = getDistrictDefinition(world, did);
    const economy = districtEconomies.get(did);
    const descriptor = economy ? deriveEconomyDescriptor(economy) : undefined;
    return {
      districtId: did,
      name: dDef?.name ?? did,
      stability: dState?.stability ?? 50,
      controllingFaction: dDef?.controllingFaction,
      economyTone: descriptor?.overallTone ?? 'stable',
    };
  });

  return buildFinaleOutline(
    resolutionClass, dominantArc, journal,
    npcs, factions, districts,
    profile?.totalTurns ?? tick,
    profile?.custom.title as string | undefined,
    profile?.progression.level,
  );
}

// ─── Strategic Map + Move Advisor ────────────────────────────

/** Build a StrategicMap from current session state. */
export function buildCurrentStrategicMap(
  world: WorldState,
  profile: CharacterProfile | null,
  playerRumors: PlayerRumor[],
  activePressures: WorldPressure[],
  lastFactionActions: FactionActionResult[],
  districtEconomies: Map<string, DistrictEconomy>,
  activeOpportunities: OpportunityState[],
): StrategicMap {
  const playerReputations = Object.keys(world.factions).map((fid) => ({
    factionId: fid,
    value: profile ? getReputation(profile, fid) : 0,
  }));
  return buildStrategicMap(
    world, playerRumors, activePressures, playerReputations,
    lastFactionActions, districtEconomies, activeOpportunities,
  );
}

/** Build a MoveRecommendation from current session state. */
export function buildMoveRecommendation(
  world: WorldState,
  profile: CharacterProfile | null,
  playerRumors: PlayerRumor[],
  activePressures: WorldPressure[],
  lastFactionActions: FactionActionResult[],
  districtEconomies: Map<string, DistrictEconomy>,
  activeOpportunities: OpportunityState[],
  tick: number,
): MoveRecommendation {
  if (!profile) return { top3: [], situationTag: 'safe' };
  const leverageState = getLeverageState(profile.custom);
  const map = buildCurrentStrategicMap(
    world, profile, playerRumors, activePressures, lastFactionActions, districtEconomies, activeOpportunities,
  );
  const playerReputations = Object.keys(world.factions).map((fid) => ({
    factionId: fid,
    value: getReputation(profile, fid),
  }));

  const cooldowns: Record<string, number> = {};
  for (const [key, val] of Object.entries(profile.custom)) {
    if (key.startsWith('cooldown.') && typeof val === 'number') {
      cooldowns[key.replace('cooldown.', '')] = val;
    }
  }

  const inputs: AdvisorInputs = {
    leverageState,
    activePressures,
    factionViews: map.factions,
    districtViews: map.districts,
    playerReputation: playerReputations,
    currentTick: tick,
    cooldowns,
    playerHeat: (leverageState as Record<string, number>).heat ?? 0,
    activeOpportunities,
  };
  return recommendMoves(inputs);
}

/** Check whether the player has ever used any leverage action. */
export function hasEverUsedLeverage(profile: CharacterProfile | null): boolean {
  if (!profile) return false;
  return Object.keys(profile.custom).some(
    (k) => k.startsWith('stats.action.') && (profile.custom[k] as number) > 0,
  );
}

/** Get the faction the player has highest rep with (for crafting provenance). */
export function getPlayerFactionAccess(
  world: WorldState,
  profile: CharacterProfile | null,
): string | undefined {
  if (!profile) return undefined;
  const factionIds = Object.keys(world.factions);
  let best: string | undefined;
  let bestRep = 0;
  for (const fid of factionIds) {
    const rep = getReputation(profile, fid);
    if (rep > bestRep) {
      bestRep = rep;
      best = fid;
    }
  }
  return bestRep >= 20 ? best : undefined;
}

// ─── Utility ─────────────────────────────────────────────────

/** Deterministic hash for side-effect rolls. */
export function simpleHashNum(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Sanitize a string for use in filenames. */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '') || 'campaign';
}

// Re-export types that game.ts needs from modules (avoids duplicate imports)
export type {
  DistrictEconomy,
  SupplyCategory,
  WorldPressure,
  PressureInputs,
  PressureFallout,
  ResolutionType,
  FalloutEffect,
  PlayerRumor,
  FactionActionResult,
  FactionProfile,
  NpcActionResult,
  NpcProfile,
  NpcObligationLedger,
  LeverageResolution,
  LoyaltyBreakpoint,
  ConsequenceChain,
  OpportunityState,
  OpportunityFallout,
  OpportunityResolutionType,
  ArcSnapshot,
  EndgameTrigger,
  FinaleOutline,
  StrategicMap,
  MoveRecommendation,
  PartyState,
  CompanionReaction,
  CompanionRole,
  TitleEvolution,
  StatusData,
  CraftEffect,
  CraftingContext,
};
