// Prompt template: scene narration from perception-filtered state
// v0.2: outputs NarrationPlan JSON for multi-modal presentation

import type { UiEffectType } from '@ai-rpg-engine/presentation';

/**
 * Coordinator Brief contract #7: the 10-id sound-effect list, single-sourced
 * here so BOTH this file's own prompt text (below) AND cli-display's
 * humanization parity tripwire (src/cli/**, src/runtime/** -- see
 * F-a465383c's note that render-time humanization of these ids is
 * cross-domain) read from the SAME list instead of maintaining two
 * independently-hand-copied ones. Mirrors dialogue-npc.ts's
 * `VOICE_PROFILES: Record<VoiceArchetype, string>` convention (archetype/id
 * -> human-readable content). Keys are the literal ids the LLM is
 * instructed to use verbatim in NarrationPlan.sfx[].effectId; values are the
 * humanized gloss shown to the LLM in parens.
 */
export const SOUND_EFFECT_IDS: Record<string, string> = {
  ui_notification: 'notification chime',
  ui_success: 'success chime',
  ui_error: 'error chime',
  ui_attention: 'attention chime',
  ui_click: 'click',
  ui_pop: 'light pop',
  ui_whoosh: 'whoosh transition',
  alert_warning: 'warning tone',
  alert_critical: 'critical alarm',
  alert_info: 'info tone',
};

/** Render SOUND_EFFECT_IDS as the "id (gloss)" comma-joined prose the prompt below expects. */
function formatSoundEffectIds(): string {
  return Object.entries(SOUND_EFFECT_IDS)
    .map(([id, gloss]) => `${id} (${gloss})`)
    .join(', ');
}

/**
 * F-01127b93: the uiEffects[].type instruction below used to be a THIRD
 * independent hand-copied mirror of @ai-rpg-engine/presentation's
 * UiEffectType (packages/presentation/src/types.ts) -- alongside
 * src/cli/presentation-renderer.ts's own mirror, fixed in F-3e0274e7 by
 * importing the type directly. Verified byte-identical today, but with zero
 * compile-time coupling to the type it claimed to track: per narrator.ts's
 * parseNarrationPlan, an unrecognized uiEffects value fails
 * isValidNarrationPlan and falls into the coerced-plan branch that drops
 * uiEffects entirely, so a future engine-side rename/addition would surface
 * only as effects quietly stopping -- never as a test or type failure.
 *
 * UiEffectType is a type-only union (erased at runtime), unlike
 * SOUND_EFFECT_IDS's Record above, so it can't be iterated the way
 * formatSoundEffectIds() iterates SOUND_EFFECT_IDS. Instead this tuple is
 * pinned to it in BOTH directions at compile time (npm run verify's
 * typecheck step, not just this file's own tests):
 *  - `satisfies readonly UiEffectType[]` right below fails to typecheck if
 *    this tuple contains a value UiEffectType does NOT have (a stale/renamed
 *    entry here);
 *  - `_allUiEffectTypesCovered` further below fails to typecheck if
 *    UiEffectType has a member this tuple is missing (a variant added
 *    upstream and never mirrored here).
 * Together those make a future UiEffectType change a compile error in this
 * file instead of a silent drift -- the same guarantee F-3e0274e7 established
 * for presentation-renderer.ts, applied here where the type is rendered as
 * prompt prose rather than used to narrow an incoming value.
 */
export const UI_EFFECT_TYPES = ['flash', 'shake', 'fade-in', 'fade-out', 'border-pulse'] as const satisfies readonly UiEffectType[];

// See UI_EFFECT_TYPES's doc comment above: the other half of the two-way pin.
type _AllUiEffectTypesCovered = [UiEffectType] extends [(typeof UI_EFFECT_TYPES)[number]] ? true : false;
const _allUiEffectTypesCovered: _AllUiEffectTypesCovered = true;

/** Render UI_EFFECT_TYPES as the "type": "a" | "b" | ... union text the prompt below expects. */
function formatUiEffectTypes(): string {
  return UI_EFFECT_TYPES.map((t) => `"${t}"`).join(' | ');
}

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
- Reference the player's gear, injuries, and title naturally — weave them into the scene
- NPCs in the scene react to the player's reputation and presence — guards stiffen, merchants beckon, enemies recoil
- When world pressure hints describe NPC body language or demeanor, weave them naturally into the scene as environmental observations — show the behavior, never explain the motivation
- The district feel describes the neighborhood mood — weave it naturally into environmental descriptions. Show crowds, emptiness, tension, commerce, morale through sensory detail
- Companions travel with the player. Reference their presence, reactions, and body language naturally. A fighter companion scans for threats. A diplomat companion reads the room. Show their personality through small details
- When the player carries items with notable history (relics, trophies, stolen goods, cursed items), reference their presence through environmental reactions — NPCs glancing at a weapon, the weight of a cursed trinket, the gleam of a legendary blade. Show provenance through the world's reaction, not exposition
- When economy context is provided, show scarcity through empty stalls, rationing queues, hoarded goods, and desperate vendors. Show surplus through overflowing markets, careless abundance, and wasted goods. Show black market activity through whispered offers, coded language, furtive exchanges in alleys. Never state supply levels directly — show the economic reality through sensory detail
- When crafting context is provided, describe the crafting through sensory detail: the sound of hammering metal, the acrid smell of potion brewing, the careful stitching of bandages, the scrape of salvage work. Modified items feel different — a sharpened blade catches light differently, reinforced armor sits heavier on the shoulders. Makeshift items look improvised — rough welds, mismatched parts, functional but ugly. Blessed items emanate subtle warmth; cursed items feel cold, heavy, wrong. Black-market modifications look dangerous — exposed wiring, volatile compounds, illegal markings
- When opportunity context is provided (active contracts, bounties, jobs), create ambient awareness through the world: an NPC quest-giver glances expectantly, a posted bounty notice catches the eye, the weight of a deadline looms. After completion, show the aftermath — grateful employers, newfound respect, or consequences of betrayal. Never state quest objectives directly — show the world reacting to the player's commitments
- When campaign arc context is provided, let the arc's theme subtly color the atmosphere. A rising-power arc means people defer, watch nervously, or seek favor. A hunted arc means furtive glances, locked doors, and whispered warnings. Never name the arc — show its reality through the world's texture
- When a turning point / endgame context is provided, the atmosphere shifts dramatically. The air feels heavier, NPCs act with urgency or resignation, the world holds its breath. This is a pivotal moment — convey gravity through environmental weight, not exposition

Respond with a JSON object (NarrationPlan) with this shape:
{
  "sceneText": "Your narration prose here.",
  "tone": "calm" | "tense" | "wonder" | "dread" | "combat" | "triumph" | "sorrow",
  "urgency": "idle" | "normal" | "elevated" | "critical",
  "sfx": [{ "effectId": "string", "timing": "immediate" | "with-text" | "after-text", "intensity": 0.0-1.0 }],
  "ambientLayers": [{ "layerId": "string", "action": "start" | "stop" | "crossfade", "volume": 0.0-1.0, "fadeMs": number }],
  "uiEffects": [{ "type": ${formatUiEffectTypes()}, "durationMs": number }],
  "interruptibility": "free" | "locked" | "soft-lock"
}

Available sound effects (use these exact ids only — never invent a new one): ${formatSoundEffectIds()}
Available ambient layers (use these exact ids only — never invent a new one): ambient_rain (rain), ambient_white_noise (white noise), ambient_drone (low tension drone)

Choose sfx/ambient based on the scene mood. Use sparingly — not every scene needs effects.`;

/** Legacy system prompt for plain-text narration (fallback). */
export const NARRATE_SYSTEM_LEGACY = `You are the narrator of a text RPG. You describe what the player character perceives — not objective truth, but their subjective experience.

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
  presentationState?: string;
  characterPresence?: string;
  activePressures?: string[];
  /**
   * F-e003562f: expected to be formatDistrictMoodForNarrator's output
   * (@ai-rpg-engine/modules) or byte-compatible with it -- i.e.
   * `"${districtName}: ${mood.descriptor}"`. This field has no type-level or
   * runtime way to enforce that contract (it's an opaque pre-formatted
   * string by the time it reaches here); narrate-scene.test.ts pins a golden
   * fixture proving buildNarratePrompt pipes a real
   * formatDistrictMoodForNarrator output through losslessly, so a future
   * change to this field's expected shape fails a test this domain owns.
   * The upstream half -- whether the caller assembling SceneNarrationInput
   * (game-core, outside this domain) actually sources this string FROM
   * formatDistrictMoodForNarrator, or from one of its own independently
   * hand-formatted alternatives -- is cross-domain and unverifiable from
   * this file alone; see F-e003562f's own fix notes.
   */
  districtDescriptor?: string;
  partyPresence?: string;
  economyContext?: string;
  craftingContext?: string;
  opportunityContext?: string;
  arcContext?: string;
  endgameContext?: string;
  /**
   * F-2218267d: player-facing strategic-map line -- the engine's own
   * MoveRecommendation.situationHint (@ai-rpg-engine/modules'
   * move-advisor.ts), gated by the caller to only the 'pressured'/'crisis'
   * situationTag bands (not 'safe'/'opportunity'), matching this domain's
   * other hint fields' urgency-gated spirit. Rendered as its own labeled
   * section, distinct from the director's on-demand /map-style screen.
   */
  situationHint?: string;
  /**
   * F-7815df9e (game-core seam contract): compact, pre-condensed long-term-memory
   * summary drawn from the campaign chronicle (e.g. past significant deeds).
   * Folded into the prompt as its own section when present.
   */
  chronicleContext?: string;
  /**
   * WO-A5-7 (slice A5 §2, design lock 2): the player's current district's
   * mood tone crossing a transition THIS round (`from` !== `to`, both
   * DistrictMood['tone'] values -- @ai-rpg-engine/modules' district-mood.ts
   * -- typed as plain strings here to avoid this prompt-template file taking
   * a compile-time dependency on that engine type). Threaded by game-core's
   * runWorldRound, which compares getWorldTickState(world).districtTones[
   * districtId] before/after the tick (no distinct engine event exists for
   * this -- confirmed in scene-context.ts's own describeEvent comment on
   * 'companion.reaction': a district-mood transition only ever queues a
   * companion reaction, never emits its own ResolvedEvent). Rendered as ONE
   * mechanical line by buildNarratePrompt below; absent (undefined) when no
   * transition happened this round -- byte-identical to before this wave.
   */
  moodTransition?: { from: string; to: string };
};

// F-9ee9b5a7: defensive budgets enforced by buildNarratePrompt itself,
// independent of whatever cap (if any) an upstream caller already applies.
// Not a fix for a currently-firing bug -- today's callers all separately
// bound their own context strings -- this is the boundary function (the one
// whose entire job is assembling the string sent to a paid, latency-sensitive
// API) finally growing teeth of its own, so a loosened upstream cap or a
// future context field added in the same freeform-concatenation style
// doesn't silently blow out a turn's prompt.
export const CHRONICLE_CHAR_BUDGET = 1500;
export const EVENTS_MAX_COUNT = 20;
export const EVENTS_CHAR_BUDGET = 1200;
export const PRESSURES_MAX_COUNT = 10;
export const PRESSURES_CHAR_BUDGET = 1200;
export const ENTITIES_MAX_COUNT = 20;
export const ENTITIES_CHAR_BUDGET = 1500;

/**
 * F-9ee9b5a7: cap a set of already-formatted lines to the most recent
 * `maxCount`, then further trim oldest-first until the joined char budget is
 * met. Mirrors dialogue-npc.ts's formatConversationHistory (cap chars, keep
 * most recent, drop oldest first) so this domain's two prompt builders share
 * one defensive-capping shape instead of each reinventing it.
 *
 * F-b641df8e: exported (was module-local) so finale-prompt.ts's
 * buildFinalePrompt can import the same helper directly instead of a second,
 * driftable copy — that file's own npcFates/factionFates/companionFates/
 * districtFates/legacy/seeds fields needed this exact shape too, just with
 * larger one-time-prompt budgets. See this file's own capText below for the
 * companion single-block variant.
 */
export function capRecentLines(lines: string[], maxCount: number, maxChars: number): string[] {
  const recent = lines.slice(-maxCount);
  const kept: string[] = [];
  let charCount = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const line = recent[i];
    if (charCount + line.length > maxChars && kept.length > 0) break;
    kept.unshift(line);
    charCount += line.length;
  }
  return kept;
}

/**
 * Truncate a single free-text block to a hard character ceiling, with a
 * visible indicator when trimmed. F-b641df8e: exported alongside
 * capRecentLines above for the same reason (finale-prompt.ts reuse).
 */
export function capText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '...[truncated]';
}

/** Format the world-pressures section, capped like the other array fields below. */
function formatActivePressures(pressures?: string[]): string {
  if (!pressures || pressures.length === 0) return '';
  const lines = capRecentLines(pressures.map((p) => `  - ${p}`), PRESSURES_MAX_COUNT, PRESSURES_CHAR_BUDGET);
  if (lines.length === 0) return '';
  return `\n\nWorld pressures:\n${lines.join('\n')}`;
}

export function buildNarratePrompt(input: SceneNarrationInput): string {
  const entityLines = input.visibleEntities.map((e) => {
    const clarity = e.clarity >= 0.8 ? 'clear' : e.clarity >= 0.5 ? 'partial' : 'vague';
    return `  - ${e.name} (${e.type}, clarity: ${clarity})${e.description ? ` — ${e.description}` : ''}`;
  });
  const entities = capRecentLines(entityLines, ENTITIES_MAX_COUNT, ENTITIES_CHAR_BUDGET).join('\n');

  const eventLines = input.recentEvents.map((e) => `  - ${e}`);
  const events = capRecentLines(eventLines, EVENTS_MAX_COUNT, EVENTS_CHAR_BUDGET).join('\n');

  const recent = input.recentNarration.length > 0
    ? `\nPrevious narration (for continuity):\n${input.recentNarration.slice(-2).map(n => `  "${n}"`).join('\n')}`
    : '';

  const stateHint = input.presentationState
    ? `\nPresentation state: ${input.presentationState}`
    : '';

  // F-7815df9e (game-core seam contract): compact long-term-memory section,
  // rendered only when game-core supplies condensed chronicle context.
  // F-9ee9b5a7: defensively capped to CHRONICLE_CHAR_BUDGET regardless of
  // how condensed the caller claims it already is.
  const chronicle = input.chronicleContext
    ? `\n\nChronicle (long-term memory): ${capText(input.chronicleContext, CHRONICLE_CHAR_BUDGET)}`
    : '';

  // WO-A5-7 (slice A5 §2, design lock 2): ONE mechanical line, rendered only
  // when a transition happened this round. Byte-identical to before this
  // wave when moodTransition is absent.
  const moodTransition = input.moodTransition
    ? `\n\nThe district's mood turns ${input.moodTransition.to}`
    : '';

  return `${input.isNewZone ? 'The player just entered a new area.' : 'The player is still in the same area.'}

Zone: ${input.zoneName} [${input.zoneTags.join(', ')}]${input.districtDescriptor ? `\nDistrict: ${input.districtDescriptor}` : ''}
Atmosphere: ${input.atmosphere.light} light, ${input.atmosphere.noise}, ${input.atmosphere.stability}
Exits: ${input.exits.join(', ') || 'none visible'}

Visible entities:
${entities || '  (none)'}

Recent events:
${events || '  (none)'}

Player: HP ${input.playerState.hp}${input.playerState.maxHp ? `/${input.playerState.maxHp}` : ''}${input.playerState.statuses.length > 0 ? `, statuses: ${input.playerState.statuses.join(', ')}` : ''}${input.characterPresence ? `\n${input.characterPresence}` : ''}${input.partyPresence ? `\nParty: ${input.partyPresence}` : ''}

Tone: ${input.tone}${input.economyContext ? `\n\nEconomy: ${input.economyContext}` : ''}${input.craftingContext ? `\n\nCrafting: ${input.craftingContext}` : ''}${input.opportunityContext ? `\n\nActive commitment: ${input.opportunityContext}` : ''}${input.arcContext ? `\n\nCampaign arc: ${input.arcContext}` : ''}${input.endgameContext ? `\n\nTurning point: ${input.endgameContext}` : ''}${input.situationHint ? `\n\nStrategic read: ${input.situationHint}` : ''}${moodTransition}${formatActivePressures(input.activePressures)}${stateHint}${chronicle}${recent}`;
}
