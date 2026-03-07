// claude-rpg — public API

export { GameSession, type GameConfig, type GameMode } from './game.js';
export { createClaudeClient, type ClaudeClient, type ClaudeClientConfig } from './claude-client.js';
export { executeTurn, type TurnResult } from './turn-loop.js';
export { interpretAction, type InterpretedAction } from './action-interpreter.js';
export { narrateScene } from './narrator/narrator.js';
export { buildSceneContext } from './narrator/scene-context.js';
export { generateDialogue, type DialogueResult } from './dialogue/dialogue-mind.js';
export { buildNPCDialogueContext } from './dialogue/npc-context.js';
export { generateWorld, type WorldGenResult, type WorldGenProposal } from './foundry/world-gen.js';
export { TurnHistory } from './session/history.js';
export { saveSession, loadSession } from './session/session.js';
export { renderPlayScreen, renderWelcome } from './display/play-renderer.js';
export { executeDirectorCommand } from './display/director-renderer.js';

// v0.2: Immersion Runtime
export { ImmersionRuntime, type ImmersionConfig } from './runtime/immersion-runtime.js';
export { PresentationStateMachine, type PresentationState, type StateTransition } from './runtime/presentation-state.js';
export { HookManager, type HookPoint, type HookContext, type HookResult, type Hook, registerBuiltinHooks } from './runtime/hooks.js';
export { VoiceCaster, type VoiceCast } from './runtime/voice-caster.js';
export { VoiceSoundboardBridge, type McpToolCall } from './runtime/audio-bridge.js';
