import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderPresentationCues } from './presentation-renderer.js';
import type { McpToolCall } from '../runtime/audio-bridge.js';

// F-08f594de: terminal-renderer half of the presentation seam contract
// (wave-8/cli-display.md). VoiceSoundboardBridge.flush() (runtime/audio-bridge.ts,
// out of scope here, read-only) queues McpToolCall entries every turn for
// sfx/ambient/music cues and UI-effect intents (e.g. deathHook's fade-to-black,
// runtime/hooks.ts:190). Before this file existed nothing downstream of that
// queue ever printed them — F-6ef6e5a0 (closed) only got hook-triggered UI
// effects as far as the bridge's own internal pendingCalls array; its own
// applyUiEffect comment says terminal rendering is "owned by the terminal
// renderer, not this audio bridge." This is that renderer.
//
// These tests exercise the pure mapping function in isolation. The other
// half of the wiring (game.ts's onPresentation callback feeding bin.ts,
// which calls this function) is a cross-domain seam that can't be exercised
// by a scoped test run in this worktree alone — see bin.ts's
// `withPresentationHook` doc comment.

describe('renderPresentationCues', () => {
  it('renders nothing for an empty call list', () => {
    expect(renderPresentationCues([])).toBe('');
  });

  it('maps a sound_effect call carrying intensity (an SfxCue) to an sfx cue line', () => {
    const calls: McpToolCall[] = [
      { tool: 'sound_effect', params: { effect: 'alert', intensity: 0.8 } },
    ];
    const text = renderPresentationCues(calls);
    expect(text).toContain('alert');
    expect(text).toContain('sounds');
    expect(text).toContain('·'); // ·  cue bullet
  });

  it('maps a sound_effect call carrying volume instead of intensity (an AmbientCue, per setAmbient) to a distinct ambient cue line', () => {
    const calls: McpToolCall[] = [
      { tool: 'sound_effect', params: { effect: 'ambient_rain', volume: 0.4 } },
    ];
    const text = renderPresentationCues(calls);
    expect(text).toContain('ambient_rain');
    expect(text).toContain('ambient');
    // Must be visibly distinct from the sfx phrasing, since both share the
    // same 'sound_effect' tool name and are only told apart by which params
    // field is present.
    expect(text).not.toContain('sounds');
  });

  it('maps a __music_intent__ intensify call (combatStartHook) to a music cue line', () => {
    const calls: McpToolCall[] = [
      { tool: '__music_intent__', params: { action: 'intensify', fadeMs: 300 } },
    ];
    const text = renderPresentationCues(calls);
    expect(text).toContain('music');
    expect(text).toContain('intensif');
  });

  it('maps a __music_intent__ soften call (combatEndHook) to a music cue line', () => {
    const calls: McpToolCall[] = [
      { tool: '__music_intent__', params: { action: 'soften', fadeMs: 1000 } },
    ];
    const text = renderPresentationCues(calls);
    expect(text).toContain('music');
    expect(text).toContain('soften');
  });

  it('maps the __ui_effect_intent__ fade-out (deathHook fade-to-black) to a blank-screen sequence: newlines + a dim rule, not ANSI art', () => {
    const calls: McpToolCall[] = [
      { tool: '__ui_effect_intent__', params: { type: 'fade-out', durationMs: 2000, color: '#000' } },
    ];
    const text = renderPresentationCues(calls);
    expect(text).toContain('\n\n');
    expect(text).toMatch(/[─-]{5,}/);
    // Honest terminal equivalent, not simulated ANSI color art: no color
    // literal from the intent (e.g. its '#000') should leak into the output.
    expect(text).not.toContain('#000');
  });

  it('does not render a line for a speak call (narration/dialogue text is already printed by play-renderer.ts)', () => {
    const calls: McpToolCall[] = [
      { tool: 'speak', params: { text: 'Hello there', voice: 'narrator' } },
    ];
    expect(renderPresentationCues(calls)).toBe('');
  });

  it('joins multiple cues from the same turn on separate lines', () => {
    const calls: McpToolCall[] = [
      { tool: 'sound_effect', params: { effect: 'alert', intensity: 0.8 } },
      { tool: '__music_intent__', params: { action: 'intensify', fadeMs: 300 } },
    ];
    const text = renderPresentationCues(calls);
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(2);
  });

  it('renders no raw ANSI escape codes when colors are disabled (default test env: non-TTY stdout)', () => {
    const calls: McpToolCall[] = [
      { tool: 'sound_effect', params: { effect: 'alert', intensity: 0.8 } },
    ];
    expect(renderPresentationCues(calls)).not.toContain('\x1b[');
  });
});

// F-08f594de: "Respect the colors.ts enabled gate (no raw ANSI when colors
// are off)" — mirrors colors.test.ts's own pattern for proving the gate
// actually wires through, not just that plain text happens to render.
describe('renderPresentationCues with color enabled', () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = originalIsTTY;
  });

  it('wraps the sfx cue in ANSI codes when stdout is a TTY and NO_COLOR is unset', async () => {
    delete process.env.NO_COLOR;
    (process.stdout as unknown as { isTTY: boolean | undefined }).isTTY = true;
    vi.resetModules();
    const mod = await import('./presentation-renderer.js');
    const text = mod.renderPresentationCues([
      { tool: 'sound_effect', params: { effect: 'alert', intensity: 0.8 } },
    ]);
    expect(text).toContain('\x1b[');
  });
});
