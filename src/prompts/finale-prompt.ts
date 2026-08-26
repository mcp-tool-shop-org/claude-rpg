// Prompt template: campaign epilogue narration from FinaleOutline
// v2.0: grounded in deterministic finale data

import type { FinaleOutline } from '@ai-rpg-engine/campaign-memory';

export const FINALE_SYSTEM = `You are the narrator of a text RPG, delivering the campaign epilogue. This is the final narration — a retrospective on the player's journey and the world they shaped.

Rules:
- Use second person past tense ("You were...", "You had become...")
- Be poetic but grounded — every detail must come from the outline provided
- Reference specific NPC fates, faction outcomes, and legacy entries
- Match the emotional tone to the resolution class
- Do not invent events — only reference what the outline provides
- Keep the epilogue between 150-250 words
- End with a single resonant closing line
- Never break the fourth wall or reference game mechanics

Resolution tone guide:
- victory: triumphant, earned, weight of responsibility
- tragic-stabilization: bittersweet, pyrrhic, hollowed
- exile: lonely, defiant, distant
- overthrow: fierce, revolutionary, uncertain dawn
- martyrdom: sacrificial, legendary, mourned
- quiet-retirement: peaceful, reflective, content
- puppet-master: cunning, shadowed, unseen power
- collapse: apocalyptic, ruined, consequences

Respond with narration text only, no JSON or formatting.`;

/**
 * Pack-specific narrative voices for the epilogue.
 *
 * F-f4f6ac90: keyed by `pack.meta.narratorTone`, NOT by genre. This map used
 * to be keyed by the pack-family genre string (fantasy/cyberpunk/detective/...),
 * but the only production call chain (bin.ts -> game.ts -> game-narration.ts
 * -> finale-narrator.ts) actually supplies `pack.meta.genres[0]` — drawn from
 * PackMetadata.genres, a shared 9-value marketing taxonomy — not a pack-family
 * key. That taxonomy collides (starter-gladiator and starter-ronin both have
 * genres[0] === 'historical') and mismatches outright for 4 of the 7
 * registered packs (detective/weird-west/zombie/colony genres[0] is
 * 'mystery'/'western'/'horror'/'sci-fi', none of which match a genre-style
 * key). narratorTone has neither problem: PackMetadata documents it as "Tone
 * string for claude-rpg narrator," and it is confirmed unique across all 10
 * packs (including the 3 currently-blocked ones below).
 *
 * Exported (not just module-local) so packs.test.ts's F-00ddfc68 drift-gate
 * reconciliation test can assert every @ai-rpg-engine/starter-* dependency
 * has an entry here, not just in allPacks.
 */
export const PACK_VOICES: Record<string, string> = {
  'dark fantasy, concise, atmospheric, foreboding': // fantasy
    'Write in an epic chronicle voice with archaic turns of phrase — the tone of a saga told beside a dying fire.',
  'cyberpunk noir, terse, neon-lit, paranoid': // cyberpunk
    'Write in a noir data-log voice with clipped corporate language — the tone of a classified debrief.',
  'victorian noir, measured, atmospheric, suspenseful': // detective
    'Write in a case-file summary voice with methodical deduction — the tone of a detective closing the final folder.',
  'pirate adventure, salty, atmospheric, treacherous': // pirate
    "Write in a ship's log voice with maritime metaphor — the tone of a captain's final entry before port.",
  'survival horror, desperate, tense, bleak': // zombie
    "Write in a survivor's journal voice, terse and haunted — the tone of someone writing by candlelight.",
  'weird western, laconic, sun-bleached, haunted': // weird-west
    'Write in a frontier tall-tale voice with dust and superstition — the tone of a story told on a saloon porch.',
  'hard sci-fi, clinical, tense, vast': // colony
    'Write in a mission report voice with bureaucratic dread — the tone of a log transmitted to no one.',
  // Forward entries for the 3 blocked packs (F-00ddfc68: starter-gladiator/
  // -ronin/-vampire are installed and type-correct but not yet registered in
  // packs.ts's allPacks, due to an upstream @ai-rpg-engine/modules version
  // skew — see src/character/packs.test.ts's tripwire describe block). Unlike
  // under the old genre-keyed scheme, adding these ahead of registration is
  // safe and correct: the key is each pack's own already-authored, stable
  // narratorTone string (copied from their compiled dist/content.js by static
  // extraction, not by importing the still-broken package), so there is no
  // risk of colliding with a future 11th pack the way genre keys did. The
  // ONLY remaining step once F-00ddfc68's upstream skew resolves is wiring
  // these into packs.ts's imports/allPacks/resolveWorldFlag — no matching
  // finale-prompt.ts change will be needed then.
  'roman arena, visceral, theatrical, defiant': // gladiator
    "Write in an arena-herald's voice with visceral, theatrical flourish — the tone of a champion's final bow before a roaring crowd.",
  'feudal court, restrained, precise, weighted with consequence': // ronin
    'Write in a restrained feudal-court voice with precise, formal diction — the tone of a scroll sealed for the record, consequence weighed in every clause.',
  'gothic horror, intimate, decadent, predatory': // vampire
    'Write in an intimate gothic confession voice with decadent, predatory undertones — the tone of a centuries-old memory recounted by candlelight.',
};

/**
 * @param genre Display-only context for the LLM (the "Genre: ..." line) —
 *   drawn from the shared marketing taxonomy (PackMetadata.genres). Plays no
 *   part in the PACK_VOICES lookup; see `narratorTone` for that.
 * @param narratorTone F-f4f6ac90: the pack's `meta.narratorTone` string, used
 *   to look up PACK_VOICES. Optional because no production caller threads it
 *   in yet — see finale-narrator.ts's narrateFinale for the residual
 *   caller-side wiring this needs (tracked outside this domain's scope).
 *   When absent or unrecognized, the epilogue simply omits the pack-specific
 *   voice instruction (same safe `?? ''` degrade as before this fix).
 */
export function buildFinalePrompt(
  outline: FinaleOutline,
  genre: string,
  playerName?: string,
  narratorTone?: string,
): string {
  const npcFates = outline.npcFates
    .map((f) => `  - ${f.name}: ${f.outcome}${f.lastSignificantEvent ? ` (${f.lastSignificantEvent})` : ''}`)
    .join('\n');

  const factionFates = outline.factionFates
    .map((f) => `  - ${f.factionId}: ${f.outcome} (rep: ${f.playerReputation}, cohesion: ${f.cohesion})`)
    .join('\n');

  const companionFates = outline.companionFates
    .map((f) => `  - ${f.name}: ${f.outcome}${f.lastSignificantEvent ? ` (${f.lastSignificantEvent})` : ''}`)
    .join('\n');

  const districtFates = outline.districtFates
    .map((f) => `  - ${f.name}: stability ${f.stability}${f.controllingFaction ? `, controlled by ${f.controllingFaction}` : ''}, ${f.economyTone}`)
    .join('\n');

  const legacy = outline.legacy
    .map((l) => `  - ${l.label} (${l.category}, significance: ${l.significance.toFixed(1)})`)
    .join('\n');

  const keyMoments = outline.keyMoments
    .slice(0, 5)
    .map((m) => `  - ${m.description}`)
    .join('\n');

  const seeds = outline.epilogueSeeds
    .map((s) => `  - ${s}`)
    .join('\n');

  return `Resolution: ${outline.resolutionClass}
Dominant arc: ${outline.dominantArc ?? 'none'}
Genre: ${genre}
Player: ${playerName ?? 'the protagonist'}
Campaign duration: ${outline.campaignDuration} turns, ${outline.totalChronicleEvents} chronicle events

Key moments:
${keyMoments || '  (none)'}

NPC fates:
${npcFates || '  (none)'}

Companion fates:
${companionFates || '  (none)'}

Faction outcomes:
${factionFates || '  (none)'}

District fates:
${districtFates || '  (none)'}

Legacy:
${legacy || '  (none)'}

Epilogue seeds (themes to weave in):
${seeds || '  (none)'}

${(narratorTone ? PACK_VOICES[narratorTone] : undefined) ?? ''}Write the epilogue.`;
}
