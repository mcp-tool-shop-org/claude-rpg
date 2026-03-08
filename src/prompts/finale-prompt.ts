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

/** Pack-specific narrative voices for the epilogue. */
const PACK_VOICES: Record<string, string> = {
  fantasy: 'Write in an epic chronicle voice with archaic turns of phrase — the tone of a saga told beside a dying fire.',
  cyberpunk: 'Write in a noir data-log voice with clipped corporate language — the tone of a classified debrief.',
  detective: 'Write in a case-file summary voice with methodical deduction — the tone of a detective closing the final folder.',
  pirate: "Write in a ship's log voice with maritime metaphor — the tone of a captain's final entry before port.",
  zombie: "Write in a survivor's journal voice, terse and haunted — the tone of someone writing by candlelight.",
  'weird-west': 'Write in a frontier tall-tale voice with dust and superstition — the tone of a story told on a saloon porch.',
  colony: 'Write in a mission report voice with bureaucratic dread — the tone of a log transmitted to no one.',
};

export function buildFinalePrompt(outline: FinaleOutline, genre: string, playerName?: string): string {
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

${PACK_VOICES[genre] ?? ''}Write the epilogue.`;
}
