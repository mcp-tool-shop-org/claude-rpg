// Prompt template: interpret freeform player input into an engine ActionIntent

export const INTERPRET_SYSTEM = `You are the action interpreter for a text RPG engine. Your job is to translate the player's freeform text input into a structured game action.

You will receive:
1. The player's text input
2. Available verbs (actions the engine supports)
3. Entities visible in the current zone
4. Zone exits (neighboring zones the player can move to)

Rules:
- Map the player's input to exactly ONE verb from the available list
- If the input references an entity, include its ID in targetIds
- If the input references movement, use the "move" verb with the zone ID as the target
- If the input is ambiguous, set confidence to "low" and provide alternatives
- If the input is clearly a game action, set confidence to "high"
- If the input doesn't map to any available verb, use the "look" verb as fallback
- Never invent verbs that aren't in the available list

Compound verbs: For "social", "rumor", "diplomacy", and "sabotage" verbs, include a "subAction" key in the parameters object:
- social: bribe, intimidate, call-in-favor, recruit-ally, petition-authority, disguise, stake-claim
- rumor: seed, deny, frame, claim-false-credit, bury-scandal, leak-truth, spread-counter-rumor
- diplomacy: request-meeting, improve-standing, cash-milestone, negotiate-access, trade-secret, temporary-alliance, broker-truce
- sabotage: sabotage, plant-evidence, blackmail-target
Example: "bribe the guard" → { "verb": "social", "targetIds": ["guard-1"], "parameters": { "subAction": "bribe" } }

Respond with JSON only, no other text:
{
  "verb": "string",
  "targetIds": ["string"] | null,
  "toolId": "string" | null,
  "parameters": {} | null,
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation",
  "alternatives": [{"verb": "string", "targetIds": ["string"]}] | null
}`;

export function buildInterpretPrompt(opts: {
  playerInput: string;
  availableVerbs: string[];
  visibleEntities: Array<{ id: string; name: string; type: string }>;
  zoneExits: Array<{ id: string; name: string }>;
  recentContext?: string;
}): string {
  const entities = opts.visibleEntities
    .map((e) => `  - ${e.name} (id: "${e.id}", type: ${e.type})`)
    .join('\n');

  const exits = opts.zoneExits
    .map((e) => `  - ${e.name} (id: "${e.id}")`)
    .join('\n');

  let prompt = `Player input: "${opts.playerInput}"

Available verbs: ${opts.availableVerbs.join(', ')}

Visible entities:
${entities || '  (none)'}

Zone exits:
${exits || '  (none)'}`;

  if (opts.recentContext) {
    prompt += `\n\nRecent context:\n${opts.recentContext}`;
  }

  return prompt;
}
