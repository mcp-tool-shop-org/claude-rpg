// GameSession: master orchestrator wiring Engine + Claude + UI + Immersion
// v0.2: integrated with ImmersionRuntime
// v0.3: character profile awareness
// v0.4: social consequence — reputation, milestones, title evolution
// v0.5: rumor ecology — player legend propagation, decay, mutation
// v0.6: emergent pressure — world-generated threats and opportunities
// v0.7: resolution & fallout — pressures resolve with structured consequences
// v0.9: faction agency — factions as active strategic actors
// v1.0: player leverage — structured social actions for player counter-agency
// v1.1: the cockpit — campaign UX, move advisor, contextual suggestions, help system
// v1.2: NPC agency — named NPCs as individual actors with goals, fears, and autonomous actions
// v1.6: equipment provenance — item recognition, combat chronicles, acquisition tracking

import type { Engine } from '@ai-rpg-engine/core';
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
  // Crafting (v1.8)
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
  // Opportunities (v1.9)
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
  // Arc Detection + Endgame (v2.0)
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
import { CampaignJournal, buildFinaleOutline, formatFinaleForDirector, formatFinaleForTerminal, type FinaleOutline, type FinaleNpcInput, type FinaleFactionInput, type FinaleDistrictInput } from '@ai-rpg-engine/campaign-memory';
import {
  grantXp,
  addInjury,
  incrementTurns,
  adjustReputation,
  recordMilestone,
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
import { getReputation } from '@ai-rpg-engine/character-profile';
import {
  getPlayerDistrictId as _getPlayerDistrictId,
  getDistrictDescriptor as _getDistrictDescriptor,
  getPartyPresence as _getPartyPresence,
  getEconomyContext as _getEconomyContext,
  getCraftingContext as _getCraftingContext,
  getPlayerZoneFaction as _getPlayerZoneFaction,
  getPresenceData,
  getStatusDataFromProfile,
  getOpportunityContext as _getOpportunityContext,
  getArcContext as _getArcContext,
  getEndgameContext as _getEndgameContext,
  getVisiblePressureContext as _getVisiblePressureContext,
  getTitleEvolutions,
  propagateRumors as _propagateRumors,
  addRumor as _addRumor,
  buildPressureInputs as _buildPressureInputs,
  applyFalloutEffects as _applyFalloutEffects,
  initializeDistrictEconomies,
  tickDistrictEconomies as _tickDistrictEconomies,
  applyEconomyShiftToMap,
  buildArcInputs as _buildArcInputs,
  buildFinaleFromState,
  buildCurrentStrategicMap as _buildCurrentStrategicMap,
  buildMoveRecommendation as _buildMoveRecommendation,
  hasEverUsedLeverage as _hasEverUsedLeverage,
  getPlayerFactionAccess as _getPlayerFactionAccess,
  simpleHashNum,
  sanitizeFilename,
} from './game/game-state.js';
import { generateOpeningNarration, generateFinaleNarration } from './game/game-narration.js';
import { renderWelcomeScreen, renderThinkingIndicator, renderOpeningOutput, renderConcludeOutput, renderPlayOutput, buildPartyStatusLine } from './game/game-presenter.js';
import { createAdaptedClient } from './llm/claude-adapter.js';
import type { ClaudeClient, ClaudeClientConfig } from './claude-client.js';
import { TurnHistory } from './session/history.js';
import { executeTurn, type TurnResult, type ProfileUpdateHints } from './turn-loop.js';
import { renderPlayScreen, renderWelcome, renderThinking } from './display/play-renderer.js';
import { executeDirectorCommand, renderDirectorHelp } from './display/director-renderer.js';
import { narrateScene } from './narrator/narrator.js';
import { narrateFinale } from './narrator/finale-narrator.js';
import { ImmersionRuntime, type ImmersionConfig } from './runtime/immersion-runtime.js';
import { buildPresence, buildNPCStancePresence, buildStatusData, type StatusData } from './character/presence.js';
import { deriveChronicleEvents, type ChronicleEventSource } from './session/chronicle.js';
import { tickNpcAgency, buildNpcProfilesForDirector, applyNpcEffects } from './npc/agency.js';
import {
  recruitCompanion,
  dismissCompanion,
  followPlayer,
  syncCompanionMorale,
  inferCompanionRole,
} from './companion/companion-bridge.js';
import {
  createPartyState,
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
import { renderPlayHelp, renderLeverageHelp, renderPackQuickstart, renderArcHelp, renderConcludeHelp, getOnboardingByGenre, renderFirstTurnOrientation } from './display/help-system.js';
import { renderCompactStatus } from './display/status-compact.js';
import { generateSuggestions } from './display/contextual-suggestions.js';
import { renderArchiveBrowser } from './display/archive-browser.js';
import { listArchivedCampaigns } from './session/session.js';
import { exportChronicleMarkdown, exportChronicleJSON, exportFinaleMarkdown, writeExport } from './session/chronicle-export.js';

export type GameMode = 'play' | 'director';

export type GameConfig = {
  engine: Engine;
  clientConfig?: ClaudeClientConfig;
  /** Pre-built client — bypasses createAdaptedClient. Use for testing. */
  client?: ClaudeClient;
  tone?: string;
  title?: string;
  worldPrompt?: string;
  immersion?: ImmersionConfig;
  profile?: CharacterProfile;
  itemCatalog?: ItemCatalog;
  genre?: string;
  journal?: CampaignJournal;
  fastMode?: boolean;
};

export class GameSession {
  readonly engine: Engine;
  readonly client: ClaudeClient;
  readonly history: TurnHistory;
  readonly tone: string;
  readonly title: string;
  readonly worldPrompt?: string;
  readonly immersion: ImmersionRuntime;
  readonly itemCatalog: ItemCatalog | null;
  profile: CharacterProfile | null;
  playerRumors: PlayerRumor[] = [];
  activePressures: WorldPressure[] = [];
  resolvedPressures: PressureFallout[] = [];
  readonly journal: CampaignJournal;
  readonly genre: string;
  mode: GameMode = 'play';
  lastFactionActions: FactionActionResult[] = [];
  lastFactionProfiles: FactionProfile[] = [];
  lastNpcActions: NpcActionResult[] = [];
  lastNpcProfiles: NpcProfile[] = [];
  npcObligations: Map<string, NpcObligationLedger> = new Map();
  previousBreakpoints: Map<string, LoyaltyBreakpoint> = new Map();
  activeConsequenceChains: Map<string, ConsequenceChain> = new Map();
  lastLeverageResolution: LeverageResolution | null = null;
  lastCompanionReactions: CompanionReaction[] = [];
  partyState: PartyState = createPartyState();
  districtEconomies: Map<string, DistrictEconomy> = new Map();
  activeOpportunities: OpportunityState[] = [];
  resolvedOpportunities: OpportunityFallout[] = [];
  arcSnapshot: ArcSnapshot | null = null;
  endgameTriggers: EndgameTrigger[] = [];
  finaleOutline: FinaleOutline | null = null;
  campaignStatus: 'active' | 'completed' = 'active';
  readonly fastMode: boolean;

  constructor(config: GameConfig) {
    this.engine = config.engine;
    this.client = config.client ?? createAdaptedClient(config.clientConfig);
    this.history = new TurnHistory();
    this.tone = config.tone ?? 'dark fantasy, concise, atmospheric';
    this.title = config.title ?? 'claude-rpg';
    this.worldPrompt = config.worldPrompt;
    this.immersion = new ImmersionRuntime(config.immersion);
    this.immersion.initialize(this.engine);
    this.profile = config.profile ?? null;
    this.itemCatalog = config.itemCatalog ?? null;
    this.journal = config.journal ?? new CampaignJournal();
    this.genre = config.genre ?? 'fantasy';
    this.fastMode = config.fastMode ?? false;

    // Initialize district economies from genre + district tags
    this.initializeDistrictEconomies();

    // Register leverage verb handlers (thin stubs — resolution happens in processInput)
    this.registerLeverageVerbs();
  }

  /** Get the welcome screen text. */
  getWelcome(): string {
    return renderWelcomeScreen(this.title, this.tone);
  }

  /** Get presence strings from current profile state. */
  getPresence(): { narrator?: string; npc?: string } {
    return getPresenceData(this.profile, this.itemCatalog);
  }

  /** Get status data for enhanced status bar. */
  getStatusData(): StatusData | null {
    return getStatusDataFromProfile(this.profile, this.itemCatalog);
  }

  /** Apply profile update hints from a turn result. */
  applyProfileHints(hints: ProfileUpdateHints): void {
    if (!this.profile) return;

    // XP
    if (hints.xpGained > 0) {
      const { profile: updated, leveledUp, newLevel } = grantXp(this.profile, hints.xpGained);
      this.profile = updated;
      if (leveledUp) {
        console.log(`\n  Level up! You are now level ${newLevel}.\n`);
      }
    }

    // Injuries
    if (hints.injurySustained) {
      this.profile = addInjury(this.profile, {
        name: hints.injurySustained.name,
        description: hints.injurySustained.description,
        statPenalties: {},
        resourcePenalties: {},
        grantedTags: ['wounded'],
        sustainedAt: `turn-${this.engine.tick}`,
      });
    }

    // Reputation
    if (hints.reputationDelta) {
      this.profile = adjustReputation(
        this.profile,
        hints.reputationDelta.factionId,
        hints.reputationDelta.delta,
      );

      // Spawn reputation rumor
      const factionState = this.engine.world.factions[hints.reputationDelta.factionId];
      const districtId = this.getPlayerDistrictId();
      this.addRumor(
        spawnReputationRumor(
          hints.reputationDelta.factionId,
          hints.reputationDelta.delta,
          factionState?.name ?? hints.reputationDelta.factionId,
          this.profile,
          districtId,
          this.engine.tick,
        ),
      );
    }

    // Milestones + title evolution
    if (hints.milestoneTriggered) {
      this.profile = recordMilestone(this.profile, {
        label: hints.milestoneTriggered.label,
        description: hints.milestoneTriggered.description,
        at: `turn-${this.engine.tick}`,
        tags: hints.milestoneTriggered.tags,
      });

      const allTags = this.profile.milestones.flatMap((m) => m.tags);
      const oldTitle = this.profile.custom.title as string | undefined;
      const newTitle = evolveTitle(
        oldTitle,
        allTags,
        this.getTitleEvolutions(),
      );
      if (newTitle && newTitle !== oldTitle) {
        this.profile = {
          ...this.profile,
          custom: { ...this.profile.custom, title: newTitle },
        };
        console.log(`\n  Title evolved: "${newTitle}"\n`);

        // Record title change in chronicle
        const titleSource: ChronicleEventSource = {
          kind: 'title-change',
          oldTitle,
          newTitle,
          tick: this.engine.tick,
        };
        for (const entry of deriveChronicleEvents(titleSource, this.engine.world.playerId)) {
          this.journal.record(entry);
        }
      }

      // Spawn milestone rumor
      const witnessedBy = this.getPlayerZoneFaction();
      const districtId = this.getPlayerDistrictId();
      this.addRumor(
        spawnPlayerRumor(
          hints.milestoneTriggered,
          this.profile,
          witnessedBy,
          districtId,
          this.engine.tick,
        ),
      );
    }

    // Pressure resolution (player-driven)
    if (hints.pressureResolution) {
      const pressure = this.activePressures.find(
        (p) => p.id === hints.pressureResolution!.pressureId,
      );
      if (pressure) {
        this.activePressures = this.activePressures.filter(
          (p) => p.id !== pressure.id,
        );
        this.resolvePressure(pressure, hints.pressureResolution.resolutionType, 'player');
      }
    }

    // Increment turns
    this.profile = incrementTurns(this.profile);

    // Sync resources from engine entity state
    const player = this.engine.world.entities[this.engine.world.playerId];
    if (player) {
      this.profile = { ...this.profile, resources: { ...player.resources } };
    }
  }

  /** Get the initial scene narration. */
  async getOpeningNarration(): Promise<string> {
    const presence = this.getPresence();
    const result = await generateOpeningNarration({
      client: this.client,
      world: this.engine.world,
      tone: this.tone,
      immersionState: this.immersion.stateMachine.current,
      narratorPresence: presence.narrator,
      pressureContext: this.getVisiblePressureContext(),
      districtDescriptor: this.getDistrictDescriptor(),
      partyPresence: this.getPartyPresence(),
      economyContext: this.getEconomyContext(),
      arcContext: this.getArcContext(),
      endgameContext: this.getEndgameContext(),
    });
    this.history.record({
      tick: this.engine.tick,
      playerInput: '',
      verb: 'look',
      narration: result.narration,
    });
    return renderOpeningOutput(
      result.narration,
      this.engine.world,
      this.engine.getAvailableActions(),
      this.getStatusData() ?? undefined,
      this.genre,
    );
  }

  /** Process one player input and return the rendered output. */
  async processInput(input: string): Promise<string> {
    const trimmed = input.trim();

    // Meta commands
    if (trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'exit') {
      return '__QUIT__';
    }

    // Director mode toggle
    if (trimmed === '/director' || trimmed === '/d') {
      this.mode = 'director';
      this.immersion.stateMachine.transition('director', '/director');
      return renderDirectorHelp();
    }

    if (trimmed === '/back' || trimmed === '/b') {
      this.mode = 'play';
      this.immersion.stateMachine.transition('exploration', '/back');
      return await this.getOpeningNarration();
    }

    // Director mode commands
    if (this.mode === 'director' && trimmed.startsWith('/')) {
      const dirRecommendation = this.profile ? this.buildMoveRecommendation() : null;
      return executeDirectorCommand(
        trimmed,
        this.engine.world,
        this.playerRumors,
        this.activePressures,
        this.resolvedPressures,
        this.journal,
        this.engine.tick,
        this.profile?.build.name,
        this.profile?.custom.title as string | undefined,
        this.lastFactionProfiles,
        this.lastFactionActions,
        this.profile ? getLeverageState(this.profile.custom) : undefined,
        this.profile ? this.buildCurrentStrategicMap() : undefined,
        this.getStatusData() ?? undefined,
        dirRecommendation?.top3[0] ?? null,
        dirRecommendation?.situationTag ?? 'safe',
        this.profile?.custom as Record<string, string | number | boolean> | undefined,
        this.lastNpcProfiles,
        this.lastNpcActions,
        this.npcObligations,
        this.partyState,
        this.profile,
        this.itemCatalog,
        this.districtEconomies,
        this.genre,
        this.activeOpportunities,
        this.arcSnapshot,
        this.endgameTriggers,
        this.finaleOutline,
      );
    }

    // Play mode slash commands (no turn consumed)
    if (this.mode === 'play' && trimmed.startsWith('/')) {
      const cmdParts = trimmed.split(/\s+/);
      const playCmd = cmdParts[0]?.toLowerCase();
      if (playCmd === '/help') {
        const sub = cmdParts[1];
        if (!sub) return renderPlayHelp();
        if (sub === 'leverage') return renderLeverageHelp();
        if (sub === 'arcs') return renderArcHelp();
        if (sub === 'conclude' || sub === 'conclusion' || sub === 'finale') return renderConcludeHelp();
        return renderPackQuickstart(sub);
      }
      if (playCmd === '/status') {
        if (!this.profile) return '  No profile loaded.';
        const leverageState = getLeverageState(this.profile.custom);
        const recommendation = this.buildMoveRecommendation();
        const topThreat = this.activePressures.length > 0
          ? { description: this.activePressures[0].description, urgency: this.activePressures[0].urgency }
          : null;
        const matSummary = formatMaterialsCompact(getMaterialInventory(this.profile.custom));
        const arcInd = this.arcSnapshot?.dominantArc
          ? `${this.arcSnapshot.dominantArc} (${this.arcSnapshot.signals.find((s) => s.kind === this.arcSnapshot!.dominantArc)?.momentum ?? 'steady'})`
          : undefined;
        const unacknowledged = this.endgameTriggers.filter((t) => !t.acknowledged);
        const endgameInd = unacknowledged.length > 0
          ? unacknowledged.map((t) => `${t.resolutionClass} (turn ${t.detectedAtTick})`).join(', ')
          : undefined;
        return renderCompactStatus({
          statusData: this.getStatusData()!,
          leverageState,
          topThreat,
          suggestedMove: recommendation.top3[0] ?? null,
          situationTag: recommendation.situationTag,
          materialsSummary: matSummary !== 'No materials' ? matSummary : undefined,
          arcIndicator: arcInd,
          endgameIndicator: endgameInd,
          fastMode: this.fastMode,
        });
      }
      if (playCmd === '/map') {
        if (!this.profile) return '  No profile loaded.';
        return formatStrategicMapForDirector(this.buildCurrentStrategicMap());
      }
      if (playCmd === '/leverage') {
        if (!this.profile) return '  No profile loaded.';
        return formatLeverageForDirector(getLeverageState(this.profile.custom));
      }
      if (playCmd === '/jobs' || playCmd === '/contracts') {
        return formatOpportunityListForDirector(this.activeOpportunities);
      }
      if (playCmd === '/arcs') {
        if (!this.arcSnapshot) return '  No arc data yet — play a few turns first.';
        return formatArcForDirector(this.arcSnapshot);
      }
      if (playCmd === '/conclude') {
        return await this.handleConclude();
      }
      if (playCmd === '/recruit') {
        return this.handleRecruit(cmdParts.slice(1));
      }
      if (playCmd === '/dismiss') {
        return this.handleDismiss(cmdParts[1]);
      }
      if (playCmd === '/archive') {
        return await this.handleArchive();
      }
      if (playCmd === '/export') {
        return await this.handleExport(cmdParts.slice(1));
      }
    }

    // Play mode: execute a turn with immersion + character presence
    const presence = this.getPresence();
    const pressureCtx = this.getVisiblePressureContext();

    // Compute district mood for narration
    const districtDescriptor = this.getDistrictDescriptor();

    // Track zone before turn for companion following
    const zoneBefore = this.engine.world.locationId;

    const partyPresenceStr = this.getPartyPresence();
    const turnEconomyCtx = this.getEconomyContext();
    const turnCraftingCtx = this.getCraftingContext();
    const turnResult = await executeTurn(
      this.engine,
      this.client,
      this.history,
      trimmed,
      this.tone,
      this.immersion,
      presence.narrator,
      presence.npc,
      this.profile,
      this.playerRumors,
      pressureCtx,
      this.activePressures,
      this.lastNpcActions,
      districtDescriptor,
      partyPresenceStr,
      turnEconomyCtx,
      turnCraftingCtx,
      this.getOpportunityContext(),
      this.getArcContext(),
      this.getEndgameContext(),
    );

    // Process leverage actions (social/rumor/diplomacy/sabotage)
    this.processLeverageAction(turnResult);

    // Process crafting actions (craft/salvage/repair/modify) (v1.8)
    this.processCraftAction(turnResult);

    // Apply profile hints from this turn (may spawn rumors)
    this.applyProfileHints(turnResult.profileHints);

    // Apply natural leverage gains + passive tick
    this.tickPlayerLeverage(turnResult.profileHints);

    // Record chronicle events from this turn
    this.recordChronicleEvents(turnResult);

    // Faction agency: factions evaluate state and take actions
    this.tickFactionAgency();

    // Economy tick: baseline-seeking decay per district (v1.7)
    this.tickDistrictEconomies();

    // NPC agency: named NPCs evaluate state and take individual actions
    this.tickNpcAgencyTurn();

    // Item recognition: NPCs notice equipped items with provenance
    this.tickItemRecognition();

    // Companion zone following: if player moved zones, companions follow
    if (this.engine.world.locationId !== zoneBefore) {
      followPlayer(this.engine, this.partyState);
    }

    // Companion reactions to combat and district conditions
    if (this.partyState.companions.length > 0) {
      // Combat reactions
      const hasCombatWon = turnResult.events.some((e) => e.type === 'combat.entity.defeated');
      const hasCombatLost = turnResult.events.some(
        (e) => e.type === 'combat.entity.defeated' &&
          e.payload.entityId === this.engine.world.playerId,
      );
      if (hasCombatLost) {
        this.processCompanionReactions('combat-lost');
      } else if (hasCombatWon) {
        this.processCompanionReactions('combat-won');
      }

      // District mood reactions (at start of each turn)
      const playerDistrict = this.getPlayerDistrictId();
      if (playerDistrict) {
        const dState = getDistrictState(this.engine.world, playerDistrict);
        const dDef = getDistrictDefinition(this.engine.world, playerDistrict);
        if (dState && dDef) {
          const mood = computeDistrictMood(dState, dDef.tags);
          if (mood.tone === 'grim' || mood.tone === 'oppressive') {
            this.processCompanionReactions('district-grim');
          } else if (mood.tone === 'prosperous') {
            this.processCompanionReactions('district-prosperous');
          }
        }
      }
    }

    // Propagate existing rumors to new factions
    this.propagateRumors();

    // Evaluate and tick world pressures
    this.evaluateAndTickPressures();

    // Evaluate and tick opportunities (v1.9)
    this.evaluateAndTickOpportunities();

    // Arc detection + endgame evaluation (v2.0)
    this.tickArcDetection();
    this.evaluateEndgameTrigger();

    // Process opportunity actions from this turn (accept/decline/complete/etc.)
    this.processOpportunityAction(turnResult);

    // Move advisor + contextual suggestions
    const leverageStatus = this.profile
      ? formatLeverageStatus(getLeverageState(this.profile.custom))
      : undefined;
    let suggestions: ReturnType<typeof generateSuggestions> | undefined;
    if (this.profile) {
      const recommendation = this.buildMoveRecommendation();
      // Economy + crafting flags for contextual suggestions
      const hasSupplyCrisis = this.activePressures.some((p) => p.kind === 'supply-crisis');
      const hasBlackMarket = [...this.districtEconomies.values()].some((e) => e.blackMarketActive);
      const hasCraftingShortage = this.activePressures.some((p) => p.kind === 'crafting-shortage');
      const matInventory = getMaterialInventory(this.profile.custom);
      const hasCraftableMaterials = Object.values(matInventory).some((v) => v >= 2);
      suggestions = generateSuggestions({
        turnCount: this.profile.totalTurns,
        leverageState: getLeverageState(this.profile.custom),
        activePressures: this.activePressures,
        lastVerb: turnResult.interpreted.verb,
        lastLeverageResolution: this.lastLeverageResolution,
        recommendation,
        hasUsedLeverage: this.hasEverUsedLeverage(),
        recentMilestone: !!turnResult.profileHints.milestoneTriggered,
        hasSupplyCrisis,
        hasBlackMarket,
        hasCraftingShortage,
        hasCraftableMaterials,
        hasNewOpportunity: this.activeOpportunities.some((o) => o.status === 'available' && o.createdAtTick === this.engine.tick),
        hasExpiringOpportunity: this.activeOpportunities.some((o) => o.status === 'available' && o.turnsRemaining != null && o.turnsRemaining <= 3),
        hasStaleAcceptedOpportunity: this.activeOpportunities.some((o) => o.status === 'accepted' && o.acceptedAtTick != null && this.engine.tick - o.acceptedAtTick >= 4),
        hasEndgameDetected: this.endgameTriggers.some((t) => !t.acknowledged),
        endgameTriggerCount: this.endgameTriggers.filter((t) => !t.acknowledged).length,
      });
    }

    return renderPlayOutput({
      narration: turnResult.narration,
      dialogue: turnResult.dialogue,
      world: this.engine.world,
      availableActions: this.engine.getAvailableActions(),
      profileStatus: this.getStatusData() ?? undefined,
      leverageStatus,
      partyStatusLine: buildPartyStatusLine(this.partyState, this.engine.world),
      suggestions,
      hasEndgameTriggers: this.endgameTriggers.some((t) => !t.acknowledged),
    });
  }

  /** Universal title evolutions based on milestone tags. */
  private getTitleEvolutions(): TitleEvolution[] {
    return getTitleEvolutions();
  }

  /** Propagate existing rumors to new factions (max 3 per turn). */
  private propagateRumors(): void {
    this.playerRumors = _propagateRumors(this.playerRumors, this.engine.world, this.partyState);
  }

  /** Get the district ID the player is currently in. */
  private getPlayerDistrictId(): string | undefined {
    return _getPlayerDistrictId(this.engine.world);
  }

  /** Get a compact district mood descriptor for the narrator. */
  private getDistrictDescriptor(): string | undefined {
    return _getDistrictDescriptor(this.engine.world);
  }

  /** Get a compact party presence string for the narrator. */
  private getPartyPresence(): string | undefined {
    return _getPartyPresence(this.engine.world, this.partyState);
  }

  /** Get economy context for narrator (~10-15 tokens). */
  private getEconomyContext(): string | undefined {
    return _getEconomyContext(this.engine.world, this.districtEconomies);
  }

  /** Build crafting context string describing notable crafted/modified gear (v1.8). */
  private getCraftingContext(): string | undefined {
    return _getCraftingContext(this.profile, this.itemCatalog);
  }

  /** Get the faction that controls the player's current zone (for witnessing). */
  private getPlayerZoneFaction(): string | undefined {
    return _getPlayerZoneFaction(this.engine.world);
  }

  /** Format visible pressures + faction agency hints for narrator prompt injection. */
  private getVisiblePressureContext(): string[] | undefined {
    return _getVisiblePressureContext(
      this.activePressures,
      this.lastFactionActions,
      this.lastNpcActions,
      this.lastNpcProfiles,
      this.engine.world,
      this.engine.world.playerId,
      this.lastLeverageResolution,
    );
  }

  /** Tick existing pressures, process expired → fallout, evaluate for new ones. */
  private evaluateAndTickPressures(): void {
    // Tick: returns active + expired
    const tickResult = tickPressures(this.activePressures, this.engine.tick);
    this.activePressures = tickResult.active;

    // Process expired pressures → fallout
    for (const expired of tickResult.expired) {
      this.resolvePressure(expired, 'expired-ignored', 'expiry');
    }

    // Evaluate for new pressure (returns null most turns — scarcity by design)
    if (!this.profile) return;
    const inputs = this.buildPressureInputs();
    const result = evaluatePressures(inputs);
    if (result) {
      this.activePressures.push(result.pressure);
    }
  }

  /** Resolve a pressure and apply its fallout effects. */
  private resolvePressure(
    pressure: WorldPressure,
    resolutionType: ResolutionType,
    resolvedBy: string,
  ): void {
    const fallout = computeFallout(pressure, resolutionType, this.genre, {
      resolvedBy,
      currentTick: this.engine.tick,
      playerDistrictId: this.getPlayerDistrictId(),
    });

    // Record in chronicle
    const falloutSource: ChronicleEventSource = {
      kind: 'pressure-resolved',
      fallout,
      tick: this.engine.tick,
    };
    for (const entry of deriveChronicleEvents(falloutSource, this.engine.world.playerId)) {
      this.journal.record(entry);
    }

    this.applyFalloutEffects(fallout);
    this.resolvedPressures.push(fallout);

    // Companion reactions to pressure resolution
    if (this.partyState.companions.length > 0) {
      const isGood = resolutionType === 'resolved-by-player' || resolutionType === 'resolved-by-faction';
      this.processCompanionReactions(isGood ? 'pressure-resolved-well' : 'pressure-resolved-badly');
    }
  }

  /** Apply structured fallout effects to session state. */
  private applyFalloutEffects(fallout: PressureFallout): void {
    for (const effect of fallout.effects) {
      switch (effect.type) {
        case 'reputation':
          if (this.profile) {
            this.profile = adjustReputation(this.profile, effect.factionId, effect.delta);
          }
          break;

        case 'district':
          modifyDistrictMetric(
            this.engine.world,
            effect.districtId,
            effect.metric as 'alertPressure' | 'rumorDensity' | 'intruderLikelihood' | 'surveillance' | 'stability',
            effect.delta,
          );
          break;

        case 'rumor':
          if (this.profile) {
            this.addRumor(
              spawnPlayerRumor(
                { label: effect.claim, description: effect.claim, tags: [effect.valence] },
                this.profile,
                effect.spreadTo[0],
                this.getPlayerDistrictId(),
                this.engine.tick,
              ),
            );
          }
          break;

        case 'spawn-pressure': {
          const MAX_ACTIVE = 3;
          if (this.activePressures.length < MAX_ACTIVE) {
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
              currentTick: this.engine.tick,
            });
            (chainPressure as WorldPressure & { chainedFrom?: string }).chainedFrom =
              fallout.resolution.pressureId;
            this.activePressures.push(chainPressure);
          }
          break;
        }

        case 'alert':
          // Alert changes applied through faction cognition if available
          break;

        case 'milestone-tag':
          // Tags recorded for title evolution consideration
          break;

        case 'title-trigger':
          // Trigger title evolution check with this tag
          if (this.profile) {
            const allTags = [
              ...this.profile.milestones.flatMap((m) => m.tags),
              effect.tag,
            ];
            const newTitle = evolveTitle(
              this.profile.custom.title as string | undefined,
              allTags,
              this.getTitleEvolutions(),
            );
            if (newTitle && newTitle !== this.profile.custom.title) {
              this.profile = {
                ...this.profile,
                custom: { ...this.profile.custom, title: newTitle },
              };
              console.log(`\n  Title evolved: "${newTitle}"\n`);
            }
          }
          break;

        case 'economy-shift':
          this.applyEconomyShiftEffect(effect.districtId, effect.category, effect.delta, effect.cause);
          break;
      }
    }
  }

  /** Assemble PressureInputs from current session state. */
  private buildPressureInputs(): PressureInputs {
    return _buildPressureInputs(
      this.engine.world, this.profile, this.playerRumors,
      this.activePressures, this.genre, this.engine.tick, this.districtEconomies,
    );
  }

  // --- Opportunity System (v1.9) ---

  /** Assemble OpportunityInputs from current session state. */
  private buildOpportunityInputs(): OpportunityInputs {
    const factionIds = Object.keys(this.engine.world.factions);

    const playerReputations = factionIds.map((fid) => ({
      factionId: fid,
      value: this.profile ? getReputation(this.profile, fid) : 0,
    }));

    const factionStates: Record<string, { alertLevel: number; cohesion: number }> = {};
    for (const factionId of factionIds) {
      const fcog = getFactionCognition(this.engine.world, factionId);
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

    return {
      activeOpportunities: this.activeOpportunities,
      activePressures: this.activePressures,
      npcProfiles: this.lastNpcProfiles,
      npcObligations: this.npcObligations,
      factionStates,
      playerReputations,
      playerLeverage: this.profile ? getLeverageState(this.profile.custom) : { favor: 0, debt: 0, blackmail: 0, influence: 0, heat: 0, legitimacy: 0 },
      districtEconomies: this.districtEconomies,
      companions: this.partyState.companions,
      playerDistrictId: this.getPlayerDistrictId() ?? 'unknown',
      playerLevel: this.profile?.progression.level ?? 1,
      currentTick: this.engine.tick,
      genre: this.genre,
      totalTurns: this.profile?.totalTurns ?? 0,
    };
  }

  /** Tick existing opportunities and evaluate for new ones. */
  private evaluateAndTickOpportunities(): void {
    // Tick: decrement timers, expire overdue
    const tickResult = tickOpportunities(this.activeOpportunities, this.engine.tick);
    this.activeOpportunities = tickResult.active;

    // Process expired opportunities → fallout
    for (const expired of tickResult.expired) {
      this.resolveOpportunity(expired, 'expired');
    }

    // Evaluate for new opportunity
    if (!this.profile) return;
    const inputs = this.buildOpportunityInputs();
    const result = evaluateOpportunities(inputs);
    if (result) {
      this.activeOpportunities.push(result.opportunity);
    }
  }

  /** Process opportunity verb from a turn result. */
  private processOpportunityAction(turnResult: TurnResult): void {
    if (turnResult.interpreted.verb !== 'opportunity') return;
    const subAction = turnResult.interpreted.parameters?.subAction as string | undefined;
    if (!subAction) return;

    switch (subAction) {
      case 'accept': {
        const available = getAvailableOpportunities(this.activeOpportunities);
        if (available.length === 0) break;
        // Accept the first available (most recent)
        const target = available[available.length - 1];
        target.status = 'accepted';
        target.acceptedAtTick = this.engine.tick;
        // Chronicle
        const source: ChronicleEventSource = { kind: 'opportunity-accepted', opportunity: target, tick: this.engine.tick };
        for (const entry of deriveChronicleEvents(source, this.engine.world.playerId)) {
          this.journal.record(entry);
        }
        break;
      }
      case 'decline': {
        const available = getAvailableOpportunities(this.activeOpportunities);
        if (available.length === 0) break;
        const target = available[available.length - 1];
        this.resolveOpportunity(target, 'declined');
        break;
      }
      case 'abandon': {
        const accepted = getAcceptedOpportunities(this.activeOpportunities);
        if (accepted.length === 0) break;
        const target = accepted[accepted.length - 1];
        this.resolveOpportunity(target, 'abandoned');
        break;
      }
      case 'betray': {
        const accepted = getAcceptedOpportunities(this.activeOpportunities);
        if (accepted.length === 0) break;
        const target = accepted[accepted.length - 1];
        this.resolveOpportunity(target, 'betrayed');
        break;
      }
      case 'complete': {
        const accepted = getAcceptedOpportunities(this.activeOpportunities);
        if (accepted.length === 0) break;
        const target = accepted[accepted.length - 1];
        this.resolveOpportunity(target, 'completed');
        break;
      }
    }
  }

  /** Resolve an opportunity and apply its fallout effects. */
  private resolveOpportunity(
    opp: OpportunityState,
    resolutionType: OpportunityResolutionType,
  ): void {
    // Remove from active list
    this.activeOpportunities = this.activeOpportunities.filter((o) => o.id !== opp.id);

    // Update status
    opp.status = resolutionType === 'completed' ? 'completed'
      : resolutionType === 'failed' ? 'failed'
      : resolutionType === 'expired' ? 'expired'
      : resolutionType === 'declined' ? 'declined'
      : resolutionType === 'abandoned' ? 'abandoned'
      : resolutionType === 'betrayed' ? 'betrayed'
      : 'failed';
    opp.resolvedAtTick = this.engine.tick;

    // Compute fallout
    const fallout = computeOpportunityFallout(opp, resolutionType, {
      currentTick: this.engine.tick,
      playerDistrictId: this.getPlayerDistrictId(),
      genre: this.genre,
    });

    // Record chronicle
    const chronicleKind =
      resolutionType === 'completed' ? 'opportunity-completed' as const
      : resolutionType === 'abandoned' ? 'opportunity-abandoned' as const
      : resolutionType === 'betrayed' ? 'opportunity-betrayed' as const
      : resolutionType === 'expired' ? 'opportunity-expired' as const
      : 'opportunity-failed' as const;
    const source: ChronicleEventSource = { kind: chronicleKind, opportunity: opp, tick: this.engine.tick };
    for (const entry of deriveChronicleEvents(source, this.engine.world.playerId)) {
      this.journal.record(entry);
    }

    // Apply fallout effects
    this.applyOpportunityFalloutEffects(fallout);
    this.resolvedOpportunities.push(fallout);
  }

  /** Apply structured opportunity fallout effects to session state. */
  private applyOpportunityFalloutEffects(fallout: OpportunityFallout): void {
    for (const effect of fallout.effects) {
      switch (effect.type) {
        case 'reputation':
          if (this.profile) {
            this.profile = adjustReputation(this.profile, effect.factionId, effect.delta);
          }
          break;
        case 'leverage':
          if (this.profile) {
            this.profile = {
              ...this.profile,
              custom: applyLeverageDeltas(this.profile.custom, { [effect.currency]: effect.delta }),
            };
          }
          break;
        case 'heat':
          if (this.profile) {
            this.profile = {
              ...this.profile,
              custom: applyLeverageDeltas(this.profile.custom, { heat: effect.delta }),
            };
          }
          break;
        case 'rumor':
          if (this.profile) {
            this.addRumor(
              spawnPlayerRumor(
                { label: effect.claim, description: effect.claim, tags: [effect.valence] },
                this.profile,
                effect.spreadTo[0],
                this.getPlayerDistrictId(),
                this.engine.tick,
              ),
            );
          }
          break;
        case 'spawn-pressure': {
          const MAX_ACTIVE = 3;
          if (this.activePressures.length < MAX_ACTIVE) {
            const chainPressure = makePressure({
              kind: effect.kind,
              sourceFactionId: effect.sourceFactionId,
              description: effect.description,
              triggeredBy: `opportunity:${fallout.resolution.opportunityKind}`,
              urgency: effect.urgency,
              visibility: 'known',
              turnsRemaining: 10,
              potentialOutcomes: [],
              tags: effect.tags,
              currentTick: this.engine.tick,
            });
            this.activePressures.push(chainPressure);
          }
          break;
        }
        case 'obligation': {
          const counterparty = effect.direction === 'npc-owes-player'
            ? this.engine.world.playerId
            : effect.npcId;
          const obl = createObligation(
            effect.kind, effect.direction, effect.npcId, counterparty,
            effect.magnitude, `opportunity-${fallout.resolution.resolutionType}`,
            this.engine.tick,
          );
          const ledger = this.npcObligations.get(effect.npcId) ?? { obligations: [] };
          this.npcObligations.set(effect.npcId, addObligation(ledger, obl));
          break;
        }
        case 'npc-relationship':
          // Applied through NPC cognition system
          break;
        case 'companion-morale':
          if (this.partyState.companions.some((c) => c.npcId === effect.npcId)) {
            this.partyState = adjustCompanionMorale(this.partyState, effect.npcId, effect.delta);
          }
          break;
        case 'alert':
          // Alert changes through faction cognition
          break;
        case 'economy-shift':
          this.applyEconomyShiftEffect(effect.districtId, effect.category, effect.delta, effect.cause);
          break;
        case 'milestone-tag':
          if (this.profile) {
            this.profile = recordMilestone(this.profile, {
              label: effect.tag,
              description: `Achievement: ${effect.tag}`,
              at: `turn-${this.engine.tick}`,
              tags: [effect.tag],
            });
          }
          break;
        case 'title-trigger':
          if (this.profile) {
            const allTags = [
              ...this.profile.milestones.flatMap((m) => m.tags),
              effect.tag,
            ];
            const newTitle = evolveTitle(
              this.profile.custom.title as string | undefined,
              allTags,
              this.getTitleEvolutions(),
            );
            if (newTitle && newTitle !== this.profile.custom.title) {
              this.profile = {
                ...this.profile,
                custom: { ...this.profile.custom, title: newTitle },
              };
              console.log(`\n  Title evolved: "${newTitle}"\n`);
            }
          }
          break;
        case 'materials':
        case 'spawn-opportunity':
          // Materials don't apply from resolution (they're rewards for completing)
          // Spawn-opportunity would add to activeOpportunities — deferred to NPC agency
          break;
      }
    }
  }

  /** Get compact opportunity context string for narrator (~20 tokens). */
  getOpportunityContext(): string | undefined {
    return _getOpportunityContext(this.activeOpportunities);
  }

  // --- v2.0: Arc Detection & Endgame ---

  /** Assemble ArcInputs from current session state. */
  private buildArcInputs(): ArcInputs {
    return _buildArcInputs(
      this.engine.world, this.profile, this.activePressures,
      this.lastNpcProfiles, this.npcObligations, this.partyState,
      this.districtEconomies, this.activeOpportunities,
      this.resolvedPressures, this.resolvedOpportunities,
      this.engine.tick, this.fastMode,
    );
  }

  /** Evaluate arc signals and update snapshot. */
  private tickArcDetection(): void {
    if (!this.profile) return;
    const inputs = this.buildArcInputs();
    this.arcSnapshot = buildArcSnapshot(inputs, this.arcSnapshot ?? undefined);
  }

  /** Evaluate endgame trigger conditions. */
  private evaluateEndgameTrigger(): void {
    if (!this.profile || !this.arcSnapshot) return;
    const player = this.engine.world.entities[this.engine.world.playerId];
    const inputs: EndgameInputs = {
      ...this.buildArcInputs(),
      arcSnapshot: this.arcSnapshot,
      playerHp: player?.resources?.hp ?? 0,
      playerMaxHp: player?.resources?.maxHp ?? 100,
      previousTriggers: this.endgameTriggers,
    };
    const trigger = evaluateEndgame(inputs);
    if (trigger) {
      this.endgameTriggers.push(trigger);
      // Record in chronicle
      this.journal.record({
        tick: this.engine.tick,
        category: 'endgame-detected',
        actorId: 'world',
        description: `Endgame detected: ${trigger.resolutionClass} — ${trigger.reason}`,
        significance: 0.9,
        witnesses: [],
        data: { resolutionClass: trigger.resolutionClass },
      });
    }
  }

  /** Get compact arc context for narrator (~15 tokens). */
  getArcContext(): string | undefined {
    return _getArcContext(this.arcSnapshot);
  }

  /** Get endgame turning-point context for narrator. */
  getEndgameContext(): string | undefined {
    return _getEndgameContext(this.endgameTriggers);
  }

  /** Build the finale outline from current campaign state. */
  buildFinale(): FinaleOutline {
    const outline = buildFinaleFromState(
      this.engine.world, this.profile, this.journal,
      this.arcSnapshot, this.endgameTriggers, this.partyState,
      this.lastNpcProfiles, this.districtEconomies, this.engine.tick,
    );

    this.finaleOutline = outline;

    // Record campaign-concluded in chronicle
    const resolutionClass = this.endgameTriggers.length > 0
      ? this.endgameTriggers[this.endgameTriggers.length - 1].resolutionClass
      : 'quiet-retirement';
    const dominantArc = this.arcSnapshot?.dominantArc ?? null;
    this.journal.record({
      tick: this.engine.tick,
      category: 'campaign-concluded',
      actorId: 'world',
      description: `Campaign concluded: ${resolutionClass}`,
      significance: 1.0,
      witnesses: [],
      data: { resolutionClass, dominantArc },
    });

    return outline;
  }

  /** Handle /conclude: build finale, generate LLM epilogue, return formatted. */
  async handleConclude(): Promise<string> {
    const outline = this.buildFinale();

    // Mark all triggers as acknowledged and campaign as completed
    for (const trigger of this.endgameTriggers) {
      trigger.acknowledged = true;
    }
    this.campaignStatus = 'completed';

    // Generate LLM epilogue
    const result = await generateFinaleNarration({
      client: this.client,
      outline,
      genre: this.genre,
      characterName: this.profile?.build.name,
    });

    return renderConcludeOutput(result);
  }

  /** Browse completed campaign archive. */
  async handleArchive(): Promise<string> {
    const campaigns = await listArchivedCampaigns();
    return renderArchiveBrowser(campaigns);
  }

  /** Export campaign chronicle or finale as markdown/JSON. */
  async handleExport(args: string[]): Promise<string> {
    const format = args[0]?.toLowerCase();

    if (format === 'finale') {
      if (this.campaignStatus !== 'completed' || !this.finaleOutline) {
        return '  No finale available — use /conclude to complete your campaign first.';
      }
      const md = exportFinaleMarkdown(
        this.finaleOutline,
        undefined,
        this.genre,
        this.title,
      );
      const filename = `${sanitizeFilename(this.title)}-finale-${Date.now()}.md`;
      const filepath = await writeExport(filename, md);
      return `  Finale exported to ${filepath}`;
    }

    if (format === 'json') {
      const sessionData = this.buildSavedSessionSnapshot();
      const data = exportChronicleJSON(sessionData);
      const filename = `${sanitizeFilename(this.title)}-${Date.now()}.json`;
      const filepath = await writeExport(filename, JSON.stringify(data, null, 2));
      return `  Chronicle exported to ${filepath}`;
    }

    if (format === 'md' || !format) {
      const sessionData = this.buildSavedSessionSnapshot();
      const md = exportChronicleMarkdown(sessionData);
      const filename = `${sanitizeFilename(this.title)}-${Date.now()}.md`;
      const filepath = await writeExport(filename, md);
      return `  Chronicle exported to ${filepath}`;
    }

    return '  Usage: /export md | /export json | /export finale';
  }

  /** Build a lightweight SavedSession snapshot for export (no engine serialization needed). */
  private buildSavedSessionSnapshot(): import('./session/session.js').SavedSession {
    return {
      version: '1.4.0',
      engineState: '',
      turnHistory: this.history.toJSON(),
      tone: this.tone,
      savedAt: new Date().toISOString(),
      packId: undefined,
      characterName: this.profile?.build.name,
      characterLevel: this.profile?.progression.level,
      characterTitle: this.profile?.custom.title as string | undefined,
      genre: this.genre,
      chronicleRecords: this.journal.size() > 0
        ? JSON.stringify(this.journal.serialize())
        : undefined,
      arcSnapshot: this.arcSnapshot
        ? JSON.stringify(this.arcSnapshot)
        : undefined,
      finaleOutline: this.finaleOutline
        ? JSON.stringify(this.finaleOutline)
        : undefined,
      campaignStatus: this.campaignStatus,
      partyState: this.partyState.companions.length > 0
        ? JSON.stringify(this.partyState)
        : undefined,
    };
  }

  /** Get the "thinking" indicator. */
  getThinking(): string {
    return renderThinkingIndicator();
  }

  /** Record chronicle events derived from a turn result. */
  private recordChronicleEvents(turnResult: TurnResult): void {
    const source: ChronicleEventSource = {
      kind: 'turn',
      events: turnResult.events,
      hints: turnResult.profileHints,
      tick: this.engine.tick,
      zoneId: this.engine.world.locationId,
    };

    const derived = deriveChronicleEvents(source, this.engine.world.playerId);
    for (const entry of derived) {
      this.journal.record(entry);
    }

    // Item chronicle: record acquisitions
    for (const event of turnResult.events) {
      if (event.type === 'item.acquired' && this.profile) {
        const itemId = event.payload.itemId as string;
        const itemDef = this.itemCatalog?.items.find((i) => i.id === itemId);
        const itemName = itemDef?.name ?? itemId;
        this.profile = {
          ...this.profile,
          itemChronicle: recordItemEvent(this.profile.itemChronicle, itemId, {
            event: 'acquired',
            detail: `Acquired in ${this.engine.world.locationId}`,
            zoneId: this.engine.world.locationId,
          }, this.engine.tick),
        };
        // Record campaign chronicle event
        const acqSource: ChronicleEventSource = {
          kind: 'item-acquired',
          itemId,
          itemName,
          source: this.engine.world.locationId,
          tick: this.engine.tick,
        };
        for (const entry of deriveChronicleEvents(acqSource, this.engine.world.playerId)) {
          this.journal.record(entry);
        }
      }
    }

    // Companion-specific chronicle events from combat
    for (const event of turnResult.events) {
      if (event.type === 'combat.companion.intercepted') {
        const npcId = event.payload.interceptorId as string;
        const npcName = event.payload.interceptorName as string ?? npcId;
        const savedSource: ChronicleEventSource = {
          kind: 'companion-saved-player',
          npcId,
          npcName,
          tick: this.engine.tick,
        };
        for (const entry of deriveChronicleEvents(savedSource, this.engine.world.playerId)) {
          this.journal.record(entry);
        }
      }
      if (event.type === 'combat.entity.defeated') {
        const entityId = event.payload.entityId as string;
        if (entityId && isCompanion(this.partyState, entityId)) {
          const npcName = event.payload.entityName as string ?? entityId;
          const diedSource: ChronicleEventSource = {
            kind: 'companion-died',
            npcId: entityId,
            npcName,
            tick: this.engine.tick,
          };
          for (const entry of deriveChronicleEvents(diedSource, this.engine.world.playerId)) {
            this.journal.record(entry);
          }
          // Remove from party
          this.handleCompanionDeparture(entityId, 'fell in battle');
        }

        // Item chronicle: record used-in-kill on equipped weapon
        if (entityId && entityId !== this.engine.world.playerId && !isCompanion(this.partyState, entityId) && this.profile) {
          const weaponId = this.profile.loadout.equipped.weapon;
          if (weaponId) {
            const entityName = (event.payload.entityName as string) ?? entityId;
            this.profile = {
              ...this.profile,
              itemChronicle: recordItemEvent(this.profile.itemChronicle, weaponId, {
                event: 'used-in-kill',
                detail: `Slew ${entityName}`,
                zoneId: this.engine.world.locationId,
              }, this.engine.tick),
            };
          }
        }
      }
    }
  }

  // --- v1.7: Economy ---

  /** Initialize district economies from genre + district tags. */
  private initializeDistrictEconomies(): void {
    this.districtEconomies = initializeDistrictEconomies(this.engine.world, this.genre);
  }

  /** Tick all district economies — baseline-seeking decay, stability modulation. */
  private tickDistrictEconomies(): void {
    _tickDistrictEconomies(this.districtEconomies, this.engine.world, this.engine.tick);
  }

  /** Apply an economy-shift effect to a district's economy. */
  private applyEconomyShiftEffect(
    districtId: string,
    category: string,
    delta: number,
    cause: string,
  ): void {
    applyEconomyShiftToMap(this.districtEconomies, districtId, category, delta, cause);
  }

  /** Faction agency: factions evaluate state and take strategic actions. */
  private tickFactionAgency(): void {
    if (!this.profile) return;

    const factionIds = Object.keys(this.engine.world.factions);
    if (factionIds.length === 0) {
      this.lastFactionActions = [];
      this.lastFactionProfiles = [];
      return;
    }

    // Build reputation array from profile
    const playerReputations = factionIds.map((factionId) => ({
      factionId,
      value: getReputation(this.profile!, factionId),
    }));

    // Run faction agency tick (builds profiles, evaluates, resolves)
    const results = runFactionAgencyTick(
      this.engine.world,
      playerReputations,
      this.activePressures,
      this.engine.tick,
      this.districtEconomies,
    );

    // Build profiles for director view (even if no actions were taken)
    this.lastFactionProfiles = factionIds.map((factionId) => {
      const rep = playerReputations.find((r) => r.factionId === factionId)?.value ?? 0;
      return buildFactionProfile(factionId, this.engine.world, rep, this.activePressures, this.districtEconomies);
    });

    // Apply effects from each faction action
    for (const result of results) {
      this.applyFactionEffects(result);

      // Record in chronicle
      const source: ChronicleEventSource = {
        kind: 'faction-action',
        action: result.action,
        tick: this.engine.tick,
      };
      for (const entry of deriveChronicleEvents(source, this.engine.world.playerId)) {
        this.journal.record(entry);
      }
    }

    this.lastFactionActions = results;
  }

  /** Apply effects from a faction action to session state. */
  private applyFactionEffects(result: FactionActionResult): void {
    for (const effect of result.effects) {
      switch (effect.type) {
        case 'district-metric':
          modifyDistrictMetric(
            this.engine.world,
            effect.districtId,
            effect.metric,
            effect.delta,
          );
          break;

        case 'reputation':
          if (this.profile) {
            this.profile = adjustReputation(this.profile, effect.factionId, effect.delta);
          }
          break;

        case 'rumor':
          if (this.profile) {
            this.addRumor(
              spawnPlayerRumor(
                { label: effect.claim, description: effect.claim, tags: [effect.valence] },
                this.profile,
                effect.targetFactionIds[0],
                this.getPlayerDistrictId(),
                this.engine.tick,
              ),
            );
          }
          break;

        case 'pressure': {
          const MAX_ACTIVE = 3;
          if (this.activePressures.length < MAX_ACTIVE) {
            this.activePressures.push(makePressure({
              kind: effect.kind,
              sourceFactionId: effect.sourceFactionId,
              description: effect.description,
              triggeredBy: `faction-agency:${result.action.verb}`,
              urgency: effect.urgency,
              visibility: 'hidden',
              turnsRemaining: 8,
              potentialOutcomes: [],
              tags: ['faction-agency'],
              currentTick: this.engine.tick,
            }));
          }
          break;
        }

        case 'cohesion': {
          const cog = getFactionCognition(this.engine.world, effect.factionId);
          cog.cohesion = Math.max(0, Math.min(1, cog.cohesion + effect.delta));
          break;
        }

        case 'alert': {
          const cog = getFactionCognition(this.engine.world, effect.factionId);
          cog.alertLevel = Math.max(0, Math.min(100, cog.alertLevel + effect.delta));
          break;
        }

        case 'member-count':
          // Member count changes are tracked conceptually — no entity spawning in v0.9
          break;

        case 'economy-shift':
          this.applyEconomyShiftEffect(effect.districtId, effect.category, effect.delta, effect.cause);
          break;
      }
    }
  }

  // --- v1.2: NPC Agency ---

  /** NPC agency: named NPCs evaluate state and take individual actions. */
  private tickNpcAgencyTurn(): void {
    if (!this.profile) return;

    // Tick obligation decay
    for (const [npcId, ledger] of this.npcObligations) {
      this.npcObligations.set(npcId, tickObligations(ledger));
    }

    // Run NPC agency tick (builds profiles, evaluates, resolves)
    const results = tickNpcAgency(
      this.engine,
      this.activePressures,
      this.playerRumors,
      this.npcObligations,
    );

    // Build profiles for director view (even if no actions were taken)
    this.lastNpcProfiles = buildNpcProfilesForDirector(
      this.engine,
      this.activePressures,
      this.playerRumors,
      this.npcObligations,
    );

    // Apply effects from each NPC action
    for (const result of results) {
      this.profile = applyNpcEffects(result, {
        profile: this.profile!,
        playerRumors: this.playerRumors,
        activePressures: this.activePressures,
        engine: this.engine,
        getPlayerDistrictId: () => this.getPlayerDistrictId(),
        npcObligations: this.npcObligations,
        activeOpportunities: this.activeOpportunities,
        genre: this.genre,
      });

      // Record in chronicle
      const npcEntity = this.engine.world.entities[result.action.npcId];
      const npcName = npcEntity?.name ?? result.action.npcId;
      const source: ChronicleEventSource = {
        kind: 'npc-action',
        action: result.action,
        npcName,
        tick: this.engine.tick,
      };
      for (const entry of deriveChronicleEvents(source, this.engine.world.playerId)) {
        this.journal.record(entry);
      }

      // Record obligation events in chronicle
      for (const effect of result.effects) {
        if (effect.type === 'obligation') {
          const oblSource: ChronicleEventSource = {
            kind: 'obligation-created',
            obligation: {
              id: `obl-${result.action.npcId}-${this.engine.tick}`,
              kind: effect.kind,
              direction: effect.direction,
              npcId: effect.npcId,
              counterpartyId: effect.counterpartyId,
              magnitude: effect.magnitude,
              sourceTag: effect.sourceTag,
              createdAtTick: this.engine.tick,
              decayTurns: effect.decayTurns,
            },
            npcName,
            tick: this.engine.tick,
          };
          for (const entry of deriveChronicleEvents(oblSource, this.engine.world.playerId)) {
            this.journal.record(entry);
          }
        }
      }
    }

    // --- Consequence chain management ---

    // Evaluate breakpoint shifts for consequence triggers
    for (const profile of this.lastNpcProfiles) {
      const prevBp = this.previousBreakpoints.get(profile.npcId);
      if (prevBp && prevBp !== profile.breakpoint) {
        // Breakpoint shifted — check for consequence trigger
        if (!this.activeConsequenceChains.has(profile.npcId)) {
          const oblLedger = this.npcObligations.get(profile.npcId);
          const kind = evaluateConsequenceChainTrigger(profile, prevBp, oblLedger);
          if (kind) {
            const chain = buildConsequenceChain(
              profile.npcId, kind, `${prevBp} → ${profile.breakpoint}`, this.engine.tick,
            );
            this.activeConsequenceChains.set(profile.npcId, chain);
          }
        }
      }
      // Store current breakpoint for next turn comparison
      this.previousBreakpoints.set(profile.npcId, profile.breakpoint);
    }

    // Tick and resolve active consequence chains
    for (const [npcId, chain] of this.activeConsequenceChains) {
      let updated = tickConsequenceChain(chain);
      if (shouldResolveChainStep(updated)) {
        const stepResult = resolveConsequenceChainStep(updated);
        if (stepResult) {
          updated = stepResult.chain;
          // Force the NPC action through existing resolution pipeline
          const npcEntity = this.engine.world.entities[npcId];
          const npcName = npcEntity?.name ?? npcId;
          const forcedAction = {
            npcId,
            verb: stepResult.verb,
            targetEntityId: this.engine.world.playerId,
            description: `${npcName} ${stepResult.description}`,
          };
          const forcedResult = {
            action: forcedAction,
            effects: [], // Chain steps use existing NPC action resolution
            narratorHint: `${npcName} ${stepResult.description}`,
            dialogueHint: undefined,
          };
          // Record chain step in chronicle
          const chainSource: ChronicleEventSource = {
            kind: 'npc-action',
            action: forcedAction,
            npcName,
            tick: this.engine.tick,
          };
          for (const entry of deriveChronicleEvents(chainSource, this.engine.world.playerId)) {
            this.journal.record(entry);
          }
          results.push(forcedResult);

          // Companion reactions to consequence chain events
          if (this.partyState.companions.length > 0 && (chain.kind === 'vendetta' || chain.kind === 'retaliation')) {
            this.processCompanionReactions('betrayal-witnessed');
          }

          // District drift from consequence chain resolution
          const npcDistrictId = npcEntity?.zoneId ? getDistrictForZone(this.engine.world, npcEntity.zoneId) : undefined;
          if (npcDistrictId) {
            switch (chain.kind) {
              case 'retaliation':
              case 'vendetta':
                modifyDistrictMetric(this.engine.world, npcDistrictId, 'alertPressure', 5);
                modifyDistrictMetric(this.engine.world, npcDistrictId, 'morale', -3);
                break;
              case 'extortion':
                modifyDistrictMetric(this.engine.world, npcDistrictId, 'commerce', -3);
                modifyDistrictMetric(this.engine.world, npcDistrictId, 'morale', -2);
                break;
              case 'abandonment':
                modifyDistrictMetric(this.engine.world, npcDistrictId, 'commerce', -3);
                break;
              case 'plea':
                modifyDistrictMetric(this.engine.world, npcDistrictId, 'morale', -1);
                break;
              case 'sacrifice':
                modifyDistrictMetric(this.engine.world, npcDistrictId, 'morale', 3);
                break;
            }
          }
        }
      }
      this.activeConsequenceChains.set(npcId, updated);
      // Clean up resolved chains
      if (updated.resolved) {
        this.activeConsequenceChains.delete(npcId);
      }
    }

    this.lastNpcActions = results;
  }

  // --- v1.6: Item Recognition ---

  /** Evaluate item recognition: NPCs in the player's zone notice equipped items. */
  private tickItemRecognition(): void {
    if (!this.profile || !this.itemCatalog) return;

    // Build list of equipped ItemDefinitions
    const equippedItems: ItemDefinition[] = [];
    for (const slot of EQUIPMENT_SLOTS) {
      const itemId = this.profile.loadout.equipped[slot];
      if (!itemId) continue;
      const item = this.itemCatalog.items.find((i) => i.id === itemId);
      if (item?.provenance) equippedItems.push(item);
    }
    if (equippedItems.length === 0) return;

    // Find NPCs in the player's zone (use lastNpcProfiles which are already built)
    const playerZone = this.engine.world.locationId;
    const npcsInZone = this.lastNpcProfiles.filter((p) => {
      const entity = this.engine.world.entities[p.npcId];
      return entity?.zoneId === playerZone;
    });
    if (npcsInZone.length === 0) return;

    for (const npcProfile of npcsInZone) {
      // Perception clarity derived from relationship — hostile NPCs are more vigilant
      const clarity = npcProfile.breakpoint === 'hostile' ? 0.8
        : npcProfile.breakpoint === 'wavering' ? 0.5
        : npcProfile.breakpoint === 'compromised' ? 0.4
        : npcProfile.breakpoint === 'favorable' ? 0.2
        : 0.1; // allied — minimal scrutiny

      const recognitions = evaluateItemRecognition(
        equippedItems, npcProfile.factionId ?? undefined,
        this.profile!.itemChronicle, this.engine.tick,
      );

      for (const recognition of recognitions) {
        // Probability gate — not every NPC notices every item every turn
        const notoriety = recognition.stanceDelta !== 0
          ? Math.abs(recognition.stanceDelta) / 10
          : 0.5;
        if (!shouldRecognize(clarity, notoriety)) continue;

        // 1. Record item chronicle entry
        const npcName = npcProfile.name;
        this.profile = {
          ...this.profile!,
          itemChronicle: recordItemEvent(this.profile!.itemChronicle, recognition.itemId, {
            event: 'recognized',
            detail: `Recognized by ${npcName}`,
            zoneId: playerZone,
          }, this.engine.tick),
        };

        // 2. Record campaign chronicle event
        const recogSource: ChronicleEventSource = {
          kind: 'item-recognized',
          itemId: recognition.itemId,
          itemName: recognition.itemName,
          recognizedBy: npcName,
          tick: this.engine.tick,
        };
        for (const entry of deriveChronicleEvents(recogSource, this.engine.world.playerId)) {
          this.journal.record(entry);
        }

        // 3. Spawn rumor if recognition warrants it
        if (recognition.rumorClaim) {
          this.addRumor(
            spawnPlayerRumor(
              { label: recognition.rumorClaim, description: recognition.rumorClaim, tags: [recognition.recognitionType] },
              this.profile!,
              npcProfile.factionId ?? 'unknown',
              this.getPlayerDistrictId(),
              this.engine.tick,
            ),
          );
        }

        // 4. Companion reactions to item recognition
        if (this.partyState.companions.length > 0) {
          const reactionTrigger = `item-${recognition.recognitionType.replace('-item', '')}-recognized`;
          this.processCompanionReactions(reactionTrigger);
        }
      }
    }
  }

  // --- v1.0: Player Leverage ---

  /** Register thin verb handlers so leverage verbs appear in getAvailableActions(). */
  private registerLeverageVerbs(): void {
    const leverageVerbs = ['social', 'rumor', 'diplomacy', 'sabotage'] as const;
    for (const verb of leverageVerbs) {
      this.engine.dispatcher.registerVerb(verb, (action) => {
        // Thin handler: just produce an "attempted" event for game.ts to process
        return [{
          id: `leverage-${verb}-${Date.now()}`,
          type: `${verb}.action.attempted`,
          payload: {
            subAction: action.parameters?.subAction ?? 'unknown',
            targetIds: action.targetIds,
            parameters: action.parameters,
          },
          targetIds: action.targetIds ?? [],
          tick: 0,
        }];
      });
    }

    // Register craft verb (v1.8)
    this.engine.dispatcher.registerVerb('craft', (action) => {
      return [{
        id: `craft-${Date.now()}`,
        type: 'craft.action.attempted',
        payload: {
          subAction: action.parameters?.subAction ?? 'craft',
          recipeOrItem: action.parameters?.recipeOrItem ?? '',
          targetIds: action.targetIds,
        },
        targetIds: action.targetIds ?? [],
        tick: 0,
      }];
    });
  }

  /**
   * Process leverage actions from a turn result.
   * Called after executeTurn() — reads events for leverage attempts,
   * resolves them with full context, and applies effects.
   */
  private processLeverageAction(turnResult: TurnResult): void {
    if (!this.profile) return;

    // Find leverage event in turn results
    const leverageEvent = turnResult.events.find(
      (e) => e.type.endsWith('.action.attempted'),
    );
    if (!leverageEvent) {
      this.lastLeverageResolution = null;
      return;
    }

    const verb = leverageEvent.type.replace('.action.attempted', '');
    const subAction = leverageEvent.payload.subAction as string;
    const targetIds = (leverageEvent.payload.targetIds as string[] | undefined) ?? turnResult.interpreted.targetIds ?? [];
    const targetId = targetIds[0];

    // Resolve the target's faction
    const targetFactionId = targetId
      ? getEntityFaction(this.engine.world, targetId) ?? targetId
      : undefined;

    // Get current leverage state
    const leverageState = getLeverageState(this.profile.custom);
    const playerRep = targetFactionId
      ? getReputation(this.profile, targetFactionId)
      : 0;

    // Get faction cognition for target faction
    const factionCog = targetFactionId
      ? getFactionCognition(this.engine.world, targetFactionId)
      : undefined;

    // Cooldown check: 3 turns default (requirements have per-verb cooldowns,
    // but the min across all verbs is 2-3 turns — use 3 as universal check)
    const cooldownTurns = 3;
    if (!isCooldownReady(this.profile.custom, verb, subAction, this.engine.tick, cooldownTurns)) {
      this.lastLeverageResolution = {
        verb: verb as 'social' | 'rumor' | 'diplomacy' | 'sabotage',
        subAction,
        targetId,
        targetFactionId,
        effects: [],
        narratorHint: '',
        success: false,
        failReason: 'That action is not available yet',
      };
      return;
    }

    // Resolve based on verb type
    let resolution: LeverageResolution;
    switch (verb) {
      case 'social':
        if (!isPlayerSocialVerb(subAction)) {
          this.lastLeverageResolution = null;
          return;
        }
        resolution = resolveSocialAction(
          subAction,
          targetId,
          targetFactionId,
          leverageState,
          playerRep,
          factionCog ? { alertLevel: factionCog.alertLevel, cohesion: factionCog.cohesion } : undefined,
          this.engine.tick,
        );
        break;

      case 'rumor':
        if (!isPlayerRumorVerb(subAction)) {
          this.lastLeverageResolution = null;
          return;
        }
        resolution = resolveRumorAction(
          subAction,
          targetFactionId,
          leverageState,
          this.engine.tick,
        );
        break;

      case 'diplomacy':
        if (!isPlayerDiplomacyVerb(subAction) || !targetFactionId) {
          this.lastLeverageResolution = null;
          return;
        }
        resolution = resolveDiplomacyAction(
          subAction,
          targetFactionId,
          leverageState,
          playerRep,
          factionCog ? { alertLevel: factionCog.alertLevel, cohesion: factionCog.cohesion } : undefined,
          this.engine.tick,
        );
        break;

      case 'sabotage':
        if (!isPlayerSabotageVerb(subAction)) {
          this.lastLeverageResolution = null;
          return;
        }
        resolution = resolveSabotageAction(
          subAction,
          targetId,
          targetFactionId,
          leverageState,
          this.engine.tick,
        );
        break;

      default:
        this.lastLeverageResolution = null;
        return;
    }

    // Apply district modifiers to leverage costs
    const playerDistrictForLev = this.getPlayerDistrictId();
    if (playerDistrictForLev) {
      const dState = getDistrictState(this.engine.world, playerDistrictForLev);
      const dDef = getDistrictDefinition(this.engine.world, playerDistrictForLev);
      if (dState && dDef) {
        const mood = computeDistrictMood(dState, dDef.tags);
        const mods = computeDistrictModifiers(mood);
        for (const effect of resolution.effects) {
          if (effect.type === 'leverage' && effect.delta < 0) {
            effect.delta = Math.round(effect.delta * mods.leverageCostScale);
          }
        }
      }
    }

    // Apply companion ability modifiers to leverage costs
    if (this.partyState.companions.length > 0) {
      const partyAbilities = computePartyAbilities(this.partyState);
      if (partyAbilities.length > 0) {
        // Build companion faction map for faction-route ability
        const companionFactions: Record<string, string | null> = {};
        for (const comp of this.partyState.companions) {
          if (comp.active) {
            companionFactions[comp.npcId] = getEntityFaction(this.engine.world, comp.npcId) ?? null;
          }
        }
        const abilityMods = computeAbilityModifiers(partyAbilities, companionFactions);

        for (const effect of resolution.effects) {
          // Apply leverage cost discount (increase negative delta by discount amount)
          if (effect.type === 'leverage' && effect.delta < 0 && abilityMods.leverageCostDiscount > 0) {
            effect.delta = Math.min(0, effect.delta + abilityMods.leverageCostDiscount);
          }
          // Apply reputation bonus from faction-route
          if (effect.type === 'reputation' && effect.delta > 0 && abilityMods.reputationBonus[effect.factionId]) {
            effect.delta += abilityMods.reputationBonus[effect.factionId];
          }
          // Apply commerce gain bonus
          if (effect.type === 'leverage' && effect.delta > 0 && abilityMods.commerceGainBonus > 0) {
            effect.delta += abilityMods.commerceGainBonus;
          }
        }
      }
    }

    // Apply relationship modifiers to the resolution
    if (resolution.success && targetId) {
      const npcProfile = this.lastNpcProfiles.find((p) => p.npcId === targetId);
      if (npcProfile) {
        const oblLedger = this.npcObligations.get(targetId);
        const netWeight = oblLedger ? getNetObligationWeight(oblLedger, this.engine.world.playerId) : 0;
        const mods = computeRelationshipModifiers(
          npcProfile.breakpoint, npcProfile.dominantAxis, netWeight, npcProfile.relationship.trust,
        );

        // Scale resolution effects by relationship modifiers
        for (const effect of resolution.effects) {
          // Scale leverage costs (negative deltas = spending)
          if (effect.type === 'leverage' && effect.delta < 0) {
            effect.delta = Math.round(effect.delta * mods.costMultiplier);
          }
          // Scale reputation effects
          if (effect.type === 'reputation') {
            effect.delta = Math.round(effect.delta * mods.reputationMultiplier);
          }
          // Scale heat generation
          if (effect.type === 'heat') {
            effect.delta = Math.round(effect.delta * mods.rumorHeatMultiplier);
          }
        }

        // Side effect: bonus obligation (friendly) or penalty rep hit (hostile)
        const sideRoll = simpleHashNum(targetId + this.engine.tick) % 100;
        if (sideRoll < mods.sideEffectChance * 100) {
          if (npcProfile.breakpoint === 'allied' || npcProfile.breakpoint === 'favorable') {
            // Friendly side effect: NPC grants a bonus favor
            const ledger = this.npcObligations.get(targetId) ?? { obligations: [] };
            const obl = createObligation(
              'favor', 'npc-owes-player', targetId, this.engine.world.playerId,
              2, 'leverage-bonus', this.engine.tick, 15,
            );
            this.npcObligations.set(targetId, addObligation(ledger, obl));
          } else if (npcProfile.breakpoint === 'hostile' || npcProfile.breakpoint === 'compromised') {
            resolution.effects.push({
              type: 'reputation', factionId: npcProfile.factionId ?? '', delta: -5,
            });
          }
        }
      }
    }

    // Apply effects if successful
    if (resolution.success) {
      this.applyLeverageEffects(resolution);
      this.profile = {
        ...this.profile,
        custom: setCooldown(this.profile.custom, verb, subAction, this.engine.tick),
      };

      // Stats: track action usage
      const statKey = `stats.action.${verb}.${subAction}`;
      const prev = (this.profile.custom[statKey] as number) ?? 0;
      this.profile = {
        ...this.profile,
        custom: { ...this.profile.custom, [statKey]: prev + 1 },
      };

      // District drift from leverage actions
      if (playerDistrictForLev) {
        switch (verb) {
          case 'sabotage':
            modifyDistrictMetric(this.engine.world, playerDistrictForLev, 'stability', -3);
            modifyDistrictMetric(this.engine.world, playerDistrictForLev, 'alertPressure', 5);
            break;
          case 'diplomacy':
            modifyDistrictMetric(this.engine.world, playerDistrictForLev, 'morale', 3);
            modifyDistrictMetric(this.engine.world, playerDistrictForLev, 'alertPressure', -2);
            break;
          case 'rumor':
            modifyDistrictMetric(this.engine.world, playerDistrictForLev, 'rumorDensity', 3);
            break;
          case 'social':
            modifyDistrictMetric(this.engine.world, playerDistrictForLev, 'commerce', 2);
            break;
        }
      }
    }

    // Companion reactions to leverage actions
    if (this.partyState.companions.length > 0) {
      this.processCompanionReactions(`leverage-${verb}`);
    }

    this.lastLeverageResolution = resolution;
  }

  /** Apply structured effects from a leverage action to session state. */
  private applyLeverageEffects(resolution: LeverageResolution): void {
    if (!this.profile) return;

    for (const effect of resolution.effects) {
      switch (effect.type) {
        case 'reputation':
          this.profile = adjustReputation(this.profile, effect.factionId, effect.delta);
          break;

        case 'leverage':
          this.profile = {
            ...this.profile,
            custom: applyLeverageDeltas(this.profile.custom, { [effect.currency]: effect.delta }),
          };
          break;

        case 'heat': {
          this.profile = {
            ...this.profile,
            custom: applyLeverageDeltas(this.profile.custom, { heat: effect.delta }),
          };
          break;
        }

        case 'rumor':
          this.addRumor(
            spawnIntentionalRumor(
              effect.claim,
              effect.valence,
              effect.targetFactionIds[0],
              this.getPlayerDistrictId(),
              this.engine.tick,
            ),
          );
          break;

        case 'district-metric':
          modifyDistrictMetric(
            this.engine.world,
            effect.districtId,
            effect.metric,
            effect.delta,
          );
          break;

        case 'pressure': {
          const MAX_ACTIVE = 3;
          if (this.activePressures.length < MAX_ACTIVE) {
            this.activePressures.push(makePressure({
              kind: effect.kind,
              sourceFactionId: effect.sourceFactionId,
              description: effect.description,
              triggeredBy: `player-leverage:${resolution.subAction}`,
              urgency: effect.urgency,
              visibility: 'rumored',
              turnsRemaining: 8,
              potentialOutcomes: [],
              tags: ['player-leverage'],
              currentTick: this.engine.tick,
            }));
          }
          break;
        }

        case 'cohesion': {
          const cog = getFactionCognition(this.engine.world, effect.factionId);
          cog.cohesion = Math.max(0, Math.min(1, cog.cohesion + effect.delta));
          break;
        }

        case 'alert': {
          const cog = getFactionCognition(this.engine.world, effect.factionId);
          cog.alertLevel = Math.max(0, Math.min(100, cog.alertLevel + effect.delta));
          break;
        }

        case 'access':
          // Access level changes tracked on profile for reputation consequence override
          if (this.profile) {
            this.profile = {
              ...this.profile,
              custom: {
                ...this.profile.custom,
                [`access.${effect.factionId}`]: effect.level,
              },
            };
          }
          break;
      }
    }
  }

  /** Apply natural leverage gains from game events, and tick passive changes. */
  private tickPlayerLeverage(hints: ProfileUpdateHints): void {
    if (!this.profile) return;

    // Natural gains from game events
    const gains = computeLeverageGains(hints);
    if (Object.keys(gains).length > 0) {
      this.profile = {
        ...this.profile,
        custom: applyLeverageDeltas(this.profile.custom, gains),
      };

      // Stats: track currency gains
      for (const [currency, delta] of Object.entries(gains)) {
        if (delta > 0) {
          const gKey = `stats.leverage.${currency}.gained`;
          const prev: number = (this.profile.custom[gKey] as number) ?? 0;
          this.profile = {
            ...this.profile,
            custom: { ...this.profile.custom, [gKey]: prev + delta },
          };
        } else if (delta < 0) {
          const sKey = `stats.leverage.${currency}.spent`;
          const prev: number = (this.profile.custom[sKey] as number) ?? 0;
          this.profile = {
            ...this.profile,
            custom: { ...this.profile.custom, [sKey]: prev + Math.abs(delta) },
          };
        }
      }
    }

    // Passive tick: heat decay, influence recalculation
    const factionIds = Object.keys(this.engine.world.factions);
    const reputations = factionIds.map((factionId) => ({
      factionId,
      value: getReputation(this.profile!, factionId),
    }));
    this.profile = {
      ...this.profile,
      custom: tickLeverage(this.profile.custom, reputations),
    };
  }

  // --- v1.1: Cockpit helpers ---

  /** Build a StrategicMap from current session state. */
  private buildCurrentStrategicMap(): StrategicMap {
    return _buildCurrentStrategicMap(
      this.engine.world, this.profile, this.playerRumors,
      this.activePressures, this.lastFactionActions,
      this.districtEconomies, this.activeOpportunities,
    );
  }

  /** Build a MoveRecommendation from current session state. */
  private buildMoveRecommendation(): MoveRecommendation {
    return _buildMoveRecommendation(
      this.engine.world, this.profile, this.playerRumors,
      this.activePressures, this.lastFactionActions,
      this.districtEconomies, this.activeOpportunities,
      this.engine.tick,
    );
  }

  /** Check whether the player has ever used any leverage action. */
  private hasEverUsedLeverage(): boolean {
    return _hasEverUsedLeverage(this.profile);
  }

  // --- Companion Commands ---

  /** Handle /recruit <npc-id> [role] command. */
  private handleRecruit(args: string[]): string {
    const npcId = args[0];
    if (!npcId) return '  Usage: /recruit <npc-id> [role]';

    const entity = this.engine.world.entities[npcId];
    if (!entity) return `  Entity "${npcId}" not found.`;

    const roleArg = args[1] as CompanionRole | undefined;
    const role = roleArg ?? inferCompanionRole(entity);

    const result = recruitCompanion(
      this.engine,
      this.partyState,
      npcId,
      role,
      this.engine.tick,
    );

    if (!result.ok) return `  ${result.error}`;

    this.partyState = result.party;
    syncCompanionMorale(this.engine, this.partyState);

    // Record chronicle event
    const joinSource: ChronicleEventSource = {
      kind: 'companion-joined',
      npcId,
      npcName: entity.name,
      role,
      tick: this.engine.tick,
    };
    for (const entry of deriveChronicleEvents(joinSource, this.engine.world.playerId)) {
      this.journal.record(entry);
    }

    return `  ${entity.name} has joined your party as ${role}. (${this.partyState.companions.length}/${this.partyState.maxSize})`;
  }

  /** Handle /dismiss <npc-id> command. */
  private handleDismiss(npcId?: string): string {
    if (!npcId) return '  Usage: /dismiss <npc-id>';

    const entity = this.engine.world.entities[npcId];
    const name = entity?.name ?? npcId;

    const result = dismissCompanion(this.engine, this.partyState, npcId);
    if (!result.removed) return `  ${name} is not in your party.`;

    this.partyState = result.party;

    // Record chronicle event
    const dismissSource: ChronicleEventSource = {
      kind: 'companion-departed',
      npcId,
      npcName: name,
      reason: 'dismissed',
      tick: this.engine.tick,
    };
    for (const entry of deriveChronicleEvents(dismissSource, this.engine.world.playerId)) {
      this.journal.record(entry);
    }

    return `  ${name} has left your party.`;
  }

  /** Add a rumor, applying companion rumor-suppression if applicable. */
  private addRumor(rumor: PlayerRumor): void {
    this.playerRumors = _addRumor(rumor, this.playerRumors, this.partyState, this.engine.tick);
  }

  /** Process companion reactions to a trigger. Applies morale deltas and handles departures. */
  private processCompanionReactions(trigger: string): void {
    if (this.partyState.companions.length === 0) return;

    // Build breakpoint map for active companions
    const breakpoints = new Map<string, LoyaltyBreakpoint>();
    for (const comp of this.partyState.companions) {
      const profile = this.lastNpcProfiles.find((p) => p.npcId === comp.npcId);
      if (profile) breakpoints.set(comp.npcId, profile.breakpoint);
    }

    const reactions = evaluateCompanionReactions(
      this.partyState.companions,
      trigger,
      { breakpoints, tick: this.engine.tick },
    );

    this.lastCompanionReactions = reactions;

    for (const reaction of reactions) {
      this.partyState = adjustCompanionMorale(
        this.partyState, reaction.npcId, reaction.moraleDelta,
      );

      if (reaction.departure) {
        this.handleCompanionDeparture(
          reaction.npcId,
          reaction.departureReason ?? 'lost faith',
        );
      }
    }

    // Sync morale to entity custom fields for engine-side goal derivation
    syncCompanionMorale(this.engine, this.partyState);
  }

  // --- v1.8: Crafting ---

  /** Build crafting context from current session state. */
  private buildCraftingContext(): CraftingContext | null {
    if (!this.profile) return null;
    const districtId = this.getPlayerDistrictId();
    if (!districtId) return null;
    const economy = this.districtEconomies.get(districtId) ?? createDistrictEconomy(this.genre);
    const dState = getDistrictState(this.engine.world, districtId);
    const dDef = getDistrictDefinition(this.engine.world, districtId);
    return {
      districtEconomy: economy,
      districtId,
      districtTags: dDef?.tags ?? [],
      prosperity: dState?.commerce ?? 50,
      stability: dState?.stability ?? 50,
      playerHeat: (this.profile.custom['leverage.heat'] as number) ?? 0,
      isBlackMarket: economy.blackMarketActive,
      factionAccess: this.getPlayerFactionAccess(),
    };
  }

  /** Get the faction the player has highest rep with (for crafting provenance). */
  private getPlayerFactionAccess(): string | undefined {
    return _getPlayerFactionAccess(this.engine.world, this.profile);
  }

  /** Process craft/salvage/repair/modify actions from a turn result. */
  private processCraftAction(turnResult: TurnResult): void {
    if (!this.profile) return;

    const craftEvent = turnResult.events.find((e) => e.type === 'craft.action.attempted');
    if (!craftEvent) return;

    const subAction = craftEvent.payload.subAction as string;
    const recipeOrItem = (craftEvent.payload.recipeOrItem as string) ?? '';

    switch (subAction) {
      case 'salvage':
        this.handleSalvage(recipeOrItem);
        break;
      case 'craft':
        this.handleCraft(recipeOrItem);
        break;
      case 'repair':
        this.handleRepairAction(recipeOrItem);
        break;
      case 'modify':
        this.handleModify(recipeOrItem);
        break;
    }
  }

  /** Handle salvage: break an item down into materials. */
  private handleSalvage(itemRef: string): void {
    if (!this.profile || !this.itemCatalog) return;
    const lower = itemRef.toLowerCase();

    // Find item in catalog by name or ID
    const item = this.itemCatalog.items.find(
      (i) => i.id.toLowerCase().includes(lower) || i.name.toLowerCase().includes(lower),
    );
    if (!item) return;

    const districtId = this.getPlayerDistrictId();
    const economy = districtId ? this.districtEconomies.get(districtId) : undefined;
    const dDef = districtId ? getDistrictDefinition(this.engine.world, districtId) : undefined;
    const dState = districtId ? getDistrictState(this.engine.world, districtId) : undefined;
    const result = salvageItem(item, (economy && districtId) ? {
      districtEconomy: economy,
      districtId,
      districtTags: dDef?.tags ?? [],
      stability: dState?.stability ?? 50,
    } : undefined);

    // Apply material yields to profile.custom
    const deltas: Partial<Record<SupplyCategory, number>> = {};
    for (const y of result.yields) {
      deltas[y.category] = (deltas[y.category] ?? 0) + y.quantity;
    }
    this.profile = { ...this.profile, custom: applyMaterialDeltas(this.profile.custom, deltas) };

    // Apply economy shifts
    for (const shift of result.economyShifts) {
      if (districtId) {
        this.applyEconomyShiftEffect(districtId, shift.category, shift.delta, shift.cause);
      }
    }

    // Record chronicle
    if (districtId) {
      const source: ChronicleEventSource = {
        kind: 'item-salvaged',
        itemId: item.id,
        itemName: item.name,
        districtId,
        tick: this.engine.tick,
      };
      for (const entry of deriveChronicleEvents(source, this.engine.world.playerId)) {
        this.journal.record(entry);
      }
    }
  }

  /** Handle craft: create a new item from a recipe. */
  private handleCraft(recipeRef: string): void {
    if (!this.profile) return;
    const ctx = this.buildCraftingContext();
    if (!ctx) return;

    const recipe = getRecipeById(this.genre, recipeRef);
    if (!recipe || recipe.category !== 'craft') return;

    const materials = getMaterialInventory(this.profile.custom);
    const check = canCraft(recipe, materials, ctx);
    if (!check.affordable || !check.meetsRequirements) return;

    const result = resolveCraft(recipe, ctx);
    if (!result.success) return;

    // Consume materials
    const consumeDeltas: Partial<Record<SupplyCategory, number>> = {};
    for (const input of result.materialsConsumed) {
      consumeDeltas[input.category] = (consumeDeltas[input.category] ?? 0) - input.quantity;
    }
    this.profile = { ...this.profile, custom: applyMaterialDeltas(this.profile.custom, consumeDeltas) };

    // Add output item to catalog
    if (result.outputItem && this.itemCatalog) {
      const newId = `crafted-${recipe.id}-${this.engine.tick}`;
      const newItem = { ...result.outputItem, id: newId } as import('@ai-rpg-engine/equipment').ItemDefinition;
      this.itemCatalog.items.push(newItem);

      // Record chronicle
      const districtId = this.getPlayerDistrictId();
      if (districtId) {
        const source: ChronicleEventSource = {
          kind: 'item-crafted',
          itemId: newId,
          itemName: newItem.name ?? recipe.name,
          recipeId: recipe.id,
          districtId,
          tick: this.engine.tick,
        };
        for (const entry of deriveChronicleEvents(source, this.engine.world.playerId)) {
          this.journal.record(entry);
        }
      }
    }

    // Apply side effects
    this.applyCraftEffects(result.sideEffects);
  }

  /** Handle repair: restore an item's condition. */
  private handleRepairAction(slotOrItem: string): void {
    if (!this.profile || !this.itemCatalog) return;
    const ctx = this.buildCraftingContext();
    if (!ctx) return;

    // Find repair recipe for slot
    const slot = slotOrItem.toLowerCase();
    const recipeId = slot.includes('armor') ? 'repair-armor' : 'repair-weapon';
    const recipe = getRecipeById(this.genre, recipeId);
    if (!recipe) return;

    const materials = getMaterialInventory(this.profile.custom);
    const check = canCraft(recipe, materials, ctx);
    if (!check.affordable) return;

    // Find equipped item in the slot
    const player = this.engine.world.entities[this.engine.world.playerId];
    const inventoryIds = player?.inventory ?? [];
    const equippedItems = inventoryIds
      .map((id) => this.itemCatalog!.items.find((i) => i.id === id))
      .filter((i): i is import('@ai-rpg-engine/equipment').ItemDefinition => !!i);
    const targetItem = equippedItems.find(
      (i) => i.slot?.toLowerCase().includes(slot) || i.id.toLowerCase().includes(slot) || i.name.toLowerCase().includes(slot),
    );
    if (!targetItem) return;

    const result = resolveRepair(targetItem, recipe, ctx);
    if (!result.success) return;

    // Consume materials
    const consumeDeltas: Partial<Record<SupplyCategory, number>> = {};
    for (const input of result.materialsConsumed) {
      consumeDeltas[input.category] = (consumeDeltas[input.category] ?? 0) - input.quantity;
    }
    this.profile = { ...this.profile, custom: applyMaterialDeltas(this.profile.custom, consumeDeltas) };

    // Record chronicle
    const districtId = this.getPlayerDistrictId();
    if (districtId) {
      const source: ChronicleEventSource = {
        kind: 'item-repaired',
        itemId: targetItem.id,
        itemName: targetItem.name,
        districtId,
        tick: this.engine.tick,
      };
      for (const entry of deriveChronicleEvents(source, this.engine.world.playerId)) {
        this.journal.record(entry);
      }
    }

    this.applyCraftEffects(result.sideEffects);
  }

  /** Handle modify: apply a modification to an item. */
  private handleModify(args: string): void {
    if (!this.profile || !this.itemCatalog) return;
    const ctx = this.buildCraftingContext();
    if (!ctx) return;

    // Parse: "modify <item> <mod-kind>" or "modify <mod-recipe-id>"
    const parts = args.split(/\s+/);
    const recipeId = parts.find((p) => p.startsWith('modify-')) ?? `modify-${parts[parts.length - 1]}`;
    const recipe = getRecipeById(this.genre, recipeId);
    if (!recipe || recipe.category !== 'modify') return;

    const materials = getMaterialInventory(this.profile.custom);
    const check = canCraft(recipe, materials, ctx);
    if (!check.affordable || !check.meetsRequirements) return;

    // Find target item
    const itemRef = parts.filter((p) => !p.startsWith('modify-')).join(' ');
    const lower = itemRef.toLowerCase();
    const item = this.itemCatalog.items.find(
      (i) => i.id.toLowerCase().includes(lower) || i.name.toLowerCase().includes(lower),
    );
    if (!item) return;

    const result = resolveModify(item, recipe, ctx);
    if (!result.success) return;

    // Consume materials
    const consumeDeltas: Partial<Record<SupplyCategory, number>> = {};
    for (const input of recipe.inputs) {
      consumeDeltas[input.category] = (consumeDeltas[input.category] ?? 0) - input.quantity;
    }
    this.profile = { ...this.profile, custom: applyMaterialDeltas(this.profile.custom, consumeDeltas) };

    // Create derived ItemDefinition (immutable — new ID)
    const newId = `${item.id}-mod-${this.engine.tick}`;
    const modifiedItem: import('@ai-rpg-engine/equipment').ItemDefinition = {
      ...item,
      id: newId,
      provenance: result.newProvenance,
      statModifiers: { ...(item.statModifiers ?? {}) },
    };
    // Apply stat deltas
    for (const [stat, delta] of Object.entries(result.statDelta)) {
      modifiedItem.statModifiers![stat] = (modifiedItem.statModifiers![stat] ?? 0) + delta;
    }
    // Add to catalog
    this.itemCatalog.items.push(modifiedItem);

    // Record chronicle
    const districtId = this.getPlayerDistrictId();
    if (districtId) {
      const modKind = recipe.modificationKind ?? 'enhancement';
      const source: ChronicleEventSource = {
        kind: 'item-modified',
        itemId: newId,
        itemName: modifiedItem.name,
        modKind,
        districtId,
        tick: this.engine.tick,
      };
      for (const entry of deriveChronicleEvents(source, this.engine.world.playerId)) {
        this.journal.record(entry);
      }
    }

    this.applyCraftEffects(result.sideEffects);
  }

  /** Apply CraftEffect side effects to session state. */
  private applyCraftEffects(effects: CraftEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'economy-shift':
          this.applyEconomyShiftEffect(effect.districtId, effect.category, effect.delta, effect.cause);
          break;

        case 'rumor':
          if (this.profile) {
            const rumorFaction = this.getPlayerFactionAccess() ?? this.engine.world.playerId;
            this.addRumor(
              spawnPlayerRumor(
                { label: effect.claim, description: effect.claim, tags: [effect.valence] },
                this.profile,
                rumorFaction,
                this.getPlayerDistrictId(),
                this.engine.tick,
              ),
            );
          }
          break;

        case 'heat':
          if (this.profile) {
            const currentHeat = (this.profile.custom['leverage.heat'] as number) ?? 0;
            this.profile = {
              ...this.profile,
              custom: { ...this.profile.custom, 'leverage.heat': Math.min(100, currentHeat + effect.delta) },
            };
          }
          break;

        case 'reputation':
          if (this.profile) {
            this.profile = adjustReputation(this.profile, effect.factionId, effect.delta);
          }
          break;

        case 'suspicion':
          // Suspicion modifies district alert pressure
          if (this.profile) {
            const suspDistrictId = this.getPlayerDistrictId();
            if (suspDistrictId) {
              modifyDistrictMetric(this.engine.world, suspDistrictId, 'alertPressure', effect.delta);
            }
          }
          break;
      }
    }
  }

  /** Handle companion-departure effects from NPC agency. */
  handleCompanionDeparture(npcId: string, reason: string): void {
    const entity = this.engine.world.entities[npcId];
    const name = entity?.name ?? npcId;

    // Check if this is a betrayal (hostile breakpoint)
    const npcProfile = this.lastNpcProfiles.find((p) => p.npcId === npcId);
    const isBetrayal = npcProfile?.breakpoint === 'hostile';

    const result = dismissCompanion(this.engine, this.partyState, npcId);
    if (result.removed) {
      this.partyState = result.party;

      if (isBetrayal) {
        const betraySource: ChronicleEventSource = {
          kind: 'companion-betrayed',
          npcId,
          npcName: name,
          tick: this.engine.tick,
        };
        for (const entry of deriveChronicleEvents(betraySource, this.engine.world.playerId)) {
          this.journal.record(entry);
        }
      } else {
        const departSource: ChronicleEventSource = {
          kind: 'companion-departed',
          npcId,
          npcName: name,
          reason,
          tick: this.engine.tick,
        };
        for (const entry of deriveChronicleEvents(departSource, this.engine.world.playerId)) {
          this.journal.record(entry);
        }
      }
    }
  }
}

// sanitizeFilename and simpleHashNum now live in game/game-state.ts
