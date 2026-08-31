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

  // F-7e171dea: autoCast() only runs once per session (ImmersionRuntime.initialize()).
  // An entity added to the world afterward previously had no path back to a real
  // voice cast for the rest of the session -- getVoice()'s optional second `entity`
  // param lets a caller that has the entity in hand infer-and-cache one on first miss.
  describe('infer-and-cache on first miss (F-7e171dea)', () => {
    it('infers and caches a voice for an entity not covered by autoCast when the caller supplies it', () => {
      const caster = new VoiceCaster();
      caster.autoCast(mockWorld); // does NOT know about 'latecomer'

      const latecomer = { id: 'latecomer', type: 'npc', name: 'Late Arrival', tags: ['guard'] };
      const voice = caster.getVoice('latecomer', latecomer);

      // Same heuristic autoCast() itself uses (announcer preset for 'guard' tag).
      expect(voice.preset).toBe('announcer');
      expect(caster.getAllCasts().has('latecomer')).toBe(true);
    });

    it('caches the inferred voice so a later call returns the SAME cast without needing the entity again', () => {
      const caster = new VoiceCaster();
      const latecomer = { id: 'latecomer', type: 'npc', name: 'Late Arrival', tags: ['merchant'] };

      const first = caster.getVoice('latecomer', latecomer);
      const second = caster.getVoice('latecomer'); // no entity arg this time

      expect(second).toEqual(first);
      expect(second.entityId).not.toBe('__narrator__');
    });

    it('still returns the narrator voice for a genuinely unknown entity when no entity is supplied (backward compatible)', () => {
      const caster = new VoiceCaster();
      const voice = caster.getVoice('still-unknown');
      expect(voice.entityId).toBe('__narrator__');
    });

    it('does not overwrite an already-cached cast when an entity is supplied again', () => {
      const caster = new VoiceCaster();
      caster.autoCast(mockWorld);
      const originalVoice = caster.getVoice('guard');

      // Supplying a DIFFERENT-looking entity for the same id must not re-infer --
      // the existing cache entry wins.
      const voice = caster.getVoice('guard', { id: 'guard', type: 'npc', name: 'Gate Guard', tags: ['female'] });

      expect(voice).toEqual(originalVoice);
    });
  });
});
