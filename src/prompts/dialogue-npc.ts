// Prompt template: NPC dialogue grounded in cognition state

export const DIALOGUE_SYSTEM = `You are roleplaying an NPC in a text RPG. You respond as this character would, given their beliefs, memories, faction loyalty, and emotional state.

Rules:
- You ONLY know what this NPC's beliefs say. If a belief has low confidence, express uncertainty.
- If the NPC believes something false, they state their belief as if it were true. They are not lying — they are wrong.
- If the NPC IS intentionally lying (motivated by goals or fears), their dialogue should contain tells: over-explaining, deflection, inconsistency.
- Morale affects tone: high morale = confident, low = nervous/defeatist
- Suspicion affects openness: high suspicion = evasive, guarded, terse
- Faction loyalty affects what they reveal: loyal NPCs protect faction secrets
- Keep dialogue to 1-3 sentences per exchange
- Output ONLY the NPC's spoken words, no narration tags, stage directions, or quotation marks
- Match the tone/genre of the world
- React to the player's visible gear, injuries, titles, and reputation`;

export type DialogueInput = {
  npcName: string;
  npcType: string;
  personality: string;
  morale: number;
  suspicion: number;
  beliefs: Array<{
    subject: string;
    key: string;
    value: string | number | boolean;
    confidence: number;
  }>;
  recentMemories: Array<{
    type: string;
    description: string;
  }>;
  faction?: {
    name: string;
    alertLevel: number;
  };
  rumors: string[];
  playerRelationship: string;
  playerUtterance: string;
  tone: string;
  playerPresence?: string;
};

export function buildDialoguePrompt(input: DialogueInput): string {
  const beliefs = input.beliefs
    .map((b) => {
      const conf =
        b.confidence >= 0.8 ? 'certain' : b.confidence >= 0.5 ? 'fairly sure' : 'uncertain';
      return `  - ${b.subject}.${b.key} = ${b.value} (${conf})`;
    })
    .join('\n');

  const memories = input.recentMemories
    .map((m) => `  - [${m.type}] ${m.description}`)
    .join('\n');

  const rumors = input.rumors.map((r) => `  - "${r}"`).join('\n');

  return `NPC: ${input.npcName} (${input.npcType})
Personality: ${input.personality}
Morale: ${input.morale}/100 (${input.morale >= 70 ? 'confident' : input.morale >= 40 ? 'uncertain' : 'nervous'})
Suspicion: ${input.suspicion}/100 (${input.suspicion >= 70 ? 'guarded' : input.suspicion >= 40 ? 'wary' : 'open'})
Relationship to player: ${input.playerRelationship}
${input.faction ? `Faction: ${input.faction.name} (alert level: ${input.faction.alertLevel})` : 'No faction'}

Beliefs:
${beliefs || '  (none)'}

Recent memories:
${memories || '  (none)'}

Rumors heard:
${rumors || '  (none)'}

Tone: ${input.tone}
${input.playerPresence ? `\n${input.playerPresence}\n` : ''}
Player says: "${input.playerUtterance}"`;
}
