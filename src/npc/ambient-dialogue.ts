// FT-BR-007: Template-based ambient NPC dialogue
// Generates short flavor lines for NPCs based on personality and beliefs.
// No LLM call — pure template expansion for cheap color text.

/**
 * Minimal NPC info needed for ambient line generation.
 */
export type AmbientNpcInfo = {
  name: string;
  personality: string;
  /** Beliefs as key-value pairs (e.g., { "town.safety": "high", "player.trust": "low" }) */
  beliefs: Record<string, string | number | boolean>;
  /** Optional tags like 'merchant', 'guard', 'hostile' */
  tags?: string[];
};

/** Template pools keyed by personality archetype. */
const PERSONALITY_TEMPLATES: Record<string, string[]> = {
  stern: [
    '{name} scans the area with a watchful eye.',
    '{name} mutters something about keeping order.',
    '{name} crosses their arms, surveying the crowd.',
  ],
  friendly: [
    '{name} hums a quiet tune.',
    '{name} nods warmly to a passerby.',
    '{name} chuckles at something only they heard.',
  ],
  merchant: [
    '{name} rearranges their wares, checking prices.',
    '{name} calls out deals to anyone who will listen.',
    '{name} polishes a trinket absentmindedly.',
  ],
  aggressive: [
    '{name} cracks their knuckles menacingly.',
    '{name} glares at anyone who gets too close.',
    '{name} paces with barely contained energy.',
  ],
  nervous: [
    '{name} fidgets with the hem of their cloak.',
    '{name} glances around, eyes darting.',
    '{name} wrings their hands anxiously.',
  ],
  default: [
    '{name} stands quietly, lost in thought.',
    '{name} shifts their weight from foot to foot.',
    '{name} gazes into the middle distance.',
  ],
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
 * @returns A short flavor sentence (1-2 lines)
 */
export function generateAmbientLine(npc: AmbientNpcInfo, seed?: number): string {
  const effectiveSeed = seed ?? Date.now();

  // Pick personality pool
  const personality = npc.personality.toLowerCase();
  const pool = PERSONALITY_TEMPLATES[personality] ?? PERSONALITY_TEMPLATES.default;

  // Select base line
  const baseIndex = effectiveSeed % pool.length;
  let line = pool[baseIndex].replace('{name}', npc.name);

  // Check belief overlays
  for (const overlay of BELIEF_OVERLAYS) {
    for (const [key, value] of Object.entries(npc.beliefs)) {
      if (overlay.keyPattern.test(key) && overlay.valuePredicate(value)) {
        const overlayIndex = effectiveSeed % overlay.templates.length;
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
 * @returns Array of ambient lines, empty if fewer than 2 NPCs
 */
export function generateZoneAmbience(npcs: AmbientNpcInfo[], seed?: number): string[] {
  if (npcs.length < 2) return [];
  const effectiveSeed = seed ?? Date.now();
  return npcs.slice(0, 3).map((npc, i) =>
    generateAmbientLine(npc, effectiveSeed + i),
  );
}
