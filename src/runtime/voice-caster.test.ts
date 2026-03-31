import { describe, it, expect } from 'vitest';
import { VoiceCaster } from './voice-caster.js';

describe('VoiceCaster', () => {
  const mockWorld = {
    playerId: 'player',
    entities: {
      player: { id: 'player', type: 'player', name: 'Hero', tags: [] },
      pilgrim: { id: 'pilgrim', type: 'npc', name: 'Suspicious Pilgrim', tags: [] },
      guard: { id: 'guard', type: 'npc', name: 'Gate Guard', tags: ['guard'] },
      priestess: { id: 'priestess', type: 'npc', name: 'High Priestess', tags: ['female'] },
    },
  } as any;

  it('should return narrator voice by default', () => {
    const caster = new VoiceCaster();
    const voice = caster.getNarratorVoice();
    expect(voice.voiceId).toBeTruthy();
    expect(voice.preset).toBe('storyteller');
  });

  it('should auto-cast all entities except player', () => {
    const caster = new VoiceCaster();
    caster.autoCast(mockWorld);
    const casts = caster.getAllCasts();
    expect(casts.has('pilgrim')).toBe(true);
    expect(casts.has('guard')).toBe(true);
    expect(casts.has('player')).toBe(false);
  });

  it('should assign announcer preset to guards', () => {
    const caster = new VoiceCaster();
    caster.autoCast(mockWorld);
    const voice = caster.getVoice('guard');
    expect(voice.preset).toBe('announcer');
  });

  it('should assign female voice to entities with female tag', () => {
    const caster = new VoiceCaster();
    caster.autoCast(mockWorld);
    const voice = caster.getVoice('priestess');
    expect(voice.voiceId).toMatch(/^[ab]f_/);
  });

  it('should allow manual cast override', () => {
    const caster = new VoiceCaster();
    caster.autoCast(mockWorld);
    caster.setCast('pilgrim', {
      entityId: 'pilgrim',
      voiceId: 'bm_lewis',
      preset: 'whisper',
      defaultEmotion: 'fearful',
      defaultSpeed: 0.85,
    });
    const voice = caster.getVoice('pilgrim');
    expect(voice.voiceId).toBe('bm_lewis');
    expect(voice.preset).toBe('whisper');
  });

  it('should not assume merchants are female', () => {
    const merchantWorld = {
      playerId: 'player',
      entities: {
        player: { id: 'player', type: 'player', name: 'Hero', tags: [] },
        vendor: { id: 'vendor', type: 'merchant', name: 'Market Vendor', tags: [] },
      },
    } as any;
    const caster = new VoiceCaster();
    caster.autoCast(merchantWorld);
    const voice = caster.getVoice('vendor');
    // Without a 'female' tag, merchant should get a male voice
    expect(voice.voiceId).toMatch(/^[ab]m_/);
  });

  it('should return narrator voice for unknown entities', () => {
    const caster = new VoiceCaster();
    const voice = caster.getVoice('nonexistent');
    expect(voice.entityId).toBe('__narrator__');
  });
});
