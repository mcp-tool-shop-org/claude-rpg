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

import type { Engine } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import { CampaignJournal } from '@ai-rpg-engine/campaign-memory';
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
  type FactionActionResult,
  type FactionProfile,
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
} from '@ai-rpg-engine/modules';
import { getReputation } from '@ai-rpg-engine/character-profile';
import { createClaudeClient, type ClaudeClient, type ClaudeClientConfig } from './claude-client.js';
import { TurnHistory } from './session/history.js';
import { executeTurn, type TurnResult, type ProfileUpdateHints } from './turn-loop.js';
import { renderPlayScreen, renderWelcome, renderThinking } from './display/play-renderer.js';
import { executeDirectorCommand, renderDirectorHelp } from './display/director-renderer.js';
import { narrateScene } from './narrator/narrator.js';
import { ImmersionRuntime, type ImmersionConfig } from './runtime/immersion-runtime.js';
import { buildPresence, buildNPCStancePresence, buildStatusData, type StatusData } from './character/presence.js';
import { deriveChronicleEvents, type ChronicleEventSource } from './session/chronicle.js';
import { renderPlayHelp, renderLeverageHelp, renderPackQuickstart } from './display/help-system.js';
import { renderCompactStatus } from './display/status-compact.js';
import { generateSuggestions } from './display/contextual-suggestions.js';

export type GameMode = 'play' | 'director';

export type GameConfig = {
  engine: Engine;
  clientConfig?: ClaudeClientConfig;
  tone?: string;
  title?: string;
  worldPrompt?: string;
  immersion?: ImmersionConfig;
  profile?: CharacterProfile;
  itemCatalog?: ItemCatalog;
  genre?: string;
  journal?: CampaignJournal;
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
  lastLeverageResolution: LeverageResolution | null = null;

  constructor(config: GameConfig) {
    this.engine = config.engine;
    this.client = createClaudeClient(config.clientConfig);
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

    // Register leverage verb handlers (thin stubs — resolution happens in processInput)
    this.registerLeverageVerbs();
  }

  /** Get the welcome screen text. */
  getWelcome(): string {
    return renderWelcome(this.title, this.tone);
  }

  /** Get presence strings from current profile state. */
  getPresence(): { narrator?: string; npc?: string } {
    if (!this.profile || !this.itemCatalog) return {};
    const presence = buildPresence(this.profile, this.itemCatalog);
    return { narrator: presence.narratorSummary, npc: presence.npcPerception };
  }

  /** Get status data for enhanced status bar. */
  getStatusData(): StatusData | null {
    if (!this.profile || !this.itemCatalog) return null;
    return buildStatusData(this.profile, this.itemCatalog);
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
      this.playerRumors.push(
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
      this.playerRumors.push(
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
    const pressureContext = this.getVisiblePressureContext();
    const result = await narrateScene(
      this.client,
      this.engine.world,
      [],
      this.tone,
      [],
      undefined,
      this.immersion.stateMachine.current,
      presence.narrator,
      pressureContext,
    );
    this.history.record({
      tick: this.engine.tick,
      playerInput: '',
      verb: 'look',
      narration: result.narration,
    });
    return renderPlayScreen({
      narration: result.narration,
      world: this.engine.world,
      availableActions: this.engine.getAvailableActions(),
      profileStatus: this.getStatusData() ?? undefined,
    });
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
        return renderPackQuickstart(sub);
      }
      if (playCmd === '/status') {
        if (!this.profile) return '  No profile loaded.';
        const leverageState = getLeverageState(this.profile.custom);
        const recommendation = this.buildMoveRecommendation();
        const topThreat = this.activePressures.length > 0
          ? { description: this.activePressures[0].description, urgency: this.activePressures[0].urgency }
          : null;
        return renderCompactStatus({
          statusData: this.getStatusData()!,
          leverageState,
          topThreat,
          suggestedMove: recommendation.top3[0] ?? null,
          situationTag: recommendation.situationTag,
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
    }

    // Play mode: execute a turn with immersion + character presence
    const presence = this.getPresence();
    const pressureCtx = this.getVisiblePressureContext();
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
    );

    // Process leverage actions (social/rumor/diplomacy/sabotage)
    this.processLeverageAction(turnResult);

    // Apply profile hints from this turn (may spawn rumors)
    this.applyProfileHints(turnResult.profileHints);

    // Apply natural leverage gains + passive tick
    this.tickPlayerLeverage(turnResult.profileHints);

    // Record chronicle events from this turn
    this.recordChronicleEvents(turnResult);

    // Faction agency: factions evaluate state and take actions
    this.tickFactionAgency();

    // Propagate existing rumors to new factions
    this.propagateRumors();

    // Evaluate and tick world pressures
    this.evaluateAndTickPressures();

    // Move advisor + contextual suggestions
    const leverageStatus = this.profile
      ? formatLeverageStatus(getLeverageState(this.profile.custom))
      : undefined;
    let suggestions: ReturnType<typeof generateSuggestions> | undefined;
    if (this.profile) {
      const recommendation = this.buildMoveRecommendation();
      suggestions = generateSuggestions({
        turnCount: this.profile.totalTurns,
        leverageState: getLeverageState(this.profile.custom),
        activePressures: this.activePressures,
        lastVerb: turnResult.interpreted.verb,
        lastLeverageResolution: this.lastLeverageResolution,
        recommendation,
        hasUsedLeverage: this.hasEverUsedLeverage(),
        recentMilestone: !!turnResult.profileHints.milestoneTriggered,
      });
    }

    return renderPlayScreen({
      narration: turnResult.narration,
      dialogue: turnResult.dialogue,
      world: this.engine.world,
      availableActions: this.engine.getAvailableActions(),
      profileStatus: this.getStatusData() ?? undefined,
      leverageStatus,
      suggestions,
    });
  }

  /** Universal title evolutions based on milestone tags. */
  private getTitleEvolutions(): TitleEvolution[] {
    return [
      { requiredTags: ['boss-kill'], minCount: 3, prefix: 'Legendary' },
      { requiredTags: ['combat'], minCount: 5, suffix: 'the Bloodied' },
      { requiredTags: ['exploration'], minCount: 3, suffix: 'the Wanderer' },
    ];
  }

  /** Propagate existing rumors to new factions (max 3 per turn). */
  private propagateRumors(): void {
    const factionIds = Object.keys(this.engine.world.factions);
    if (factionIds.length <= 1) return;

    let propagations = 0;
    const MAX_PER_TURN = 3;

    for (let i = 0; i < this.playerRumors.length && propagations < MAX_PER_TURN; i++) {
      const rumor = this.playerRumors[i];
      if (rumor.confidence <= 0.3) continue;

      // Find factions that haven't heard this rumor yet
      const eligible = factionIds.filter((f) => !rumor.spreadTo.includes(f));
      if (eligible.length === 0) continue;

      // Pick one faction to propagate to
      const target = eligible[propagations % eligible.length];
      this.playerRumors[i] = propagateRumor(rumor, target);
      propagations++;
    }
  }

  /** Get the district ID the player is currently in. */
  private getPlayerDistrictId(): string | undefined {
    return getDistrictForZone(this.engine.world, this.engine.world.locationId);
  }

  /** Get the faction that controls the player's current zone (for witnessing). */
  private getPlayerZoneFaction(): string | undefined {
    // Find an NPC in the current zone that belongs to a faction
    for (const entity of Object.values(this.engine.world.entities)) {
      if (entity.zoneId === this.engine.world.locationId && entity.ai) {
        const factionId = getEntityFaction(this.engine.world, entity.id);
        if (factionId) return factionId;
      }
    }
    return undefined;
  }

  /** Format visible pressures + faction agency hints for narrator prompt injection. */
  private getVisiblePressureContext(): string[] | undefined {
    const hints: string[] = [];

    // Pressure hints (max 2)
    const visible = getVisiblePressures(this.activePressures).slice(0, 2);
    for (const p of visible) {
      const urgency = p.urgency >= 0.7 ? 'urgent' : p.urgency >= 0.4 ? 'growing' : 'distant';
      hints.push(`${p.kind}: ${p.description} (${urgency})`);
    }

    // Faction agency hints (max 2, from last turn's actions)
    const agencyHints = formatFactionAgencyForNarrator(this.lastFactionActions);
    hints.push(...agencyHints);

    // Leverage action hint (from last turn's resolution)
    if (this.lastLeverageResolution?.success && this.lastLeverageResolution.narratorHint) {
      hints.push(formatLeverageActionForNarrator(this.lastLeverageResolution));
    }

    return hints.length > 0 ? hints : undefined;
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
            this.playerRumors.push(
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
      }
    }
  }

  /** Assemble PressureInputs from current session state. */
  private buildPressureInputs(): PressureInputs {
    const factionIds = Object.keys(this.engine.world.factions);

    // Build reputation array from profile
    const reputation = factionIds.map((factionId) => ({
      factionId,
      value: this.profile ? getReputation(this.profile, factionId) : 0,
    }));

    // Build faction states from cognition
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

    // Build milestones array from profile
    const milestones = (this.profile?.milestones ?? []).map((m) => ({
      label: m.label,
      tags: m.tags,
    }));

    return {
      playerRumors: this.playerRumors,
      reputation,
      milestones,
      factionStates,
      playerLevel: this.profile?.progression.level ?? 1,
      totalTurns: this.profile?.totalTurns ?? 0,
      activePressures: this.activePressures,
      genre: this.genre,
      currentTick: this.engine.tick,
    };
  }

  /** Get the "thinking" indicator. */
  getThinking(): string {
    return renderThinking();
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
    );

    // Build profiles for director view (even if no actions were taken)
    this.lastFactionProfiles = factionIds.map((factionId) => {
      const rep = playerReputations.find((r) => r.factionId === factionId)?.value ?? 0;
      return buildFactionProfile(factionId, this.engine.world, rep, this.activePressures);
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
            this.playerRumors.push(
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
          this.playerRumors.push(
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
    const playerReputations = Object.keys(this.engine.world.factions).map((fid) => ({
      factionId: fid,
      value: this.profile ? getReputation(this.profile, fid) : 0,
    }));
    return buildStrategicMap(
      this.engine.world,
      this.playerRumors,
      this.activePressures,
      playerReputations,
      this.lastFactionActions,
    );
  }

  /** Build a MoveRecommendation from current session state. */
  private buildMoveRecommendation(): MoveRecommendation {
    if (!this.profile) return { top3: [], situationTag: 'safe' };
    const leverageState = getLeverageState(this.profile.custom);
    const map = this.buildCurrentStrategicMap();
    const playerReputations = Object.keys(this.engine.world.factions).map((fid) => ({
      factionId: fid,
      value: getReputation(this.profile!, fid),
    }));

    // Extract cooldowns from profile.custom
    const cooldowns: Record<string, number> = {};
    for (const [key, val] of Object.entries(this.profile.custom)) {
      if (key.startsWith('cooldown.') && typeof val === 'number') {
        cooldowns[key.replace('cooldown.', '')] = val;
      }
    }

    const inputs: AdvisorInputs = {
      leverageState,
      activePressures: this.activePressures,
      factionViews: map.factions,
      districtViews: map.districts,
      playerReputation: playerReputations,
      currentTick: this.engine.tick,
      cooldowns,
      playerHeat: (leverageState as Record<string, number>).heat ?? 0,
    };
    return recommendMoves(inputs);
  }

  /** Check whether the player has ever used any leverage action. */
  private hasEverUsedLeverage(): boolean {
    if (!this.profile) return false;
    return Object.keys(this.profile.custom).some(
      (k) => k.startsWith('stats.action.') && (this.profile!.custom[k] as number) > 0,
    );
  }
}
