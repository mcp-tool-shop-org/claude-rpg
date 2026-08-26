// FT-BR-007: Template-based ambient NPC dialogue
// Generates short flavor lines for NPCs based on personality and beliefs.
// No LLM call — pure template expansion for cheap color text.

/**
 * Minimal NPC info needed for ambient line generation.
 */
export type AmbientNpcInfo = {
  name: string;
  /**
   * F-c8c8c67c (SLATE-1) / Coordinator Brief contract #1: must be one of
   * PERSONALITY_TEMPLATES' closed keys (merchant | guard | scholar | rogue |
   * noble | default) -- the SAME classification prompts/dialogue-npc.ts's
   * resolveVoiceArchetype() produces, mirrored for callers of this module as
   * dialogue/npc-context.ts's deriveNpcPersonality(npc). A value outside
   * this set safely falls through to the `default` pool below rather than
   * throwing.
   */
  personality: string;
  /**
   * Beliefs as key-value pairs (e.g., { "town.safety": "high", "player.trust": "low" }).
   *
   * F-c8c8c67c: the engine's real live store is CognitionState.beliefs:
   * Belief[] ({subject,key,value,confidence,source,tick}[]) -- a caller must
   * transform it before constructing an AmbientNpcInfo:
   * `Object.fromEntries(cognition.beliefs.map(b => [`${b.subject}.${b.key}`, b.value]))`,
   * matching the key format this type's own doc example implies. Cap BEFORE
   * transforming (dialogue/npc-context.ts's own BELIEFS_MAX=8, sorted by
   * confidence, is the established precedent) -- BELIEF_OVERLAYS' matching
   * loop below is O(beliefs x overlays) per call, so an uncapped feed makes
   * every zone render scale with an NPC's total accumulated belief count.
   */
  beliefs: Record<string, string | number | boolean>;
};

/** Template pools keyed by personality archetype. */
export const PERSONALITY_TEMPLATES: Record<string, string[]> = {
  merchant: [
    '{name} rearranges their wares, checking prices.',
    '{name} calls out deals to anyone who will listen.',
    '{name} polishes a trinket absentmindedly.',
  ],
  guard: [
    '{name} scans the area with a watchful eye.',
    '{name} mutters something about keeping order.',
    '{name} crosses their arms, surveying the crowd.',
  ],
  scholar: [
    '{name} pages through a well-worn book.',
    '{name} mutters half-formed theories under their breath.',
    '{name} adjusts their spectacles, studying the middle distance.',
  ],
  rogue: [
    '{name} keeps to the shadows along the wall.',
    '{name} counts something in their palm, then pockets it.',
    '{name} watches the crowd a little too closely.',
  ],
  noble: [
    '{name} surveys the area with obvious distaste.',
    '{name} adjusts a fine sleeve, unbothered by the surroundings.',
    '{name} waits, visibly expecting to be attended to.',
  ],
  default: [
    '{name} stands quietly, lost in thought.',
    '{name} shifts their weight from foot to foot.',
    '{name} gazes into the middle distance.',
  ],
};

/**
 * F-c8c8c67c (SLATE-1) item 3 / Coordinator Brief contract #2: per-pack
 * overlay layer, consulted BEFORE the generic PERSONALITY_TEMPLATES pool
 * above, so packs with a register far from dark fantasy (sci-fi, cyberpunk,
 * gothic horror, gladiatorial arena) aren't stuck with mismatched ambient
 * color (e.g. "polishes a trinket absentmindedly" in a colony-ship
 * corridor). Ship overlays only for the packs reading most obviously wrong
 * against the generic pool first -- the Coordinator Brief's pinned list
 * (signal-loss, neon-lockbox, crimson-court, iron-colosseum); every other
 * pack falls through to PERSONALITY_TEMPLATES unchanged, accepted v1 scope,
 * not an oversight. Every line below is a DRAFT.
 */
const PACK_AMBIENT_OVERLAYS: Partial<Record<string, Partial<Record<string, string[]>>>> = {
  'signal-loss': {
    guard: [
      '{name} checks a handheld scanner, frowning at the readout.',
      "{name} keeps one eye on the airlock's status light.",
      '{name} mutters a comm-channel callsign under their breath.',
    ],
    default: [
      '{name} taps at a wrist terminal, half-listening.',
      '{name} glances at the recycled-air vents overhead.',
      '{name} stands near the bulkhead, quiet.',
    ],
  },
  'neon-lockbox': {
    merchant: [
      '{name} haggles in clipped bursts over a data pad.',
      '{name} flashes a counterfeit-detector light over a credchip.',
      '{name} calls out augment upgrades to passersby.',
    ],
    default: [
      '{name} watches the neon signage flicker overhead.',
      '{name} taps ash from a synth-cigarette.',
      "{name} keeps their optic implant trained on the crowd.",
    ],
  },
  'crimson-court': {
    noble: [
      '{name} regards the room with cold, ancient patience.',
      "{name} traces a gloved finger along a goblet's rim.",
      '{name} inclines their head, betraying nothing.',
    ],
    default: [
      '{name} lingers at the edge of the candlelight.',
      '{name} watches the shadows more than the room.',
      '{name} says nothing, for now.',
    ],
  },
  'iron-colosseum': {
    guard: [
      '{name} tests the edge of a blade with a thumb.',
      '{name} calls out wagers on the next bout.',
      '{name} paces the arena rail, sizing up the crowd.',
    ],
    default: [
      '{name} rolls their shoulders, loosening up.',
      '{name} eyes the sand-strewn arena floor.',
      '{name} wipes grit from their hands.',
    ],
  },
};

/** Belief-reactive overlays — appended when a matching belief is present. */
const BELIEF_OVERLAYS: Array<{
  keyPattern: RegExp;
  valuePredicate: (v: string | number | boolean) => boolean;
  templates: string[];
}> = [
  {
    keyPattern: /trust/i,
    valuePredicate: (v) => v === 'low' || v === false || (typeof v === 'number' && v < 0),
    templates: [
      '{name} eyes you with suspicion.',
      '{name} keeps a careful distance.',
    ],
  },
  {
    keyPattern: /trust/i,
    valuePredicate: (v) => v === 'high' || v === true || (typeof v === 'number' && v > 50),
    templates: [
      '{name} gives you a brief, approving nod.',
    ],
  },
  {
    keyPattern: /safety|danger/i,
    valuePredicate: (v) => v === 'low' || v === false || v === 'dangerous',
    templates: [
      '{name} keeps one hand near their weapon.',
    ],
  },
];

/**
 * Generate a single ambient dialogue line for an NPC.
 * Pure template-based — no LLM call.
 *
 * @param npc - Minimal NPC info
 * @param seed - Optional numeric seed for deterministic selection (defaults to Date.now())
 * @param packId - F-c8c8c67c (SLATE-1) / Coordinator Brief contract #2: optional
 *   pack id used to consult PACK_AMBIENT_OVERLAYS before the generic pool.
 *   Backward-compatible -- omitted callers get exactly today's behavior.
 * @returns A short flavor sentence (1-2 lines)
 */
export function generateAmbientLine(npc: AmbientNpcInfo, seed?: number, packId?: string): string {
  const effectiveSeed = seed ?? Date.now();

  // Pick personality pool. F-c8c8c67c: pack overlay first (if the pack and
  // personality both have an entry), then the generic archetype pool, then
  // default -- see PACK_AMBIENT_OVERLAYS's doc comment above.
  const personality = npc.personality.toLowerCase();
  const pool =
    (packId ? PACK_AMBIENT_OVERLAYS[packId]?.[personality] : undefined) ??
    PERSONALITY_TEMPLATES[personality] ??
    PERSONALITY_TEMPLATES.default;

  // Select base line
  // F-20ec59de: JS `%` preserves the dividend's sign, so a negative effectiveSeed
  // (e.g. a caller-supplied negative seed) would otherwise produce a negative
  // index and pool[negativeIndex] === undefined.
  const baseIndex = ((effectiveSeed % pool.length) + pool.length) % pool.length;
  let line = pool[baseIndex].replace('{name}', npc.name);

  // Check belief overlays
  for (const overlay of BELIEF_OVERLAYS) {
    for (const [key, value] of Object.entries(npc.beliefs)) {
      if (overlay.keyPattern.test(key) && overlay.valuePredicate(value)) {
        const overlayIndex = ((effectiveSeed % overlay.templates.length) + overlay.templates.length) % overlay.templates.length;
        const extra = overlay.templates[overlayIndex].replace('{name}', npc.name);
        line += ' ' + extra;
        // Only one overlay per line
        return line;
      }
    }
  }

  return line;
}

/**
 * Generate ambient color text for a zone with 2+ NPCs.
 * Returns an array of ambient lines (one per NPC, capped at 3).
 *
 * @param npcs - NPCs present in the zone
 * @param seed - Optional seed for determinism
 * @param packId - F-c8c8c67c (SLATE-1) / Coordinator Brief contract #2: forwarded
 *   to every generateAmbientLine call below. Backward-compatible when omitted.
 * @returns Array of ambient lines, empty if fewer than 2 NPCs
 */
export function generateZoneAmbience(npcs: AmbientNpcInfo[], seed?: number, packId?: string): string[] {
  if (npcs.length < 2) return [];
  const effectiveSeed = seed ?? Date.now();
  return npcs.slice(0, 3).map((npc, i) =>
    generateAmbientLine(npc, effectiveSeed + i, packId),
  );
}
