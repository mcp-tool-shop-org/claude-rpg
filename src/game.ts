// GameSession: runtime coordinator. Pure state → game-state, LLM calls → game-narration,
// terminal output → game-presenter. This file wires seams + owns turn loop + complex mutations.
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

import { seedWorldTruthFromSession, STORES_SEEDED_KEY, type WorldTruthSeedReport } from './game/world-truth-seed.js';
import { mirrorPlayerRumor } from './game/rumor-mirror.js';
import { RumorEngine, type EngineSnapshot } from '@ai-rpg-engine/rumor-system';
import type { Engine, EntityState, ResolvedEvent } from '@ai-rpg-engine/core';
import type { PresentationState } from '@ai-rpg-engine/presentation';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { ItemCatalog, ItemDefinition } from '@ai-rpg-engine/equipment';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
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
  getAvailableOpportunities,
  getAcceptedOpportunities,
  formatOpportunityListForDirector,
  type OpportunityState,
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
// WO-A2-2/3 (slice A2 §2-§3, the living-world driver): the tick itself,
// plus the world-truth readers/setters every session-field VIEW and
// write-through path in this file refreshes from/writes through to.
// Signatures verified against the installed 3.11 dist
// (node_modules/@ai-rpg-engine/modules/dist/*.d.ts) before use, per the
// wave addendum's engine-reuse lock.
import {
  runWorldTick,
  getActivePressures,
  getResolvedPressures,
  getWorldTickState,
  RESOLVED_PRESSURES_KEPT,
  HEAT_KEY,
  pushActivePressure,
  getPersistedOpportunities,
  setPersistedOpportunities,
  getPersistedNpcProfiles,
  getPersistedNpcLastActions,
  getPersistedNpcObligations,
  getPersistedNpcChains,
  getPersistedNpcRecapEntries,
  setPersistedNpcState,
  getPersistedFactionProfiles,
  getPersistedFactionLastActions,
  getEconomyCoreState,
  getPlayerRumorState,
  setPlayerRumorState,
  getPartyState,
  // WO-A4-2 (slice A4 §2, design lock 3): the engine's own persisted move
  // recommendation — the tick's own move-advisor step (runMoveAdvisorStep,
  // world-tick.ts) recomputes and persists this every round, ALREADY
  // including the situationHint text (attached by the tick's own caller,
  // never by recommendMoves() itself — see MoveRecommendation's own doc
  // comment, move-advisor.d.ts). The app's own buildMoveRecommendation()
  // (below) calls recommendMoves() directly and never attaches
  // situationHint, so reading it from THAT call always returned undefined
  // — the red this WO's situationHint proof catches.
  getPersistedMoveRecommendation,
} from '@ai-rpg-engine/modules';
import { CampaignJournal, buildFinaleOutline, formatFinaleForDirector, formatFinaleForTerminal, type FinaleOutline, type FinaleNpcInput, type FinaleFactionInput, type FinaleDistrictInput } from '@ai-rpg-engine/campaign-memory';
import {
  grantXp,
  addInjury,
  incrementTurns,
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
  getVisiblePressures,
  makePressure,
  type WorldPressure,
  computeFallout,
  type ResolutionType,
  type PressureFallout,
  type FalloutEffect,
  modifyDistrictMetric,
} from '@ai-rpg-engine/modules';
import {
  getEntityFaction,
  getFactionCognition,
  type FactionActionResult,
  type FactionProfile,
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
  type LoyaltyBreakpoint,
  type ConsequenceChain,
  getDistrictState,
  getDistrictDefinition,
  getAllDistrictIds,
  computeDistrictMood,
  computeDistrictModifiers,
  formatDistrictMoodForNarrator,
} from '@ai-rpg-engine/modules';
// WO-A5 (slice A5, wave 8): additive engine reads for the world-reaches-
// the-player surfaces — signatures verified against the installed 3.11 dist
// (node_modules/@ai-rpg-engine/modules/dist/*.d.ts) per the wave addendum's
// engine-reuse lock.
import {
  // WO-A5-1 (§1, lock 1): the engine's own buy-price quote + the flat
  // constant every quote prices from (SELL_BASE_VALUE) — no hand-rolled
  // price math on this domain's side (see buildMarketQuote()'s own doc
  // comment for the honesty-floor correction to the design doc's "per
  // district" framing).
  quoteBuyPrice,
  inferSupplyCategory,
  getBuyableStock,
  SELL_BASE_VALUE,
  // WO-A5-3 (§4, lock 4): /leverage's quiet-round denominator, re-exposed
  // on the extended worldLedger.
  QUIET_ROUNDS_BEFORE_DECAY,
  type LeverageCurrency,
  // WO-A5-4 (§6, lock 6): named-NPC predicate, faction identity resolution,
  // per-entity suspicion, and the district-stability formula
  // DISTRICT_STABILITY_BASE's own doc comment documents (world-tick.d.ts:
  // "clamp(0, 100, base + district_<id>_safety)").
  isNamedNpc,
  resolveEntityFaction,
  getCognition,
  getDistrictForZone,
  DISTRICT_STABILITY_BASE,
} from '@ai-rpg-engine/modules';
import { formatRumorBoard, type RumorBoardLine } from '@ai-rpg-engine/rumor-system';
import { type WorldMovedEntry, type WorldMovedKind } from './game/world-moved.js';
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
  applyFalloutEffects as _applyFalloutEffects,
  applyEconomyShiftToWorld,
  buildArcInputs as _buildArcInputs,
  buildFinaleFromState,
  readFactionCognitionScalars,
  buildCurrentStrategicMap as _buildCurrentStrategicMap,
  buildMoveRecommendation as _buildMoveRecommendation,
  hasEverUsedLeverage as _hasEverUsedLeverage,
  getPlayerFactionAccess as _getPlayerFactionAccess,
  simpleHashNum,
  sanitizeFilename,
} from './game/game-state.js';
// WO-A2T-2 (slice A2 §9, R1): reputation composition — one write path
// (addFactionReputationGlobal), one view (refreshReputationProfile), one
// baseline stamp (stampReputationBaselines, also called from
// world-truth-seed.ts's WO-A2T-1 at load time).
import { addFactionReputationGlobal, stampReputationBaselines, refreshReputationProfile } from './game/reputation-view.js';
// WO-A2T-3 (slice A2 §10, R6): leverage unification, scoped to
// tickPlayerLeverage only this wave (see refreshProfileViews' own doc
// comment for why the other leverage/heat writers in this file are NOT
// converted) — writeLeverageDeltas is the entity-ledger write-through +
// profile-view refresh tickPlayerLeverage calls.
import { writeLeverageDeltas } from './game/leverage-view.js';
import { generateOpeningNarration, generateFinaleNarration } from './game/game-narration.js';
import { renderWelcomeScreen, renderThinkingIndicator, renderOpeningOutput, renderConcludeOutput, renderPlayOutput, renderDeathOutput, buildPartyStatusLine } from './game/game-presenter.js';
import { createAdaptedClient } from './llm/claude-adapter.js';
import type { ClaudeClient, ClaudeClientConfig, StreamCallback } from './claude-client.js';
import { TurnHistory } from './session/history.js';
import { executeTurn, getFatalTurnBookkeeping, type TurnResult, type ProfileUpdateHints, type HearerRumorView, type MoodTransitionInfo } from './turn-loop.js';
// F-462792bb (SLATE-2, persisted per Director ruling R2): NPC conversation
// memory. ConversationExchange is prompts/dialogue-npc.ts's own type
// (narrative-llm-owned) -- generateDialogue/dialogue-mind.ts already imports
// and re-exports through that same path.
import type { ConversationExchange } from './prompts/dialogue-npc.js';
import { executeDirectorCommand, renderDirectorHelp, formatWorldLedgerLine } from './display/director-renderer.js';
import { buildAmbushHeadline } from './game/ambush-headline.js';
// WO-A6-1/WO-A6-2 (slice A6 §3/§5, design locks 1/2, ADDENDUM-COMMON): the
// tuning surface + round-metrics shape this wave introduces.
import { resolveTuning, type LivingWorldTuning } from './game/tuning.js';
import { MAX_ROUND_METRICS, type RoundMetrics } from './game/round-metrics.js';
// WO-B1-1/2/4/5 (slice B1, design locks 1/3/7/8): condition rungs, the
// hostile turn's awareness marking for encounter spawns, asks, and
// recognition.
import { describeHostiles } from './game/condition.js';
import { markEntitiesAware } from './game/hostile-turn.js';
import {
  maybeOfferAsk,
  getAllAsks,
  getAsk,
  askSubjectId,
  askSubjectName,
  resolveAskConsequence,
  type AskConsequence,
  markAskHelped,
  markAskIgnored,
  markAskRevealed,
  dueReveals,
} from './game/asks.js';
import {
  grantGratitude,
  recognitionLineFor,
  recognitionReputationDelta,
  recognitionRumorClaim,
  checkAmbushGratitudeWarning,
} from './game/recognition.js';
import { filterHints, readHintLedger, writeHintLedger } from './game/hint-ledger.js';
import { computeUnknownCommandInfo, deriveValidNowFromWorld } from './game/unknown-command.js';
import { ImmersionRuntime, type ImmersionConfig } from './runtime/immersion-runtime.js';
import { hasLivingHostiles } from './runtime/hooks.js';
// F-79a25863 (presentation seam contract): McpToolCall is turn-loop.ts's own
// TurnResult.audioCalls element type — imported from its origin module
// (audio-bridge.ts), the same way turn-loop.ts itself imports it, since
// turn-loop.ts doesn't re-export the type.
import type { McpToolCall } from './runtime/audio-bridge.js';
import type { StatusData } from './character/presence.js';
// WO-A4-3 (slice A4 §4, design lock 5): type-only — runtime-foundry owns
// world-gen.ts's proposeWorld/instantiateWorld split (their own worktree,
// this wave); this session only carries the already-validated proposal
// object through to its own save (getWorldGenProposal(), below), never
// constructs or validates one itself.
import type { WorldGenProposal } from './foundry/world-gen.js';
import { deriveChronicleEvents, buildChronicleContext, type ChronicleEventSource } from './session/chronicle.js';
// WO-A2-4 (slice A2 §5, deletion): tickNpcAgency/buildNpcProfilesForDirector/
// applyNpcEffects (src/npc/agency.ts, narrative-llm-owned) had exactly one
// caller in this file — the now-deleted tickNpcAgencyTurn — so this import
// is dropped. Not a cross-domain edit: agency.ts itself is untouched here;
// narrative-llm's own wave-4 addendum (WO for that domain) reduces/deletes
// those now-dead exports on its own file.
import {
  recruitCompanion,
  dismissCompanion,
  followPlayer,
  syncCompanionMorale,
  inferCompanionRole,
} from './companion/companion-bridge.js';
/**
 * WO-A2-2 (slice A2 §2, cross-domain — ADDENDUM-runtime-foundry.md
 * WO-A2-8): a NAMESPACE import (not a named one) for
 * drainQueuedCompanionReactions, runtime-foundry's own export, drained in
 * runWorldRound() below. NOT present in this isolated worktree's copy of
 * companion-bridge.ts as of this commit (only the five named exports
 * above exist here) — runtime-foundry lands it in the SAME wave, in
 * parallel, in its own worktree; this resolves once that domain's edits
 * merge at collect/stitch. A named `import { drainQueuedCompanionReactions }`
 * would fail to LINK at all in an isolated worktree missing the export
 * (a hard ESM SyntaxError on this file's very first import, breaking
 * every test in game.test.ts, not just the ones that exercise it) —
 * the namespace form only fails at the CALL SITE below (already wrapped
 * in try/catch), which is the isolation-safe shape per the wave brief's
 * "test your side with a documented local cast/stub if the other half is
 * absent" allowance.
 */
import * as companionBridge from './companion/companion-bridge.js';
// F-88570323: shared tiered name resolution — see its doc comment in
// action-interpreter.ts for why this is the same lookup attack/speak/
// inspect/use already get.
import { findEntityByName } from './action-interpreter.js';
import {
  isCompanion,
  adjustCompanionMorale,
  type PartyState,
  type CompanionRole,
  evaluateCompanionReactions,
  type CompanionReaction,
  computePartyAbilities,
  computeAbilityModifiers,
} from '@ai-rpg-engine/modules';
import { renderPlayHelp, renderLeverageHelp, renderPackQuickstart, renderArcHelp, renderConcludeHelp, renderUnknownCommand } from './display/help-system.js';
import { renderCompactStatus } from './display/status-compact.js';
import { generateSuggestions } from './display/contextual-suggestions.js';
import { renderArchiveBrowser } from './display/archive-browser.js';
import { listArchivedCampaigns, saveSession, loadResolvedOpportunitiesFromSession, type SaveSessionInput, type SavedSession, getSavePath as getDefaultSavePath } from './session/session.js';
import { exportChronicleMarkdown, exportChronicleJSON, exportFinaleMarkdown, writeExport } from './session/chronicle-export.js';
import { createDebugLogger, type DebugLogger } from './game/debug-logger.js';
import { SessionTokenTracker, withTokenTracking } from './game/token-tracker.js';

export type GameMode = 'play' | 'director';

export type AutosaveConfig = {
  /** Whether autosave is enabled (default: true). */
  enabled: boolean;
  /** Autosave every N turns (default: 5). */
  intervalTurns: number;
  /** Function to resolve the autosave file path given a character name. */
  getSavePath?: (characterName: string) => string;
};

const DEFAULT_AUTOSAVE: AutosaveConfig = { enabled: true, intervalTurns: 5 };

/**
 * F-af8f1048: checkAutosave()'s previous `Promise<string | null>` contract
 * let three semantically distinct outcomes — disabled, not yet due, and a
 * genuine failure caught by the try/catch — collapse into the same `null`.
 * processInput() rendered output byte-for-byte identical to "not due yet"
 * for a failed autosave attempt, forever, with zero player-facing signal.
 * Discriminated so the caller (and therefore the player, via
 * formatAutosaveNotice below) can actually tell these apart.
 */
export type AutosaveOutcome =
  | { status: 'skipped' }
  | { status: 'saved'; message: string }
  | { status: 'failed'; error: string };

/**
 * F-51e110b9: caps mirroring TurnHistory's MAX_COMPACTED_CHUNKS precedent
 * (F-dfd125bb, session/history.ts) — this.journal, this.resolvedPressures,
 * this.resolvedOpportunities, and this.endgameTriggers previously grew
 * without any ceiling across a campaign's lifetime and are all serialized
 * in full on every save (session.ts), trending every sufficiently-long
 * campaign toward loadSession()'s hard 10 MB rejection (session.ts's
 * MAX_SAVE_FILE_BYTES) with nothing upstream to prevent it. Journal records
 * one significant event at a time and is the dominant per-turn contributor
 * (recordChronicleEvents() runs unconditionally every turn); the other
 * three record comparatively rare resolution/trigger events, so a smaller
 * cap suffices.
 */
const MAX_JOURNAL_RECORDS = 500;
const MAX_RESOLVED_FALLOUT_ENTRIES = 200;
const MAX_ENDGAME_TRIGGERS = 200;

/**
 * F-f13ca236: ring-buffer cap for GameSession.subsystemFailures — a
 * pathological run of repeated post-turn subsystem failures shouldn't grow
 * that record unbounded either (same discipline as the caps above).
 */
const MAX_SUBSYSTEM_FAILURE_RECORDS = 20;

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
  /**
   * F-97ffd8cd: BuildCatalog for resolving archetypeId/disciplineId to their
   * display name (character/catalog-names.ts's resolveArchetypeName/
   * resolveDisciplineName) in the player's own status bar / narrator
   * presence strings — mirrors character/packs.ts's WorldPack.buildCatalog
   * field. Omitted (e.g. a custom, non-pack world) degrades to the existing
   * raw-id fallback, never a hard failure.
   */
  buildCatalog?: BuildCatalog;
  genre?: string;
  journal?: CampaignJournal;
  /**
   * Restored turn history for resumed sessions (task_3ddb1c06): without this,
   * every `claude-rpg load` started narration with zero recent-narration
   * continuity even though the save carries the full history.
   */
  history?: TurnHistory;
  /** Pack id for pack-launched sessions — keys onboarding and voice lookups. */
  packId?: string;
  /** Restored campaign status for resumed sessions (defaults to 'active'). */
  campaignStatus?: 'active' | 'completed';
  fastMode?: boolean;
  /** Autosave configuration. */
  autosave?: Partial<AutosaveConfig>;
  /** Debug logger instance — if omitted, auto-detected from --debug / CLAUDE_RPG_DEBUG. */
  debugLogger?: DebugLogger;
  /**
   * F-79a25863 (presentation seam contract): invoked after each completed
   * turn with that turn's queued audio/UI-effect MCP tool calls (sfx,
   * music, ambient, and the deathHook fade-to-black
   * `__ui_effect_intent__`) — previously computed correctly all the way
   * through ImmersionRuntime.processPresentation() and then silently
   * discarded at this domain's boundary. Fires every completed turn,
   * including the fatal-bookkeeping path and (when it produces any) the
   * opening-narration path — an empty array means "nothing to present this
   * turn," not "not called." Invoked in a try/catch internally: a throwing
   * sink must never damage the turn. The caller (e.g. bin.ts /
   * cli-display's presentation-renderer) owns turning these into terminal
   * output.
   */
  onPresentation?: (calls: McpToolCall[]) => void;
  /**
   * STREAMING SEAM CONTRACT (game-core half): invoked with each narration
   * chunk as narrateScene() streams it, for a NORMAL turn only — not the
   * opening narration, not director mode (director commands never reach
   * executeTurn() at all; see processInput()). narrateScene already accepts
   * an onChunk callback and only takes the streaming branch when one is
   * provided (mirrors narrator.ts's `onChunk && client.generateStream`
   * gate) — omitting this leaves every turn on the existing non-streaming
   * path, unchanged. Invoked in a try/catch internally: a throwing sink
   * must never damage the turn (mirrors onPresentation's containment
   * above). The caller (e.g. bin.ts / cli-display's stream-presenter) owns
   * turning chunks into incremental terminal output.
   */
  onNarrationChunk?: StreamCallback;
  /**
   * F-8c3e32b7: presentation state (combat/dialogue/aftermath/menu/
   * exploration) to seed the freshly-constructed ImmersionRuntime with,
   * read from a save via session.ts's loadPresentationStateFromSession().
   * Applied via stateMachine.transition() AFTER ImmersionRuntime.initialize()
   * runs (see the constructor) — so a reload resumes the same presentation
   * context it was saved in instead of always starting at 'exploration',
   * and (deliberately) takes priority over initialize()'s own narrower
   * combat-core-derived 'combat' restore (F-f13b58f3) when both apply: this
   * field is the more complete, explicit record of what was actually saved,
   * where that heuristic only ever reconstructs 'combat' from a different
   * data source (the engine's own serialized module state). Omitted (or the
   * save predates this field) leaves the existing behavior unchanged.
   */
  restoredPresentationState?: PresentationState;
  /**
   * F-462792bb (SLATE-2 exposure, brief ruled 2026-08-26): restored per-NPC
   * conversation history for resumed sessions, read from a save via
   * session.ts's loadNpcConversationsFromSession(). cli-display threads this
   * at the load path (bin.ts); GameSession exposes the live map back out
   * (see the `npcConversations` field below) so cli-display can also thread
   * it into every saveSession call site on the save path.
   */
  npcConversations?: Map<string, ConversationExchange[]>;
  /**
   * WO-A3-2 (slice A3 §3): restored RumorEngine snapshot for resumed
   * sessions, read from a save via SavedSession.rumorEngine (a JSON string
   * of the engine's own EngineSnapshot `{ rumors, stances }`). Parsed and
   * restored via `RumorEngine.deserializeSafe` in the constructor — a
   * malformed individual rumor entry is skipped with a logged warning
   * (never surfaced to the player), never a hard failure of session
   * construction. Omitted (new game, or a save that predates this field)
   * constructs a fresh RumorEngine instead.
   */
  rumorEngineSnapshot?: string;
  /**
   * WO-A4-3 (slice A4 §4, design lock 5): the LLM-authored world proposal a
   * PACKLESS (generated) session was instantiated from — undefined for a
   * pack-launched session, whose own `packId` is its reconstruction key
   * instead. Already validated by its own caller (runtime-foundry's
   * proposeWorld/instantiateWorld split, cli-display's runNew); this
   * session only carries it forward so its own first save can persist it
   * (getWorldGenProposal(), read by cli-display's save-input builder) —
   * closes the wave-5 finding that a generated world had no resume path.
   */
  worldGenProposal?: WorldGenProposal;
  /**
   * WO-A4-3: the seed `instantiateWorld` used to build this packless
   * session's world, carried forward the same way worldGenProposal is
   * (getWorldSeed()) so `runLoad`'s generated branch can rebuild the
   * identical world from the SAME proposal + seed pair.
   */
  worldSeed?: number;
  /**
   * WO-A5-5 (slice A5 §7): restored "the world moved" ledger for resumed
   * sessions, read from a save via session.ts's
   * loadWorldMovedFromSession(). Omitted (new game, or a save that
   * predates this field) starts empty, same "absence means nothing to
   * restore" convention worldGenProposal/worldSeed above already have.
   */
  worldMoved?: WorldMovedEntry[];
  /**
   * WO-A6-1 (slice A6 §3, design lock 1): partial overrides onto
   * `DEFAULT_LIVING_WORLD_TUNING` (game/tuning.ts) — omitted fields keep
   * their measured default, so a session that never sets this is
   * byte-identical to pre-wave behavior. `GameSession.getTuning()` returns
   * the resolved object; the tuning waves (T1…Tn, post-Phase-9) are the only
   * intended callers of this override this cycle.
   */
  tuning?: Partial<LivingWorldTuning>;
};

/** One clause naming a revealed con's cost for the play screen (stitch, playtest b1-2026-09-02b). */
function describeAskCost(consequence: AskConsequence): string {
  switch (consequence.kind) {
    case 'coin-lost': return ` ${consequence.amount} coin gone.`;
    case 'ambush': return ` The way to ${consequence.zoneId} was watched.`;
    case 'faction-pin':
    case 'standing-burn': return ` Your standing with ${consequence.factionId} took the blame.`;
    default: return '';
  }
}

export class GameSession {
  readonly engine: Engine;
  readonly client: ClaudeClient;
  readonly history: TurnHistory;
  /** Pack id for pack-launched sessions (undefined for custom worlds). */
  readonly packId?: string;
  /** WO-A4-3: see GameConfig.worldGenProposal — undefined for a pack session. */
  private readonly worldGenProposal?: WorldGenProposal;
  /** WO-A4-3: see GameConfig.worldSeed. */
  private readonly worldSeed?: number;
  readonly tone: string;
  readonly title: string;
  readonly worldPrompt?: string;
  readonly immersion: ImmersionRuntime;
  readonly itemCatalog: ItemCatalog | null;
  /** F-97ffd8cd: see GameConfig.buildCatalog. */
  readonly buildCatalog: BuildCatalog | null;
  profile: CharacterProfile | null;
  /**
   * WO-A4-1 (slice A4 §1, design lock 1): these twelve properties are LIVE
   * getters over engine world truth, not stored fields — every access reads
   * `this.engine.world` fresh (arrays/maps callers never mutate), so there
   * is no refresh step and no stale window: a write to the world is visible
   * to every reader on its very next access. `refreshWorldViews()` (the old
   * per-round/per-write-through sync for these) is deleted with them; the
   * source-text tripwire (game.test.ts) fails on any `this.<name> =`
   * assignment to one of these dozen names anywhere in this file.
   * `resolvedOpportunities` is the one exception (declared below,
   * unchanged) — session HISTORY, not a world-truth view (design doc §1).
   */
  get playerRumors(): PlayerRumor[] {
    return getPlayerRumorState(this.engine.world).rumors;
  }
  get activePressures(): WorldPressure[] {
    return getActivePressures(this.engine.world);
  }
  get resolvedPressures(): PressureFallout[] {
    return getResolvedPressures(this.engine.world);
  }
  get activeOpportunities(): OpportunityState[] {
    return getPersistedOpportunities(this.engine.world);
  }
  get lastNpcActions(): NpcActionResult[] {
    return getPersistedNpcLastActions(this.engine.world);
  }
  get lastNpcProfiles(): NpcProfile[] {
    return getPersistedNpcProfiles(this.engine.world);
  }
  get npcObligations(): Map<string, NpcObligationLedger> {
    return getPersistedNpcObligations(this.engine.world);
  }
  get activeConsequenceChains(): Map<string, ConsequenceChain> {
    return new Map(getPersistedNpcChains(this.engine.world).map((c) => [c.id, c]));
  }
  get lastFactionActions(): FactionActionResult[] {
    return getPersistedFactionLastActions(this.engine.world);
  }
  get lastFactionProfiles(): FactionProfile[] {
    return getPersistedFactionProfiles(this.engine.world);
  }
  get districtEconomies(): Map<string, DistrictEconomy> {
    return new Map(Object.entries(getEconomyCoreState(this.engine.world).districts));
  }
  /**
   * WO-A2-8 (runtime-foundry, cross-domain) / WO-A4-1: the engine's own
   * persisted party mirror (companion-core.ts) is now this getter's ONLY
   * source — every write path in this file pushes OUT to it via
   * `setPartyState`/`syncCompanionMorale` (recruit, dismiss, morale
   * adjustments, the tick's own companion reactions) and this getter always
   * reads it back fresh, so a tick-applied morale/departure change is
   * visible here on its very next access with no separate resync step.
   */
  get partyState(): PartyState {
    return getPartyState(this.engine.world);
  }
  // F-51e110b9: not readonly — trimJournalIfNeeded() below rebuilds this
  // from CampaignJournal's own public serialize()/deserialize() pair (the
  // compiled @ai-rpg-engine/campaign-memory class exposes no delete/evict
  // API), mirroring TurnHistory's MAX_COMPACTED_CHUNKS eviction discipline.
  journal: CampaignJournal;
  readonly genre: string;
  mode: GameMode = 'play';
  /**
   * F-462792bb (SLATE-2, persisted per Director ruling R2): per-NPC recent
   * conversation history, keyed by NPC id (never name/genre — the same key
   * turn-loop.ts's Step 5 looks up interpreted.targetIds[0] by). Public and
   * readonly per the brief's SLATE-2 exposure contract, so cli-display
   * (bin.ts) can thread it into every saveSession call site on the save
   * path — readonly only forbids reassigning the property itself; the Map's
   * contents are still mutated in place via recordConversationExchange()
   * below and tickObligations-style Map.set() calls.
   */
  readonly npcConversations: Map<string, ConversationExchange[]>;
  /**
   * WO-B1F-1 (design lock 1, ADDENDUM-COMMON): the npcId whose (real,
   * non-fallback) dialogue was addressed to the player on the MOST
   * RECENTLY COMPLETED turn -- `null` when that turn had no such dialogue
   * (a non-speak turn, or a fallback stall). Set/cleared every turn inside
   * recordConversationExchange() below, using the exact same guard that
   * already decides whether npcConversations grows, and threaded into the
   * NEXT turn's executeTurn() call (turn-loop.ts's ExecuteTurnOpts.
   * lastSpeakerNpcId) so a free-prose reply the fast path can't otherwise
   * match resolves as `speak` to this NPC instead of a clarification.
   * Deliberately session-local, not persisted to a save -- this is a
   * one-turn UX affordance (mirrors consecutiveFallbacks' own non-persisted
   * discipline just below in ExecuteTurnOpts), not campaign state; a
   * resumed save simply starts with no pending reply-to-speaker context,
   * same as a save resuming with consecutiveFallbacks reset to 0.
   */
  private lastSpeakerNpcId: string | null = null;
  /**
   * WO-A3-2 (slice A3 §3): the admitted `@ai-rpg-engine/rumor-system`
   * instance — host-owned, constructed on a new game with
   * `{ stanceFadeTicks: 24 }` (per-hearer stances fade after ~24 rounds; an
   * A6 tuning lever) or restored from a save via
   * config.rumorEngineSnapshot (see the constructor below). Write side
   * only this slice: mirrorPlayerRumor (game/rumor-mirror.ts) bridges the
   * app's existing 4-valence playerRumors ledger into it at addRumor() and
   * via runWorldRound()'s post-round sweep; dialogue and the /rumors
   * surface keep reading the 4-valence view unchanged until A5.
   */
  readonly rumorEngine: RumorEngine;
  previousBreakpoints: Map<string, LoyaltyBreakpoint> = new Map();
  lastLeverageResolution: LeverageResolution | null = null;
  lastCompanionReactions: CompanionReaction[] = [];
  resolvedOpportunities: OpportunityFallout[] = [];
  /**
   * WO-A5-5 (slice A5 §7): the round-by-round "the world moved" ledger —
   * session HISTORY (like resolvedOpportunities above), not a world-truth
   * view. See game/world-moved.ts's WorldMovedEntry doc comment for the
   * shape and why it's uniform across kinds. Capped oldest-first via
   * capOldestFirst (pushWorldMoved(), below) — same discipline as
   * resolvedOpportunities/endgameTriggers. Restored from a save via
   * GameConfig.worldMoved in the constructor; persisted via
   * getWorldMovedSnapshot() (see its own doc comment).
   */
  worldMovedLedger: WorldMovedEntry[];
  arcSnapshot: ArcSnapshot | null = null;
  endgameTriggers: EndgameTrigger[] = [];
  finaleOutline: FinaleOutline | null = null;
  campaignStatus: 'active' | 'completed' = 'active';
  readonly fastMode: boolean;
  /** Autosave configuration. */
  readonly autosaveConfig: AutosaveConfig;
  /** Track turns since last autosave to avoid counting non-turn inputs. */
  private turnsSinceLastAutosave = 0;
  /** Last autosave message (appended to output when triggered). */
  private lastAutosaveMessage: string | null = null;
  /**
   * F-af8f1048: true once the player has been shown the one-time
   * autosave-failure notice this session — formatAutosaveNotice() checks
   * this so a persistent failure condition (full disk, permissions,
   * antivirus lock) doesn't repeat the notice every subsequent turn,
   * honoring the original "don't disrupt gameplay" intent while still
   * telling the player once that their safety net stopped working.
   */
  private autosaveFailureWarned = false;
  /**
   * F-fd5e8eec: true once the player's session has been shown the one-time
   * playerRumors-cap notice — addRumor() below checks this so a
   * long-running campaign that stays over MAX_PLAYER_RUMORS for the rest of
   * its life doesn't repeat the notice on every subsequent rumor-spawning
   * turn. Mirrors autosaveFailureWarned's one-time-notice discipline
   * directly above. capPlayerRumors (game-state.ts) itself stays silent by
   * design — that file is documented "No console IO" — so the notice lives
   * here instead, gated through debugLog (a NoopLogger when --debug/
   * CLAUDE_RPG_DEBUG is off, so no explicit enabled check is needed).
   */
  private rumorCapWarned = false;
  /**
   * F-f13ca236: post-turn subsystem-tick failure count + a bounded ring
   * buffer of the most recent ones, tracked independent of the --debug gate
   * (see the PB-001 catch block below and debug-logger.ts's NoopLogger).
   * Surfaced via getSubsystemFailureCount()/getRecentSubsystemFailures().
   */
  private subsystemFailureCount = 0;
  private readonly subsystemFailures: { tick: number; error: string }[] = [];
  /**
   * F-940cd4d0: count of consecutive non-fatal narrateScene fallbacks up to
   * and including the most recent turn, forwarded into ExecuteTurnOpts so
   * narrator.ts can switch to FALLBACK_NARRATION_REPEATED once an outage
   * proves itself ongoing rather than a one-off hiccup. Session-local,
   * deliberately NOT persisted — same shape as turnsSinceLastAutosave/
   * subsystemFailureCount above: a resumed session is itself evidence the
   * app just started working again, so carrying a stale count forward would
   * show "this has been happening for a while" copy on a fresh session's
   * first turn even though zero fallbacks occurred in the new process.
   */
  private consecutiveFallbacks = 0;
  /**
   * F-b4b16d0a: COST COMMAND — per-call-type token/cost tracker for this
   * session. Fed by executeTurn()'s per-call-type client wrapping
   * (turn-loop.ts) for narration/dialogue, and by getOpeningNarration()/
   * handleConclude() below for the opening scene and finale epilogue.
   * Surfaced via getCostSummary().
   */
  private readonly tokenTracker = new SessionTokenTracker();
  /** Structured announcements from subsystem processing (level-ups, title changes, etc.). */
  pendingAnnouncements: string[] = [];
  /** Structured debug logger — gated behind --debug flag. */
  readonly debugLog: DebugLogger;
  /** F-79a25863 (presentation seam contract): see GameConfig.onPresentation. */
  private readonly onPresentation?: (calls: McpToolCall[]) => void;
  /** Streaming seam contract (game-core half): see GameConfig.onNarrationChunk. */
  private readonly onNarrationChunk?: StreamCallback;
  /**
   * WO-A2-2 (slice A2 §2): the player's zone at the START of the turn
   * currently in flight, captured in processInput() right before
   * executeTurn() is called. runWorldRound() (this session's own
   * onResolved hook, invoked BY executeTurn mid-flight, before this turn's
   * processInput() call site sees a return) reads this to detect a
   * same-turn zone change and call followPlayer() — the only place in
   * processInput() that naturally has a pre-turn zone to compare against.
   * Session-local, deliberately not persisted (meaningless between turns).
   */
  private turnStartZoneId: string | undefined;
  /**
   * WO-A5-2 (slice A5 §2, design lock 2): this round's district-mood
   * transition for the PLAYER's district, or undefined when the round's
   * before/after districtTones comparison found no change (or the player
   * has no district). Recomputed every round in runWorldRound — never
   * accumulated, so a quiet round correctly reports "nothing changed this
   * round" rather than replaying a stale transition from several rounds
   * back. Read by getMoodTransition() below, threaded into executeTurn's
   * getMoodTransition opts callback (design lock 2's threading contract).
   */
  private lastMoodTransition: MoodTransitionInfo | undefined;
  /**
   * WO-A5-3 (slice A5 §4, design lock 4): this round's leverage-currency
   * deltas — getLeverageState(player.custom) after the tick's own
   * runLeverageIncomeStep minus before it ran. {} on a round that granted
   * nothing (never undefined, so buildWorldLedger()'s `income` field is
   * always a real object cli-display can iterate with no null-check).
   * Recomputed fresh every round for the same "this round only" reason
   * lastMoodTransition is.
   */
  private lastLeverageIncome: Partial<Record<LeverageCurrency, number>> = {};
  /**
   * WO-A6-1 (slice A6 §3, design lock 1): resolved once at construction
   * (`resolveTuning(config.tuning)`) — every hard-coded site this wave
   * rewires reads THIS field, never the literal it replaced. See
   * `getTuning()` below and `GameConfig.tuning`'s own doc comment.
   */
  private readonly tuning: LivingWorldTuning;
  /**
   * WO-A6-2 (slice A6 §5, design lock 2): one entry per played round,
   * oldest-first-capped at MAX_ROUND_METRICS. NOT persisted (design doc §5:
   * "Round metrics are read, not persisted") — see `getRoundMetrics()` and
   * `captureRoundMetrics()` below for where entries are built and pushed.
   */
  private readonly roundMetrics: RoundMetrics[] = [];
  /**
   * WO-A6-2: this round's faction-agency action count — captured inside
   * runWorldRound from the SAME reference-identity diff (prevFactionByFaction)
   * the chronicle-derivation loop already computes, so this doesn't re-pay
   * for a second diff pass. Reset every round (runWorldRound always
   * reassigns it, even to 0), read by captureRoundMetrics().
   */
  private lastRoundFactionActions = 0;
  /**
   * WO-A6-2: this round's first-hearing stance counts, tallied inside the
   * per-hearer rumor-spread step (runWorldRound) alongside the existing
   * `rumor-mutated` world-moved push. Reset every round.
   */
  private lastRoundStanceBelieve = 0;
  private lastRoundStanceDoubt = 0;
  /**
   * WO-A6-2: incremented by processOpportunityAction's 'accept' case — a
   * documented POST-turn step (same timing as applyProfileHints' player
   * pressure-resolution branch), so this counter is read-and-reset by
   * captureRoundMetrics() at the END of a turn's processing rather than
   * inside runWorldRound itself. See RoundMetrics.opportunitiesAccepted's
   * own doc comment for the full honesty-floor note.
   */
  private opportunitiesAcceptedThisRound = 0;

  constructor(config: GameConfig) {
    this.engine = config.engine;
    // WO-A6-1: resolved BEFORE the RumorEngine is constructed below — its
    // config reads this.tuning.rumorStanceFadeTicks instead of the literal
    // `24` this wave replaces.
    this.tuning = resolveTuning(config.tuning);
    this.client = config.client ?? createAdaptedClient(config.clientConfig);
    this.history = config.history ?? new TurnHistory();
    this.packId = config.packId;
    this.worldGenProposal = config.worldGenProposal;
    this.worldSeed = config.worldSeed;
    // WO-A5-5 (slice A5 §7): see GameConfig.worldMoved's doc comment.
    this.worldMovedLedger = config.worldMoved ?? [];
    if (config.campaignStatus) this.campaignStatus = config.campaignStatus;
    this.tone = config.tone ?? 'dark fantasy, concise, atmospheric';
    this.title = config.title ?? 'claude-rpg';
    this.worldPrompt = config.worldPrompt;
    this.immersion = new ImmersionRuntime(config.immersion);
    this.immersion.initialize(this.engine);
    // F-8c3e32b7: apply AFTER initialize() so an explicit restored value
    // (the more complete record of what was actually saved) takes priority
    // over initialize()'s own narrower combat-core-derived 'combat' restore
    // when both apply — see GameConfig.restoredPresentationState's doc
    // comment.
    // F-6bc0721e (SLATE-6, brief ruled 2026-08-26): this ALSO already "arms"
    // the downed gate at construction when restoredPresentationState is
    // 'menu' -- a save made while downed resumes downed, since
    // processInput()'s gate reads stateMachine.current directly (set here,
    // before any turn is ever played) rather than depending on a per-turn
    // transition edge that a resumed session has no way to fire.
    if (config.restoredPresentationState) {
      this.immersion.stateMachine.transition(config.restoredPresentationState, 'session-restore');
    }
    this.profile = config.profile ?? null;
    this.itemCatalog = config.itemCatalog ?? null;
    this.buildCatalog = config.buildCatalog ?? null;
    // F-462792bb (SLATE-2, persisted per Director ruling R2): see
    // GameConfig.npcConversations's doc comment.
    this.npcConversations = config.npcConversations ?? new Map();
    this.journal = config.journal ?? new CampaignJournal();
    this.genre = config.genre ?? 'fantasy';
    this.fastMode = config.fastMode ?? false;
    this.autosaveConfig = { ...DEFAULT_AUTOSAVE, ...config.autosave };
    this.debugLog = config.debugLogger ?? createDebugLogger();
    // Contract B (debug mode): thread GameConfig's existing debug flag —
    // realized here as debugLog.enabled, resolved above from either an
    // explicit config.debugLogger or createDebugLogger()'s auto-detection of
    // --debug / CLAUDE_RPG_DEBUG (the same plumbing bin.ts's own local
    // `debugMode` variable reads) — into ImmersionRuntime.debugMode, which
    // was previously only ever set directly by tests
    // (immersion-runtime.test.ts), never by any real construction path. No
    // new GameConfig field: this reuses the debug signal that already
    // reaches GameSession.
    this.immersion.debugMode = this.debugLog.enabled;
    this.onPresentation = config.onPresentation;
    this.onNarrationChunk = config.onNarrationChunk;

    // WO-A3-2 (slice A3 §3): restore the RumorEngine from a save snapshot,
    // or construct fresh for a new game. debugLog is already initialized
    // above (this.debugLog = config.debugLogger ?? createDebugLogger()),
    // so a restore warning has somewhere safe to go before the constructor
    // finishes.
    // WO-A6-1 (slice A6 §3, design lock 1): reads this.tuning instead of the
    // literal `24` this wave replaces — measured default is unchanged (see
    // LivingWorldTuning.rumorStanceFadeTicks's own doc comment, game/tuning.ts).
    const rumorEngineConfig = { stanceFadeTicks: this.tuning.rumorStanceFadeTicks };
    if (config.rumorEngineSnapshot) {
      let parsed: EngineSnapshot | undefined;
      try {
        parsed = JSON.parse(config.rumorEngineSnapshot) as EngineSnapshot;
      } catch {
        this.debugLog.warn('rumors', 'RumorEngine restore: rumorEngineSnapshot was not valid JSON — starting a fresh RumorEngine.');
      }
      if (parsed) {
        const { engine, warnings } = RumorEngine.deserializeSafe(parsed, rumorEngineConfig);
        this.rumorEngine = engine;
        for (const w of warnings) {
          this.debugLog.warn('rumors', `RumorEngine restore: ${w.field}: ${w.message}`);
        }
      } else {
        this.rumorEngine = new RumorEngine(rumorEngineConfig);
      }
    } else {
      this.rumorEngine = new RumorEngine(rumorEngineConfig);
    }

    // WO-A4-1 (slice A4 §1): districtEconomies is a live getter over world
    // truth now (getEconomyCoreState(world).districts) — the engine's own
    // createEconomyCore module already seeds that namespace from
    // genre+district-tags at world construction (runtime-foundry's world
    // build, verified against economy-core.js's createEconomyCore), so
    // there is nothing left for this session to seed independently. The
    // former private initializeDistrictEconomies() (and its free-function
    // counterpart, game-state.ts) are deleted with it.

    // Register leverage verb handlers (thin stubs — resolution happens in processInput)
    this.registerLeverageVerbs();
  }

  /** Get the welcome screen text. */
  getWelcome(): string {
    return renderWelcomeScreen(this.title, this.tone);
  }

  /** Get presence strings from current profile state. */
  getPresence(): { narrator?: string; npc?: string } {
    return getPresenceData(this.profile, this.itemCatalog, this.buildCatalog ?? undefined);
  }

  /** Get status data for enhanced status bar. */
  getStatusData(): StatusData | null {
    return getStatusDataFromProfile(this.profile, this.itemCatalog, this.buildCatalog ?? undefined);
  }

  /**
   * WO-A4-4 (slice A4 §3, design lock 6): the tick's own strategic ledger —
   * heat (`world.globals[HEAT_KEY]`), faction alerts above zero
   * (`world.globals['faction_alert_<factionId>']` per faction in
   * `world.factions` — the same global-key convention game.test.ts already
   * exercises directly), quietRounds, and the CURRENT district's tone
   * (`getWorldTickState(world).districtTones`, keyed by districtId). The
   * first surface of the tick's own ledger on `/status` (both modes,
   * above) — assembling the data is this domain's job; rendering it is
   * cli-display's (status-compact.ts / director-renderer.ts).
   */
  private buildWorldLedger(): {
    heat: number;
    quietRounds: number;
    factionAlerts: Record<string, number>;
    districtTone?: string;
    /**
     * WO-A5-3 (slice A5 §4, design lock 4): this round's leverage-currency
     * deltas — see lastLeverageIncome's own doc comment. {} on a quiet
     * round, never undefined.
     */
    income: Partial<Record<LeverageCurrency, number>>;
    /**
     * WO-A5-3: the SAME quiet-round decay denominator quietRounds counts
     * toward — re-exposed here so /leverage's "N/decayAfter quiet rounds to
     * cooling" line doesn't need its own separate import of the constant.
     */
    decayAfter: number;
  } {
    const world = this.engine.world;
    const heatRaw = world.globals[HEAT_KEY];
    const heat = typeof heatRaw === 'number' ? heatRaw : 0;
    const tickState = getWorldTickState(world);
    const factionAlerts: Record<string, number> = {};
    for (const factionId of Object.keys(world.factions ?? {})) {
      const raw = world.globals[`faction_alert_${factionId}`];
      const value = typeof raw === 'number' ? raw : 0;
      if (value > 0) factionAlerts[factionId] = value;
    }
    const districtId = this.getPlayerDistrictId();
    const districtTone = districtId ? tickState.districtTones?.[districtId] : undefined;
    return {
      heat,
      quietRounds: tickState.quietRounds,
      factionAlerts,
      ...(districtTone ? { districtTone } : {}),
      income: this.lastLeverageIncome,
      decayAfter: QUIET_ROUNDS_BEFORE_DECAY,
    };
  }

  /**
   * WO-A5-1 (slice A5 §1, design lock 1): market-quote data for /market and
   * /trade — the engine's own `quoteBuyPrice(world, itemId, genre)` on a
   * representative item, plus the flat constant every quote prices from
   * (`SELL_BASE_VALUE`), so cli-display can compute a markup line
   * ("Merchants here mark you up 15%") without this domain doing any price
   * arithmetic of its own.
   *
   * HONESTY-FLOOR CORRECTION (node_modules/@ai-rpg-engine/modules/dist/
   * trade-core.js:348-350): the design doc frames this as "per district"
   * data, but `quoteBuyPrice` takes no district parameter at all — it
   * ALWAYS derives its district from `world.playerId`'s own current zone
   * (`getDistrictForZone(world, player.zoneId)`), by design (its own doc
   * comment: "this function is deliberately world-level... buyHandler
   * routes through it, so the quote and the purchase read the SAME
   * composition"). Calling it in a loop over every district would return
   * the identical number every time — the player's OWN district's quote —
   * mislabeled under every other district's id, which is a caller-visible
   * lie, not a "per district" survey. The only honest quote this domain can
   * hand cli-display is the one district the engine can actually price:
   * wherever the player is standing right now. cli-display's own worktree
   * (§1) decides whether to render this line only when the requested/
   * displayed districtId matches the returned `districtId`.
   */
  private buildMarketQuote(): {
    districtId: string;
    controllingFactionId?: string;
    sampleItemId: string;
    quotedPrice: number;
    basePrice: number;
  } | undefined {
    const districtId = this.getPlayerDistrictId();
    if (!districtId) return undefined;
    const economy = this.districtEconomies.get(districtId);
    if (!economy || !this.itemCatalog || this.itemCatalog.items.length === 0) return undefined;

    // "the pack's item catalog's first tradeable in that district's supply
    // categories (fallback: the first catalog item)" (WO-A5-1): the first
    // catalog item that IS one of the fixed ids getBuyableStock actually
    // offers for its own inferred SupplyCategory — not merely an item
    // whose category happens to have SOME stock offered (findBuyableCategory,
    // trade-core.js:308-314, requires the exact itemId to appear in that
    // list; quoteBuyPrice returns undefined for anything short of that, so
    // checking only the category would hand quoteBuyPrice an item it will
    // silently refuse to price). Falls back to the catalog's own first item
    // when nothing in the catalog is currently offered here (a
    // black-market-only or newly-seeded district, say) — quoteBuyPrice
    // then honestly returns undefined for it below, same as any other
    // untradeable/ungated case.
    let sampleItemId: string | undefined;
    for (const item of this.itemCatalog.items) {
      const category = inferSupplyCategory(item.id);
      if (getBuyableStock(economy, category, this.genre).includes(item.id)) {
        sampleItemId = item.id;
        break;
      }
    }
    sampleItemId ??= this.itemCatalog.items[0]?.id;
    if (!sampleItemId) return undefined;

    const quotedPrice = quoteBuyPrice(this.engine.world, sampleItemId, this.genre);
    if (quotedPrice === undefined) return undefined;

    const controllingFactionId = getDistrictDefinition(this.engine.world, districtId)?.controllingFaction;
    return {
      districtId,
      ...(controllingFactionId ? { controllingFactionId } : {}),
      sampleItemId,
      quotedPrice,
      basePrice: SELL_BASE_VALUE,
    };
  }

  /**
   * WO-B1F-4 (design lock 4, ADDENDUM-COMMON): "Market: <item> <price>
   * (<note>)" for the play screen's own location block -- three family
   * playtests found price-reacts 0 of 5 (no seat ever found /market or
   * /trade unprompted). Reuses buildMarketQuote()'s existing engine-priced
   * quote (same item selection, same `quoteBuyPrice` call the wave-8
   * /market and /trade paths already use) rather than recomputing
   * anything; undefined whenever buildMarketQuote() is (no market in this
   * district), so every existing fixture without a market renders
   * byte-identical (the field is simply absent).
   *
   * `note` mirrors the markup/standing math src/display/director-renderer.ts's
   * own (module-private, out of this domain's edit scope) formatMarketQuoteLine
   * already carries for `/market` -- duplicated here at the same handful of
   * arithmetic lines rather than exported, since the wording itself
   * ("Market: ..." vs "Merchants here quote ...") is a deliberately
   * different, NEW string per this WO, not a reuse of that render (listed
   * under strings_for_coordinator_review). Unlike that renderer, a district
   * with no controlling faction still gets a markup-only note (omitting
   * the faction/standing clause) rather than no note at all -- this WO's
   * own contract says the field is absent only when the district has no
   * market, not when it merely lacks a controlling faction.
   */
  private buildPresenterMarketQuote(): { item: string; price: number; note: string } | undefined {
    const quote = this.buildMarketQuote();
    if (!quote) return undefined;

    const itemName = this.itemCatalog?.items.find((i) => i.id === quote.sampleItemId)?.name ?? quote.sampleItemId;
    const pctDelta = quote.basePrice > 0
      ? Math.round(((quote.quotedPrice - quote.basePrice) / quote.basePrice) * 100)
      : 0;
    const sign = pctDelta >= 0 ? '+' : '';
    let note = `${sign}${pctDelta}% vs base`;
    if (quote.controllingFactionId) {
      const factionName = this.engine.world.factions[quote.controllingFactionId]?.name ?? quote.controllingFactionId;
      const reputation = (this.engine.world.factions[quote.controllingFactionId]?.reputation ?? 0)
        + Number(this.engine.world.globals?.[`reputation_${quote.controllingFactionId}`] ?? 0);
      const standing = reputation <= -30 ? 'hostile' : reputation <= 10 ? 'wavering' : reputation <= 60 ? 'favorable' : 'allied';
      note += ` · ${factionName}: ${standing}`;
    }

    return { item: itemName, price: quote.quotedPrice, note };
  }

  /**
   * F-f13ca236: number of post-turn subsystem-tick failures this session
   * (see the PB-001 catch block in processInput) — tracked independent of
   * the --debug gate, since debugLog is a true NoopLogger by default.
   */
  getSubsystemFailureCount(): number {
    return this.subsystemFailureCount;
  }

  /**
   * F-f13ca236: the most recent post-turn subsystem-tick failures (bounded
   * ring buffer, oldest evicted first — see MAX_SUBSYSTEM_FAILURE_RECORDS),
   * each with the full error stack, independent of the --debug gate.
   */
  getRecentSubsystemFailures(): readonly { tick: number; error: string }[] {
    return this.subsystemFailures;
  }

  /**
   * F-9319b8d8: player-visible summary of post-turn subsystem-tick failures
   * this session, for /status. Previously getSubsystemFailureCount()/
   * getRecentSubsystemFailures() were tracked but never surfaced anywhere a
   * player could query them — only a single transient, non-cumulative line
   * the first time a failure happened that turn ('[A subsystem hiccupped —
   * your turn was processed safely]'), with no way to later ask "did that
   * happen more than once?" Returns undefined when there have been no
   * failures this session, so /status's output is unchanged for the
   * overwhelming common case. renderCompactStatus (display/status-compact.ts,
   * cli-display domain) has no field for this, so the line is appended
   * after its rendered box rather than requiring a cross-domain opts change.
   */
  private buildSubsystemHealthIndicator(): string | undefined {
    if (this.subsystemFailureCount === 0) return undefined;
    const mostRecent = this.subsystemFailures[this.subsystemFailures.length - 1];
    const plural = this.subsystemFailureCount === 1 ? 'hiccup' : 'hiccups';
    return `${this.subsystemFailureCount} subsystem ${plural} this session, most recent: tick ${mostRecent?.tick ?? '?'}`;
  }

  /**
   * F-b4b16d0a: COST COMMAND cross-domain contract (game-core half) —
   * cli-display's /cost dispatch branch (bin.ts) calls this and prints the
   * result. Built on token-tracker.ts's existing formatCostSummary().
   * Narration and dialogue calls are fully counted; interpretation-call cost
   * is not yet counted — see token-tracker.ts's withTokenTracking() doc
   * comment for why (StructuredResult carries no token counts to record).
   */
  getCostSummary(): string {
    return this.tokenTracker.formatCostSummary();
  }

  /**
   * WO-A3-2 (slice A3 §3): pre-serialized RumorEngine snapshot for the save
   * path — cli-display's buildSaveInput (bin.ts) reads this and threads it
   * straight into SaveSessionInput.rumorEngine unchanged (same pass-through
   * discipline as GameConfig.restoredPresentationState/
   * this.immersion.stateMachine.current above).
   */
  getRumorEngineSnapshot(): string {
    return JSON.stringify(this.rumorEngine.serialize());
  }

  /**
   * WO-A5-4 (slice A5 §6, design lock 6): per-hearer rumor view for the
   * dialogue prompt — REPLACES `DialogueInput.playerRumors`' 4-valence
   * shape on narrative-llm's own dialogue path (their own worktree this
   * wave; turn-loop.ts's ExecuteTurnOpts.getHearerRumors threads this
   * straight through). `heardBy(npcId)` already excludes dead rumors and
   * sorts by confidence; `stanceOf` defaults to `'unknown'` for a rumor
   * this engine has no recorded stance for — shouldn't happen for anything
   * `heardBy` returns given runWorldRound's own spread step (below) always
   * sets a stance the SAME round a named NPC first hears a rumor, but an
   * honest reading either way: heard, no stance recorded.
   */
  getHearerRumors(npcId: string): HearerRumorView[] {
    return this.rumorEngine.heardBy(npcId).map((r) => ({
      claim: r.claim,
      stance: this.rumorEngine.stanceOf(npcId, r.id),
      confidence: r.confidence,
      mutationCount: r.mutationCount,
    }));
  }

  /**
   * WO-A5-4 (slice A5 §6, design lock 6): the /rumors board — the engine's
   * own `formatRumorBoard` view of what the player's OWN rumors (subject
   * 'player') have become across every hearer (mutation count, faction
   * uptake, denial). cli-display's /rumors renderer (its own worktree)
   * reads this instead of the deleted 4-valence formatter/
   * getRumorsKnownToFaction path. `query({ subject: 'player' })`
   * deliberately includes dead rumors — formatRumorBoard's own default
   * (`includeDead: false`) is what filters them, matching how the board
   * is documented to behave ("live statuses only" unless asked).
   */
  getRumorBoard(): RumorBoardLine[] {
    return formatRumorBoard(this.rumorEngine.query({ subject: 'player' }), {
      resolveName: (entityId) => this.engine.world.entities[entityId]?.name ?? entityId,
    });
  }

  /**
   * WO-A5-5 (slice A5 §7): pre-serialized worldMovedLedger for the save
   * path — cli-display's buildSaveInput (bin.ts) reads this and threads it
   * into SaveSessionInput.worldMoved, same pass-through discipline as
   * getRumorEngineSnapshot() above. Undefined when the ledger is empty
   * (same "omit when nothing to persist" convention resolvedOpportunities/
   * endgameTriggers already have in saveSession itself).
   */
  getWorldMovedSnapshot(): string | undefined {
    return this.worldMovedLedger.length > 0 ? JSON.stringify(this.worldMovedLedger) : undefined;
  }

  /**
   * WO-A6-1 (slice A6 §3, design lock 1): the resolved tuning object —
   * `DEFAULT_LIVING_WORLD_TUNING` merged with `GameConfig.tuning`'s partial
   * override, computed once at construction (see the constructor's own
   * comment). Every app lever this wave introduces reads FROM this object;
   * nothing recomputes it per-round.
   */
  getTuning(): LivingWorldTuning {
    return this.tuning;
  }

  /**
   * WO-A6-2 (slice A6 §5, design lock 2): the round-by-round metrics ledger
   * — NOT persisted (design doc §5). See `RoundMetrics`'s own doc comment
   * (game/round-metrics.ts) for what each field means and where it's
   * captured.
   */
  getRoundMetrics(): RoundMetrics[] {
    return this.roundMetrics;
  }

  /**
   * WO-A6-3 (slice A6 §5): the read-only data cli-display's `/tuning`
   * director command (WO-A6-5, their own worktree this wave) renders —
   * threaded into the director-mode call site below as `tuningView`
   * (ExecuteDirectorCommandOptions gains the matching field on cli-display's
   * side; excess property here until then — "green expected at merge," same
   * pattern as `worldLedger`/`marketQuotes`/`rumorBoard` above it).
   */
  getTuningView(): { tuning: LivingWorldTuning; lastRound?: RoundMetrics; rounds: number } {
    return {
      tuning: this.tuning,
      lastRound: this.roundMetrics[this.roundMetrics.length - 1],
      rounds: this.roundMetrics.length,
    };
  }

  /**
   * WO-A4-3 (slice A4 §4, design lock 5): the world-gen proposal this
   * packless session was instantiated from — cli-display's save-input
   * builder reads this (alongside getWorldSeed()) and threads it straight
   * into SaveSessionInput.worldGenProposal, same pass-through discipline as
   * getRumorEngineSnapshot() above. Undefined for a pack-launched session.
   */
  getWorldGenProposal(): WorldGenProposal | undefined {
    return this.worldGenProposal;
  }

  /** WO-A4-3: see getWorldGenProposal's doc comment. */
  getWorldSeed(): number | undefined {
    return this.worldSeed;
  }

  /** Apply profile update hints from a turn result. */
  applyProfileHints(hints: ProfileUpdateHints): void {
    if (!this.profile) return;

    // XP
    if (hints.xpGained > 0) {
      const { profile: updated, leveledUp, newLevel } = grantXp(this.profile, hints.xpGained);
      this.profile = updated;
      if (leveledUp) {
        this.pendingAnnouncements.push(`Level up! You are now level ${newLevel}.`);
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
      // WO-A2T-2 (slice A2 §9, R1): the accrued ledger, not the profile
      // directly — this.adjustFactionReputation refreshes the profile view.
      this.adjustFactionReputation(hints.reputationDelta.factionId, hints.reputationDelta.delta);

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
        this.pendingAnnouncements.push(`Title evolved: "${newTitle}"`);

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

    // Pressure resolution (player-driven).
    // WO-A2-3/4 (slice A2 §4, write-through): splice the resolved pressure
    // out of the world-tick namespace's OWN live `pressures` array (the
    // "one ledger" — this.activePressures is a view of it from this wave
    // on) instead of filtering a local copy. This call always runs OUTSIDE
    // a tick (applyProfileHints is a post-turn step, after runWorldRound's
    // own tick already finished this turn), so mutating the array
    // getWorldTickState returns directly is the correct discipline
    // pushActivePressure's own doc comment describes for non-tick callers.
    if (hints.pressureResolution) {
      const state = getWorldTickState(this.engine.world);
      const idx = state.pressures.findIndex(
        (p) => p.id === hints.pressureResolution!.pressureId,
      );
      if (idx !== -1) {
        const [pressure] = state.pressures.splice(idx, 1);
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

  /**
   * F-79a25863 (presentation seam contract): invoke the registered
   * onPresentation sink for this turn's audio/UI-effect calls, if the
   * caller registered one. Wrapped in try/catch — mirrors PB-001's
   * containment (game.ts's post-turn subsystem-tick block): a throwing
   * sink must never damage the turn.
   */
  private emitPresentation(calls: McpToolCall[]): void {
    if (!this.onPresentation) return;
    try {
      this.onPresentation(calls);
    } catch (err) {
      this.debugLog.error('subsystem', 'presentation sink failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Streaming seam contract (game-core half): relay one narration chunk to
   * the registered onNarrationChunk sink, if any. Wrapped in try/catch —
   * mirrors emitPresentation's containment above — because this function is
   * what actually gets passed down as narrateScene's onChunk (via
   * executeTurn's opts, turn-loop.ts), and that call site invokes it
   * directly with no try/catch of its own: a throwing sink must never
   * damage the turn.
   */
  private emitNarrationChunk(chunk: string): void {
    if (!this.onNarrationChunk) return;
    try {
      this.onNarrationChunk(chunk);
    } catch (err) {
      this.debugLog.error('subsystem', 'narration chunk sink failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Get the initial scene narration. */
  async getOpeningNarration(): Promise<string> {
    const presence = this.getPresence();
    const result = await generateOpeningNarration({
      // F-b4b16d0a: counted as 'narration' toward getCostSummary(), same as
      // every other narrateScene-family call this session makes.
      client: withTokenTracking(this.client, this.tokenTracker, 'narration'),
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
      chronicleContext: this.getChronicleContext(),
    });

    // F-79a25863 (seam contract): mirror turn-loop.ts's Step 4.5 so the
    // opening scene's own ambient/music intents (from its NarrationPlan)
    // reach the presentation sink too, not just real turns. Guarded on the
    // state machine not already being 'combat': ImmersionRuntime.initialize()
    // (called from this session's constructor) seeds 'combat' from a
    // mid-fight save's combat-core module state before this ever runs, and
    // processPresentation()'s empty-events state inference has no "preserve
    // current state" case — with no events to infer from it falls through to
    // 'exploration', which would flip a freshly restored 'combat' back
    // before the player's first real turn ever sees it. Skipping here costs
    // nothing for that case: the next real turn computes state (and any
    // cues) from its own actual events.
    let openingCalls: McpToolCall[] = [];
    if (this.immersion.stateMachine.current !== 'combat') {
      openingCalls = await this.immersion.processPresentation(
        this.engine,
        [],
        'look',
        result.plan ?? undefined,
      );
    }
    this.emitPresentation(openingCalls);

    this.history.record({
      tick: this.engine.tick,
      playerInput: '',
      verb: 'look',
      narration: result.narration,
      // F-8da2e6f7: sibling call site to turn-loop.ts's history.record()
      // calls — carry the same isFallback flag so a non-fatal LLM failure on
      // the opening narration doesn't get quoted back as real narrative
      // either (getRecentNarration() / recap.ts).
      isFallback: result.isFallback,
    });
    return renderOpeningOutput(
      result.narration,
      this.engine.world,
      this.engine.getAvailableActions(),
      this.getStatusData() ?? undefined,
      this.genre,
      this.packId,
    );
  }

  /**
   * WO-A4-1 (slice A4 §1, design lock 1, renamed from refreshWorldViews):
   * refresh the profile-side VIEWS only — reputation composition
   * (stampReputationBaselines + refreshReputationProfile). The eleven
   * world-backed session fields this method used to also resync
   * (activePressures, resolvedPressures, activeOpportunities, lastNpcActions/
   * lastNpcProfiles/npcObligations/activeConsequenceChains,
   * lastFactionActions/lastFactionProfiles, districtEconomies,
   * playerRumors) plus partyState are now live `get` accessors over world
   * truth (above) that need no refresh step at all — every access already
   * reads `this.engine.world` fresh. Still called after runWorldRound()'s
   * tick and after every write-through mutation elsewhere in this file
   * (design lock 3 — "one ledger per store"), since the profile's
   * reputation view is genuinely a separate store from the world-truth
   * getters and still needs its own explicit sync.
   *
   * stampReputationBaselines is idempotent (a no-op once
   * `claude_rpg.rep_baselined` is set) — calling it on every round is what
   * lets a FRESH world (no SavedSession to seed from; see
   * world-truth-seed.ts's WO-A2T-1 for the loaded-save half) get its
   * baseline stamped on its own first round, per design doc §9 (A2).
   *
   * WO-A2T-3's leverage unification is deliberately NOT mirrored here.
   * Reputation's five write sites are ALL converted (design doc §9's own
   * enumeration, verified exhaustive against a grep for `adjustReputation(`
   * — every one funnels through addFactionReputationGlobal now), so
   * profile.reputation has exactly one writer and refreshing it
   * unconditionally every round is safe. Leverage/heat effects, by
   * contrast, still write `profile.custom` DIRECTLY in three other places
   * this file (applyOpportunityFalloutEffects, applyLeverageEffects,
   * applyCraftEffects) — an earlier attempt to also convert those three
   * broke a currently-passing test (game.test.ts's F-5b48354f
   * bribe-resolution case): a blanket per-round leverage view-refresh from
   * the entity's ledger silently reverted a leverage-verb's own
   * profile.custom write the very next round, since the entity ledger and
   * profile.custom are still two genuinely separate stores for those three
   * sites. tickPlayerLeverage's own call to writeLeverageDeltas stays
   * scoped to itself (see that method's own doc comment for the residual,
   * narrower same-turn gap this leaves).
   */
  private refreshProfileViews(): void {
    if (this.profile) {
      stampReputationBaselines(this.profile, this.engine.world);
      this.profile = refreshReputationProfile(this.profile, this.engine.world);
    }
  }

  /**
   * Coordinator stitch (slice A2-truth, wave 5): the ONE load-time seed entry
   * point for a 1.x save. Runs seedWorldTruthFromSession against this
   * session's engine + profile and then refreshes the profile views —
   * WO-A4-1: the world-backed getters need no seed-time refresh of their
   * own (they read world truth live, and seedWorldTruthFromSession has
   * already written it by this point), but a FRESH world's reputation
   * baseline still needs its one explicit stamp. bin.ts's runLoad and the
   * test harness both call this; nothing calls the bare seed with a live
   * session.
   */
  seedWorldTruth(saved: SavedSession, engineVersion?: string): WorldTruthSeedReport {
    const version = engineVersion
      ?? (this.engine.world as { meta?: { saveVersion?: string } }).meta?.saveVersion
      ?? 'unknown';
    const report = seedWorldTruthFromSession(this.engine, saved, this.profile, version);
    this.refreshProfileViews();
    // resolvedOpportunities is session HISTORY, not world truth: the engine's
    // opportunity-core namespace holds only the live list, and the view table
    // appends expiry fallout per round. Restore it from the save here so both
    // callers (bin.ts, the harness) get it through the one seed path.
    this.resolvedOpportunities = loadResolvedOpportunitiesFromSession(saved);
    return report;
  }

  /**
   * WO-A2T-2 (slice A2 §9, R1): the ONE write path for a reputation delta —
   * ADDs to `world.globals['reputation_<factionId>']` (never sets; see
   * reputation-view.ts's addFactionReputationGlobal), then refreshes the
   * profile's reputation view. `adjustReputation` (character-profile) is
   * never called directly anywhere else in this file after this wave.
   */
  private adjustFactionReputation(factionId: string, delta: number): void {
    const world = this.engine.world;
    addFactionReputationGlobal(world, factionId, delta);
    if (this.profile) {
      stampReputationBaselines(this.profile, world);
      this.profile = refreshReputationProfile(this.profile, world);
    }
  }

  /**
   * WO-A2-3/4 (slice A2 §4, write-through): the one write path for
   * npcObligations mutations outside the tick. setPersistedNpcState is a
   * full-namespace write (profiles/lastActions/obligationLedgers/chains/
   * recapEntries together) — read the other four slices back from world
   * truth first so this call only actually changes the obligations
   * ledger, then refresh every view.
   */
  private writeNpcObligations(next: Map<string, NpcObligationLedger>): void {
    const world = this.engine.world;
    setPersistedNpcState(
      world,
      getPersistedNpcProfiles(world),
      getPersistedNpcLastActions(world),
      next,
      getPersistedNpcChains(world),
      getPersistedNpcRecapEntries(world),
    );
    this.refreshProfileViews();
  }

  /**
   * WO-A2-2 (slice A2 §2): the living-world round — wired as this session's
   * own executeTurn() `onResolved` hook (see the call site in
   * processInput() below). Runs AFTER the player's action resolved and
   * BEFORE narration, so pressure spawns, NPC/faction actions, district-
   * mood/heat/leverage-income ticks, and encounter spawns all land in the
   * SAME turn's narration and event log the player's own action did.
   *
   * Corpse gate (step 1): no tick over a corpse. followPlayer (step 2):
   * companions move with the player when the zone changed, so the world
   * then reacts to where they actually stand. Steps 3-4: capture the
   * eventLog cursor, then run the tick — straight adoption, no feature
   * flag (design lock 2): every non-rejected, non-corpse round. Step 4.5
   * (WO-A3-2, slice A3 §3): tick the RumorEngine's own lifecycle
   * (spreading → established → fading → dead; stance decay), AFTER the
   * world tick and BEFORE the profile-view refresh (design doc §3's own
   * ordering). Step 5: refresh the profile views (WO-A4-1: the
   * world-backed getters need no refresh call — they already read this
   * round's tick output live). Step 5.5 (WO-A3-2): sweep this round's
   * refreshed playerRumors for any ledger rumor not yet mirrored — the
   * tick's own NPC-originated rumors (spawnNpcOriginatedRumor, written
   * directly into the player-rumor namespace by the engine's own
   * npc-agency step, never through this session's addRumor) land here,
   * plus any other write path that bypasses addRumor entirely (e.g.
   * game-state.ts's applyFalloutEffects rumor case, which writes through
   * setPlayerRumorState directly rather than this.addRumor — see that
   * method's own doc comment). Step 6: drain the tick's own
   * companion-reaction side effects — WO-A4-1: partyState is a live
   * getter now, so there is no separate session-field resync to do here
   * any more (see that getter's own doc comment above). Step 7: return the
   * round's delta so turn-loop.ts's `events` includes it for
   * narration/hints/history.
   */
  private runWorldRound(actionEvents: ResolvedEvent[]): ResolvedEvent[] {
    // Coordinator stitch (slice A3): a fresh world stamps the seed marker at
    // its first round, so every save it ever writes carries it and no later
    // load can mistake the world for an unseeded 1.x save (the tests agent's
    // data-loss finding; the seed also refuses v3 saves outright).
    if (this.engine.world.globals[STORES_SEEDED_KEY] === undefined) {
      const ver = (this.engine.world as { meta?: { saveVersion?: string } }).meta?.saveVersion ?? 'unknown';
      this.engine.world.globals[STORES_SEEDED_KEY] = `fresh@${ver}`;
    }
    // 1. Corpse gate.
    const player = this.engine.world.entities[this.engine.world.playerId];
    const alreadyDead = (player?.resources?.hp ?? 1) <= 0;
    const justDefeated = actionEvents.some(
      (e) => e.type === 'combat.entity.defeated' && e.payload.entityId === this.engine.world.playerId,
    );
    if (alreadyDead || justDefeated) return [];

    // 2. followPlayer when the zone changed this turn.
    if (this.turnStartZoneId !== undefined && this.engine.world.locationId !== this.turnStartZoneId) {
      followPlayer(this.engine, this.partyState);
    }

    // WO-A2-4 (slice A2 §5, kept branch): reference-identity snapshot of
    // this round's INCOMING lastNpcActions/lastFactionActions views. The
    // engine's own persisted lastActions list is a ROLLING snapshot (the
    // most recent action PER npc/faction, not "this round's actions") —
    // an npc/faction that took no action this round keeps the SAME object
    // reference from a previous round, while one that DID act gets a
    // brand-new result object (verified against world-tick.js's
    // runNpcAgencyStep/runFactionAgencyStep: both seed their
    // lastActionsBy* map from getPersistedNpc/FactionLastActions and only
    // `.set()` a NEW object for ids present in this round's own results).
    // Comparing by reference after the tick — not content — is what lets
    // the chronicle derivation below fire only for entries that are
    // actually new this round, instead of re-chronicling the same stale
    // action every quiet round forever.
    const prevNpcByNpc = new Map(this.lastNpcActions.map((r) => [r.action.npcId, r]));
    const prevFactionByFaction = new Map(this.lastFactionActions.map((r) => [r.action.factionId, r]));

    // WO-A5-2 (slice A5 §2, design lock 2): before-snapshot for this
    // round's district-mood transition — compared against the after value
    // once the tick has run, below.
    const playerDistrictId = this.getPlayerDistrictId();
    const moodBefore = playerDistrictId
      ? getWorldTickState(this.engine.world).districtTones?.[playerDistrictId]
      : undefined;
    // WO-A5-3 (slice A5 §4, design lock 4): before-snapshot for this
    // round's leverage-currency income — the tick's own
    // runLeverageIncomeStep (world-tick.js) writes back onto THIS SAME
    // entity object's `.custom` (`player.custom = custom`), so `player`
    // here — already captured at step 1's corpse gate, above — sees the
    // write with no extra lookup once the tick returns.
    const leverageBefore = getLeverageState(player?.custom ?? {});

    // 3. Capture the eventLog cursor before the tick.
    const before = this.engine.world.eventLog.length;

    // 4. Run the tick.
    const tickResult = runWorldTick(this.engine, {
      genre: this.genre,
      log: (m) => this.debugLog.warn('world-tick', m),
    });
    if (!tickResult.ok) {
      // WorldTickResult.ok:false means the guarded tick threw internally
      // and logged its own bounded line already (runWorldTick's own
      // contract) — logged here too, never surfaced raw to the player.
      this.debugLog.error('subsystem', 'world tick failed', { tick: this.engine.tick });
    }

    // WO-A5-2 (design lock 2): detect this round's transition — undefined
    // when nothing changed (recomputed fresh every round, never
    // accumulated). moodBefore/moodAfter are both undefined on a district's
    // very first observation (world-tick.ts's own "establish the baseline
    // silently" contract, districtTones' own doc comment) — the `!==
    // undefined` guards below mean that round correctly reports no
    // transition rather than a spurious one from nothing.
    this.lastMoodTransition = undefined;
    if (playerDistrictId) {
      const moodAfter = getWorldTickState(this.engine.world).districtTones?.[playerDistrictId];
      if (moodBefore !== undefined && moodAfter !== undefined && moodBefore !== moodAfter) {
        this.lastMoodTransition = { districtId: playerDistrictId, from: moodBefore, to: moodAfter };
        this.pushWorldMoved('mood-transition', `${playerDistrictId}: ${moodBefore} -> ${moodAfter}`);
      }
    }

    // WO-A5-3 (design lock 4): this round's leverage-currency income —
    // {} when the tick granted nothing (a quiet round, or a world with no
    // leverage activity at all yet — runLeverageIncomeStep's own SEED-0
    // gate).
    const leverageAfter = getLeverageState(player?.custom ?? {});
    const leverageIncome: Partial<Record<LeverageCurrency, number>> = {};
    for (const currency of Object.keys(leverageAfter) as LeverageCurrency[]) {
      const delta = leverageAfter[currency] - leverageBefore[currency];
      if (delta !== 0) leverageIncome[currency] = delta;
    }
    this.lastLeverageIncome = leverageIncome;

    // WO-A5-5 (slice A5 §7): "the world moved" — pressures spawned/
    // expired, opportunities offered/expired, and ambushes, all sourced
    // straight from this round's own WorldTickResult (pressure-resolved is
    // pushed from resolvePressure() instead — see its own doc comment).
    for (const p of tickResult.spawned) {
      const headline = `${p.kind}: ${p.description}`;
      this.pushWorldMoved('pressure-spawned', headline);
      // WO-B1F-5 (design lock 5, ADDENDUM-COMMON): pressure lifecycle
      // headlines were only ever visible in the recap (all three family
      // playtests) -- also surfaced through the SAME announcement channel
      // the ask lines use, once, the round it happens. String unchanged
      // (B1-COORDINATOR-STRINGS ruling: "the existing headlines,
      // unchanged").
      this.pendingAnnouncements.push(headline);
    }
    for (const fallout of tickResult.expired) {
      const headline = `${fallout.resolution.pressureKind}: ${fallout.summary}`;
      this.pushWorldMoved('pressure-expired', headline);
      this.pendingAnnouncements.push(headline);
    }
    for (const opp of tickResult.opportunitiesSpawned) {
      this.pushWorldMoved('opportunity-offered', opp.title);
    }
    for (const fallout of tickResult.opportunitiesExpired) {
      this.pushWorldMoved('opportunity-expired', fallout.summary);
    }
    for (const enc of tickResult.encounters) {
      this.pushWorldMoved('ambush', `${enc.encounterName} in ${enc.zoneId}`);
      // WO-B1-2 (design lock 3, awareness trigger 3 of 3): an ambush reveals
      // itself to the player on arrival -- its own hostiles are aware from
      // the round they spawn, so next round's hostile turn can act on them.
      markEntitiesAware(this.engine.world, enc.entityIds, this.engine.tick);
      // WO-B1-5 (design lock 8, repay trigger 1 of 3): a gratitude debt owed
      // to the player pays back with a warning the round an ambush lands in
      // the PLAYER'S OWN zone (see checkAmbushGratitudeWarning's own doc
      // comment for why this is same-round, not one-round-ahead).
      if (enc.zoneId === this.engine.world.locationId) {
        const warning = checkAmbushGratitudeWarning(
          this.engine.world,
          (npcId) => this.engine.world.entities[npcId]?.name ?? npcId,
        );
        if (warning) {
          this.pushWorldMoved('gratitude-repaid', warning);
          this.pendingAnnouncements.push(warning);
        }
      }
    }

    // resolvedOpportunities: append this round's expiry fallout (design
    // doc §3 — an accumulator, not a world-truth getter; it stays a real
    // field per WO-A4-1).
    for (const fallout of tickResult.opportunitiesExpired) {
      this.resolvedOpportunities.push(fallout);
    }
    this.capOldestFirst(this.resolvedOpportunities, MAX_RESOLVED_FALLOUT_ENTRIES); // F-51e110b9

    // 4.6 (WO-B1-4/5, slice B1 §§4-5): the asks ledger -- offer a fresh ask
    // for the player's district (at most one open at a time), age out any
    // open ask nobody answered, and apply the consequence of every
    // predatory ask whose reveal window just elapsed. Runs after the world
    // tick (asks are an app-truth ledger, not an engine one) and before the
    // RumorEngine tick just below, so a reveal's own rumor (pushed via
    // addRumor, which mirrors into the RumorEngine) is eligible to spread
    // this SAME round (mirrors the ordering note on WO-A3-2's mirror sweep,
    // a few steps below).
    this.processAsks();

    // 4.5 (WO-A3-2, slice A3 §3): tick the RumorEngine's own lifecycle —
    // AFTER the world tick, BEFORE the profile-view refresh (design doc
    // §3's ordering; see this method's own doc comment above).
    this.rumorEngine.tick(this.engine.tick);

    // 5. Refresh the profile views (reputation composition) — WO-A4-1: the
    // world-backed getters (activePressures, playerRumors, etc.) need no
    // refresh call at all; they already read this round's tick output live.
    this.refreshProfileViews();

    // 5.5 (WO-A3-2): mirror any ledger rumor this round's refreshed
    // playerRumors carries that isn't in the RumorEngine yet — catches the
    // tick's own NPC-originated rumors and any write path that bypasses
    // this.addRumor. Idempotent (mirrorPlayerRumor's own findBySubjectKey
    // guard), so re-scanning already-mirrored rumors every round is safe.
    this.mirrorUnmirroredRumors();

    // WO-A5-4 (slice A5 §6, design lock 6): per-hearer rumor spread — for
    // each active RumorEngine rumor about the player, spread once per
    // round to every named NPC in the player's current district who
    // hasn't heard it yet (spreadPath), then set that NPC's FIRST-hearing
    // stance. Runs after the mirror sweep (this method's own step 5.5,
    // above) so a rumor mirrored into the RumorEngine THIS round is
    // eligible to spread the SAME round it's mirrored, not one round
    // behind. No-op when the player has no district or no named NPCs live
    // there this round.
    //
    // WO-A6-2: this round's first-hearing stance tally, reset every round
    // (even one that never enters this block) — read by
    // captureRoundMetrics().
    this.lastRoundStanceBelieve = 0;
    this.lastRoundStanceDoubt = 0;
    if (playerDistrictId) {
      // WO-A6-1 (slice A6 §3, design lock 1): 'zone' restricts spread to the
      // player's own zone instead of the whole district — measured default
      // ('district') keeps today's `getDistrictForZone(...) ===
      // playerDistrictId` filter byte-identical; the outer `if
      // (playerDistrictId)` gate above is unchanged for either scope value
      // (a 'zone'-scoped session still needs the player standing in SOME
      // district today — narrowing that gate is out of this wave's scope,
      // since every lever this wave ships must stay byte-identical at
      // defaults and the composed-proof fixtures all place named NPCs
      // inside a district).
      const playerZoneId = this.engine.world.entities[this.engine.world.playerId]?.zoneId;
      // A6 wave T2 (dogfood/tuning/WAVE_2_OUTCOMES.md): 'adjacent-districts'
      // widens the district filter to every district that shares a zone
      // edge with the player's -- the street talks across a doorway. The
      // T0/T1 sheets measured NPC hearers <= 2 and 0 on four rumor-producing
      // worlds because the fixed script leaves the player where no named
      // NPC lives after the milestone that spawned the rumor.
      const audienceDistrictIds = new Set<string>([playerDistrictId]);
      if (this.tuning.rumorSpreadScope === 'adjacent-districts') {
        const zoneIds = getDistrictDefinition(this.engine.world, playerDistrictId)?.zoneIds ?? [];
        for (const zoneId of zoneIds) {
          for (const neighborId of this.engine.world.zones[zoneId]?.neighbors ?? []) {
            const neighborDistrict = getDistrictForZone(this.engine.world, neighborId);
            if (neighborDistrict) audienceDistrictIds.add(neighborDistrict);
          }
        }
      }
      const namedNpcIds = Object.values(this.engine.world.entities)
        .filter((e) => isNamedNpc(e, this.engine.world.playerId))
        .filter((e) => e.zoneId !== undefined && (
          this.tuning.rumorSpreadScope === 'zone'
            ? e.zoneId === playerZoneId
            : audienceDistrictIds.has(getDistrictForZone(this.engine.world, e.zoneId) ?? '')
        ))
        .map((e) => e.id);

      if (namedNpcIds.length > 0) {
        // environmentInstability = 1 - (district stability / 100), clamped
        // (design lock 6) — the SAME 0-100 composed-safety stability
        // buildPressureInputs derives (world-tick.d.ts's
        // DISTRICT_STABILITY_BASE doc comment: "clamp(0, 100, base +
        // district_<id>_safety)"), NOT district-core's own ~0-10 raw
        // metric (a different scale entirely, per that same doc comment).
        // No public single-district accessor exists for this composed
        // figure short of buildPressureInputs' full PressureInputs sweep
        // (a whole-world pass this per-round rumor step has no other
        // reason to pay for), so this reads the documented formula
        // directly off the same global buildPressureInputs itself reads.
        const safetyRaw = this.engine.world.globals[`district_${playerDistrictId}_safety`];
        const safetyDelta = typeof safetyRaw === 'number' ? safetyRaw : 0;
        const stability = Math.min(100, Math.max(0, DISTRICT_STABILITY_BASE + safetyDelta));
        const environmentInstability = Math.min(1, Math.max(0, 1 - stability / 100));

        for (const rumor of this.rumorEngine.aboutSubject('player')) {
          // "spreaderId = the rumor's last spreader" (WO-A5-4): resolved
          // ONCE per rumor (not per hearer) so every named NPC this round
          // hears it from the SAME source — the rumor's own state as of
          // this round's start, not a live chain that would otherwise
          // depend on namedNpcIds' arbitrary iteration order.
          const spreaderId = rumor.spreadPath.length > 0
            ? rumor.spreadPath[rumor.spreadPath.length - 1]
            : rumor.sourceId;
          const spreaderFactionId = resolveEntityFaction(this.engine.world, spreaderId);

          for (const npcId of namedNpcIds) {
            if (rumor.spreadPath.includes(npcId)) continue; // already heard
            const mutationCountBefore = rumor.mutationCount;
            const receiverFactionId = resolveEntityFaction(this.engine.world, npcId);
            const spread = this.rumorEngine.spread(rumor.id, {
              spreaderId,
              spreaderFactionId,
              receiverId: npcId,
              receiverFactionId,
              environmentInstability,
              hopCount: rumor.spreadPath.length,
              currentTick: this.engine.tick,
            });

            // Stance on first hearing (design lock 6, one rule, documented
            // — A6 tunes): believe if the rumor's faction uptake already
            // includes the hearer's own faction, OR the hearer's suspicion
            // is low (< this.tuning.rumorBelieveSuspicionBelow — WO-A6-1;
            // measured default 50, the SAME threshold cognition-core.js's
            // own intent evaluation uses for "increasingly suspicious"
            // behavior; DEFAULT_SUSPICION is 0, so an NPC nothing has
            // provoked reads as low-suspicion by default); doubt
            // otherwise.
            const suspicion = getCognition(this.engine.world, npcId).suspicion;
            const believes = (receiverFactionId !== undefined && spread.factionUptake.includes(receiverFactionId))
              || suspicion < this.tuning.rumorBelieveSuspicionBelow;
            this.rumorEngine.setStance(npcId, spread.id, believes ? 'believe' : 'doubt', this.engine.tick);
            // WO-A6-2: tally this round's first-hearing stance split.
            if (believes) this.lastRoundStanceBelieve++; else this.lastRoundStanceDoubt++;

            if (spread.mutationCount > mutationCountBefore) {
              this.pushWorldMoved('rumor-mutated', `${spread.claim} (x${spread.mutationCount})`);
            }
          }
        }
      }
    }

    // WO-A2-4 (slice A2 §5, kept branch): chronicle entries for NPC and
    // faction actions new THIS round only (see the reference-identity
    // note above) — re-sourced from the refreshed views instead of the
    // deleted tickFactionAgency/tickNpcAgencyTurn's own per-result loops.
    // This also covers the old forced-chain-step loop's chronicle side
    // effect: the engine merges a resolved chain's forced action into the
    // SAME lastActions list (world-tick.js's runNpcAgencyStep pushes the
    // stepped result into `results` before persisting), so it shows up
    // here too, keyed by the same reference-identity check.
    for (const result of this.lastNpcActions) {
      if (prevNpcByNpc.get(result.action.npcId) === result) continue;
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
    }
    // WO-A6-2: this round's faction-agency action count, reset every round
    // — read by captureRoundMetrics(). Counted from the SAME
    // reference-identity diff the chronicle derivation below already pays
    // for.
    this.lastRoundFactionActions = 0;
    for (const result of this.lastFactionActions) {
      if (prevFactionByFaction.get(result.action.factionId) === result) continue;
      this.lastRoundFactionActions++;
      const source: ChronicleEventSource = {
        kind: 'faction-action',
        action: result.action,
        tick: this.engine.tick,
      };
      for (const entry of deriveChronicleEvents(source, this.engine.world.playerId)) {
        this.journal.record(entry);
      }
    }

    // 6. Drain the tick's own companion-reaction side effects.
    // WO-A2-8 (runtime-foundry, cross-domain — ADDENDUM-runtime-foundry.md):
    // the tick's district-mood transition step (world-tick.ts step 0c)
    // reacts companions directly against the engine's OWN persisted party
    // mirror (getPartyState/setPartyState, companion-core.ts). WO-A4-1:
    // `this.partyState` is a live getter over that SAME mirror now, so any
    // morale/departure the tick just applied is already visible to this
    // session on its very next access — no resync assignment needed here
    // any more (see the getter's own doc comment above). Just drain
    // whatever reaction trigger companion-bridge.ts's
    // drainQueuedCompanionReactions maps into this app's own
    // CompanionReaction shape for recording (see that function's own doc
    // comment, companion-bridge.ts, for exactly what it drains).
    try {
      if (typeof companionBridge.drainQueuedCompanionReactions === 'function') {
        // Coordinator stitch (wave 4): the engine has NO reaction queue — the
        // tick applies companion reactions synchronously and emits
        // companion.reaction / companion.departed onto the event log — so the
        // drain reads the round's own delta from the pre-tick cursor.
        const drained = companionBridge.drainQueuedCompanionReactions(this.engine, before);
        if (drained.length > 0) this.lastCompanionReactions = drained;
      }
    } catch (err) {
      this.debugLog.error('subsystem', 'companion reaction drain failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 7. Return the round's delta.
    return this.engine.world.eventLog.slice(before);
  }

  /**
   * WO-B1-4/5 (slice B1 §§4-5, design locks 7-8): the asks ledger's own
   * per-round step -- age out unanswered asks, apply a due predatory
   * reveal's consequence, then offer a fresh ask for the player's district
   * if none is open. Called once per round from runWorldRound(), after the
   * world tick.
   */
  private processAsks(): void {
    const world = this.engine.world;
    const tick = this.engine.tick;

    // A predatory ask's reveal, once its window has elapsed.
    for (const ask of dueReveals(world, tick, this.tuning.askRevealRounds)) {
      const subjectName = askSubjectName(ask, world);
      if (ask.status !== 'helped') {
        // The player never bit: the reveal is free, and named.
        markAskRevealed(world, ask.id, tick);
        this.pushWorldMoved('ask-revealed', `${subjectName}'s story wasn't true. You never bit.`);
        this.pendingAnnouncements.push(`${subjectName}'s story wasn't true. You never bit.`);
        continue;
      }
      const consequence = resolveAskConsequence(ask);
      switch (consequence.kind) {
        case 'coin-lost': {
          const player = world.entities[world.playerId];
          if (player) {
            const before = (player.resources.coin as number | undefined) ?? 0;
            player.resources.coin = Math.max(0, before - consequence.amount);
          }
          break;
        }
        case 'ambush': {
          // Design lock 7: "via the encounter-spawn registry's spawn for
          // the destination zone" -- honesty floor: the installed engine's
          // encounter-spawn step (encounter-spawn.ts) resolves spawns
          // internally against its own registered content and zone
          // tables; it exposes no app-callable "spawn this specific
          // encounter in this zone now" entry point (only
          // runEncounterSpawnStep, the whole-tick sweep already run this
          // round via runWorldTick). Reproducing that registry's own
          // content-matching logic here would duplicate engine internals
          // this domain doesn't own. Applied instead as a direct, named
          // consequence: a hostile encounter the player will meet on
          // arrival at that zone, via the SAME awareness/hostile-turn
          // machinery WO-B1-2 already ships (markEntitiesAware once they
          // arrive) -- deferred to the next visit rather than synthesized
          // here with no real entities to seat.
          this.pushWorldMoved('ask-revealed', `${subjectName}'s "guide" was a trap -- the path to ${consequence.zoneId} was watched.`);
          break;
        }
        case 'faction-pin':
        case 'standing-burn':
          this.adjustFactionReputation(consequence.factionId, consequence.delta);
          break;
      }
      markAskRevealed(world, ask.id, tick);
      this.pushWorldMoved('ask-revealed', `${subjectName}'s story wasn't true.`);
      // Playtest b1-2026-09-02b: a reveal that only the recap reports is a
      // con nobody felt. Announce it the round it lands, with its cost.
      this.pendingAnnouncements.push(`${subjectName}'s story wasn't true.${describeAskCost(consequence)}`);
    }
    // Age out a GENUINE ask nobody answered within the reveal window
    // (stitch ruling, wave 10: one cadence for both truths -- the con shows
    // its hand after askRevealRounds, and a real need left that long
    // "resolves badly for the petitioner ... and the world says so later",
    // design doc §4). Predatory asks never reach this loop: the reveal step
    // above already resolved them, at no cost when the player never bit.
    for (const ask of getAllAsks(world)) {
      if (ask.status !== 'open' || ask.truth !== 'genuine') continue;
      if (tick - ask.offeredTick < this.tuning.askRevealRounds) continue;
      markAskIgnored(world, ask.id);
      this.pushWorldMoved('ask-ignored', `${askSubjectName(ask, world)} needed help that never came.`);
      this.pendingAnnouncements.push(`${askSubjectName(ask, world)} needed help that never came.`);
    }


    // Offer a fresh ask for the player's district, at most one open at a
    // time (maybeOfferAsk's own gate).
    const offer = maybeOfferAsk({ world, tick, worldSeed: world.meta.seed, tuning: this.tuning });
    if (offer) {
      // maybeOfferAsk is pure (asks.ts's own doc comment) -- this call site
      // is the one place that actually seats the petitioner and persists
      // the ledger.
      world.entities[offer.petitionerEntity.id] = offer.petitionerEntity;
      // Plant the 'rumor' cue for real (design lock 7: RumorEngine.create,
      // subject = the petitioner, never the player) -- planAskCues already
      // described the cue text; this attaches a live rumor id to it so
      // /rumors and /npc can surface something concrete when the player
      // cross-checks. Genuine asks plant no rumor cue (planAskCues' own
      // contract: one cue total, the faction tie), so there's nothing to
      // create here for them.
      const rumorCue = offer.ask.cues.find((c) => c.kind === 'rumor');
      if (rumorCue) {
        const rumor = this.rumorEngine.create({
          claim: rumorCue.detail,
          subject: askSubjectId(offer.ask),
          key: 'suspicious-story',
          value: true,
          sourceId: askSubjectId(offer.ask),
          originTick: tick,
          confidence: 0.6,
        });
        rumorCue.rumorId = rumor.id;
      }
      world.globals['claude_rpg.asks'] = JSON.stringify([...getAllAsks(world), offer.ask]);
      this.pushWorldMoved('ask-offered', offer.ask.surface);
      // Second family playtest (b1-2026-09-02): every seat's recap listed
      // "Asks made of you" but no seat ever saw an ask on the play screen
      // -- the offer reached only the ledger, so nobody could help a
      // petitioner or dodge a con (con/recognition 1 of 5). The ask is now
      // announced the round it is made, with the verb that answers it.
      const petitionerName = offer.petitionerEntity.name;
      this.pendingAnnouncements.push(`${petitionerName} asks you: "${offer.ask.surface}" (help ${petitionerName.toLowerCase()} to answer, or walk on)`);
    }
  }

  /**
   * WO-B1-5 (slice B1 §5, design lock 8): recognition for a genuine ask
   * just helped this turn -- the acknowledgment line, the per-faction
   * reputation delta, the witnessed rumor, and the gratitude grant. Called
   * from processInput() right after executeTurn() returns, once
   * `interpreted.parameters?.helpAskId` (set by action-interpreter.ts's
   * `help <name>` fast-path alias, WO-B1-3) names the ask being answered.
   * Returns the acknowledgment line, or `undefined` when there was nothing
   * to recognize this turn (no helpAskId, an ask already resolved, or a
   * predatory ask -- which gets no immediate recognition; its own
   * consequence arrives later via processAsks' reveal step).
   */
  private applyRecognitionForHelpedAsk(askId: string | undefined): string | undefined {
    if (!askId) return undefined;
    const world = this.engine.world;
    const ask = getAsk(world, askId);
    if (!ask || ask.status !== 'open') return undefined;

    markAskHelped(world, askId);
    if (ask.truth !== 'genuine') return undefined; // predatory: no recognition, reveal comes later

    const subjectName = askSubjectName(ask, world);
    const line = recognitionLineFor(subjectName, ask.kind);

    if (ask.petitioner?.factionId) {
      this.adjustFactionReputation(ask.petitioner.factionId, recognitionReputationDelta(ask.stake));
    }

    this.rumorEngine.create({
      claim: recognitionRumorClaim(subjectName, ask.kind),
      subject: 'player',
      key: 'good-deed',
      value: true,
      sourceId: askSubjectId(ask),
      originTick: this.engine.tick,
      confidence: 0.9,
      emotionalCharge: 0.5,
    });

    grantGratitude(world, askSubjectId(ask), askId, ask.petitioner?.factionId);
    this.pushWorldMoved('deed-recognized', line);
    return line;
  }

  /**
   * WO-B1F-2 (design lock 2, ADDENDUM-COMMON): every field executeDirectorCommand()
   * needs EXCEPT `command` -- extracted so play-mode's `/rumors` alias
   * (design lock 2: "the director renderer's rumor view, same output") can
   * call the SAME renderer director mode already dispatches to, without
   * duplicating this ~60-line options assembly or forking any of its
   * strings. The director-mode dispatch just below and the play-mode
   * `/rumors` branch (processInput) both do
   * `executeDirectorCommand({ command: <the raw command string>, ...this.buildDirectorCommandOptions() })`.
   */
  private buildDirectorCommandOptions(): Omit<Parameters<typeof executeDirectorCommand>[0], 'command'> {
    const dirRecommendation = this.profile ? this.buildMoveRecommendation() : null;
    return {
      world: this.engine.world,
      playerRumors: this.playerRumors,
      activePressures: this.activePressures,
      resolvedPressures: this.resolvedPressures,
      journal: this.journal,
      currentTick: this.engine.tick,
      characterName: this.profile?.build.name,
      characterTitle: this.profile?.custom.title as string | undefined,
      factionProfiles: this.lastFactionProfiles,
      lastFactionActions: this.lastFactionActions,
      leverageState: this.profile ? getLeverageState(this.profile.custom) : undefined,
      strategicMap: this.profile ? this.buildCurrentStrategicMap() : undefined,
      statusData: this.getStatusData() ?? undefined,
      suggestedMove: dirRecommendation?.top3[0] ?? null,
      situationTag: dirRecommendation?.situationTag ?? 'safe',
      profileCustom: this.profile?.custom as Record<string, string | number | boolean> | undefined,
      npcProfiles: this.lastNpcProfiles,
      lastNpcActions: this.lastNpcActions,
      npcObligations: this.npcObligations,
      partyState: this.partyState,
      profile: this.profile,
      itemCatalog: this.itemCatalog,
      districtEconomies: this.districtEconomies,
      genre: this.genre,
      activeOpportunities: this.activeOpportunities,
      arcSnapshot: this.arcSnapshot,
      endgameTriggers: this.endgameTriggers,
      finaleOutline: this.finaleOutline,
      worldLedger: this.buildWorldLedger(),
      // Stitch (wave 8): cli-display keys quotes by districtId over a list;
      // game-core can only price the player's own district (its
      // buildMarketQuote doc comment), so the list holds that one quote.
      marketQuotes: (() => { const quote = this.buildMarketQuote(); return quote ? [quote] : []; })(),
      rumorBoard: this.getRumorBoard(),
      tuningView: this.getTuningView(),
    };
  }

  /** Process one player input and return the rendered output. */
  async processInput(input: string): Promise<string> {
    // WO-B1F-2 (design lock 2): mutable so the `/go|/move|/zone <exit>`
    // play-mode alias branch below can rewrite it to the equivalent
    // free-prose move input before falling through to ordinary turn
    // execution -- every other branch in this method still only ever reads it.
    let trimmed = input.trim();

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
      return executeDirectorCommand({ command: trimmed, ...this.buildDirectorCommandOptions() });
    }

    // Play mode slash commands (no turn consumed)
    if (this.mode === 'play' && trimmed.startsWith('/')) {
      const cmdParts = trimmed.split(/\s+/);
      const playCmd = cmdParts[0]?.toLowerCase();
      // WO-B1F-2 (design lock 2, ADDENDUM-COMMON): `/go`, `/move`, `/zone
      // <exit>` are play-mode ALIASES for the move verb, not rendered
      // slash commands -- three family playtests found them "unresponsive"
      // because this whole block returns before a turn ever executes.
      // Unlike every other play-mode /word below, a real argument rewrites
      // `trimmed` to the equivalent free-prose move input and falls THROUGH
      // past every branch here into the ordinary turn-execution path below
      // (article-stripped exit match is action-interpreter.ts's own
      // existing `go <exit>` fast path -- no new engine verb, no new
      // matching logic). A bare alias with no argument has nothing to move
      // to and is handled just below like any other malformed slash usage.
      const moveAliasArg = (playCmd === '/go' || playCmd === '/move' || playCmd === '/zone') && cmdParts.length > 1
        ? cmdParts.slice(1).join(' ')
        : undefined;
      if (moveAliasArg !== undefined) {
        trimmed = `go ${moveAliasArg}`;
      } else if (playCmd === '/go' || playCmd === '/move' || playCmd === '/zone') {
        return `  Usage: ${playCmd} <exit>`;
      } else if (playCmd === '/rumors') {
        // WO-B1F-2 (design lock 2): "/rumors is readable from play mode
        // (the director renderer's rumor view, same output)" -- reuses the
        // SAME executeDirectorCommand()/`/rumors` case director mode
        // already dispatches to (director-renderer.ts, out of this
        // domain's edit scope), never a forked copy of its strings.
        return executeDirectorCommand({ command: trimmed, ...this.buildDirectorCommandOptions() });
      } else if (playCmd === '/help') {
        const sub = cmdParts[1];
        if (!sub) return renderPlayHelp();
        if (sub === 'leverage') return renderLeverageHelp();
        if (sub === 'arcs') return renderArcHelp();
        if (sub === 'conclude' || sub === 'conclusion' || sub === 'finale') return renderConcludeHelp();
        return renderPackQuickstart(sub);
      }
      // WO-B1F-2: every branch below is a genuine rendered slash command
      // (no turn consumed) -- skipped entirely when `trimmed` was just
      // rewritten to a move-alias's equivalent free-prose input above, so
      // that rewritten input falls through to the ordinary turn-execution
      // path below instead of being misread as "still unknown" by the
      // fallback at the end of this chain.
      if (moveAliasArg === undefined) {
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
        const statusOutput = renderCompactStatus({
          statusData: this.getStatusData()!,
          leverageState,
          topThreat,
          suggestedMove: recommendation.top3[0] ?? null,
          situationTag: recommendation.situationTag,
          materialsSummary: matSummary !== 'No materials' ? matSummary : undefined,
          arcIndicator: arcInd,
          endgameIndicator: endgameInd,
          fastMode: this.fastMode,
          // WO-A4-4 (slice A4 §3, design lock 6): see the director-mode
          // /status call site's identical note above — cli-display's
          // status-compact.ts gains this field in their own worktree.
          // Stitch (wave 7): cli-display's renderCompactStatus takes the
          // PRE-FORMATTED line (`worldLedgerLine`), formatted by the same
          // helper the director-mode /status path uses.
          worldLedgerLine: formatWorldLedgerLine(this.buildWorldLedger()),
        });
        // F-9319b8d8: appended after the rendered box (see
        // buildSubsystemHealthIndicator()'s doc comment for why it isn't a
        // renderCompactStatus opts field instead); omitted entirely when
        // there have been no subsystem failures this session.
        const subsystemInd = this.buildSubsystemHealthIndicator();
        // F-bd2ff8c8: statusOutput already ends in exactly one trailing
        // newline (renderCompactStatus's own closing divider + empty-string
        // line joined by '\n'), so appending straight onto it here put the
        // Subsystems line flush against the box's bottom border instead of
        // clearly inside or clearly separated from it. One more '\n' gives
        // it the same blank-line breathing room every in-box field has.
        return subsystemInd ? `${statusOutput}\n  Subsystems: ${subsystemInd}\n` : statusOutput;
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
      // WO-B1-7 (slice B1 §3, design lock 4): every known play-mode `/word`
      // above has already returned by this point -- anything left is
      // genuinely unknown. Costs no turn and never reaches the interpreter
      // (the Phase-9 playtest finding this WO exists to fix: an unknown
      // slash command used to fall through to the LLM as free prose).
      // Stitched at wave 10: rendered by cli-display's own renderUnknownCommand.
      // WO-B1F-8 (design lock 8): the state-derived strip, when non-empty,
      // replaces the curated valid-now list -- see
      // deriveValidNowFromWorld's own doc comment (game/unknown-command.ts).
      const info = computeUnknownCommandInfo(
        trimmed,
        this.mode,
        deriveValidNowFromWorld(this.engine.world, this.activeOpportunities),
      );
      return renderUnknownCommand({
        input: playCmd,
        nearest: info.nearest,
        family: info.family ?? undefined,
        validNow: info.validNow,
      });
      }
    }

    // F-6bc0721e (SLATE-6, death-as-setback per Director ruling R1): gate
    // ordinary turns while the player is down -- placed AFTER every play-mode
    // slash command above (and /director / quit, both handled earlier in
    // this method) has already had its chance to return, so /status,
    // /sheet, /chronicle, /help, /export, quit all keep working while
    // downed, the same way they already work in director mode. Reads
    // stateMachine.current directly (not TurnResult.justDied, which is a
    // same-turn edge flag) so this also correctly gates the very first input
    // after a save made while downed resumes downed (see the constructor's
    // restoredPresentationState handling above).
    if (this.mode === 'play' && this.immersion.stateMachine.current === 'menu') {
      return this.renderDownedGate(trimmed);
    }

    // Play mode: execute a turn with immersion + character presence
    const presence = this.getPresence();
    const pressureCtx = this.getVisiblePressureContext();

    // Compute district mood for narration
    const districtDescriptor = this.getDistrictDescriptor();

    // WO-A2-2 (slice A2 §2): the pre-turn zone, read back by
    // runWorldRound() (executeTurn's onResolved hook, below) to decide
    // whether companions need to follow the player this round.
    this.turnStartZoneId = this.engine.world.locationId;

    const partyPresenceStr = this.getPartyPresence();
    const turnEconomyCtx = this.getEconomyContext();
    const turnCraftingCtx = this.getCraftingContext();
    let turnResult: TurnResult;
    try {
      turnResult = await executeTurn({
        engine: this.engine,
        client: this.client,
        history: this.history,
        playerInput: trimmed,
        tone: this.tone,
        immersion: this.immersion,
        characterPresence: presence.narrator,
        npcPlayerPresence: presence.npc,
        playerProfile: this.profile,
        // WO-A5-4 (slice A5 §6, design lock 6): REPLACES the old
        // playerRumors (4-valence) threading — see
        // ExecuteTurnOpts.getHearerRumors' own doc comment (turn-loop.ts)
        // for the cross-domain contract with dialogue-mind.ts.
        getHearerRumors: (npcId: string) => this.getHearerRumors(npcId),
        pressureContext: pressureCtx,
        worldPressures: this.activePressures,
        lastNpcActions: this.lastNpcActions,
        // WO-A2-1/2 (slice A2 §1-§2): the living-world round — NPC
        // agency, companions, the world tick — runs after the player's
        // own action resolves and before narration (turn-loop.ts's
        // ExecuteTurnOpts.onResolved contract).
        onResolved: (actionEvents) => this.runWorldRound(actionEvents),
        // WO-B1-2 (slice B1 §2, design lock 3): the resolved living-world
        // tuning surface -- runHostileTurn reads `enemyAggression`/
        // `enemyDamageScale` from it (turn-loop.ts's ExecuteTurnOpts.tuning).
        tuning: this.tuning,
        // WO-A5-2 (slice A5 §2, design lock 2): resolved by turn-loop.ts
        // AFTER onResolved's round has run — see
        // ExecuteTurnOpts.getMoodTransition's own doc comment.
        getMoodTransition: () => this.lastMoodTransition,
        // WO-A6-1 (slice A6 §3, design lock 1): the resolved narration
        // budget — see ExecuteTurnOpts.budget's own doc comment
        // (turn-loop.ts) for the cross-domain contract.
        budget: {
          pressureLines: this.tuning.narrationPressureLines,
          opportunityLines: this.tuning.narrationOpportunityLines,
          rumorLines: this.tuning.narrationRumorLines,
        },
        districtDescriptor,
        partyPresence: partyPresenceStr,
        // WO-A4-2 (slice A4 §2, design lock 3): situationHint is pre-gated
        // to the urgent tags so calm rounds add zero prompt text.
        activeOpportunities: this.activeOpportunities,
        situationHint: (() => {
          // A hint computation must never kill a turn: a malformed/absent
          // world-tick namespace degrades to no-hint, not a thrown turn —
          // same discipline the pre-A4 buildMoveRecommendation() call this
          // replaces already had.
          //
          // WO-A4-2: sourced from the engine's OWN persisted recommendation
          // (getPersistedMoveRecommendation — the tick's own move-advisor
          // step, runMoveAdvisorStep in world-tick.ts, recomputes and
          // persists this every round) instead of this session's own
          // buildMoveRecommendation() (still used elsewhere — see that
          // method's own doc comment for exactly where). RED BEFORE THIS
          // FIX: buildMoveRecommendation()'s own game-state.ts helper calls
          // recommendMoves() directly and never attaches `situationHint`
          // (only the tick's own runMoveAdvisorStep caller does — see
          // MoveRecommendation's doc comment, move-advisor.d.ts) — so
          // `rec.situationHint` read from THAT call was always undefined,
          // no matter the situationTag. This is "one simulation" (design
          // doc §2): the app no longer recomputes what the tick already
          // computed and persisted this same round.
          try {
            const rec = getPersistedMoveRecommendation(this.engine.world);
            return rec && (rec.situationTag === 'pressured' || rec.situationTag === 'crisis')
              ? rec.situationHint
              : undefined;
          } catch {
            return undefined;
          }
        })(),
        economyContext: turnEconomyCtx,
        craftingContext: turnCraftingCtx,
        opportunityContext: this.getOpportunityContext(),
        arcContext: this.getArcContext(),
        endgameContext: this.getEndgameContext(),
        chronicleContext: this.getChronicleContext(),
        tokenTracker: this.tokenTracker,
        // F-462792bb (SLATE-2, persisted per Director ruling R2): the WHOLE
        // map -- turn-loop.ts's Step 5 resolves the per-NPC slice itself
        // once it knows which NPC is being spoken to (see
        // ExecuteTurnOpts.conversationHistory's doc comment).
        conversationHistory: this.npcConversations,
        // WO-B1F-1 (design lock 1): see field's own doc comment above --
        // set by the PREVIOUS turn's recordConversationExchange() call.
        lastSpeakerNpcId: this.lastSpeakerNpcId ?? undefined,
        // F-940cd4d0: session-local counter, reset/incremented below once
        // this turn's own narrationResult.isFallback is known.
        consecutiveFallbacks: this.consecutiveFallbacks,
        // F-9976a6d6 (SLATE-5e option (a) only per Director ruling R3): a
        // true no-op via NoopLogger for every non-debug session (default).
        debugLog: this.debugLog,
        // F-6e75fa93 (SLATE-1 packId, brief ruled 2026-08-26): forwarded to
        // generateAmbientLine/generateZoneAmbience's 3rd positional arg.
        packId: this.packId,
        // Streaming seam contract (game-core half): only pass a defined
        // callback when a real sink is registered — narrateScene's
        // `onChunk && client.generateStream` gate (narrator.ts) must see
        // `undefined`, not an always-truthy no-op wrapper, or every turn
        // would silently switch onto the streaming/legacy-prompt path even
        // when no caller ever asked to stream. NORMAL turns only: director
        // commands return before this call site (see above), and
        // getOpeningNarration() calls generateOpeningNarration() directly,
        // never executeTurn().
        onNarrationChunk: this.onNarrationChunk
          ? (chunk: string) => this.emitNarrationChunk(chunk)
          : undefined,
      });
    } catch (err) {
      // F-c4332895: executeTurn() rethrows once engine.submitAction() has
      // already mutated world state for this turn — a fatal NarrationError
      // (auth/bad-request) no longer means "nothing happened." When
      // executeTurn() attached turn-bookkeeping to the error (see
      // getFatalTurnBookkeeping() in turn-loop.ts), keep this session's own
      // post-turn record in sync with the turn-history entry it already
      // wrote, instead of silently skipping recordChronicleEvents/
      // applyProfileHints/autosave because we never got a TurnResult back.
      // A secondary failure while recovering must not swallow the original
      // (actionable) error — it's logged and the original still rethrows.
      const bookkeeping = getFatalTurnBookkeeping(err);
      if (bookkeeping) {
        try {
          this.applyProfileHints(bookkeeping.profileHints);
          this.recordChronicleEvents({
            playerInput: trimmed,
            interpreted: bookkeeping.interpreted,
            events: bookkeeping.events,
            narration: bookkeeping.narration,
            narrationPlan: null,
            dialogue: null,
            audioCalls: [],
            tick: bookkeeping.tick,
            profileHints: bookkeeping.profileHints,
            // Fatal-turn bookkeeping: the recorded narration is the fatal
            // fallback sentinel (the narrator degraded), and no presentation
            // inference ran on this path.
            isFallback: true,
            justDied: false,
            // WO-B1-3: the fatal-bookkeeping path never reached the combat-
            // channel computation (narrateScene threw before it) -- nothing
            // to report, same discipline as the low-confidence/engine-throw
            // early returns in turn-loop.ts itself.
            combatLines: [],
          });
          await this.checkAutosave();
          // F-79a25863 (seam contract): narrateScene() threw before
          // executeTurn()'s Step 4.5 could compute audioCalls, so there's
          // nothing to relay for this turn — but the sink still fires with
          // an empty array, matching the normal-turn call below, so a
          // caller can rely on "one onPresentation call per completed
          // turn" without special-casing the fatal path.
          this.emitPresentation([]);
        } catch (bookkeepingErr) {
          this.debugLog.error('subsystem', 'fatal-turn bookkeeping failed', {
            error: bookkeepingErr instanceof Error ? bookkeepingErr.message : String(bookkeepingErr),
          });
        }
      }
      throw err;
    }

    // F-79a25863 (seam contract): relay this turn's audio/UI-effect calls —
    // already computed inside executeTurn()'s Step 4.5 — independent of the
    // post-turn subsystem-tick block below. A subsystem hiccup after this
    // point must not swallow presentation for a turn that already completed.
    this.emitPresentation(turnResult.audioCalls);

    // F-940cd4d0: what counts is exactly and only narrationResult.isFallback
    // -- surfaced on TurnResult scoped precisely to "the narrator itself
    // degraded" (see TurnResult.isFallback's doc comment, turn-loop.ts) --
    // so a low-confidence clarification turn (a distinct UX path) correctly
    // resets this to 0 rather than counting toward an "outage" streak.
    this.consecutiveFallbacks = turnResult.isFallback ? this.consecutiveFallbacks + 1 : 0;

    // PB-001: Post-turn subsystem ticks wrapped in error containment.
    // The critical path (executeTurn) already completed — subsystem failures
    // should degrade gracefully, not crash the session.
    this.debugLog.setTick(this.engine.tick);
    this.debugLog.info('turn', 'turn-start', { input: trimmed, tick: this.engine.tick });
    let subsystemWarning: string | undefined;
    // F-7c44396e: player-facing notice when processOpportunityAction (below)
    // found no matching opportunity for the requested sub-action — see that
    // method's doc comment.
    let opportunityNotice: string | undefined;
    try {
      // Process leverage actions (social/rumor/diplomacy/sabotage)
      this.processLeverageAction(turnResult);

      // Process crafting actions (craft/salvage/repair/modify) (v1.8)
      this.processCraftAction(turnResult);

      // F-462792bb (SLATE-2, persisted per Director ruling R2): capture this
      // turn's player<->NPC exchange, if any.
      this.recordConversationExchange(turnResult);

      // WO-B1-3/5 (slice B1 §§4-5, design locks 7-8): a deliberate "help"
      // action (action-interpreter.ts's `help <name>` fast-path alias
      // stamps `interpreted.parameters.helpAskId`) resolves the ask it
      // answers -- recognition fires immediately for a genuine ask; a
      // predatory one is silently marked helped and pays off later via
      // processAsks' reveal step (the whole point: identical surface,
      // divergent truth). Mutates the SAME TurnResult object executeTurn
      // returned so every downstream consumer below (the render call,
      // history) reads one consistent shape, per TurnResult.recognitionLine's
      // own doc comment (turn-loop.ts).
      const helpAskId = turnResult.interpreted.parameters?.helpAskId as string | undefined;
      turnResult.recognitionLine = this.applyRecognitionForHelpedAsk(helpAskId);

      // Apply profile hints from this turn (may spawn rumors)
      this.applyProfileHints(turnResult.profileHints);
      this.debugLog.debug('profile', 'hints-applied', {
        xp: turnResult.profileHints.xpGained ?? 0,
        milestone: turnResult.profileHints.milestoneTriggered ?? null,
      });

      // Apply natural leverage gains + passive tick
      this.tickPlayerLeverage(turnResult.profileHints);

      // Record chronicle events from this turn
      this.recordChronicleEvents(turnResult);

      // WO-A2-4 (slice A2 §5, deletion): tickFactionAgency,
      // tickDistrictEconomies, tickNpcAgencyTurn, evaluateAndTickPressures,
      // and evaluateAndTickOpportunities are DELETED — runWorldRound()
      // (this session's own executeTurn onResolved hook, already run
      // earlier this turn, before narration) now advances all five via the
      // engine's runWorldTick, straight adoption, every non-rejected,
      // non-corpse round (slice A2 §2, design lock 2). Their session
      // fields (lastFactionActions/lastFactionProfiles,
      // districtEconomies, lastNpcActions/lastNpcProfiles/
      // npcObligations/activeConsequenceChains, activePressures,
      // activeOpportunities) are live getters over world truth (WO-A4-1)
      // — never independently ticked here.

      // Item recognition: NPCs notice equipped items with provenance
      this.tickItemRecognition();

      // Companion reactions to combat and district conditions
      if (this.partyState.companions.length > 0) {
        // Combat reactions
        // F-ccd9dc08: the old heuristic (a defeat event fired this turn AND
        // no living hostiles remain in the zone) never read the engine's own
        // combat.encounter.cleared/outcome. At 3.11 a same-turn "one hostile
        // defeated, the last hostile flees" turn clears the encounter with
        // outcome: 'retreat' -- the fled hostile drops out of
        // hasLivingHostiles() too, so the old heuristic read that as a win.
        // The engine's cleared event is now the primary signal: absent
        // `outcome` (3.10-shaped events/fixtures) still means victory (lock
        // 1 default); a 'retreat' outcome is never a win (lock 2), full
        // stop, even though a real `combat.entity.defeated` also fired the
        // same turn.
        //
        // The old defeat+no-hostiles derivation is KEPT, but only as a
        // fallback for when NO cleared event fires at all -- proven
        // necessary, not assumed: verified directly against the installed
        // 3.11 dist that killing a non-hostile NPC in a zone that also
        // holds an unrecruited companion candidate (e.g. Sister Maren
        // before /recruit) emits ZERO combat.encounter.cleared events.
        // engagement-core.ts's 'defeated' trigger bails out at
        // `else if (hasEnemiesInZone(world, playerEntity)) return;`
        // (packages/modules/src/engagement-core.ts:178-179) before ever
        // reaching the emit, because hasEnemiesInZone routes through
        // targeting.ts's affiliationOf, whose legacy same-`type` fallback
        // (targeting.ts:46, `candidate.type === source.type`) misclassifies
        // ANY unrecruited "npc"-typed entity (no `faction` set) as an
        // "enemy" of the player-typed source -- a harmless recruitable ally
        // included. hasLivingHostiles() (runtime/hooks.ts) does not share
        // that flaw -- it gates on the `hostile`/`enemy` TAG convention, not
        // engine-wide type affiliation -- so it stays a correct fallback
        // signal for exactly this suppressed case.
        // Coordinator ruling (slice A2 stitch): companion combat morale is
        // the ENGINE's now. runWorldTick's own combat-trigger scan
        // (world-tick.ts collectCombatReactionTriggers) reacts to every
        // combat.entity.defeated in the round — 'combat-won' on a hostile's
        // defeat, 'combat-lost' on a companion's — applies the morale
        // deltas, and emits companion.reaction events that runWorldRound's
        // drain folds into lastCompanionReactions. The app's former
        // hasCombatWon/hasCombatLost dispatch (wave-2 F-ccd9dc08) would
        // apply the same morale a second time, so it is deleted. The ONE
        // case the tick can never see is the player's own defeat: the
        // corpse gate skips the round, so the app still dispatches
        // 'combat-lost' for it — no double application is possible there.
        // Engine ask (recorded): the engine's combat reactions key per
        // kill, not per encounter outcome, so a kill during a retreat still
        // reads as 'combat-won' to companions.
        const playerDefeated = turnResult.events.some(
          (e) => e.type === 'combat.entity.defeated' &&
            e.payload.entityId === this.engine.world.playerId,
        );
        if (playerDefeated) {
          this.processCompanionReactions('combat-lost');
        }

        // WO-A2-4 (slice A2 §5, deletion): the steady-state district-mood
        // companion reaction ("at the start of every turn, react to the
        // CURRENT mood tone") is deleted — the engine's own tick (step 0c,
        // world-tick.ts) fires companion reactions on district-mood
        // TRANSITIONS only, drained in runWorldRound() this same turn (see
        // that method's companion-reaction-drain step).
      }

      // Propagate existing rumors to new factions (now write-through — see
      // propagateRumors' own doc comment).
      this.propagateRumors();

      // WO-A2-4 (slice A2 §5, deletion): evaluateAndTickPressures /
      // evaluateAndTickOpportunities are deleted — runWorldTick (inside
      // this turn's runWorldRound, before narration) already evaluated,
      // ticked, and expired both this round; activePressures/
      // activeOpportunities are live getters over world truth (WO-A4-1).

      // Arc detection + endgame evaluation (v2.0)
      this.tickArcDetection();
      this.evaluateEndgameTrigger();

      // Process opportunity actions from this turn (accept/decline/complete/etc.)
      opportunityNotice = this.processOpportunityAction(turnResult) ?? undefined;
    } catch (err) {
      // Subsystem failure — the turn itself was processed safely.
      const errMsg = err instanceof Error ? err.message : String(err);
      // F-f13ca236: a bare .message can't distinguish which of the ~17
      // structurally-similar post-turn subsystem calls actually threw when
      // several throw near-identical generic TypeErrors — capture the full
      // stack too.
      const errStack = err instanceof Error && err.stack ? err.stack : errMsg;
      this.debugLog.error('subsystem', 'post-turn tick failed', { error: errMsg, stack: errStack });
      // F-f13ca236: recorded independent of the --debug gate — debugLog is a
      // true NoopLogger by default (debug-logger.ts), whose .error() doesn't
      // even append to getEntries(), so without this, a subsystem failure in
      // the overwhelming majority of real play sessions left zero trace
      // anywhere beyond the generic player-facing bracket message below.
      this.subsystemFailureCount++;
      this.subsystemFailures.push({ tick: this.engine.tick, error: errStack });
      this.capOldestFirst(this.subsystemFailures, MAX_SUBSYSTEM_FAILURE_RECORDS);
      subsystemWarning = this.formatTrailerNotice('A subsystem hiccupped — your turn was processed safely');
    }
    this.debugLog.info('turn', 'turn-end', { tick: this.engine.tick });

    // WO-A6-2 (slice A6 §5, design lock 2): capture this round's metrics.
    // Placed HERE — after applyProfileHints/processOpportunityAction (both
    // already ran above, inside the try block that just closed) — rather
    // than inside runWorldRound() itself, so a same-turn player-driven
    // pressure resolution or opportunity accept (both documented POST-turn
    // steps that run strictly AFTER runWorldRound returns) is still counted
    // in the round it actually happened in. See captureRoundMetrics()'s own
    // doc comment for the full honesty-floor note against the design doc's
    // literal "captured inside runWorldRound" phrasing. A metrics-capture
    // failure must never damage a turn that already completed.
    try {
      this.captureRoundMetrics(turnResult.events);
    } catch (err) {
      this.debugLog.error('subsystem', 'round-metrics capture failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

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
      // WO-B1-6 (slice B1 §3, design lock 6): the hint ledger -- caps each
      // suggestion's own `trigger` (cause) at 2 firings per session with a
      // 20-round cooldown, re-arming on a state change. The state token is
      // coarse (district + open-opportunity count + "has the player ever
      // fought") rather than a per-cause token, a deliberate simplification
      // (one ledger read/write per turn instead of a per-cause state
      // model) that still satisfies the doc's three named re-arm triggers
      // (new district, new opportunity, first combat) as one combined
      // signature.
      const stateToken = [
        this.getPlayerDistrictId() ?? 'no-district',
        this.activeOpportunities.filter((o) => o.status === 'available').length,
        this.getRoundMetrics().some((m) => m.kills > 0) ? 'combat-yes' : 'combat-no',
      ].join('|');
      const { kept, ledger } = filterHints(suggestions, readHintLedger(this.engine.world), this.engine.tick, stateToken);
      suggestions = kept;
      writeHintLedger(this.engine.world, ledger);
    }

    // Autosave check after turn processing
    // F-af8f1048: checkAutosave() now returns a discriminated AutosaveOutcome
    // (skipped/saved/failed) instead of a bare string|null — translate it to
    // player-facing text via formatAutosaveNotice, which also owns the
    // one-time-only failure-notice throttling.
    const autosaveOutcome = await this.checkAutosave();
    const autosaveMsg = this.formatAutosaveNotice(autosaveOutcome);

    // F-6bc0721e (SLATE-6, death-as-setback per Director ruling R1): the
    // turn whose own transition just crossed into 'menu' gets the dedicated
    // death screen (mirroring renderConcludeOutput's dedicated framing for
    // campaign endings) instead of the ordinary play screen -- using this
    // turn's REAL narration (how the player actually died), not the
    // downed-gate's generic placeholder text. Every SUBSEQUENT turn while
    // still down is caught earlier by the gate above processInput(), before
    // executeTurn() ever runs, so this branch only ever fires once per
    // death.
    const output = turnResult.justDied
      ? renderDeathOutput(turnResult.narration, this.profile?.build.name)
      : renderPlayOutput({
          narration: turnResult.narration,
          dialogue: turnResult.dialogue,
          world: this.engine.world,
          availableActions: this.engine.getAvailableActions(),
          profileStatus: this.getStatusData() ?? undefined,
          leverageStatus,
          partyStatusLine: buildPartyStatusLine(this.partyState, this.engine.world),
          // Stitch (wave 8, WO-A5-15 routed from cli-display): the round's
          // encounter.spawned event, rendered by the same describeEvent line
          // the narration prompt carries, becomes the play screen's headline.
          // WO-A6-1 (slice A6 §3, design lock 1): gated on the resolved
          // `ambushHeadline` policy via getAmbushHeadline() below.
          ambushHeadline: this.getAmbushHeadline(turnResult.events),
          suggestions,
          hasEndgameTriggers: this.endgameTriggers.some((t) => !t.acknowledged),
          // Contract A (turn divider): cli-display's play-renderer consumes this
          // via makeTurnDivider when present. history.getAll().length is this
          // codebase's own established "how many turns has the player
          // experienced" counter (matches the test harness's turnCount() and
          // the sibling turn-count assertions in test/integration/
          // game-turn-loop.test.ts) — executeTurn() has already recorded this
          // turn in history by this point, so it already reflects the turn just
          // completed.
          turnNumber: this.history.getAll().length,
          // F-6e75fa93 (SLATE-1, brief ruled 2026-08-26): zero-LLM-cost
          // ambient NPC chatter generated this turn, if any.
          ambientLines: turnResult.ambientLines,
          // WO-B1-1/3/5 (slice B1, design locks 1/2/8): the zone's live
          // hostiles (status-hostile-line data), this turn's reserved
          // combat-channel lines, and this turn's recognition line (if a
          // genuine ask was just helped -- computed below, after
          // executeTurn returns, since it needs the ask ledger/RumorEngine/
          // reputation that only GameSession carries).
          hostiles: describeHostiles(this.engine.world, this.engine.world.locationId),
          combatLines: turnResult.combatLines,
          recognitionLine: turnResult.recognitionLine,
          // WO-B1F-4 (design lock 4): undefined when the player's district
          // has no market (buildPresenterMarketQuote()'s own contract).
          marketQuote: this.buildPresenterMarketQuote(),
          // WO-B1F-8 (design lock 8): the SAME state-derived function the
          // unknown-command reply's validNow now uses (game/unknown-command.ts) --
          // one source of truth for "what can the player do right now,"
          // per this WO's own "one function feeds both surfaces" contract.
          commandStrip: deriveValidNowFromWorld(this.engine.world, this.activeOpportunities),
        });
    let finalOutput = output;
    // F-cfc5ff37: collect the post-turn "trailer notices" (structured
    // announcements, subsystem warning, autosave notice) and join them with
    // a blank-line separator between fired notices, instead of
    // concatenating each ad hoc. Previously announcements alone appended an
    // extra trailing '\n' (a blank-line gap after them) while
    // subsystemWarning/autosaveMsg had none, so when multiple notices fired
    // on the same turn they sat flush against each other with zero visual
    // break — and announcements were the one trailer notice NOT wrapped in
    // the `[...]` bracket idiom the other two use, despite being arguably
    // the biggest positive beats a player sees. Each fragment below already
    // carries its own leading '\n' (formatTrailerNotice / subsystemWarning
    // / autosaveMsg all start with '\n  [...]'), so joining with one more
    // '\n' between fragments yields exactly one blank line between
    // consecutive notices, while a single fired notice keeps the same
    // one-newline gap from `output` as before.
    const trailerNotices: string[] = [];
    if (this.pendingAnnouncements.length > 0) {
      for (const announcement of this.pendingAnnouncements) {
        trailerNotices.push(this.formatTrailerNotice(announcement));
      }
      this.pendingAnnouncements = [];
    }
    // F-7c44396e: surfaced ahead of subsystemWarning/autosaveMsg — it's the
    // most direct response to what the player just typed this turn.
    if (opportunityNotice) trailerNotices.push(this.formatTrailerNotice(opportunityNotice));
    if (subsystemWarning) trailerNotices.push(subsystemWarning);
    if (autosaveMsg) trailerNotices.push(autosaveMsg);
    finalOutput += trailerNotices.join('\n');
    return finalOutput;
  }

  /**
   * F-6bc0721e (SLATE-6, death-as-setback per Director ruling R1): render
   * the downed-gate response for an ordinary turn attempted while
   * stateMachine.current === 'menu'. A small explicit allow-list of
   * continuation phrases transitions back to 'exploration' and returns a
   * short beat -- deliberately WITHOUT calling executeTurn/
   * engine.submitAction, so no world-state mutation happens on the
   * transition turn itself; the player's next real input is an ordinary
   * turn. Any other input returns a distinct frame (renderDeathOutput,
   * mirroring renderConcludeOutput's dedicated framing for campaign
   * endings) rather than the ordinary play screen.
   *
   * DRAFT copy (both the continuation beat and the downed-frame narration
   * below) — coordinator/Director copy review, per the brief's "every
   * player-facing string you introduce is a DRAFT" instruction.
   */
  private renderDownedGate(input: string): string {
    const normalized = input.trim().toLowerCase();
    const isContinuation = normalized === 'continue' || normalized === 'get up' || normalized === 'rise';
    if (isContinuation) {
      this.immersion.stateMachine.transition('exploration', 'player-continue');
      return '\n  You steady yourself and rise. The world resumes its breath.\n';
    }
    return renderDeathOutput(
      'You are down. The world holds its breath.',
      this.profile?.build.name,
    );
  }

  /**
   * F-cfc5ff37: shared formatter for the three post-turn "trailer notices"
   * (structured announcements, the subsystem-hiccup warning, the autosave
   * notice) so all three agree on bracket idiom instead of differing by an
   * accident of which code path was written first. The leading '\n'
   * matches the shape these fragments have always had; processInput()'s
   * drain step joins multiple fired fragments with one more '\n' so
   * consecutive notices land a full blank line apart.
   */
  private formatTrailerNotice(text: string): string {
    return `\n  [${text}]`;
  }

  /**
   * Check if autosave should trigger and perform it silently.
   *
   * F-af8f1048: returns a discriminated AutosaveOutcome instead of a bare
   * `string | null` — 'skipped' covers both "disabled" and "not yet due"
   * (parity with the old silent no-op for those two cases), 'saved' carries
   * the same success message as before, and 'failed' is now distinguishable
   * from both so the caller can surface it instead of treating it like
   * nothing happened.
   */
  async checkAutosave(): Promise<AutosaveOutcome> {
    if (!this.autosaveConfig.enabled) return { status: 'skipped' };
    this.turnsSinceLastAutosave++;
    if (this.turnsSinceLastAutosave < this.autosaveConfig.intervalTurns) return { status: 'skipped' };

    // Reset counter
    this.turnsSinceLastAutosave = 0;

    // Determine character name for autosave slot
    const charName = this.profile?.build.name ?? this.title ?? 'game';
    const safeName = sanitizeFilename(charName);
    const savePath = this.autosaveConfig.getSavePath
      ? this.autosaveConfig.getSavePath(safeName)
      : getDefaultSavePath(`${safeName}-autosave`);

    try {
      const input: SaveSessionInput = {
        engine: this.engine,
        history: this.history,
        tone: this.tone,
        savePath,
        worldPrompt: this.worldPrompt,
        profile: this.profile,
        genre: this.genre,
        journal: this.journal,
        // WO-A3-1 (design lock 2): playerRumors/activePressures/
        // resolvedPressures/npcProfiles/npcActions/npcObligations/
        // consequenceChains/partyState/districtEconomies/activeOpportunities
        // are no longer SaveSessionInput fields — engine.serialize() (below,
        // via SaveSessionInput.engine) already carries all ten inside the
        // engine's own world-truth namespaces. resolvedOpportunities is NOT
        // one of the ten (session history, not world truth) and stays.
        resolvedOpportunities: this.resolvedOpportunities,
        arcSnapshot: this.arcSnapshot,
        endgameTriggers: this.endgameTriggers,
        finaleOutline: this.finaleOutline,
        campaignStatus: this.campaignStatus,
        // F-8c3e32b7: see SavedSession.presentationState — restored via
        // GameConfig.restoredPresentationState on the session's next load.
        presentationState: this.immersion.stateMachine.current,
        // F-462792bb (SLATE-2, persisted per Director ruling R2): see
        // GameConfig.npcConversations's doc comment. cli-display (bin.ts)
        // threads this same field into every OTHER saveSession call site —
        // this is the one this domain owns directly (autosave).
        npcConversations: this.npcConversations,
        // WO-A3-2 (slice A3 §3): see SavedSession.rumorEngine's doc comment.
        rumorEngine: this.getRumorEngineSnapshot(),
        // WO-A5-5 (slice A5 §7): see SavedSession.worldMoved's doc comment
        // (session.ts) — same pass-through discipline as rumorEngine above.
        worldMoved: this.getWorldMovedSnapshot(),
      };
      await saveSession(input);
      this.debugLog.info('autosave', 'autosave-complete', { path: savePath });
      return { status: 'saved', message: this.formatTrailerNotice('autosaved') };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.debugLog.error('autosave', 'autosave-failed', { error: errMsg });
      return { status: 'failed', error: errMsg };
    }
  }

  /**
   * F-af8f1048: translate an AutosaveOutcome into player-facing output text.
   * 'skipped' (disabled or not yet due) never produces output — parity with
   * the original silent no-op. 'failed' produces a low-noise, one-time-only
   * notice per session (see autosaveFailureWarned) so the player learns
   * their safety net stopped working without every subsequent turn nagging
   * them about a persistent condition (full disk, permissions, an
   * antivirus/indexing lock on the save directory) — honoring the original
   * "don't disrupt gameplay" intent while no longer treating a genuine
   * failure identically to nothing having happened.
   */
  private formatAutosaveNotice(outcome: AutosaveOutcome): string | null {
    if (outcome.status === 'saved') return outcome.message;
    if (outcome.status === 'failed') {
      if (this.autosaveFailureWarned) return null;
      this.autosaveFailureWarned = true;
      return this.formatTrailerNotice('autosave failed — your last save may be out of date; use /export to back up your progress');
    }
    return null;
  }

  /**
   * F-51e110b9: evict the oldest elements of `arr` once its length exceeds
   * `max`, mirroring TurnHistory.trimCompactedChunks()'s
   * (session/history.ts) oldest-first-eviction discipline exactly (a
   * while-loop of shift() calls). Shared by resolvePressure(),
   * resolveOpportunity(), and evaluateEndgameTrigger() below to cap
   * resolvedPressures/resolvedOpportunities/endgameTriggers.
   */
  /**
   * WO-A6-1 (slice A6 §3, design lock 1): the ambush-headline policy gate,
   * pulled out of the renderPlayOutput call site into its own method so it's
   * independently testable without a real combat/encounter fixture (a
   * private-method proof, same access pattern game.test.ts's WO-A5-5 suite
   * already uses for pushWorldMoved). Measured default 'always' keeps this
   * byte-identical to the unconditional `buildAmbushHeadline(...)` call it
   * replaces.
   */
  private getAmbushHeadline(events: ResolvedEvent[]): string | undefined {
    return this.tuning.ambushHeadline === 'never' ? undefined : buildAmbushHeadline(events);
  }

  private capOldestFirst<T>(arr: T[], max: number): void {
    while (arr.length > max) {
      arr.shift();
    }
  }

  /**
   * WO-A6-2 (slice A6 §5, design lock 2): build and push one RoundMetrics
   * entry for the round that just finished, from `turnEvents` (this turn's
   * FULL event delta — turn-loop.ts's own `events` array, the player's own
   * action plus runWorldRound's tick delta concatenated) and the persisted
   * readers this session already exposes as live getters.
   *
   * Called from processInput() AFTER applyProfileHints/
   * processOpportunityAction have both already run for this turn (see that
   * call site's own comment) — NOT literally inside runWorldRound()'s own
   * method body, despite the design doc's "captured inside runWorldRound"
   * phrasing (docs/living-world-slice-a6-phase9.md §5 via
   * ADDENDUM-game-core WO-A6-2). Honesty-floor correction: `resolvePressure`
   * (applyProfileHints' player pressure-resolution branch, this file's own
   * comment at the corpse-gate step above: "applyProfileHints is a
   * post-turn step, after runWorldRound's...") and processOpportunityAction's
   * 'accept' case are BOTH documented post-turn steps that run strictly
   * AFTER runWorldRound() returns for a turn — the only call site game.ts
   * has for resolvePressure() and the only call site for opportunity-accept
   * are neither one inside runWorldRound. Capturing metrics strictly inside
   * that method would silently miss a same-turn player-driven pressure
   * resolution or opportunity accept (undercounting `pressuresResolved`/
   * `opportunitiesAccepted` for the round they actually happened in). This
   * call site still produces exactly ONE entry per played round, keyed by
   * the SAME `tick` value throughout a turn (ticks don't advance mid-turn),
   * so the entry correctly describes "this round" either way — it is simply
   * assembled once the round's full event stream (tick + post-turn steps)
   * has actually happened, not partway through it.
   *
   * worldMovedLedger-derived counts (pressuresSpawned/Resolved/Expired,
   * ambushes, rumorsMutated) are filtered by `entry.tick === tick` rather
   * than tracked via a second parallel counter — pushWorldMoved() already
   * tags every entry with the round's tick (including the ones
   * resolvePressure() pushes from its post-turn call site), so this reuses
   * that existing accumulation instead of re-deriving it.
   */
  private captureRoundMetrics(turnEvents: ResolvedEvent[]): void {
    const tick = this.engine.tick;
    const world = this.engine.world;
    const heatRaw = world.globals[HEAT_KEY];
    const heat = typeof heatRaw === 'number' ? heatRaw : 0;
    const quietRounds = getWorldTickState(world).quietRounds;

    const kills = turnEvents.filter(
      (e) => e.type === 'combat.entity.defeated' && e.payload.entityId !== world.playerId,
    ).length;

    const thisRoundMoved = this.worldMovedLedger.filter((e) => e.tick === tick);
    const countKind = (kind: WorldMovedKind) => thisRoundMoved.filter((e) => e.kind === kind).length;

    // rumorsCreated: RumorEngine entries whose originTick is THIS round —
    // rumor-mirror.ts's mirrorPlayerRumor writes the mirrored 4-valence
    // rumor's OWN originTick (not the mirror-call tick), so this correctly
    // reflects true creation tick even when mirroring happens a round late
    // (mirrorUnmirroredRumors' own doc comment, this file).
    const rumorsCreated = this.rumorEngine.query({}).filter((r) => r.originTick === tick).length;

    // rumorHearers: a SNAPSHOT (all-time distinct hearers so far), not an
    // event count — see RoundMetrics.rumorHearers' own doc comment.
    const hearerSet = new Set<string>();
    for (const r of this.rumorEngine.aboutSubject('player')) {
      for (const id of r.spreadPath) hearerSet.add(id);
    }

    const priceQuote = this.buildMarketQuote()?.quotedPrice;

    const entry: RoundMetrics = {
      tick,
      heat,
      quietRounds,
      kills,
      pressuresActive: this.activePressures.length,
      pressuresSpawned: countKind('pressure-spawned'),
      pressuresResolved: countKind('pressure-resolved'),
      pressuresExpired: countKind('pressure-expired'),
      factionActions: this.lastRoundFactionActions,
      opportunitiesSpawned: countKind('opportunity-offered'),
      opportunitiesAccepted: this.opportunitiesAcceptedThisRound,
      opportunitiesExpired: countKind('opportunity-expired'),
      ambushes: countKind('ambush'),
      moodTransition: this.lastMoodTransition !== undefined,
      rumorsCreated,
      rumorsMutated: countKind('rumor-mutated'),
      rumorHearers: hearerSet.size,
      stanceBelieve: this.lastRoundStanceBelieve,
      stanceDoubt: this.lastRoundStanceDoubt,
      priceQuote,
    };
    this.roundMetrics.push(entry);
    this.capOldestFirst(this.roundMetrics, MAX_ROUND_METRICS);

    // Post-turn-step counters are per-round accumulators consumed by THIS
    // entry — reset for the next round now that they've been read.
    this.opportunitiesAcceptedThisRound = 0;
  }

  /**
   * WO-A5-5 (slice A5 §7): append one "the world moved" entry and cap
   * oldest-first — same discipline capOldestFirst already applies to
   * resolvedOpportunities/endgameTriggers above.
   */
  private pushWorldMoved(kind: WorldMovedKind, headline: string): void {
    this.worldMovedLedger.push({ tick: this.engine.tick, kind, headline });
    // WO-A6-1 (slice A6 §3, design lock 1): reads the resolved tuning's
    // worldMovedCap instead of the MAX_WORLD_MOVED_ENTRIES literal — measured
    // default is that SAME constant (game/tuning.ts), so this stays
    // byte-identical.
    this.capOldestFirst(this.worldMovedLedger, this.tuning.worldMovedCap);
  }

  /**
   * F-51e110b9: evict the oldest journal records once the retained count
   * exceeds MAX_JOURNAL_RECORDS. CampaignJournal (compiled
   * @ai-rpg-engine/campaign-memory) exposes no delete/evict API, so eviction
   * rebuilds the journal from its own public serialize()/deserialize() pair
   * instead — serialize() already returns records sorted oldest-first by
   * tick (journal.js's `.sort((a, b) => a.tick - b.tick)`), so slicing the
   * last MAX_JOURNAL_RECORDS keeps the most recent ones and drops the rest.
   * Called once per ordinary turn from recordChronicleEvents() — the
   * unconditional every-turn call site (game.ts's PB-001 block) this
   * finding anchors on, and the dominant driver of journal growth relative
   * to the many rarer per-event journal.record() call sites elsewhere in
   * this file.
   */
  private trimJournalIfNeeded(): void {
    if (this.journal.size() <= MAX_JOURNAL_RECORDS) return;
    const trimmed = this.journal.serialize().records.slice(-MAX_JOURNAL_RECORDS);
    this.journal = CampaignJournal.deserialize(trimmed);
  }

  /** Universal title evolutions based on milestone tags. */
  private getTitleEvolutions(): TitleEvolution[] {
    return getTitleEvolutions();
  }

  /**
   * Propagate existing rumors to new factions (max 3 per turn).
   * WO-A2-3/4 (slice A2 §4, write-through): reads/writes the
   * player-rumor namespace directly (world truth), not the session's own
   * cached field, then refreshes the view.
   */
  private propagateRumors(): void {
    const world = this.engine.world;
    const state = getPlayerRumorState(world);
    const next = _propagateRumors(state.rumors, world, this.partyState);
    setPlayerRumorState(world, { ...state, rumors: next });
    this.refreshProfileViews();
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

  /**
   * F-7815df9e: long-term campaign memory for the narrator — combines the
   * chronicle's top significant events (buildChronicleContext) with the
   * rolling turn-history compaction summary (TurnHistory.getChronicleHighlights),
   * so narration can call back to past story beats beyond the last few turns
   * of raw narration text (a betrayal, a companion death, a resolved pressure
   * from many turns ago).
   */
  private getChronicleContext(): string | undefined {
    const parts: string[] = [];
    const chronicle = buildChronicleContext(this.journal, this.engine.tick);
    if (chronicle) parts.push(chronicle);
    const highlights = this.history.getChronicleHighlights();
    if (highlights) parts.push(highlights);
    return parts.length > 0 ? parts.join(' ') : undefined;
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

  // WO-A2-4 (slice A2 §5, deletion): evaluateAndTickPressures /
  // buildPressureInputs (the private wrapper) / evaluateAndTickOpportunities
  // / buildOpportunityInputs (the private wrapper) are deleted —
  // runWorldTick (world-tick.ts, driven from runWorldRound below) now
  // ticks/expires/evaluates both pressures and opportunities every round
  // from world truth; resolvePressure's own former "expired-ignored" call
  // site (evaluateAndTickPressures' expiry loop) is gone with it — expiry
  // fallout is the engine's own job now (WorldTickResult.expired /
  // .opportunitiesExpired, both already applied by the tick itself).
  // resolvePressure below survives for the ONE remaining caller:
  // applyProfileHints' player-resolved-pressure branch (a leverage verb
  // resolving a live pressure), which runs OUTSIDE any tick.

  /**
   * Resolve a pressure and apply its fallout effects. Player-resolved path
   * only from this wave on (see the deletion note above) — resolvedPressures
   * is a world-truth ledger the engine's own tick also appends to on
   * expiry, so this method appends onto that SAME live array
   * (getWorldTickState) rather than a session-local one, capped to
   * RESOLVED_PRESSURES_KEPT (the engine's own cap, not the app's old
   * MAX_RESOLVED_FALLOUT_ENTRIES) so both paths agree on one retention
   * policy for one shared ledger.
   */
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

    const state = getWorldTickState(this.engine.world);
    const resolved = state.resolvedPressures ?? [];
    resolved.push(fallout);
    while (resolved.length > RESOLVED_PRESSURES_KEPT) resolved.shift();
    state.resolvedPressures = resolved;
    this.refreshProfileViews();

    // WO-A5-5 (slice A5 §7): "the world moved" — the player/faction-
    // resolved half of "pressures spawned/resolved/expired"; the other two
    // (spawned/expired) are pushed in runWorldRound from the tick's own
    // WorldTickResult, below.
    {
      const headline = `${pressure.kind}: ${fallout.summary}`;
      this.pushWorldMoved('pressure-resolved', headline);
      // WO-B1F-5 (design lock 5): see the runWorldRound spawned/expired
      // call sites' identical comment above -- same channel, same
      // once-per-event discipline, unchanged string.
      this.pendingAnnouncements.push(headline);
    }

    // Companion reactions to pressure resolution
    if (this.partyState.companions.length > 0) {
      const isGood = resolutionType === 'resolved-by-player' || resolutionType === 'resolved-by-faction';
      this.processCompanionReactions(isGood ? 'pressure-resolved-well' : 'pressure-resolved-badly');
    }
  }

  /**
   * Apply structured fallout effects to session state. Delegates to the
   * pure function in game-state.ts.
   *
   * WO-A2-3/4 (slice A2 §4, write-through): the pure function no longer
   * takes/returns activePressures or districtEconomies (both write
   * straight to world truth internally — see its own doc comment); a
   * spawned rumor is written through to the player-rumor namespace here
   * (the ledger the rumor 'addRumor' write-through helper also writes),
   * then every view is refreshed once.
   */
  private applyFalloutEffects(fallout: PressureFallout): void {
    const result = _applyFalloutEffects(
      fallout,
      this.profile,
      this.engine.world,
      this.playerRumors,
      this.partyState,
      this.genre,
      this.engine.tick,
    );
    this.profile = result.profile;
    if (result.playerRumors !== this.playerRumors) {
      setPlayerRumorState(this.engine.world, {
        ...getPlayerRumorState(this.engine.world),
        rumors: result.playerRumors,
      });
    }
    if (result.titleChanged) {
      this.pendingAnnouncements.push(`Title evolved: "${result.titleChanged.newTitle}"`);
    }
    this.refreshProfileViews();
  }

  // --- Opportunity System (v1.9) ---

  /**
   * Process opportunity verb from a turn result.
   *
   * F-7c44396e: previously void-returning — every case's guard clause
   * (`if (available.length === 0) break;` / `if (accepted.length === 0)
   * break;`) was a bare no-op: no state change, no chronicle entry, no
   * player-facing signal. action-interpreter.ts's fast-path regex matches
   * verbs like "decline" / "abandon" / "complete" on syntax alone with no
   * check that a matching opportunity exists, so this was reachable from
   * ordinary phrasing, not just a contrived edge case. Now returns a
   * player-facing notice (consumed by the executeTurn call site as a
   * trailer notice, mirroring subsystemWarning/autosaveMsg) when a guard
   * clause fires, or null when the sub-action resolved normally (including
   * "not an opportunity verb this turn" — the pre-existing silent-skip
   * cases, which are correct as-is and stay silent).
   */
  private processOpportunityAction(turnResult: TurnResult): string | null {
    if (turnResult.interpreted.verb !== 'opportunity') return null;
    const subAction = turnResult.interpreted.parameters?.subAction as string | undefined;
    if (!subAction) return null;

    // FT-B-007: Extract optional disambiguation identifier
    const opportunityName = turnResult.interpreted.parameters?.opportunityName as string | undefined;
    const opportunityIndex = turnResult.interpreted.parameters?.opportunityIndex as number | undefined;

    switch (subAction) {
      case 'accept': {
        const available = getAvailableOpportunities(this.activeOpportunities);
        if (available.length === 0) {
          return 'No opportunity is available to accept — type /jobs to see current contracts.';
        }
        // FT-B-007: Match by name/index, fallback to most recent
        const original = this.matchOpportunity(available, opportunityName, opportunityIndex);
        const target: OpportunityState = { ...original, status: 'accepted', acceptedAtTick: this.engine.tick };
        // WO-A2-3/4 (slice A2 §4, write-through): setPersistedOpportunities
        // then refresh, instead of reassigning the session's own (now-view)
        // array directly.
        setPersistedOpportunities(
          this.engine.world,
          getPersistedOpportunities(this.engine.world).map((o) => o.id === target.id ? target : o),
        );
        this.refreshProfileViews();
        // WO-A6-2: tally this round's opportunity-accept count — see
        // RoundMetrics.opportunitiesAccepted's own doc comment (this counter
        // is read-and-reset by captureRoundMetrics()).
        this.opportunitiesAcceptedThisRound++;
        // Chronicle
        const source: ChronicleEventSource = { kind: 'opportunity-accepted', opportunity: target, tick: this.engine.tick };
        for (const entry of deriveChronicleEvents(source, this.engine.world.playerId)) {
          this.journal.record(entry);
        }
        return null;
      }
      case 'decline': {
        const available = getAvailableOpportunities(this.activeOpportunities);
        if (available.length === 0) {
          return 'No opportunity is available to decline — type /jobs to see current contracts.';
        }
        const target = this.matchOpportunity(available, opportunityName, opportunityIndex);
        this.resolveOpportunity(target, 'declined');
        return null;
      }
      case 'abandon': {
        const accepted = getAcceptedOpportunities(this.activeOpportunities);
        if (accepted.length === 0) {
          return 'You have no accepted opportunity to abandon — type /jobs to see current contracts.';
        }
        const target = this.matchOpportunity(accepted, opportunityName, opportunityIndex);
        this.resolveOpportunity(target, 'abandoned');
        return null;
      }
      case 'betray': {
        const accepted = getAcceptedOpportunities(this.activeOpportunities);
        if (accepted.length === 0) {
          return 'You have no accepted opportunity to betray — type /jobs to see current contracts.';
        }
        const target = this.matchOpportunity(accepted, opportunityName, opportunityIndex);
        this.resolveOpportunity(target, 'betrayed');
        return null;
      }
      case 'complete': {
        const accepted = getAcceptedOpportunities(this.activeOpportunities);
        if (accepted.length === 0) {
          return 'You have no accepted opportunity to complete — type /jobs to see current contracts.';
        }
        const target = this.matchOpportunity(accepted, opportunityName, opportunityIndex);
        this.resolveOpportunity(target, 'completed');
        return null;
      }
      default:
        return null;
    }
  }

  /**
   * FT-B-007: Match an opportunity by name or index.
   * Falls back to most-recent (last) if no match found.
   */
  private matchOpportunity(
    candidates: OpportunityState[],
    name?: string,
    index?: number,
  ): OpportunityState {
    // Try by 1-based index
    if (index !== undefined && index >= 1 && index <= candidates.length) {
      return candidates[index - 1];
    }

    // Try by name (case-insensitive partial match on opportunity kind or id)
    if (name) {
      const lower = name.toLowerCase();
      const byKind = candidates.find((o) => o.kind.toLowerCase().includes(lower));
      if (byKind) return byKind;
      const byId = candidates.find((o) => o.id.toLowerCase().includes(lower));
      if (byId) return byId;
    }

    // Fallback: most recent (last in list)
    return candidates[candidates.length - 1];
  }

  /**
   * Resolve an opportunity and apply its fallout effects.
   * WO-A2-3/4 (slice A2 §4, write-through): removes from world truth's
   * own persisted opportunities list, not the session's own (now-view)
   * array.
   */
  private resolveOpportunity(
    opp: OpportunityState,
    resolutionType: OpportunityResolutionType,
  ): void {
    // Remove from active list
    setPersistedOpportunities(
      this.engine.world,
      getPersistedOpportunities(this.engine.world).filter((o) => o.id !== opp.id),
    );

    // Build resolved copy — immutable, never mutate the original
    const resolvedStatus = resolutionType === 'completed' ? 'completed'
      : resolutionType === 'failed' ? 'failed'
      : resolutionType === 'expired' ? 'expired'
      : resolutionType === 'declined' ? 'declined'
      : resolutionType === 'abandoned' ? 'abandoned'
      : resolutionType === 'betrayed' ? 'betrayed'
      : 'failed';
    const resolvedOpp: OpportunityState = { ...opp, status: resolvedStatus, resolvedAtTick: this.engine.tick };

    // Compute fallout
    const fallout = computeOpportunityFallout(resolvedOpp, resolutionType, {
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
      : resolutionType === 'declined' ? 'opportunity-declined' as const
      : 'opportunity-failed' as const;
    const source: ChronicleEventSource = { kind: chronicleKind, opportunity: resolvedOpp, tick: this.engine.tick };
    for (const entry of deriveChronicleEvents(source, this.engine.world.playerId)) {
      this.journal.record(entry);
    }

    // Apply fallout effects
    this.applyOpportunityFalloutEffects(fallout);
    this.resolvedOpportunities.push(fallout);
    this.capOldestFirst(this.resolvedOpportunities, MAX_RESOLVED_FALLOUT_ENTRIES); // F-51e110b9
    this.refreshProfileViews();
  }

  /** Apply structured opportunity fallout effects to session state. */
  private applyOpportunityFalloutEffects(fallout: OpportunityFallout): void {
    for (const effect of fallout.effects) {
      switch (effect.type) {
        case 'reputation':
          // WO-A2T-2 (slice A2 §9, R1): the caller (applyOpportunityFalloutEffects'
          // own caller, below) refreshes the profile views — including
          // this one — right after this method returns.
          if (this.profile) {
            this.adjustFactionReputation(effect.factionId, effect.delta);
          }
          break;
        case 'leverage':
          // WO-A2T-3 (slice A2 §10, R6): NOT converted to the entity
          // ledger this wave — see leverage-view.ts's own doc comment and
          // refreshProfileViews' doc comment (game.ts) for why: the wave
          // addendum names only tickPlayerLeverage, and converting this
          // site too (tried, then reverted this session) broke
          // game.test.ts's F-5b48354f bribe-resolution test once
          // refreshProfileViews' own per-round leverage sync reverted this
          // write on the next round. Stays on profile.custom directly,
          // unchanged from pre-wave behavior.
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
          // WO-A2-3/4 (slice A2 §4, write-through + engine reuse):
          // pushActivePressure honors the engine's own one-active-per-kind
          // invariant (superseding the old ad hoc MAX_ACTIVE=3 cap) and
          // writes straight to the world-tick namespace's live array.
          const MAX_ACTIVE = 3;
          if (getActivePressures(this.engine.world).length < MAX_ACTIVE) {
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
            pushActivePressure(this.engine.world, chainPressure);
            this.refreshProfileViews();
          }
          break;
        }
        case 'obligation': {
          // WO-A2-3/4 (slice A2 §4, write-through): npcObligations
          // mutations go through setPersistedNpcState (the full NPC-agency
          // namespace write), preserving every other slice of it as read
          // back from world truth, then refresh.
          const counterparty = effect.direction === 'npc-owes-player'
            ? this.engine.world.playerId
            : effect.npcId;
          const obl = createObligation(
            effect.kind, effect.direction, effect.npcId, counterparty,
            effect.magnitude, `opportunity-${fallout.resolution.resolutionType}`,
            this.engine.tick,
          );
          const ledger = this.npcObligations.get(effect.npcId) ?? { obligations: [] };
          const updatedObligations = new Map(this.npcObligations);
          updatedObligations.set(effect.npcId, addObligation(ledger, obl));
          this.writeNpcObligations(updatedObligations);
          break;
        }
        case 'npc-relationship':
          // Applied through NPC cognition system
          break;
        case 'companion-morale':
          // WO-A4-1 (slice A4 §1): partyState is a getter now — assigning
          // to it is not legal (and, pre-A4, this call site's plain-field
          // assignment silently discarded itself the next time
          // runWorldRound's own resync ran, since nothing here ever
          // pushed this change out to world truth). Write straight
          // through via syncCompanionMorale (setPartyState), matching
          // every other companion-morale write path in this file
          // (processCompanionReactions below).
          if (this.partyState.companions.some((c) => c.npcId === effect.npcId)) {
            const updatedParty = adjustCompanionMorale(this.partyState, effect.npcId, effect.delta);
            syncCompanionMorale(this.engine, updatedParty);
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
              this.pendingAnnouncements.push(`Title evolved: "${newTitle}"`);
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
      this.capOldestFirst(this.endgameTriggers, MAX_ENDGAME_TRIGGERS); // F-51e110b9
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
    // Retry-safe (task_3ddb1c06 companion): re-invoking /conclude after the
    // campaign is already concluded reuses the existing outline instead of
    // re-running buildFinale(), which would duplicate the campaign-concluded
    // chronicle record and re-mutate triggers. This is what makes the
    // epilogue-fallback copy's "type /conclude again to retry" promise true.
    const outline = this.campaignStatus === 'completed' && this.finaleOutline
      ? this.finaleOutline
      : this.buildFinale();

    // Mark all triggers as acknowledged and campaign as completed
    for (const trigger of this.endgameTriggers) {
      trigger.acknowledged = true;
    }
    this.campaignStatus = 'completed';

    // Generate LLM epilogue
    const result = await generateFinaleNarration({
      // F-b4b16d0a: counted as 'narration' toward getCostSummary().
      client: withTokenTracking(this.client, this.tokenTracker, 'narration'),
      outline,
      genre: this.genre,
      characterName: this.profile?.build.name,
      narratorTone: this.tone,
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
      schemaVersion: 2,
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

    // F-51e110b9: bound journal growth once per ordinary turn — this is the
    // unconditional every-turn call site (game.ts's PB-001 block calls this
    // method at every turn) the finding anchors on.
    this.trimJournalIfNeeded();
  }

  // --- v1.7: Economy ---

  // WO-A4-1 (slice A4 §1, deletion): the private initializeDistrictEconomies()
  // seeder (and its game-state.ts free-function counterpart) are deleted —
  // see the constructor's own doc comment for why districtEconomies needs
  // no independent seeding once it is a live getter over world truth.

  // WO-A2-4 (slice A2 §5, deletion): tickDistrictEconomies (the private
  // wrapper) is deleted — runWorldTick already ticks every district's
  // economy itself each round (see the game-state.ts deletion note beside
  // its own now-deleted tickDistrictEconomies export).

  /**
   * Apply an economy-shift effect to a district's economy.
   * WO-A2-3/4 (slice A2 §4, write-through): writes straight to
   * economy-core's own live districts Record on world truth
   * (applyEconomyShiftToWorld) instead of the app's own districtEconomies
   * Map, then refreshes the view.
   */
  private applyEconomyShiftEffect(
    districtId: string,
    category: string,
    delta: number,
    cause: string,
  ): void {
    applyEconomyShiftToWorld(this.engine.world, districtId, category, delta, cause);
    this.refreshProfileViews();
  }

  // WO-A2-4 (slice A2 §5, deletion): tickFactionAgency and its now-dead
  // helper applyFactionEffects are deleted — verified against the
  // installed 3.11 dist (world-tick.js's runFactionAgencyStep,
  // packages/modules/dist/world-tick.js:1543-1626 in this worktree's
  // node_modules) that runWorldTick's own faction-agency step already
  // drives runFactionAgencyTick and applies EVERY one of this method's own
  // effect cases directly onto world truth: district-metric
  // (applyDistrictMetricEffect), reputation (addGlobal
  // 'reputation_<f>' — the accrued ledger; NOT profile.reputation[]
  // directly, which is why A2-truth's reputation composition, §9, exists
  // as the NEXT wave, not this one), alert (addGlobal 'faction_alert_<f>'),
  // rumor (spawnNpcOriginatedRumor + setPlayerRumorState), pressure
  // (makePressure + the one-active-per-kind invariant, same as
  // pushActivePressure), economy-shift (setDistrictEconomy), and
  // member-count. lastFactionActions/lastFactionProfiles are refreshed
  // views (getPersistedFactionLastActions/getPersistedFactionProfiles)
  // from this wave on.

  // --- v1.2: NPC Agency ---
  //
  // WO-A2-4 (slice A2 §5, deletion): tickNpcAgencyTurn is deleted —
  // verified against the installed 3.11 dist (world-tick.js's
  // runNpcAgencyStep, packages/modules/dist/world-tick.js:1254-1526 in
  // this worktree's node_modules) that runWorldTick's own npc-agency step
  // already does EVERY piece of this method's job directly against world
  // truth: obligation decay (tickObligations per ledger), the NPC agency
  // tick itself (runNpcAgencyTick), EVERY NpcEffect variant this codebase's
  // own applyNpcEffects (src/npc/agency.ts, narrative-llm-owned) used to
  // apply by hand (belief/memory/morale/suspicion/reputation/alert/
  // zone-change/pressure/obligation/npc-rumor/companion-departure/
  // spawn-opportunity), AND the entire consequence-chain lifecycle
  // (tick existing chains, evaluate breakpoint-shift triggers, build new
  // chains, resolve a ready step by forcing the NPC action through
  // resolveNpcAction, persisting profiles/lastActions/obligationLedgers/
  // chains/recapEntries in one setPersistedNpcState call). lastNpcActions/
  // lastNpcProfiles/npcObligations/activeConsequenceChains are refreshed
  // views from this wave on; chronicle derivation for the round's actions
  // (including forced chain steps, now merged into the same lastActions
  // list by the engine) is re-sourced in runWorldRound() below.
  //
  // KNOWN GAP (kept branch NOT reproduced, reported per the honesty
  // floor): the engine's own consequence-chain resolution does not emit
  // this app's old bespoke "district drift by chain kind"
  // (modifyDistrictMetric keyed off retaliation/vendetta/extortion/
  // abandonment/plea/sacrifice) or the 'betrayal-witnessed' companion
  // reaction trigger for a resolved retaliation/vendetta step — neither
  // is in the design doc's explicit "must re-source" list (only chronicle
  // entries and the recap/chronicle side effects are named), and no
  // engine-side equivalent exists for either (confirmed: no
  // retaliation/vendetta/extortion/abandonment/plea/sacrifice string
  // appears anywhere in world-tick.js). A resolved chain step still
  // narrates (the engine emits npc.action.resolved and, for a 'betray'
  // verb, npc.betrayal.witnessed onto the eventLog every forced step
  // reaches) but no longer nudges district metrics or companion morale on
  // its own. Flagged for a follow-up wave rather than reimplemented here
  // against low-confidence diffing.

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
        // Engine 2.9.x: the recognition roll comes from the world's seeded RNG
        // (shouldRecognize no longer draws internally — world truth stays
        // reproducible across same-seed runs).
        if (!shouldRecognize(clarity, notoriety, this.engine.store.rng.next())) continue;

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
      // F-a658b0fb (3.9 slice): engine 3.9's buildWorldStack starters always
      // include player-leverage, which registers 'sabotage' — and 3.9's
      // registerVerb throws on duplicates. claude-rpg owns these verbs by
      // design (thin attempted-event handlers; game.ts processes them), so
      // 'sabotage' takes the engine's sanctioned intentional-replacement
      // path. The other three stay fail-loud on purpose: if the engine ever
      // claims them, we want the throw, not a silent shadow.
      const opts = verb === 'sabotage' ? { override: true } : undefined;
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
      }, opts);
    }

    // Register craft verb (v1.8). { override: true }: engine 3.9's crafting
    // module (always in buildWorldStack starters) registers 'craft' first —
    // same intentional replacement as 'sabotage' above (F-a658b0fb).
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
    }, { override: true });
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
            // Friendly side effect: NPC grants a bonus favor.
            // WO-A2-3/4 (slice A2 §4, write-through): see
            // writeNpcObligations' own doc comment.
            const ledger = this.npcObligations.get(targetId) ?? { obligations: [] };
            const obl = createObligation(
              'favor', 'npc-owes-player', targetId, this.engine.world.playerId,
              2, 'leverage-bonus', this.engine.tick, 15,
            );
            const updatedObligations = new Map(this.npcObligations);
            updatedObligations.set(targetId, addObligation(ledger, obl));
            this.writeNpcObligations(updatedObligations);
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
          // WO-A2T-2 (slice A2 §9, R1): adjustFactionReputation both writes
          // the accrued global and refreshes the profile view — no
          // subsequent refreshProfileViews() call in this method's own
          // caller, so the refresh must happen here.
          this.adjustFactionReputation(effect.factionId, effect.delta);
          break;

        case 'leverage':
          // WO-A2T-3 (slice A2 §10, R6): NOT converted to the entity
          // ledger this wave — see refreshProfileViews' doc comment (above,
          // this file) for why.
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
          // WO-A2-3/4 (slice A2 §4, write-through + engine reuse): see
          // applyOpportunityFalloutEffects' own 'spawn-pressure' case for
          // the same pushActivePressure pattern.
          const MAX_ACTIVE = 3;
          if (getActivePressures(this.engine.world).length < MAX_ACTIVE) {
            const pressure = makePressure({
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
            });
            pushActivePressure(this.engine.world, pressure);
            this.refreshProfileViews();
          }
          break;
        }

        case 'cohesion': {
          // F-faf37249: same readFactionCognitionScalars() consolidation as
          // the byte-for-byte-duplicate 'cog' block above (this one was
          // 'cog2', a renamed copy).
          const cog2 = getFactionCognition(this.engine.world, effect.factionId);
          cog2.cohesion = Math.max(0, Math.min(1, readFactionCognitionScalars(cog2).cohesion + effect.delta));
          break;
        }

        case 'alert': {
          const cog2 = getFactionCognition(this.engine.world, effect.factionId);
          cog2.alertLevel = Math.max(0, Math.min(100, readFactionCognitionScalars(cog2).alertLevel + effect.delta));
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

  /**
   * Apply natural leverage gains from game events.
   *
   * WO-A2T-3 (slice A2 §10, R6): gains land on the player ENTITY's custom
   * map (the ONE ledger — writeLeverageDeltas), never profile.custom
   * directly; the profile's `leverage.*` fields are the view, refreshed by
   * writeLeverageDeltas' own return.
   *
   * The passive tick this method used to run itself (heat decay +
   * reputation-derived influence reconciliation, via the SAME `tickLeverage`
   * this file used to call) is DELETED here, not redirected to the entity
   * ledger: the engine's own leverage-income step (world-tick.ts's
   * runLeverageIncomeStep, step 5a2 — straight-adopted, unconditional,
   * since the A2-core wave-4 stitch) already calls `tickLeverage` on the
   * SAME entity.custom every round runWorldRound's tick runs (verified
   * against the installed 3.11 dist: `custom = tickLeverage(playerCustom,
   * reputation); ... player.custom = custom;`). Once this method's gains
   * target the same map the engine's step owns, keeping this method's own
   * passive-tick call too would decay heat and reconcile influence TWICE
   * per round on one ledger — the exact "no double simulation" failure
   * mode this slice's own design doc guards pressures against (§7), just
   * discovered here for leverage instead. Deleting the redundant half
   * mirrors A2-core §5's hand-ticker-deletion precedent: what the engine's
   * tick already does every round is not re-done app-side.
   *
   * KNOWN RESIDUAL GAP (documented, not fixed this wave — see
   * refreshProfileViews' own doc comment above for the full reasoning):
   * writeLeverageDeltas' return is a full six-currency refresh of
   * profile.custom's `leverage.*` keys from the entity ledger. On a turn
   * where `gains` is non-empty AND a leverage VERB (bribe/intimidate/etc.,
   * via applyLeverageEffects) ALSO wrote profile.custom directly that same
   * turn (still unconverted per the wave addendum's own narrow WO-A2T-3
   * scope), this call would overwrite that verb's currencies with the
   * entity ledger's unrelated values. Narrower than the per-round clobber
   * this session found and reverted (that one fired on EVERY subsequent
   * turn, unconditionally); this one requires `gains` to be non-empty the
   * SAME turn a verb also spent/gained currency. Flagged for the
   * coordinator: fully closing it requires converting every leverage/heat
   * read+write site in this file to the entity ledger, a materially larger
   * change than this WO authorizes.
   */
  private tickPlayerLeverage(hints: ProfileUpdateHints): void {
    if (!this.profile) return;

    const gains = computeLeverageGains(hints);
    if (Object.keys(gains).length === 0) return;

    this.profile = writeLeverageDeltas(this.profile, this.engine.world, gains);

    // Stats: track currency gains (profile-only bookkeeping — unaffected by
    // the ledger unification; these keys were never part of the
    // leverage.* view).
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

  // --- v1.1: Cockpit helpers ---

  /** Build a StrategicMap from current session state. */
  private buildCurrentStrategicMap(): StrategicMap {
    return _buildCurrentStrategicMap(
      this.engine.world, this.profile, this.playerRumors,
      this.activePressures, this.lastFactionActions,
      this.districtEconomies, this.activeOpportunities,
    );
  }

  /**
   * Build a MoveRecommendation from current session state.
   *
   * WO-A4-2 (slice A4 §2, design lock 3): the ONE per-turn call this method
   * used to have — situationHint's computation in processInput's
   * executeTurn options (above) — is deleted; that hint now reads
   * getPersistedMoveRecommendation(world) instead (the tick's own
   * recomputation, which also attaches situationHint — this method's own
   * `recommendMoves(inputs)` call never did, so `rec.situationHint` from
   * THIS method was always undefined). This method survives for its three
   * remaining on-demand callers, none of which are in the turn path and
   * none of which read `.situationHint`: the director-mode command
   * dispatch's `suggestedMove`/`situationTag` (no turn consumed — see
   * processInput's director-mode branch), the play-mode `/status` command
   * (also no turn consumed), and the post-turn move-advisor/contextual-
   * suggestions block (`.top3`/`.situationTag` for `generateSuggestions`).
   */
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

    // F-88570323: try the same tiered name resolution attack/speak/inspect
    // already use (exact name -> substring name -> substring id) against
    // entities in the player's current zone before falling back to a raw id
    // lookup. Entity ids aren't reliably derivable from what's displayed to
    // the player (a starter-fantasy NPC declared `id: 'pilgrim'` shows
    // everywhere else as "Suspicious Pilgrim"), so most players only ever
    // know the spoken name. Zone-scoping mirrors the fast-path interpreter's
    // own scoping and can't produce a false positive recruitCompanion's own
    // same-zone check below wouldn't reject anyway.
    const zoneEntities = Object.values(this.engine.world.entities).filter(
      (e) => e.zoneId === this.engine.world.locationId && e.id !== this.engine.world.playerId,
    );
    const resolved = findEntityByName(npcId, zoneEntities);
    const entity = resolved ?? this.engine.world.entities[npcId];
    if (!entity) {
      return `  No one named "${npcId}" is here to recruit — type "look" to see who's nearby.`;
    }
    const resolvedId = entity.id;

    const roleArg = args[1] as CompanionRole | undefined;
    const role = roleArg ?? inferCompanionRole(entity);

    const result = recruitCompanion(
      this.engine,
      this.partyState,
      resolvedId,
      role,
      this.engine.tick,
    );

    if (!result.ok) return `  ${result.error}`;

    // WO-A4-1: recruitCompanion already wrote result.party through to world
    // truth via its own internal setPartyState call — partyState (a getter
    // now) already reflects it; syncCompanionMorale below both stamps the
    // new companion's morale onto its entity's custom fields AND re-writes
    // the same party state through, so no separate assignment is needed
    // here.
    syncCompanionMorale(this.engine, this.partyState);

    // Record chronicle event
    const joinSource: ChronicleEventSource = {
      kind: 'companion-joined',
      npcId: resolvedId,
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

    // F-88570323: resolve against the current party roster's display names,
    // the same tiered way /recruit above does. Scoping the search to
    // companions already in the party (rather than every entity in the
    // world) means a match here can never point at the wrong NPC — a
    // dismiss target is always an existing companion or nothing at all.
    // Party member display names are already visible every turn via the
    // party status line (game-presenter.ts's buildPartyStatusLine), so
    // that's genuinely what a player has on hand to type, not the id.
    const partyEntities = this.partyState.companions
      .map((c) => this.engine.world.entities[c.npcId])
      .filter((e): e is EntityState => e != null);
    const resolved = findEntityByName(npcId, partyEntities);
    const resolvedId = resolved ? resolved.id : npcId;

    const entity = this.engine.world.entities[resolvedId];
    const name = entity?.name ?? npcId;

    const result = dismissCompanion(this.engine, this.partyState, resolvedId);
    if (!result.removed) return `  ${name} is not in your party.`;

    // WO-A4-1: dismissCompanion already wrote result.party through to world
    // truth via its own internal setPartyState call (gated on
    // result.removed, true here) — partyState (a getter now) already
    // reflects it, so no separate assignment is needed.

    // Record chronicle event
    const dismissSource: ChronicleEventSource = {
      kind: 'companion-departed',
      npcId: resolvedId,
      npcName: name,
      reason: 'dismissed',
      tick: this.engine.tick,
    };
    for (const entry of deriveChronicleEvents(dismissSource, this.engine.world.playerId)) {
      this.journal.record(entry);
    }

    return `  ${name} has left your party.`;
  }

  /**
   * Add a rumor, applying companion rumor-suppression if applicable.
   * WO-A2-3/4 (slice A2 §4, write-through): THE one write-through helper
   * every other playerRumors writer in this file (item recognition,
   * dialogue-adjacent fallout/leverage/faction rumor effects) now goes
   * through — reads/writes the player-rumor namespace directly (world
   * truth) instead of the session's own cached field, then refreshes the
   * view.
   */
  private addRumor(rumor: PlayerRumor): void {
    const world = this.engine.world;
    const state = getPlayerRumorState(world);
    const before = state.rumors;
    const next = _addRumor(rumor, before, this.partyState, this.engine.tick);
    if (next !== before) {
      setPlayerRumorState(world, { ...state, rumors: next });
      // WO-A3-2 (slice A3 §3): mirror into the RumorEngine ONLY when the
      // rumor was actually added — `next === before` above (companion
      // rumor-suppression, game-state.ts's own addRumor doc comment) means
      // this rumor never entered the ledger at all, so there is nothing to
      // mirror. runWorldRound's own post-round sweep (mirrorUnmirroredRumors)
      // is idempotent against this call via findBySubjectKey, so calling
      // both is safe.
      mirrorPlayerRumor(this.rumorEngine, rumor);
    }
    this.refreshProfileViews();
    // F-fd5e8eec: detect a cap eviction (a genuinely new array — ruling out
    // suppression, which returns the same reference unchanged — whose length
    // didn't grow) and warn once per session. See rumorCapWarned's doc
    // comment above for why the notice lives here rather than inside
    // capPlayerRumors/addRumor (game-state.ts, "No console IO").
    if (!this.rumorCapWarned && next !== before && next.length <= before.length) {
      this.rumorCapWarned = true;
      this.debugLog.warn('rumors', 'playerRumors hit MAX_PLAYER_RUMORS — oldest/inert rumors are now evicted as new ones are spawned.');
    }
  }

  /**
   * WO-A3-2 (slice A3 §3): mirror every entry in this.playerRumors that the
   * RumorEngine doesn't already have (by `findBySubjectKey('player', id)`)
   * — called from runWorldRound's post-round sweep (step 5.5). Covers
   * ledger rumors that never went through this.addRumor: the engine's own
   * NPC-originated rumors (spawnNpcOriginatedRumor, written straight into
   * the player-rumor namespace by the npc-agency tick step) and
   * game-state.ts's applyFalloutEffects rumor case (writes through
   * setPlayerRumorState directly — see applyFalloutEffects' own doc
   * comment, game.ts). Idempotent: mirrorPlayerRumor itself no-ops on an
   * already-mirrored id, so calling this every round never creates
   * duplicates (design doc §4, "Mirror completeness").
   */
  private mirrorUnmirroredRumors(): void {
    for (const rumor of this.playerRumors) {
      mirrorPlayerRumor(this.rumorEngine, rumor);
    }
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

    // WO-A4-1 (slice A4 §1): partyState is a getter now, so each
    // iteration's morale change is written straight through
    // (syncCompanionMorale, which calls setPartyState internally) before
    // the next iteration reads `this.partyState` again — the same
    // fold-as-you-go a plain field assignment used to give for free, now
    // made explicit. A departure reads world truth via
    // handleCompanionDeparture -> this.partyState, which is why the flush
    // has to happen before it, not after the whole loop.
    for (const reaction of reactions) {
      const updatedParty = adjustCompanionMorale(
        this.partyState, reaction.npcId, reaction.moraleDelta,
      );
      syncCompanionMorale(this.engine, updatedParty);

      if (reaction.departure) {
        this.handleCompanionDeparture(
          reaction.npcId,
          reaction.departureReason ?? 'lost faith',
        );
      }
    }
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

  /**
   * F-462792bb (SLATE-2, persisted per Director ruling R2): capture this
   * turn's player<->NPC exchange into this.npcConversations, keyed by the
   * NPC's real id (never name/genre, per the brief's explicit requirement --
   * matches the same key turn-loop.ts's Step 5 looks the map up by).
   *
   * Reads turnResult.dialogue; skipped entirely when absent OR when
   * isFallback is true -- the hardcoded 'NPC pauses, gathering their
   * thoughts...' stall text (dialogue-mind.ts's own isFallback contract) is
   * a non-event, and remembering it forever as if it were a real exchange
   * would be worse than not remembering. Trims to the last 20 entries per
   * NPC, mirroring this exact codebase's own MAX_COMPACTED_CHUNKS=50
   * discipline (session/history.ts) for any structure that grows once per
   * campaign-length session.
   *
   * Player-line speaker is the fixed literal 'Player' (contract amendment
   * #1, brief ruled 2026-08-26) -- narrative-llm's prompt convention and
   * their formatConversationHistory render these labels; 'Player' matches
   * the prompt's existing "Player says:" framing (prompts/dialogue-npc.ts).
   * NPC lines keep turnResult.dialogue.speakerName.
   */
  private recordConversationExchange(turnResult: TurnResult): void {
    const dialogue = turnResult.dialogue;
    if (!dialogue || dialogue.isFallback) {
      // WO-B1F-1 (design lock 1): only the turn IMMEDIATELY PRECEDING a
      // free-prose reply counts as "an NPC just spoke" -- any other turn
      // (no dialogue at all, or a fallback stall that was never a real
      // exchange) clears the reply-to-speaker slot, so a sentence typed
      // several turns after a conversation ended doesn't quietly latch onto
      // a stale NPC.
      this.lastSpeakerNpcId = null;
      return;
    }

    const npcId = dialogue.speakerId;
    this.lastSpeakerNpcId = npcId;
    const exchanges = this.npcConversations.get(npcId) ?? [];
    exchanges.push({ speaker: 'Player', text: turnResult.playerInput });
    exchanges.push({ speaker: dialogue.speakerName, text: dialogue.text });
    this.npcConversations.set(npcId, exchanges.slice(-20));
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
          // WO-A2T-3 (slice A2 §10, R6): NOT converted to the entity
          // ledger this wave — see refreshProfileViews' doc comment (above,
          // this file) for why. applyLeverageDeltas clamps 0-100, the same
          // bound the previous Math.min(100, ...) enforced.
          if (this.profile) {
            this.profile = {
              ...this.profile,
              custom: applyLeverageDeltas(this.profile.custom, { heat: effect.delta }),
            };
          }
          break;

        case 'reputation':
          // WO-A2T-2 (slice A2 §9, R1): no subsequent refreshProfileViews()
          // call in this method's own callers, so adjustFactionReputation's
          // own immediate view refresh is load-bearing here.
          if (this.profile) {
            this.adjustFactionReputation(effect.factionId, effect.delta);
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
      // WO-A4-1: dismissCompanion already wrote result.party through to
      // world truth via its own internal setPartyState call — partyState
      // (a getter now) already reflects it.

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
