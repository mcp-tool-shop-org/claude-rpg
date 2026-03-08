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
- React to the player's visible gear, injuries, titles, and reputation
- If the player's stance is hostile or fearful, reflect that in dialogue tone and willingness to help
- If the player is awed or has kinship, be more forthcoming with information and aid
- Merchants adjust pricing language based on stance (hostile = inflated, awed = discounts)
- If the NPC's faction has high alert, be evasive or defensive regardless of personal feelings
- If the NPC has heard rumors about the player, weave them into dialogue naturally
- High-confidence rumors are stated as fact; low-confidence rumors are hedged ("I heard...", "They say...")
- High-distortion rumors may be inaccurate — the NPC believes the distorted version
- Heroic rumors make the NPC more respectful or cautious; fearsome rumors make them wary or hostile
- NPCs may ask the player about rumors they've heard, seeking confirmation or denial
- If there is an active pressure from the NPC's faction, it affects their behavior:
  - bounty-issued: the NPC may threaten, demand surrender, or offer to look the other way
  - investigation-opened: the NPC asks probing questions, withholds information
  - merchant-blacklist: the NPC refuses trade or demands premium prices
  - faction-summons: the NPC insists the player comply, warns of consequences
  - revenge-attempt: the NPC is hostile, may ambush or betray
- Pressures the NPC doesn't know about (hidden visibility) have no effect on dialogue`;

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
  playerRumors?: Array<{
    claim: string;
    confidence: number;
    distortion: number;
    valence: string;
  }>;
  activePressures?: Array<{
    kind: string;
    description: string;
    urgency: number;
    visibility: string;
  }>;
};

function formatActivePressures(
  pressures?: DialogueInput['activePressures'],
): string {
  if (!pressures || pressures.length === 0) return '';
  const lines = pressures.map((p) => {
    const urgency = p.urgency >= 0.7 ? 'imminent' : p.urgency >= 0.4 ? 'developing' : 'emerging';
    return `  - ${p.kind} (${urgency}): ${p.description}`;
  });
  return `\nFaction pressures involving the player:\n${lines.join('\n')}\n`;
}

function formatPlayerRumors(
  rumors?: DialogueInput['playerRumors'],
): string {
  if (!rumors || rumors.length === 0) return '';
  const lines = rumors.map((r) => {
    const conf = r.confidence >= 0.8 ? 'certain' : r.confidence >= 0.5 ? 'heard' : 'vague whisper';
    return `  - "${r.claim}" (${conf}, ${r.valence})`;
  });
  return `\nRumors about the player:\n${lines.join('\n')}\n`;
}

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
${input.playerPresence ? `\n${input.playerPresence}\n` : ''}${formatPlayerRumors(input.playerRumors)}${formatActivePressures(input.activePressures)}
Player says: "${input.playerUtterance}"`;
}
