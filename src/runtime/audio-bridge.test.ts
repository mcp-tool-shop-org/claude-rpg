import { describe, it, expect } from 'vitest';
import { VoiceSoundboardBridge } from './audio-bridge.js';
import { SoundRegistry, CORE_SOUND_PACK } from '@ai-rpg-engine/soundpack-core';

describe('VoiceSoundboardBridge', () => {
  function createBridge(enabled = true) {
    const registry = new SoundRegistry();
    registry.load(CORE_SOUND_PACK);
    return new VoiceSoundboardBridge(registry, enabled);
  }

  it('should generate speak tool call for voice cue', async () => {
    const bridge = createBridge();
    await bridge.playVoice({
      entityId: 'pilgrim',
      voiceId: 'am_adam',
      emotion: 'fearful',
      speed: 0.9,
      text: 'Turn back!',
    });

    const calls = bridge.flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('speak');
    expect(calls[0].params.text).toBe('Turn back!');
    expect(calls[0].params.voice).toBe('am_adam');
  });

  it('should map SFX to voice-soundboard effect names', async () => {
    const bridge = createBridge();
    await bridge.playSfx({ effectId: 'ui_success', timing: 'immediate', intensity: 0.7 });

    const calls = bridge.flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('sound_effect');
    expect(calls[0].params.effect).toBe('chime_success');
  });

  it('should generate ambient tool calls', async () => {
    const bridge = createBridge();
    await bridge.setAmbient({
      layerId: 'ambient_rain',
      action: 'start',
      volume: 0.4,
      fadeMs: 1000,
    });

    const calls = bridge.flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].params.effect).toBe('rain');
  });

  it('should not generate calls when disabled', async () => {
    const bridge = createBridge(false);
    await bridge.playVoice({
      entityId: 'npc',
      voiceId: 'af_bella',
      emotion: 'calm',
      speed: 1.0,
      text: 'Hello.',
    });

    const calls = bridge.flush();
    expect(calls).toHaveLength(0);
  });

  it('should clear pending calls on flush', async () => {
    const bridge = createBridge();
    await bridge.playSfx({ effectId: 'ui_click', timing: 'immediate', intensity: 0.5 });
    expect(bridge.flush()).toHaveLength(1);
    expect(bridge.flush()).toHaveLength(0);
  });

  it('should execute batch AudioCommands', async () => {
    const bridge = createBridge();
    const calls = await bridge.executeCommands([
      {
        domain: 'voice',
        action: 'play',
        resourceId: 'af_bella',
        priority: 100,
        timing: 0,
        params: { text: 'Hello', emotion: 'happy', speed: 1.0, entityId: 'npc' },
      },
      {
        domain: 'sfx',
        action: 'play',
        resourceId: 'ui_pop',
        priority: 75,
        timing: 0,
        params: { intensity: 0.5 },
      },
    ]);

    expect(calls).toHaveLength(2);
    expect(calls[0].tool).toBe('speak');
    expect(calls[1].tool).toBe('sound_effect');
  });
});
