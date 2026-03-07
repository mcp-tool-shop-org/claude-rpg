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
      // No direct stop in voice-soundboard — just don't play
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
    // UI effects are terminal escape codes — handled by the terminal renderer
    // This is a no-op for the audio bridge
    void effect;
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
      }
    }
    return this.flush();
  }
}
