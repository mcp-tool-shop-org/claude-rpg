// Voice caster — maps NPCs to voice-soundboard voices

import type { WorldState } from '@ai-rpg-engine/core';

export type VoiceCast = {
  entityId: string;
  voiceId: string;
  preset: string;
  defaultEmotion: string;
  defaultSpeed: number;
};

// Voice pools from voice-soundboard's 54 Kokoro voices
const FEMALE_VOICES = [
  'af_bella', 'af_nicole', 'af_sarah', 'af_sky',
  'bf_emma', 'bf_isabella',
];
const MALE_VOICES = [
  'am_adam', 'am_michael',
  'bm_george', 'bm_lewis',
];
const NARRATOR_VOICE: VoiceCast = {
  entityId: '__narrator__',
  voiceId: 'bf_emma',
  preset: 'storyteller',
  defaultEmotion: 'calm',
  defaultSpeed: 0.95,
};

/** Maps entities to voice-soundboard voices based on entity metadata. */
export class VoiceCaster {
  private casts = new Map<string, VoiceCast>();
  private narratorVoice: VoiceCast;
  private femaleIdx = 0;
  private maleIdx = 0;

  constructor(narratorVoice?: VoiceCast) {
    this.narratorVoice = narratorVoice ?? { ...NARRATOR_VOICE };
  }

  /** Auto-cast all entities in the world based on type and faction. */
  autoCast(world: WorldState): void {
    for (const entity of Object.values(world.entities)) {
      if (entity.id === world.playerId) continue;
      if (this.casts.has(entity.id)) continue;

      const cast = this.inferCast(entity);
      this.casts.set(entity.id, cast);
    }
  }

  /**
   * Get voice for an entity. Returns narrator voice if not found.
   *
   * F-7e171dea: autoCast() is invoked exactly once per session
   * (ImmersionRuntime.initialize(), by its own doc comment), with no restore path.
   * Any entity added to world.entities AFTER that one-time call -- this domain's own
   * files cannot verify whether any cross-domain system (npc-agency, faction
   * spawning) ever does this mid-session -- would otherwise share the narrator's
   * voice for the rest of the session, indistinguishable from a genuinely-unknown
   * id. When the caller can supply the entity (optional `entity` param, e.g. from a
   * live engine.world.entities lookup), infer-and-cache its cast on first miss
   * instead, reusing the SAME inferCast() heuristic autoCast() already uses, so a
   * late-added entity gets its own voice on first use rather than permanently
   * sharing the narrator's. Omitting `entity` preserves the exact prior behavior.
   */
  getVoice(entityId: string, entity?: { id: string; type: string; name: string; tags?: string[] }): VoiceCast {
    const existing = this.casts.get(entityId);
    if (existing) return existing;
    if (entity && entity.id === entityId) {
      const cast = this.inferCast(entity);
      this.casts.set(entityId, cast);
      return cast;
    }
    return this.narratorVoice;
  }

  /** Override a cast. */
  setCast(entityId: string, cast: VoiceCast): void {
    this.casts.set(entityId, cast);
  }

  /** Get narrator voice. */
  getNarratorVoice(): VoiceCast {
    return this.narratorVoice;
  }

  /** Get all casts. */
  getAllCasts(): Map<string, VoiceCast> {
    return new Map(this.casts);
  }

  private inferCast(entity: { id: string; type: string; name: string; tags?: string[] }): VoiceCast {
    // Simple gender heuristic from type/tags
    const tags = entity.tags ?? [];
    const isFemale = tags.includes('female') ||
      entity.name.toLowerCase().includes('priestess') ||
      entity.name.toLowerCase().includes('maiden');

    let voiceId: string;
    if (isFemale) {
      voiceId = FEMALE_VOICES[this.femaleIdx % FEMALE_VOICES.length];
      this.femaleIdx++;
    } else {
      voiceId = MALE_VOICES[this.maleIdx % MALE_VOICES.length];
      this.maleIdx++;
    }

    // Adjust preset/emotion based on entity type
    let preset = 'assistant';
    let emotion = 'calm';
    let speed = 1.0;

    if (entity.type === 'npc') {
      preset = 'storyteller';
      emotion = 'calm';
      speed = 0.95;
    }
    if (tags.includes('hostile') || tags.includes('enemy')) {
      emotion = 'angry';
      speed = 0.9;
    }
    if (tags.includes('merchant') || entity.type === 'merchant') {
      preset = 'assistant';
      emotion = 'happy';
      speed = 1.05;
    }
    if (tags.includes('guard')) {
      preset = 'announcer';
      emotion = 'determined';
      speed = 0.95;
    }

    return {
      entityId: entity.id,
      voiceId,
      preset,
      defaultEmotion: emotion,
      defaultSpeed: speed,
    };
  }
}
