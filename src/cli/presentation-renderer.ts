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
// These are honest terminal equivalents, not ANSI art: dim text cues for
// sfx/music/ambient, and a blank-screen pause (plain newlines + a bold red
// '═' rule, distinct from makeDivider()'s routine dim '─' rule, never a
// simulated color fade) for fade UI effects. Output respects colors.ts's
// `enabled` gate automatically — dim()/critical() already no-op to plain
// text when colors are off (NO_COLOR, or stdout isn't a TTY), so this file
// does not need its own separate color gate.

import type { McpToolCall } from '../runtime/audio-bridge.js';
// F-3e0274e7: UiEffectType used to be a hand-copied local union with a
// comment claiming it mirrored @ai-rpg-engine/presentation's UiEffectType —
// verified byte-identical, but with zero compile-time coupling to the
// package it claimed to track, so an engine-side rename or added variant
// would have desynced silently. Imported directly instead (a pure
// string-literal type export, zero runtime cost): a future drift is now a
// compile error here, not a silent one. The '__ui_effect_intent__' call's
// `params.type` field carries this shape (see audio-bridge.ts's
// applyUiEffect) but params is a loosely-typed Record<string, unknown> at
// this boundary, so the value is narrowed defensively below (renderUiEffectLine)
// rather than trusted outright.
import type { UiEffectType } from '@ai-rpg-engine/presentation';
import { dim, critical } from './colors.js';
import { getTerminalWidth } from '../display/play-renderer.js';

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

/**
 * F-7eb33249: renderSfxLine/renderAmbientLine used to print the raw
 * voiceSoundboardEffect token straight from the sound bridge with zero
 * humanization -- e.g. '  · ambient: white_noise' with the underscore
 * intact -- reachable 100% of the time the LLM or a built-in hook selects
 * that cue, no variance required. Keyed by voiceSoundboardEffect (the
 * literal value renderSfxLine/renderAmbientLine receive via params.effect --
 * see audio-bridge.ts's playSfx/setAmbient, which resolve
 * `entry?.voiceSoundboardEffect ?? cue.effectId`/`cue.layerId` before
 * queuing the McpToolCall). Wording drawn from narrate-scene.ts's own
 * parenthetical descriptions of the same ids (the "Available sound effects"
 * / "Available ambient layers" lines in NARRATE_SYSTEM) so player-facing
 * phrasing agrees with what the LLM was told the sound is.
 *
 * Covers all 13 tokens @ai-rpg-engine/soundpack-core's CORE_SOUND_PACK
 * currently defines (10 sfx + 3 ambient) -- see the vocabulary-drift
 * tripwire in presentation-renderer.test.ts, which imports CORE_SOUND_PACK
 * directly so a future 14th entry gets exercised automatically.
 */
const SFX_LABELS: Record<string, string> = {
  chime_notification: 'a notification chime',
  chime_success: 'a success chime',
  chime_error: 'an error chime',
  chime_attention: 'an attention chime',
  click: 'a click',
  pop: 'a light pop',
  whoosh: 'a whoosh',
  warning: 'a warning tone',
  critical: 'a critical alarm',
  info: 'an info tone',
};

const AMBIENT_LABELS: Record<string, string> = {
  rain: 'rain',
  white_noise: 'white noise',
  drone: 'a low, tense drone',
};

/**
 * Fallback for a token with no curated label above: a generic
 * delimiter-strip rather than the raw id. Less polished, but guarantees no
 * raw underscore/hyphen ever reaches the screen even for an id nobody has
 * written copy for yet (e.g. a future registry entry).
 */
function humanizeToken(token: string): string {
  return token.replace(/[_-]+/g, ' ');
}

/**
 * F-06e3bd9e: this was the only one of the four cue-line renderers wrapped
 * in italic() on top of dim() -- renderAmbientLine, renderMusicLine, and
 * renderUiEffectLine's flash/shake/border-pulse fallback all use plain
 * dim(), with no comment ever explaining why sfx cues alone got different
 * treatment. Matches the other three now so all four share one visual
 * language for the same kind of system aside.
 */
function renderSfxLine(params: Record<string, unknown>): string {
  const effect = stringParam(params, 'effect') ?? 'effect';
  const label = SFX_LABELS[effect] ?? humanizeToken(effect);
  return dim(`  · ${label} sounds`);
}

function renderAmbientLine(params: Record<string, unknown>): string {
  const effect = stringParam(params, 'effect') ?? 'ambience';
  const label = AMBIENT_LABELS[effect] ?? humanizeToken(effect);
  return dim(`  · ambient: ${label}`);
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

/**
 * F-cbd65014: a few blank lines + a rule -- the "screen" pausing, not a
 * simulated ANSI color fade. This is only ever triggered by deathHook
 * (src/runtime/hooks.ts) on player death, the single most dramatic beat in
 * the game, so it must not reuse makeDivider()'s plain dim '─' rule
 * (play-renderer.ts) -- that exact token already prints on every ordinary
 * turn's screen. Width matches play-renderer.ts's own dividers; the '═'
 * character (matching makeTurnDivider()'s "something more significant just
 * happened" treatment) plus critical (bold red) coloring give this its own
 * signature, so a player can tell the pause apart from a routine divider
 * even under NO_COLOR, from the character alone.
 */
function renderScreenPause(): string {
  return '\n\n\n' + critical('═'.repeat(getTerminalWidth()));
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

/**
 * F-135b1970 / F-e78d68c1: bin.ts's per-turn loop used to console.log()
 * this turn's presentation cues in a separate call AFTER the full rendered
 * screen -- which already ends with play-renderer.ts's renderPlayScreen
 * "What do you do?" prompt and its trailing blank line. The on-screen order
 * read backwards: the cues describing what just happened this turn printed
 * BELOW the question asking what the player wants to do next, sandwiched
 * between the prompt and the actual '  > ' input marker.
 *
 * The real per-turn call chain that builds `screen` is bin.ts ->
 * GameSession.processInput() (game.ts, game-core) -> renderPlayOutput()
 * (src/game/game-presenter.ts, game-core) -> renderPlayScreen() (this
 * domain's play-renderer.ts) -- game-presenter.ts sits in the middle of
 * that chain outside cli-display's edit scope this wave, so there is no
 * seam to pass cues into renderPlayScreen's own composition from bin.ts.
 * This inserts them into the already-rendered screen instead, anchored on
 * renderPlayScreen's own "What do you do?" prompt line -- both the anchor
 * and this function live in cli-display, so the anchor is a stable
 * in-domain contract, not a guess at game-core's internals. Cues land as
 * their own paragraph directly above the prompt, so scrollback reads
 * narration -> status -> cues -> prompt -> input marker.
 */
export function insertCuesBeforePrompt(screen: string, cues: string): string {
  if (!cues) return screen;
  const marker = 'What do you do?';
  const idx = screen.indexOf(marker);
  if (idx === -1) return `${screen}\n${cues}`;
  const lineStart = screen.lastIndexOf('\n', idx) + 1;
  return `${screen.slice(0, lineStart)}${cues}\n\n${screen.slice(lineStart)}`;
}
