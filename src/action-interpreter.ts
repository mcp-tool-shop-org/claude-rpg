// Interpret freeform player input into a structured ActionIntent

import type { WorldState, EntityState } from '@ai-rpg-engine/core';
import type { ClaudeClient, StructuredResult } from './claude-client.js';
import { INTERPRET_SYSTEM, buildInterpretPrompt } from './prompts/interpret-action.js';
import { findOpenAskForEntity, getOpenAsks } from './game/asks.js';
import type { DebugLogger } from './game/debug-logger.js';

export type InterpretedAction = {
  verb: string;
  targetIds: string[] | null;
  toolId: string | null;
  parameters: Record<string, string | number | boolean> | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  alternatives: Array<{ verb: string; targetIds: string[] }> | null;
};

/** Try fast keyword-based interpretation first, fall back to Claude. */
export async function interpretAction(
  client: ClaudeClient,
  world: WorldState,
  playerInput: string,
  availableVerbs: string[],
  /**
   * F-fb9e78af: short continuity note for the interpreter, e.g. "the
   * previous turn asked the player to clarify an ambiguous action." Threaded
   * into buildInterpretPrompt's existing recentContext parameter (already
   * supported there, just never populated by this call site) so a short
   * follow-up reply to a clarification isn't interpreted from scratch with
   * no memory the clarification ever happened.
   */
  recentContext?: string,
  /**
   * WO-B1F-1 (design lock 1, ADDENDUM-COMMON): the npcId whose dialogue was
   * addressed to the player on the immediately preceding turn (game.ts's
   * own recordConversationExchange sets/clears this every turn -- see
   * ExecuteTurnOpts.lastSpeakerNpcId's doc comment, turn-loop.ts). Threaded
   * through to tryFastInterpret's own reply-to-speaker fallback below.
   */
  lastSpeakerNpcId?: string,
  /**
   * WO-B1F-7 (design lock 7, ADDENDUM-COMMON): optional structured logger,
   * same no-op-by-default contract as every other DebugLogger thread in
   * this codebase (game.ts's `this.debugLog`, turn-loop.ts's own
   * `debugLog?.debug('interpret', 'action-reasoning', ...)` a few lines
   * after this function returns). Used only by the `help <name>` fast-path
   * below to trace which branch resolved it.
   */
  debugLog?: DebugLogger,
): Promise<InterpretedAction> {
  // Fast path: direct keyword matching
  const fast = tryFastInterpret(playerInput, world, availableVerbs, lastSpeakerNpcId, debugLog);
  if (fast) return fast;

  // Slow path: Claude interpretation
  const zone = world.zones[world.locationId];
  const entities = Object.values(world.entities).filter(
    (e) => e.zoneId === world.locationId && e.id !== world.playerId,
  );
  const exits = (zone?.neighbors ?? [])
    .map((id) => world.zones[id])
    .filter((z): z is NonNullable<typeof z> => z != null)
    .map((z) => ({ id: z.id, name: z.name }));

  const prompt = buildInterpretPrompt({
    playerInput,
    availableVerbs,
    visibleEntities: entities.map((e) => ({ id: e.id, name: e.name, type: e.type })),
    zoneExits: exits,
    recentContext,
  });

  // F-d026f78d: client.generateStructured() doesn't only *resolve* with
  // { ok: false } for a bad/unparseable response (handled below by PB-007) —
  // per claude-adapter.ts's callApi()/withRetry, it also *throws* a
  // NarrationError for auth/bad-request (immediately) or after retries are
  // exhausted for rate-limit/timeout/transport/unexpected. That throw used
  // to propagate straight out of interpretAction(), past executeTurn()'s
  // Step 1 (no try/catch of its own) and past game.ts's fatal-bookkeeping
  // recovery (which only engages for errors Step 2/3/5 explicitly attach
  // bookkeeping to) — surfacing a jarring system error box for what the
  // player experiences as simply "I typed something and the game didn't get
  // it." Treat a thrown error exactly like a resolved { ok: false }: both
  // are API-layer failures, not genuinely ambiguous input, so PB-007's
  // transient-vs-ambiguous distinction below still applies correctly.
  let result: StructuredResult<InterpretedAction>;
  try {
    result = await client.generateStructured<InterpretedAction>({
      system: INTERPRET_SYSTEM,
      prompt,
      maxTokens: 256,
    });
  } catch {
    result = { ok: false, data: null, raw: '', error: 'interpretation request failed' };
  }

  if (result.ok && result.data) {
    return result.data;
  }

  // PB-007: Distinguish API failure from low-confidence interpretation.
  // API failures get a player-visible message so they know it was transient,
  // not that their input was invalid.
  const isApiFailure = !result.ok;
  return {
    verb: 'look',
    targetIds: null,
    toolId: null,
    parameters: null,
    confidence: 'low',
    reasoning: isApiFailure
      ? 'The world feels hazy for a moment... (interpretation service unavailable — try again)'
      : 'Could not interpret input',
    alternatives: null,
  };
}

/** Fast keyword-based interpretation for common actions. */
function tryFastInterpret(
  input: string,
  world: WorldState,
  verbs: string[],
  lastSpeakerNpcId?: string,
  debugLog?: DebugLogger,
): InterpretedAction | null {
  const lower = input.toLowerCase().trim();
  const zone = world.zones[world.locationId];
  const entities = Object.values(world.entities).filter(
    (e) => e.zoneId === world.locationId && e.id !== world.playerId,
  );

  // Look/examine
  if (/^(look|l|examine|inspect)(\s|$)/.test(lower)) {
    const target = findEntityByName(lower.replace(/^(look|l|examine|inspect)\s*/i, ''), entities);
    return {
      verb: target ? 'inspect' : 'look',
      targetIds: target ? [target.id] : null,
      toolId: null,
      parameters: null,
      confidence: 'high',
      reasoning: target ? `Inspect ${target.name}` : 'Look around',
      alternatives: null,
    };
  }

  // Movement
  if (/^(go|move|walk|head|travel)\s+/.test(lower)) {
    const dest = lower.replace(/^(go|move|walk|head|travel)\s+(to\s+)?/i, '');
    const target = findZoneByName(dest, zone?.neighbors ?? [], world);
    if (target) {
      return {
        verb: 'move',
        targetIds: [target],
        toolId: null,
        parameters: null,
        confidence: 'high',
        reasoning: `Move to ${target}`,
        alternatives: null,
      };
    }
  }

  // Flee (WO-B1-3, design lock 4, R6 ruling): the engine's existing
  // `disengage` verb, already registered -- no new engine-side verb, just a
  // player-facing name change at the interpreter layer. Bare `flee` only
  // (no target): disengage always leaves via the zone's own neighbor list,
  // never a chosen direction.
  // Sixth family playtest (b1h-2026-09-02): seats typed `flee <exit>`; the
  // bare-only rule sent that to the LLM mid-fight. A named exit is a move.
  if (/^flee\s+/.test(lower) && verbs.includes('move')) {
    const dest = lower.replace(/^flee\s+(to\s+)?/i, '');
    const target = findZoneByName(dest, zone?.neighbors ?? [], world);
    if (target) {
      return {
        verb: 'move',
        targetIds: [target],
        toolId: null,
        parameters: null,
        confidence: 'high',
        reasoning: `Flee to ${target}`,
        alternatives: null,
      };
    }
  }
  if (/^flee\b/.test(lower) && verbs.includes('disengage')) {
    return {
      verb: 'disengage',
      targetIds: null,
      toolId: null,
      parameters: null,
      confidence: 'high',
      reasoning: 'Flee the fight',
      alternatives: null,
    };
  }

  // Help (WO-B1-4, design lock 7): resolves the OPEN ask (if any) the named
  // entity is asking of the player, and stamps `helpAskId` so game.ts's
  // ask-help detection (game/asks.ts, applyRecognitionForHelpedAsk) can
  // tell this deliberate "I'm helping" apart from incidental conversation
  // with the same NPC. Always resolves through `speak` -- see asks.ts's
  // `expectedAskHelp` doc comment for why every ask kind routes through a
  // dialogue commitment rather than a literal item/escort mechanic.
  if (/^help\s+/.test(lower) && verbs.includes('speak')) {
    const targetName = lower.replace(/^help\s+/i, '');
    const target = findEntityByName(targetName, entities);
    if (target) {
      const ask = findOpenAskForEntity(world, target.id);
      if (ask) {
        // WO-B1F-7 (design lock 7): trace which branch resolved this
        // `help <name>` input -- debug-level, true no-op via NoopLogger.
        debugLog?.debug('interpret', 'help-path', {
          branch: 'entity-with-ask',
          targetName,
          resolvedEntityId: target.id,
          candidateNames: entities.map((e) => e.name),
        });
        return {
          verb: 'speak',
          targetIds: [target.id],
          toolId: null,
          parameters: { helpAskId: ask.id },
          confidence: 'high',
          reasoning: `Help ${target.name} with: ${ask.surface}`,
          alternatives: null,
        };
      }
    }
    // Stitch (wave 10): the petitioner may be an ask-ledger record without
    // a body in the player's zone (a courier who left word, a petitioner
    // seeded straight onto the storage contract). Match the open asks by
    // petitioner name; when the petitioner has no entity, the commitment
    // resolves as a plain look (no engine target to speak to) and the ask
    // itself still carries `helpAskId` to game.ts's recognition step.
    //
    // WO-B1F-7 (design lock 7): both sides of this
    // comparison now strip a leading article before matching, mirroring
    // findEntityByName's own discipline above -- previously only the
    // PETITIONER'S side implicitly matched literally (no stripping applied
    // to either string), so "help the shivering pilgrim" against a
    // petitioner literally named "a shivering pilgrim" failed both
    // directions of the substring check (`name.includes(targetName)` and
    // `targetName.includes(name)` both false: "a shivering pilgrim" and
    // "the shivering pilgrim" share no common prefix once the differing
    // article is counted). Reproduced against
    // dogfood/playtest/runs/b1-2026-09-02b/llama/transcript.txt's "help the
    // shivering pilgrim" input (around its turn 8->9 exchange): the ask
    // never resolved (no helpAskId), and the pilgrim's LLM-generated reply
    // that followed was a generic first-meeting line, not an
    // acknowledgment -- exactly what falling through to the slow path
    // instead of this fast path produces.
    const strippedTargetName = targetName.replace(/^(the|a|an)\s+/, '');
    const byName = getOpenAsks(world).find((a) => {
      const rawName = a.petitioner?.name.toLowerCase() ?? '';
      if (!rawName) return false;
      const strippedName = rawName.replace(/^(the|a|an)\s+/, '');
      return (
        strippedName.length > 0 &&
        (strippedName.includes(strippedTargetName) || strippedTargetName.includes(strippedName))
      );
    });
    if (byName) {
      const petitionerId = byName.petitioner?.id;
      const hasEntity = petitionerId !== undefined && world.entities[petitionerId] !== undefined;
      debugLog?.debug('interpret', 'help-path', {
        branch: 'ask-by-name',
        targetName,
        resolvedPetitionerId: petitionerId ?? null,
        candidateNames: getOpenAsks(world).map((a) => a.petitioner?.name ?? a.npcId ?? '(unnamed)'),
      });
      return {
        verb: hasEntity ? 'speak' : 'look',
        targetIds: hasEntity ? [petitionerId] : null,
        toolId: null,
        parameters: { helpAskId: byName.id },
        confidence: 'high',
        reasoning: `Help ${byName.petitioner?.name ?? 'the petitioner'} with: ${byName.surface}`,
        alternatives: null,
      };
    }
    debugLog?.debug('interpret', 'help-path', {
      branch: 'none',
      targetName,
      candidateNames: [
        ...entities.map((e) => e.name),
        ...getOpenAsks(world).map((a) => a.petitioner?.name ?? a.npcId ?? '(unnamed)'),
      ],
    });
  }

  // Attack
  // WO-B1-3 (design lock 4): "never resolves an attack to a downed entity"
  // -- candidates are filtered to hp > 0 here, attack-specifically (other
  // verbs like inspect/take may legitimately target a corpse).
  if (/^(attack|fight|hit|strike)\s+/.test(lower) && verbs.includes('attack')) {
    const targetName = lower.replace(/^(attack|fight|hit|strike)\s+/i, '');
    const liveEntities = entities.filter((e) => (e.resources.hp ?? 0) > 0);
    const target = findEntityByName(targetName, liveEntities);
    if (target) {
      return {
        verb: 'attack',
        targetIds: [target.id],
        toolId: null,
        parameters: null,
        confidence: 'high',
        reasoning: `Attack ${target.name}`,
        alternatives: null,
      };
    }
  }

  // Speak/talk
  if (/^(talk|speak|chat|ask)\s+(to\s+|with\s+)?/.test(lower) && verbs.includes('speak')) {
    const targetName = lower.replace(/^(talk|speak|chat|ask)\s+(to\s+|with\s+)?/i, '');
    const target = findEntityByName(targetName, entities);
    if (target) {
      return {
        verb: 'speak',
        targetIds: [target.id],
        toolId: null,
        parameters: null,
        confidence: 'high',
        reasoning: `Speak to ${target.name}`,
        alternatives: null,
      };
    }
  }

  // Social verbs (bribe, intimidate, recruit, petition, disguise, stake claim)
  if (verbs.includes('social')) {
    const socialMatch = tryLeverageVerb(lower, 'social', entities);
    if (socialMatch) return socialMatch;
  }

  // Rumor verbs (spread rumor, deny rumor, frame, bury, leak)
  if (verbs.includes('rumor')) {
    const rumorMatch = tryLeverageVerb(lower, 'rumor', entities);
    if (rumorMatch) return rumorMatch;
  }

  // Diplomacy verbs (negotiate, broker, request meeting, improve standing)
  if (verbs.includes('diplomacy')) {
    const diploMatch = tryLeverageVerb(lower, 'diplomacy', entities);
    if (diploMatch) return diploMatch;
  }

  // Sabotage verbs (sabotage, plant evidence, blackmail)
  if (verbs.includes('sabotage')) {
    const saboMatch = tryLeverageVerb(lower, 'sabotage', entities);
    if (saboMatch) return saboMatch;
  }

  // Opportunity verbs (accept, decline, abandon, betray, complete job/contract/bounty/mission)
  // FT-B-007: Extended to extract optional name/index for disambiguation
  // F-4d102b74: the noun alternation is followed by a boundary lookahead —
  // without it, "accept jobless benefits" fast-matched on "job" as a bare
  // prefix of "jobless" since the trailing (\s+(.+))? group is optional and
  // enforces nothing on its own. The lookahead is zero-width so it doesn't
  // shift the existing capture-group indices used below (oppMatch[1]/[5]).
  const oppMatch = lower.match(/^(accept|decline|abandon|betray|complete|finish|deliver|turn\s+in)\s+(the\s+)?(job|contract|offer|bounty|mission|quest|task)(?=\s|$)(\s+(.+))?/i);
  if (oppMatch) {
    const oppVerb = oppMatch[1].replace(/\s+/g, '-');
    const subAction = oppVerb === 'finish' || oppVerb === 'deliver' || oppVerb === 'turn-in'
      ? 'complete'
      : oppVerb;
    const identifier = oppMatch[5]?.trim() || undefined;
    const params: Record<string, string | number | boolean> = { subAction };
    if (identifier) {
      // Check if it's a numeric index (1-based)
      const numIndex = parseInt(identifier, 10);
      if (!isNaN(numIndex) && String(numIndex) === identifier) {
        params.opportunityIndex = numIndex;
      } else {
        params.opportunityName = identifier;
      }
    }
    return {
      verb: 'opportunity',
      targetIds: null,
      toolId: null,
      parameters: params,
      confidence: 'high',
      reasoning: `opportunity: ${subAction}${identifier ? ` (${identifier})` : ''}`,
      alternatives: null,
    };
  }

  // Crafting verbs (craft, salvage, repair, modify)
  if (/^(craft|salvage|repair|modify)(\s|$)/.test(lower)) {
    const craftMatch = lower.match(/^(craft|salvage|repair|modify)(?:\s+(.*))?$/);
    if (craftMatch) {
      const craftVerb = craftMatch[1];
      const craftArg = craftMatch[2]?.trim() || '';
      let targetId: string | null = null;
      if (craftArg && (craftVerb === 'salvage' || craftVerb === 'repair' || craftVerb === 'modify')) {
        const entity = findEntityByName(craftArg, entities);
        if (entity) targetId = entity.id;
      }
      return {
        verb: 'craft',
        targetIds: targetId ? [targetId] : null,
        toolId: null,
        parameters: { subAction: craftVerb, recipeOrItem: craftArg },
        confidence: 'high',
        reasoning: `${craftVerb}${craftArg ? ` ${craftArg}` : ''}`,
        alternatives: null,
      };
    }
  }

  // Inventory check (no turn consumed)
  if (/^(inventory|i)$/.test(lower)) {
    return {
      verb: 'inventory',
      targetIds: null,
      toolId: null,
      parameters: null,
      confidence: 'high',
      reasoning: 'Check inventory',
      alternatives: null,
    };
  }

  // Pick up / take / grab / loot
  if (/^(pick\s+up|take|grab|loot)\s+/.test(lower)) {
    const targetName = lower.replace(/^(pick\s+up|take|grab|loot)\s+(the\s+)?/i, '');
    const target = findEntityByName(targetName, entities);
    return {
      verb: 'take',
      targetIds: target ? [target.id] : null,
      toolId: null,
      parameters: { item: targetName },
      confidence: 'high',
      reasoning: target ? `Take ${target.name}` : `Take ${targetName}`,
      alternatives: null,
    };
  }

  // Drop
  if (/^drop\s+/.test(lower)) {
    const targetName = lower.replace(/^drop\s+(the\s+)?/i, '');
    const target = findEntityByName(targetName, entities);
    return {
      verb: 'drop',
      targetIds: target ? [target.id] : null,
      toolId: null,
      parameters: { item: targetName },
      confidence: 'high',
      reasoning: target ? `Drop ${target.name}` : `Drop ${targetName}`,
      alternatives: null,
    };
  }

  // Equip / wear / wield
  // F-b9a844dc: @ai-rpg-engine/equipment's itemRefOf() reads ONLY
  // action.parameters.itemId, then action.toolId, then action.targetIds[0]
  // -- never action.parameters.item, and zone entities (findEntityByName's
  // usual target) are never a valid item ref either. Resolve the typed name
  // against the PLAYER'S OWN carried items instead, and send the resolved
  // id as parameters.itemId. An unresolvable name leaves itemId unset (not
  // a best-effort guess) so the engine's own guided rejection fires --
  // 'equip what? carrying: <ids>' -- exactly the miss UX today.
  if (/^(equip|wear|wield)\s+/.test(lower)) {
    const targetName = lower.replace(/^(equip|wear|wield)\s+(the\s+)?/i, '');
    const player = world.entities[world.playerId];
    const itemId = findCarriedItemId(targetName, player?.inventory ?? []);
    return {
      verb: 'equip',
      targetIds: null,
      toolId: null,
      parameters: itemId ? { itemId } : null,
      confidence: 'high',
      reasoning: itemId ? `Equip ${itemId}` : `Equip ${targetName}`,
      alternatives: null,
    };
  }

  // Unequip / remove
  // F-b9a844dc: same itemRefOf contract as equip above -- resolve against
  // the player's currently EQUIPPED item ids (the slot-value side of
  // EntityState.equipment), not a zone entity or the discarded
  // parameters.item field.
  if (/^(unequip|remove)\s+/.test(lower)) {
    const targetName = lower.replace(/^(unequip|remove)\s+(the\s+)?/i, '');
    const player = world.entities[world.playerId];
    const equippedIds = Object.values(player?.equipment ?? {}).filter(
      (id): id is string => typeof id === 'string',
    );
    const itemId = findCarriedItemId(targetName, equippedIds);
    return {
      verb: 'unequip',
      targetIds: null,
      toolId: null,
      parameters: itemId ? { itemId } : null,
      confidence: 'high',
      reasoning: itemId ? `Unequip ${itemId}` : `Unequip ${targetName}`,
      alternatives: null,
    };
  }

  // Use item
  if (/^use\s+/.test(lower) && verbs.includes('use')) {
    const itemName = lower.replace(/^use\s+/i, '');
    const player = world.entities[world.playerId];
    const item = (player?.inventory ?? []).find(
      (i) => i.toLowerCase().includes(itemName),
    );
    if (item) {
      return {
        verb: 'use',
        targetIds: null,
        toolId: item,
        parameters: null,
        confidence: 'high',
        reasoning: `Use ${item}`,
        alternatives: null,
      };
    }
  }

  // WO-B1F-3 (design lock 3, ADDENDUM-COMMON): "bare name means talk" --
  // when nothing above matched a verb-prefixed pattern, an input that is
  // EXACTLY a zone entity's name (article-stripped, case-insensitive,
  // reusing findEntityByName's own tiered exact/substring discipline so
  // "Brother Aldric" and "aldric" both resolve the same way every other
  // verb's target text already does) resolves as `speak` to it; exactly an
  // exit's name (reusing findZoneByName the same way `go <exit>` already
  // does) resolves as `move`. Checked only here, after every other
  // fast-path pattern has already had its chance, so "attack pilgrim" etc.
  // are never shadowed by this more general fallback.
  const bareStripped = lower.replace(/^(the|a|an)\s+/, '');
  if (bareStripped) {
    if (verbs.includes('speak')) {
      const bareEntity = findEntityByName(bareStripped, entities);
      if (bareEntity) {
        return {
          verb: 'speak',
          targetIds: [bareEntity.id],
          toolId: null,
          parameters: null,
          confidence: 'high',
          reasoning: `Speak to ${bareEntity.name}`,
          alternatives: null,
        };
      }
    }
    const bareExit = findZoneByName(bareStripped, zone?.neighbors ?? [], world);
    if (bareExit) {
      return {
        verb: 'move',
        targetIds: [bareExit],
        toolId: null,
        parameters: null,
        confidence: 'high',
        reasoning: `Move to ${bareExit}`,
        alternatives: null,
      };
    }
  }

  // WO-B1F-1 (design lock 1, ADDENDUM-COMMON): "reply-to-speaker" -- a
  // free-prose input that matched no fast-path verb above (including the
  // bare-name/bare-exit checks just above) and that was typed the turn
  // right after an NPC's dialogue was addressed to the player resolves as
  // `speak` to that same NPC, with this turn's raw input carried through as
  // the dialogue line (turn-loop.ts's Step 5 already passes `playerInput`
  // straight to generateDialogue as the player's utterance, unaffected by
  // which fast-path branch resolved the verb). A clarification request
  // ("I'm not sure what you mean") is never the right answer to a sentence
  // typed at someone who just spoke -- this must run BEFORE the LLM slow
  // path, not as a repair afterward.
  //
  // Only requires the NPC to still exist in the world (mirrors the help
  // fast-path's own cross-zone allowance above and generateDialogue's own
  // `if (!npc) return null` contract, dialogue-mind.ts) -- not that it
  // still share the player's zone. game.ts's own lastSpeakerNpcId tracking
  // (see ExecuteTurnOpts.lastSpeakerNpcId's doc comment, turn-loop.ts) only
  // ever sets this from the IMMEDIATELY PRECEDING turn's own non-fallback
  // dialogue, so in practice the NPC is still exactly where this
  // conversation just happened.
  if (lastSpeakerNpcId && verbs.includes('speak') && world.entities[lastSpeakerNpcId]) {
    return {
      verb: 'speak',
      targetIds: [lastSpeakerNpcId],
      toolId: null,
      parameters: null,
      confidence: 'high',
      reasoning: `Reply to ${world.entities[lastSpeakerNpcId]?.name ?? lastSpeakerNpcId}`,
      alternatives: null,
    };
  }

  return null;
}

// --- Leverage verb fast path patterns ---

type LeverageVerbMap = { pattern: RegExp; subAction: string; extractTarget: boolean };

const SOCIAL_PATTERNS: LeverageVerbMap[] = [
  { pattern: /^bribe\s+(.+)/i, subAction: 'bribe', extractTarget: true },
  { pattern: /^intimidate\s+(.+)/i, subAction: 'intimidate', extractTarget: true },
  { pattern: /^recruit\s+(.+)/i, subAction: 'recruit-ally', extractTarget: true },
  { pattern: /^petition\s+(.+)/i, subAction: 'petition-authority', extractTarget: true },
  { pattern: /^(disguise|hide identity|conceal)(\s|$)/i, subAction: 'disguise', extractTarget: false },
  // F-4d102b74: sibling of the F-f57bbfd9/disguise word-boundary fix — these
  // bare trailing literals had no (\s|$) boundary, so e.g. "stake claiming
  // the territory" or "call in a favorite ally" fast-matched as a bare
  // prefix of "claiming"/"favorite" instead of falling through to the LLM.
  { pattern: /^stake\s+claim(?:\s|$)/i, subAction: 'stake-claim', extractTarget: false },
  { pattern: /^call\s+in\s+(a\s+)?favor(?:\s|$)/i, subAction: 'call-in-favor', extractTarget: false },
];

const RUMOR_PATTERNS: LeverageVerbMap[] = [
  { pattern: /^spread\s+(a\s+)?(rumor|rumour)\s+(about\s+|that\s+)?(.+)/i, subAction: 'seed', extractTarget: true },
  // F-4d102b74: same missing-boundary shape as the SOCIAL_PATTERNS fix above
  // — each of these ends on a bare literal/alternation with nothing
  // enforcing a word boundary, so e.g. "deny the accusations firmly" or
  // "bury the scandalous affair" fast-matched on an unrelated adjective.
  { pattern: /^(seed|plant)\s+(a\s+)?(rumor|rumour)(?:\s|$)/i, subAction: 'seed', extractTarget: false },
  { pattern: /^deny\s+(the\s+)?(rumor|rumour|accusation)(?:\s|$)/i, subAction: 'deny', extractTarget: false },
  { pattern: /^frame\s+(.+)/i, subAction: 'frame', extractTarget: true },
  { pattern: /^(bury|suppress)\s+(the\s+)?(scandal|rumor|rumour)(?:\s|$)/i, subAction: 'bury-scandal', extractTarget: false },
  { pattern: /^leak\s+(the\s+)?truth(?:\s|$)/i, subAction: 'leak-truth', extractTarget: false },
  { pattern: /^(spread\s+)?counter[\s-]?rumor(?:\s|$)/i, subAction: 'spread-counter-rumor', extractTarget: false },
  { pattern: /^claim\s+(false\s+)?credit(?:\s|$)/i, subAction: 'claim-false-credit', extractTarget: false },
];

const DIPLOMACY_PATTERNS: LeverageVerbMap[] = [
  { pattern: /^request\s+(a\s+)?meeting\s+(with\s+)?(.+)/i, subAction: 'request-meeting', extractTarget: true },
  { pattern: /^improve\s+standing\s+(with\s+)?(.+)/i, subAction: 'improve-standing', extractTarget: true },
  { pattern: /^negotiate\s+access\s+(with\s+|to\s+)?(.+)/i, subAction: 'negotiate-access', extractTarget: true },
  // F-4d102b74: same missing-boundary shape — e.g. "trade a secretive
  // letter" or "propose alliances with everyone" fast-matched on a bare
  // prefix instead of falling through to the LLM.
  { pattern: /^broker\s+(a\s+)?truce(?:\s|$)/i, subAction: 'broker-truce', extractTarget: false },
  { pattern: /^trade\s+(a\s+)?secret(?:\s|$)/i, subAction: 'trade-secret', extractTarget: false },
  { pattern: /^(form|propose)\s+(a\s+)?(temporary\s+)?alliance(?:\s|$)/i, subAction: 'temporary-alliance', extractTarget: false },
  { pattern: /^cash\s+(in\s+)?(a\s+)?milestone(?:\s|$)/i, subAction: 'cash-milestone', extractTarget: false },
];

const SABOTAGE_PATTERNS: LeverageVerbMap[] = [
  { pattern: /^sabotage\s+(.+)/i, subAction: 'sabotage', extractTarget: true },
  { pattern: /^plant\s+evidence\s+(against\s+)?(.+)/i, subAction: 'plant-evidence', extractTarget: true },
  { pattern: /^blackmail\s+(.+)/i, subAction: 'blackmail-target', extractTarget: true },
];

const VERB_PATTERN_MAP: Record<string, LeverageVerbMap[]> = {
  social: SOCIAL_PATTERNS,
  rumor: RUMOR_PATTERNS,
  diplomacy: DIPLOMACY_PATTERNS,
  sabotage: SABOTAGE_PATTERNS,
};

function tryLeverageVerb(
  lower: string,
  verb: string,
  entities: EntityState[],
): InterpretedAction | null {
  const patterns = VERB_PATTERN_MAP[verb];
  if (!patterns) return null;

  for (const { pattern, subAction, extractTarget } of patterns) {
    const match = lower.match(pattern);
    if (match) {
      let targetId: string | null = null;
      if (extractTarget) {
        // Get the last capture group as the potential target name
        const targetText = match[match.length - 1];
        if (targetText) {
          const entity = findEntityByName(targetText.trim(), entities);
          if (entity) targetId = entity.id;
        }
      }
      return {
        verb,
        targetIds: targetId ? [targetId] : null,
        toolId: null,
        parameters: { subAction },
        confidence: 'high',
        reasoning: `${verb}: ${subAction}`,
        alternatives: null,
      };
    }
  }
  return null;
}

// F-88570323: exported so game.ts's /recruit and /dismiss handlers can
// reuse the same tiered case-insensitive exact-name -> substring-name ->
// substring-id resolution every other player-facing targeting command
// (attack/speak/inspect/use, above) already gets, instead of requiring the
// exact internal entity id verbatim.
export function findEntityByName(name: string, entities: EntityState[]): EntityState | null {
  // WO-B1-3 (slice B1 §3, design lock 4): "the interpreter's fast path
  // strips a leading article (the|a|an) before entity/zone matching" --
  // centralized here so every fast-path caller benefits (attack/speak did
  // not already strip one; equip/unequip/take/drop already stripped it in
  // their own regex before calling this, so stripping again here is a
  // harmless no-op for them).
  const lower = name.toLowerCase().trim().replace(/^(the|a|an)\s+/, '');
  if (!lower) return null;
  return (
    entities.find((e) => e.name.toLowerCase() === lower) ??
    entities.find((e) => e.name.toLowerCase().includes(lower)) ??
    entities.find((e) => e.id.toLowerCase().includes(lower)) ??
    null
  );
}

/**
 * F-b9a844dc: resolve a player-typed item reference against a list of the
 * player's own item ids (carried inventory for equip, equipped slot values
 * for unequip). WorldState carries no item display name the interpreter can
 * read -- items are catalog-defined (game.ts's separate ItemCatalog, never
 * passed to this function), so the only text available here is the id
 * itself (e.g. 'rusted-mace', 'gravedigger-spade'). Mirrors findEntityByName's
 * tiered case-insensitive/substring discipline against that id text: exact
 * id match first (typed spaces normalized to the id's own hyphen
 * convention), then substring either direction, so "equip spade" finds
 * 'gravedigger-spade' even when a second carried item ('rusted-mace') is
 * also eligible.
 */
function findCarriedItemId(name: string, itemIds: string[]): string | null {
  const lower = name.toLowerCase().trim();
  if (!lower) return null;
  const hyphenated = lower.replace(/\s+/g, '-');
  return (
    itemIds.find((id) => id.toLowerCase() === hyphenated) ??
    itemIds.find((id) => id.toLowerCase().includes(hyphenated)) ??
    itemIds.find((id) => id.toLowerCase().replace(/-/g, ' ').includes(lower)) ??
    null
  );
}

function findZoneByName(
  name: string,
  neighborIds: string[],
  world: WorldState,
): string | null {
  const lower = name.toLowerCase().trim();
  if (!lower) return null;
  return (
    neighborIds.find((id) => {
      const z = world.zones[id];
      return z && (z.name.toLowerCase().includes(lower) || z.id.toLowerCase().includes(lower));
    }) ?? null
  );
}
