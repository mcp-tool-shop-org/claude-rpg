// Prompt template: scene narration from perception-filtered state

export const NARRATE_SYSTEM = `You are the narrator of a text RPG. You describe what the player character perceives — not objective truth, but their subjective experience.

Rules:
- Describe only what the player can see, hear, smell, feel
- If perception clarity is low, describe things as uncertain, shadowy, unclear
- Never reveal information the player character has not perceived
- Keep narration concise: 2-4 sentences for scene descriptions, 1-2 for action results
- Use second person present tense ("You step into...")
- Never break the fourth wall
- Match the tone guide provided
- If entities have low clarity, describe them vaguely ("a figure", "something moves")
- Environmental instability should affect prose tone
- Do not list game mechanics or stats — describe experiences

Respond with narration text only, no JSON or formatting.`;

export type SceneNarrationInput = {
  zoneName: string;
  zoneTags: string[];
  atmosphere: {
    light: string;
    noise: string;
    stability: string;
  };
  visibleEntities: Array<{
    name: string;
    type: string;
    clarity: number;
    description?: string;
  }>;
  recentEvents: string[];
  playerState: {
    hp: number;
    maxHp?: number;
    statuses: string[];
  };
  exits: string[];
  tone: string;
  recentNarration: string[];
  isNewZone: boolean;
};

export function buildNarratePrompt(input: SceneNarrationInput): string {
  const entities = input.visibleEntities
    .map((e) => {
      const clarity = e.clarity >= 0.8 ? 'clear' : e.clarity >= 0.5 ? 'partial' : 'vague';
      return `  - ${e.name} (${e.type}, clarity: ${clarity})${e.description ? ` — ${e.description}` : ''}`;
    })
    .join('\n');

  const events = input.recentEvents.map((e) => `  - ${e}`).join('\n');

  const recent = input.recentNarration.length > 0
    ? `\nPrevious narration (for continuity):\n${input.recentNarration.slice(-2).map(n => `  "${n}"`).join('\n')}`
    : '';

  return `${input.isNewZone ? 'The player just entered a new area.' : 'The player is still in the same area.'}

Zone: ${input.zoneName} [${input.zoneTags.join(', ')}]
Atmosphere: ${input.atmosphere.light} light, ${input.atmosphere.noise}, ${input.atmosphere.stability}
Exits: ${input.exits.join(', ') || 'none visible'}

Visible entities:
${entities || '  (none)'}

Recent events:
${events || '  (none)'}

Player: HP ${input.playerState.hp}${input.playerState.maxHp ? `/${input.playerState.maxHp}` : ''}${input.playerState.statuses.length > 0 ? `, statuses: ${input.playerState.statuses.join(', ')}` : ''}

Tone: ${input.tone}${recent}`;
}
