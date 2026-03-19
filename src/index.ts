// claude-rpg — public API

export { GameSession, type GameConfig, type GameMode } from './game.js';
export { createClaudeClient, type ClaudeClient, type ClaudeClientConfig, type StreamCallback } from './claude-client.js';
export { createAdaptedClient } from './llm/claude-adapter.js';
export { NarrationError, userMessage, type NarrationErrorKind } from './llm/claude-errors.js';
export { executeTurn, type TurnResult, type ProfileUpdateHints } from './turn-loop.js';
export { interpretAction, type InterpretedAction } from './action-interpreter.js';
export { narrateScene } from './narrator/narrator.js';
export { buildSceneContext } from './narrator/scene-context.js';
export { generateDialogue, type DialogueResult } from './dialogue/dialogue-mind.js';
export { buildNPCDialogueContext } from './dialogue/npc-context.js';
export { generateWorld, type WorldGenResult, type WorldGenProposal } from './foundry/world-gen.js';
export { TurnHistory } from './session/history.js';
export { saveSession, loadSession, validateSaveShape, SaveValidationError, loadProfileFromSession, loadRumorsFromSession, loadPressuresFromSession, loadResolvedPressuresFromSession, loadNpcAgencyFromSession, listSaves, type SaveSlotSummary, type LoadResult } from './session/session.js';
export { migrateSave, detectSchemaVersion, CURRENT_SCHEMA_VERSION } from './session/migrate.js';
export { renderPlayScreen, renderWelcome } from './display/play-renderer.js';
export { executeDirectorCommand } from './display/director-renderer.js';

// v0.2: Immersion Runtime
export { ImmersionRuntime, type ImmersionConfig } from './runtime/immersion-runtime.js';
export { PresentationStateMachine, type PresentationState, type StateTransition } from './runtime/presentation-state.js';
export { HookManager, type HookPoint, type HookContext, type HookResult, type Hook, registerBuiltinHooks } from './runtime/hooks.js';
export { VoiceCaster, type VoiceCast } from './runtime/voice-caster.js';
export { VoiceSoundboardBridge, type McpToolCall } from './runtime/audio-bridge.js';

// v0.3: Character Presence
export { allPacks, getPackById, resolveWorldFlag, type PackInfo } from './character/packs.js';
export { buildCharacter, type BuildResult } from './character/builder.js';
export { buildPresence, buildNPCStancePresence, buildStatusData, type PresenceStrings, type StatusData } from './character/presence.js';
export { renderCharacterSheet } from './character/sheet.js';
export { renderRecap } from './character/recap.js';

// v0.4: Social Consequence
export { captureSnapshot, computeSessionDelta, renderSessionDelta, type SessionSnapshot, type SessionDelta } from './character/recap-delta.js';

// v0.5: Rumor Ecology (types re-exported from engine)
// PlayerRumor type available via @ai-rpg-engine/modules

// v0.6: Emergent Pressure (types re-exported from engine)
// WorldPressure, PressureKind, PressureInputs available via @ai-rpg-engine/modules

// v0.7: Resolution & Fallout
export { captureWorldSnapshot, computeWorldDelta, renderWorldDelta, type WorldSnapshot, type WorldDelta } from './character/world-delta.js';
// ResolutionType, PressureFallout, FalloutEffect available via @ai-rpg-engine/modules

// v0.8: Chronicle & Campaign Memory
export {
  deriveChronicleEvents,
  computeSignificance,
  compactChronicle,
  buildChronicleContext,
  type ChronicleEventSource,
  type CompactedChronicle,
  type EraSummary,
} from './session/chronicle.js';
export { renderChronicle, type ChronicleRenderMode } from './character/chronicle-renderer.js';
export {
  computeFactionDeltas,
  computeRumorDelta,
  deriveWhatPeopleAreSaying,
  renderFullRecap,
  type FactionDelta,
  type RumorDelta,
  type WhatPeopleAreSaying,
} from './character/session-recap.js';
export { loadChronicleFromSession, loadObligationsFromSession, loadConsequenceChainsFromSession } from './session/session.js';

// v0.9: Faction Agency
// FactionProfile, FactionAction, FactionActionResult, FactionGoal, FactionEffect available via @ai-rpg-engine/modules

// v1.0: Player Leverage
// LeverageCurrency, LeverageState, PlayerSocialVerb, PlayerRumorVerb, PlayerDiplomacyVerb, PlayerSabotageVerb,
// LeverageCost, LeverageRequirement, LeverageEffect, LeverageResolution, LeverageHints
// available via @ai-rpg-engine/modules
// StrategicMap, DistrictStrategicView, FactionStrategicView available via @ai-rpg-engine/modules

// v1.1: The Cockpit — campaign UX and product hardening
// Move advisor: ScoredMove, AdvisorInputs, MoveRecommendation, MoveCategory available via @ai-rpg-engine/modules
// Play-mode commands: /help, /help leverage, /help <pack>, /status, /map, /leverage
// Director commands: /stats, /status
// Contextual suggestions injected after turns
// Pack-aware onboarding via help-system

// v1.2: NPC Agency
export { tickNpcAgency, buildNpcProfilesForDirector, applyNpcEffects } from './npc/agency.js';
export { buildNpcPresenceForDialogue, buildNpcPresenceForNarrator, getNpcDialogueHint } from './npc/presence.js';
// NpcProfile, NpcAction, NpcActionResult, NpcGoal, NpcRelationship, NpcActionVerb, NpcEffect available via @ai-rpg-engine/modules
