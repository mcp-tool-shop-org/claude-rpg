// MCP Bridge — translates AudioCommands to voice-soundboard MCP tool calls

import type {
  PresentationRenderer,
  SpeakerCue,
  SfxCue,
  AmbientCue,
  MusicCue,
  UiEffect,
} from '@ai-rpg-engine/presentation';
import type { AudioCommand } from '@ai-rpg-engine/audio-director';
import { SoundRegistry } from '@ai-rpg-engine/soundpack-core';

export type McpToolCall = {
  tool: string;
  params: Record<string, unknown>;
};

/**
 * Bridges AudioCommands to voice-soundboard MCP tool calls.
 * In v0.2, this emits McpToolCall objects that can be executed
 * by an MCP client. The actual MCP transport is injected.
 */
export class VoiceSoundboardBridge implements PresentationRenderer {
  private pendingCalls: McpToolCall[] = [];
  private soundRegistry: SoundRegistry;
  private enabled: boolean;

  constructor(soundRegistry: SoundRegistry, enabled = true) {
    this.soundRegistry = soundRegistry;
    this.enabled = enabled;
  }

  /** Get and clear pending MCP tool calls. */
  flush(): McpToolCall[] {
    const calls = this.pendingCalls;
    this.pendingCalls = [];
    return calls;
  }

  /** Check if bridge is enabled. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Enable or disable the bridge. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async renderText(_text: string): Promise<void> {
    // Text rendering is handled by the terminal renderer, not audio
  }

  async playVoice(cue: SpeakerCue): Promise<void> {
    if (!this.enabled) return;
    this.pendingCalls.push({
      tool: 'speak',
      params: {
        text: cue.text,
        voice: cue.voiceId,
        emotion: cue.emotion,
        speed: cue.speed,
      },
    });
  }

  async playSfx(cue: SfxCue): Promise<void> {
    if (!this.enabled) return;

    // Look up voice-soundboard effect name from registry
    const entry = this.soundRegistry.get(cue.effectId);
    const effectName = entry?.voiceSoundboardEffect ?? cue.effectId;

    this.pendingCalls.push({
      tool: 'sound_effect',
      params: {
        effect: effectName,
        intensity: cue.intensity,
      },
    });
  }

  async setAmbient(cue: AmbientCue): Promise<void> {
    if (!this.enabled) return;

    if (cue.action === 'stop') {
      // No direct stop in voice-soundboard — nothing to actually play. But every
      // other "can't do this yet" path in this file (setMusic's __music_intent__,
      // applyUiEffect's __ui_effect_intent__, executeCommands' catch-all
      // __unhandled_audio_domain__) pushes a visible marker instead of vanishing
      // silently -- F-5f4834cd: this stop branch was the one exception, dropping
      // e.g. deathHook's ambient-stop cues with no trace. Match the convention.
      this.pendingCalls.push({
        tool: '__ambient_stop_intent__',
        params: {
          layerId: cue.layerId,
          fadeMs: cue.fadeMs,
        },
      });
      return;
    }

    const entry = this.soundRegistry.get(cue.layerId);
    const effectName = entry?.voiceSoundboardEffect ?? cue.layerId;

    this.pendingCalls.push({
      tool: 'sound_effect',
      params: {
        effect: effectName,
        volume: cue.volume,
      },
    });
  }

  async setMusic(cue: MusicCue): Promise<void> {
    if (!this.enabled) return;
    // Music playback is a future feature — voice-soundboard doesn't have a music player yet
    // For now, emit the intent for logging/debugging
    this.pendingCalls.push({
      tool: '__music_intent__',
      params: {
        action: cue.action,
        trackId: cue.trackId,
        fadeMs: cue.fadeMs,
      },
    });
  }

  async applyUiEffect(effect: UiEffect): Promise<void> {
    if (!this.enabled) return;
    // UI effects (fade/flash/shake) are terminal escape codes owned by the terminal
    // renderer, not this audio bridge — same "future feature, cue owned elsewhere"
    // shape as setMusic's __music_intent__ below. Emit the intent so callers of
    // flush()/executeCommands() at least see the request instead of it vanishing
    // here as a silent no-op (F-6ef6e5a0: this method previously had zero callers
    // anywhere in the codebase, so e.g. deathHook's fade-to-black never reached
    // anything downstream of ImmersionRuntime.processPresentation).
    this.pendingCalls.push({
      tool: '__ui_effect_intent__',
      params: {
        type: effect.type,
        durationMs: effect.durationMs,
        color: effect.color,
      },
    });
  }

  /** Execute a batch of AudioCommands through the bridge. */
  async executeCommands(commands: AudioCommand[]): Promise<McpToolCall[]> {
    for (const cmd of commands) {
      if (cmd.domain === 'voice' && cmd.action === 'play') {
        await this.playVoice({
          entityId: (cmd.params.entityId as string) ?? '__narrator__',
          voiceId: cmd.resourceId,
          emotion: (cmd.params.emotion as string) ?? 'calm',
          speed: (cmd.params.speed as number) ?? 1.0,
          text: (cmd.params.text as string) ?? '',
        });
      } else if (cmd.domain === 'sfx' && cmd.action === 'play') {
        await this.playSfx({
          effectId: cmd.resourceId,
          timing: 'immediate',
          intensity: (cmd.params.intensity as number) ?? 0.5,
        });
      } else if (cmd.domain === 'ambient') {
        await this.setAmbient({
          layerId: cmd.resourceId,
          action: cmd.action as 'start' | 'stop' | 'crossfade',
          volume: (cmd.params.volume as number) ?? 0.5,
          fadeMs: (cmd.params.fadeMs as number) ?? 1000,
        });
      } else if (cmd.domain === 'music') {
        await this.setMusic({
          action: cmd.action as 'play' | 'stop' | 'crossfade' | 'intensify' | 'soften',
          trackId: cmd.resourceId || undefined,
          fadeMs: (cmd.params.fadeMs as number) ?? 1000,
        });
      } else {
        // F-de0fd739: this if/else-if chain is a runtime string comparison, not a
        // switch with compiler-enforced exhaustiveness -- confirmed exhaustive
        // against @ai-rpg-engine/audio-director's CURRENT AudioDomain union (exactly
        // 'voice' | 'sfx' | 'ambient' | 'music'), but a future engine version adding
        // a 5th domain (or a voice/sfx command whose action isn't 'play') would
        // otherwise vanish here silently -- no push to pendingCalls, no signal at
        // all, unlike every branch above which at least reaches a real tool call or
        // (for music/uiEffects elsewhere in this file) an __*_intent__ marker.
        // Matches this file's existing __music_intent__/__ui_effect_intent__
        // convention so an unhandled command fails visibly instead of silently.
        this.pendingCalls.push({
          tool: '__unhandled_audio_domain__',
          params: {
            domain: cmd.domain,
            action: cmd.action,
            resourceId: cmd.resourceId,
          },
        });
      }
    }
    return this.flush();
  }
}
