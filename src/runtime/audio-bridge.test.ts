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

  // F-de0fd739: the domain dispatch in executeCommands is an if/else-if chain, not a
  // switch with compiler-enforced exhaustiveness -- a command matching none of the
  // four known branches must fail visibly (an __unhandled_audio_domain__ marker,
  // matching this file's existing __music_intent__/__ui_effect_intent__ convention)
  // instead of silently vanishing with no push to pendingCalls at all.
  it('emits an __unhandled_audio_domain__ marker for a command whose domain matches no known branch', async () => {
    const bridge = createBridge();
    const calls = await bridge.executeCommands([
      {
        domain: 'future-domain' as any,
        action: 'play',
        resourceId: 'mystery-cue',
        priority: 50,
        timing: 0,
        params: {},
      },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('__unhandled_audio_domain__');
    expect(calls[0].params).toMatchObject({
      domain: 'future-domain',
      action: 'play',
      resourceId: 'mystery-cue',
    });
  });

  it('emits the marker for a KNOWN domain whose action is not "play" (voice/sfx only dispatch on action === "play")', async () => {
    const bridge = createBridge();
    const calls = await bridge.executeCommands([
      {
        domain: 'voice',
        action: 'stop',
        resourceId: 'am_adam',
        priority: 50,
        timing: 0,
        params: {},
      },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('__unhandled_audio_domain__');
    expect(calls[0].params).toMatchObject({ domain: 'voice', action: 'stop' });
  });

  it('does not emit the marker for any of the four known, correctly-dispatched domains', async () => {
    const bridge = createBridge();
    const calls = await bridge.executeCommands([
      { domain: 'voice', action: 'play', resourceId: 'am_adam', priority: 50, timing: 0, params: {} },
      { domain: 'sfx', action: 'play', resourceId: 'ui_click', priority: 50, timing: 0, params: {} },
      { domain: 'ambient', action: 'start', resourceId: 'ambient_rain', priority: 50, timing: 0, params: {} },
      { domain: 'music', action: 'play', resourceId: 'theme', priority: 50, timing: 0, params: {} },
    ]);

    expect(calls.some((c) => c.tool === '__unhandled_audio_domain__')).toBe(false);
  });
});
