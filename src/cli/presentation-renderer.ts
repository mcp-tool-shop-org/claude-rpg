// presentation-renderer.ts — terminal half of the presentation seam contract
// (F-08f594de, wave 8). VoiceSoundboardBridge (src/runtime/audio-bridge.ts,
// game-core domain, read-only from here) queues McpToolCall entries every
// turn for sfx/ambient/music cues and UI-effect intents (e.g. deathHook's
// fade-to-black, src/runtime/hooks.ts:190). Before this file existed, nothing
// downstream of that queue ever printed them: F-6ef6e5a0 (closed) got
// hook-triggered UI effects as far as VoiceSoundboardBridge.applyUiEffect's
// own internal pendingCalls array, but that method's own comment says
// terminal rendering is "owned by the terminal renderer, not this audio
// bridge" — a renderer that never existed. This file is that renderer.
//
// game.ts (game-core domain, NOT owned here) adds a GameSession
// `onPresentation?: (calls: McpToolCall[]) => void` constructor option that
// fires after each completed turn (and the opening narration, if it produces
// calls). bin.ts wires that callback to capture a turn's calls and passes
// them through renderPresentationCues() for printing after the turn's
// narration output — see bin.ts's `withPresentationHook` helper.
//
// McpToolCall's shape (`{ tool: string; params: Record<string, unknown> }`)
// is defined in runtime/audio-bridge.ts; imported here as a type only,
// matching how turn-loop.ts and immersion-runtime.ts already reference the
// same type across the same domain boundary.
//
// These are honest terminal equivalents, not ANSI art: dim/italic text cues
// for sfx/music/ambient, and a blank-screen pause (plain newlines + a dim
// rule, never simulated color fades) for fade UI effects. Output respects
// colors.ts's `enabled` gate automatically — dim()/italic() already no-op to
// plain text when colors are off (NO_COLOR, or stdout isn't a TTY), so this
// file does not need its own separate color gate.

import type { McpToolCall } from '../runtime/audio-bridge.js';
import { dim, italic } from './colors.js';
import { getTerminalWidth } from '../display/play-renderer.js';

/**
 * Mirrors @ai-rpg-engine/presentation's UiEffectType. The '__ui_effect_intent__'
 * call's `params.type` field carries this shape (see audio-bridge.ts's
 * applyUiEffect) but params is a loosely-typed Record<string, unknown> at
 * this boundary, so the value is narrowed defensively below rather than
 * trusted outright.
 */
type UiEffectType = 'flash' | 'shake' | 'fade-in' | 'fade-out' | 'border-pulse';

function stringParam(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

function numberParam(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * `sound_effect` is how VoiceSoundboardBridge queues BOTH one-shot SFX
 * (playSfx) and ambient layers (setAmbient) — there is no separate tool name
 * for the two (audio-bridge.ts:68-102). The only distinguishing signal in
 * the queued params is which field is present: SfxCue's `intensity`, or
 * AmbientCue's `volume`.
 */
function isAmbientCue(params: Record<string, unknown>): boolean {
  return numberParam(params, 'intensity') === undefined && numberParam(params, 'volume') !== undefined;
}

function renderSfxLine(params: Record<string, unknown>): string {
  const effect = stringParam(params, 'effect') ?? 'effect';
  return italic(dim(`  · ${effect} sounds`));
}

function renderAmbientLine(params: Record<string, unknown>): string {
  const effect = stringParam(params, 'effect') ?? 'ambience';
  return dim(`  · ambient: ${effect}`);
}

function renderMusicLine(params: Record<string, unknown>): string {
  const action = stringParam(params, 'action');
  switch (action) {
    case 'intensify':
      return dim('  · music intensifies');
    case 'soften':
      return dim('  · music softens');
    case 'stop':
      return dim('  · music fades out');
    case 'crossfade':
      return dim('  · music shifts');
    case 'play':
    default:
      return dim('  · music starts');
  }
}

/** A few blank lines + a dim rule — the "screen" pausing, not a simulated
 *  ANSI color fade. Width matches play-renderer.ts's own dividers. */
function renderScreenPause(): string {
  return '\n\n\n' + dim('─'.repeat(getTerminalWidth()));
}

function renderUiEffectLine(params: Record<string, unknown>): string | null {
  const type = stringParam(params, 'type') as UiEffectType | undefined;
  switch (type) {
    case 'fade-out':
    case 'fade-in':
      return renderScreenPause();
    case 'flash':
    case 'shake':
    case 'border-pulse':
      // Not currently reachable in production — only deathHook populates
      // uiEffects today, and always with 'fade-out' (hooks.ts:190). Handled
      // anyway so a future narrator-driven effect of these kinds (the LLM
      // narration schema already allows all five types — see
      // prompts/narrate-scene.ts) doesn't dead-end silently the way the
      // fade-out intent did before this file existed (F-08f594de).
      return dim(`  · ${type}`);
    default:
      return null;
  }
}

/**
 * Map one turn's queued McpToolCall entries (VoiceSoundboardBridge.flush()'s
 * output) to compact terminal cue lines. `speak` calls are intentionally
 * skipped: narration/dialogue text is already printed by play-renderer.ts,
 * so echoing the TTS intent here would duplicate it on screen.
 */
export function renderPresentationCues(calls: McpToolCall[]): string {
  const lines: string[] = [];
  for (const call of calls) {
    const params = call.params ?? {};
    switch (call.tool) {
      case 'sound_effect':
        lines.push(isAmbientCue(params) ? renderAmbientLine(params) : renderSfxLine(params));
        break;
      case '__music_intent__':
        lines.push(renderMusicLine(params));
        break;
      case '__ui_effect_intent__': {
        const rendered = renderUiEffectLine(params);
        if (rendered !== null) lines.push(rendered);
        break;
      }
      default:
        // 'speak' and any other/unknown tool: no terminal cue.
        break;
    }
  }
  return lines.join('\n');
}
