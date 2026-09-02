// Serialize NPC cognitive state into dialogue prompt context

import type { WorldState, EntityState } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import { getReputation } from '@ai-rpg-engine/character-profile';
import {
  getCognition,
  getEntityFaction,
  getFactionCognition,
  getRumorsFrom,
  deriveStance,
  getReputationConsequence,
  getPressuresForFaction,
  buildNpcProfile,
  getVisiblePressures,
  formatPressureForDialogue,
  getOpportunitiesForNpc,
  formatOpportunityForDialogue,
  generateNpcTextures,
  getPersistedNpcObligations,
  getObligationsToward,
  getNetObligationWeight,
  type Belief,
  type Memory,
  type PlayerRumor,
  type WorldPressure,
  type NpcActionResult,
  type OpportunityState,
  type NpcObligationLedger,
} from '@ai-rpg-engine/modules';
import type { DialogueInput } from '../prompts/dialogue-npc.js';
import { resolveVoiceArchetype } from '../prompts/dialogue-npc.js';
import { buildNpcPresenceForDialogue, getNpcDialogueHint } from '../npc/presence.js';

/**
 * F-c8c8c67c (SLATE-1) / Coordinator Brief contract #1: closed-set
 * personality classifier for callers OUTSIDE this file's own dialogue-prompt
 * assembly (e.g. game-core's turn-loop.ts, this domain's own
 * npc/ambient-dialogue.ts) that need an NPC's "personality" as one of a
 * small fixed set, not free text. Mirrors prompts/dialogue-npc.ts's
 * resolveVoiceArchetype() classifier exactly (same tag/type keyword
 * matching) so ambient-dialogue.ts's PERSONALITY_TEMPLATES and this
 * dialogue path's own voice-archetype resolution key off ONE shared
 * vocabulary instead of two independently-drifting ones. Returns 'default'
 * instead of resolveVoiceArchetype's `undefined` — every caller of this
 * function wants a value to index a template map with directly, not an
 * optional it has to null-coalesce itself.
 *
 * NOTE: deliberately NOT the same thing as buildNPCDialogueContext's own
 * internal `personality` local below (npc.ai?.profileId ?? a
 * merchant/cautious/aggressive tag heuristic) — that value feeds free text
 * into the LLM prompt's "Personality: ..." line, where a richer, uncapped
 * vocabulary the model reads as prose is fine. deriveNpcPersonality is for
 * callers that need a closed set to key a template map with instead.
 */
export function deriveNpcPersonality(npc: EntityState): string {
  return resolveVoiceArchetype(npc.type, npc.tags) ?? 'default';
}

// F-b52349e0: unlike recentMemories (.slice(-5)), knownPlayerRumors
// (.slice(0,3)), and factionPressures (.slice(0,2)) below, beliefs and rumors
// had no cap at all -- both can grow unboundedly over a long campaign (the
// engine decays/prunes beliefs by confidence rather than a hard count, and
// getRumorsFrom has no limit of its own), so a major faction leader or
// recurring companion would accumulate an ever-larger interpolated block for
// the rest of the campaign. Matching the pattern the function already
// establishes for its other three array fields.
const BELIEFS_MAX = 8;
const RUMORS_MAX = 5;

/**
 * WO-A5-6 (slice A5 §3, design lock 3): the NPC's standing obligation toward
 * the player, reduced to ONE of three mechanical strings (or absent) for the
 * dialogue prompt's "Standing with you: ..." line -- distinct from
 * formatObligationsForDirector's multi-line director view (which lists every
 * obligation individually), this is a single collapsed read for a spoken-NPC
 * context. `betrayed` wins over the net-weight read regardless of magnitude:
 * a betrayal is a standing fact about the relationship, not a quantity that
 * should be able to be outweighed by an unrelated favor stacked on top of it.
 * Absent (undefined) when the ledger has nothing involving this counterparty,
 * or nets to exactly zero (a favor and a debt of equal magnitude canceling
 * out reads as "nothing standing," not a fabricated tie-breaker string) --
 * the caller's line is omitted entirely in either case, matching every other
 * optional NPC-agency field's absent-means-silent contract in this file.
 */
function deriveObligationStanding(
  ledger: NpcObligationLedger | undefined,
  playerId: string,
): string | undefined {
  if (!ledger) return undefined;
  const relevant = getObligationsToward(ledger, playerId);
  if (relevant.length === 0) return undefined;
  if (relevant.some((o) => o.kind === 'betrayed')) return 'was betrayed by you';
  const net = getNetObligationWeight(ledger, playerId);
  if (net > 0) return 'owes you a favor';
  if (net < 0) return 'you owe them a debt';
  return undefined;
}

/** Build the dialogue context for an NPC from their simulation state. */
export function buildNPCDialogueContext(
  world: WorldState,
  npcId: string,
  playerUtterance: string,
  tone: string,
  playerPresence?: string,
  playerProfile?: CharacterProfile,
  playerRumors?: PlayerRumor[],
  activePressures?: WorldPressure[],
  lastNpcActions?: NpcActionResult[],
  /**
   * F-d8184410: full opportunity roster, threaded the same way
   * activePressures/playerRumors already are. NOT sourced via the engine's
   * own getPersistedOpportunities(world) -- claude-rpg tracks opportunities
   * as GameSession.activeOpportunities (game.ts), never calling
   * setPersistedOpportunities, so world.modules['opportunity-core'] is
   * never populated in this app's actual runtime. This param is the live
   * data path; the caller (dialogue-mind.ts's generateDialogue) forwards it
   * from wherever it's given one -- see that file's own matching param.
   */
  activeOpportunities?: OpportunityState[],
  /**
   * F-ff0b4af6 (party half): pre-formatted active-party-presence line, same
   * contract as narrate-scene.ts's SceneNarrationInput.partyPresence. NOT
   * computed here via getPartyState(world) -- claude-rpg tracks party state
   * as GameSession.partyState (game.ts), never calling setPartyState, so
   * world.modules['companion-core'] is never populated either. A caller
   * that already has the formatted string (e.g. reusing game-state.ts's own
   * getPartyPresence(world, partyState), which already calls the engine's
   * formatPartyPresence) can pass it straight through.
   */
  partyPresence?: string,
  /**
   * WO-A4-5 (slice A4, §2 lock 4): the NPC's obligation ledger — favors,
   * debts, betrayals — forwarded to buildNpcProfile's sixth argument so
   * goal derivation (deriveNpcGoals' obligation-influenced priority
   * adjustments, deriveLoyaltyBreakpoint's netOblWeight check) reflects
   * them. Additive and optional, with a "read it from the world" default:
   * when omitted, this function reads getPersistedNpcObligations(world)
   * .get(npcId) itself, so no existing caller (game-core's turn-loop.ts,
   * this domain's own ambient-dialogue.ts) has to change to pick this up
   * — the same shape the world already flows through (`world` is this
   * function's first parameter). A caller that already has a ledger in
   * hand (e.g. a test, or a future caller with a more specific one) can
   * still pass it explicitly to override the world read.
   */
  obligations?: NpcObligationLedger,
  /**
   * WO-A5-8 (slice A5 §6, design lock 6): per-hearer rumor read, replacing
   * DialogueInput.playerRumors (the deleted 4-valence formatting below).
   * Sourced by the caller from game-core's `getHearerRumors(npcId)` (the
   * RumorEngine's own `heardBy(npcId)` + `stanceOf(npcId, rumor.id)`, which
   * this file has no access to -- unlike `obligations` above, there is no
   * "read it from the world" default here: the RumorEngine instance is
   * host-owned (GameSession.rumorEngine, ADDENDUM-COMMON.md's inherited-state
   * note), never attached to the `WorldState` this function actually
   * receives. Additive and optional -- an omitted value renders no rumor
   * section at all (formatHearerRumors' own absent-is-silent contract,
   * prompts/dialogue-npc.ts), matching this file's other pass-through fields.
   */
  hearerRumors?: DialogueInput['hearerRumors'],
): DialogueInput | null {
  const npc = world.entities[npcId];
  if (!npc) return null;

  // Get cognition state
  const cognition = getCognition(world, npcId);
  // F-b52349e0: sort highest-confidence-first, then cap at BELIEFS_MAX. The
  // engine already treats confidence as the salience/recency proxy (beliefs
  // decay in confidence over time, per cognition-core.js), so keeping the
  // most-confident beliefs when trimming keeps the ones most likely to still
  // be current, not an arbitrary insertion-order prefix.
  const beliefs: DialogueInput['beliefs'] = (cognition?.beliefs ?? [])
    .map((b: Belief) => ({
      subject: b.subject,
      key: b.key,
      value: b.value,
      confidence: b.confidence,
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, BELIEFS_MAX);

  // Get recent memories
  const memories: DialogueInput['recentMemories'] = (cognition?.memories ?? [])
    .slice(-5)
    .map((m: Memory) => ({
      type: m.type,
      description: `${m.type}${m.entityId ? ` involving ${m.entityId}` : ''}${m.zoneId ? ` in ${m.zoneId}` : ''}`,
    }));

  // Get faction info
  const factionId = getEntityFaction(world, npcId);
  let faction: DialogueInput['faction'] | undefined;
  if (factionId) {
    const fcog = getFactionCognition(world, factionId);
    const factionState = world.factions[factionId];
    faction = {
      name: factionState?.name ?? factionId,
      alertLevel: fcog
        ? (typeof (fcog as Record<string, unknown>).alertLevel === 'number'
          ? (fcog as Record<string, unknown>).alertLevel as number
          : 0)
        : 0,
    };
  }

  // Get rumors
  // F-b52349e0: sort most-recent-first (by originTick, explicit rather than
  // relying on getRumorsFrom's own return order), then cap at RUMORS_MAX.
  const rumorRecords = getRumorsFrom(world, npcId);
  const rumors = [...rumorRecords]
    .sort((a, b) => b.originTick - a.originTick)
    .slice(0, RUMORS_MAX)
    .map((r) => `${r.subject ?? 'unknown'}: ${r.key ?? ''} = ${r.value ?? '?'}`);

  // Derive social stance from reputation + cognition. deriveStance requires
  // non-null cognition (it reads .suspicion/.morale unguarded); when this NPC
  // has no cognition state, substitute the same 50/30 defaults the returned
  // context uses for morale/suspicion below — keep the two in sync.
  //
  // F-962e800b (investigated, deliberately NOT switched to the engine's
  // store): dialogue-core.ts's private dialogueBiasForSpeaker reads
  // reputation from a DIFFERENT store -- (world.factions[factionId]
  // ?.reputation ?? 0) + (world.globals['reputation_'+factionId] ?? 0) --
  // than this line's getReputation(playerProfile, factionId), which reads
  // CharacterProfile.reputation[]. Verified before "fixing" this: claude-rpg
  // NEVER uses the engine's authored-dialogue-tree system (createDialogueCore
  // is wired only for two scripted intro trees in starter content) or its
  // 'reputation-adjust' effect -- grep across node_modules/@ai-rpg-engine and
  // this app's own src/ finds zero writers of world.globals['reputation_*'].
  // world.factions[factionId].reputation is a STATIC pack-authored baseline
  // (e.g. starter-pirate ships -35/+15 per faction) never touched at
  // runtime. Every reputation-affecting code path this app actually has --
  // game.ts (x4), game/game-state.ts (x1), and this domain's own
  // npc/agency.ts's 'reputation' NpcEffect handler -- calls
  // @ai-rpg-engine/character-profile's adjustReputation, which writes ONLY
  // to CharacterProfile.reputation[]. Switching this read to the
  // world.factions/world.globals merge (as F-962e800b's fix spec's option
  // (b) proposed) would therefore make dialogueBias permanently reflect each
  // faction's static starting disposition and NEVER the player's actual
  // in-game reputation swings -- a regression for this app, not a fix.
  // Keeping the CharacterProfile read (option (a): document, don't switch)
  // is the correct call for claude-rpg's actual architecture; see this
  // file's npc-context.test.ts for the locked-in regression test. This DOES
  // mean the engine's OTHER internal consumers of the world.factions/
  // world.globals merge (trade-core.ts pricing, world-tick.ts pressure
  // spawning) are themselves blind to the player's real reputation in this
  // app -- that gap lives in game.ts/game-state.ts's write path, outside
  // this domain, and is flagged separately rather than patched here.
  const repValue = factionId && playerProfile ? getReputation(playerProfile, factionId) : 0;
  const alertLevel = faction?.alertLevel ?? 0;
  const stance = deriveStance(repValue, cognition ?? { morale: 50, suspicion: 30 }, alertLevel);
  const consequence = getReputationConsequence(repValue);

  let relationship = stance as string;
  if (consequence.dialogueBias) {
    relationship += ` — ${consequence.dialogueBias}`;
  }

  // Determine personality from AI profile or tags
  const personality = npc.ai?.profileId ?? (
    npc.tags.includes('merchant') ? 'merchant' :
    npc.tags.includes('guard') ? 'cautious' :
    npc.tags.includes('hostile') ? 'aggressive' :
    'cautious'
  );

  // Get pressures from this NPC's faction (exclude hidden)
  const factionPressures = activePressures && factionId
    ? getPressuresForFaction(activePressures, factionId)
        .filter((p) => p.visibility !== 'hidden')
        .slice(0, 2)
        .map((p) => ({
          kind: p.kind,
          description: p.description,
          urgency: p.urgency,
          visibility: p.visibility,
        }))
    : undefined;

  // F-7459799a (scope half): world-scoped highest-urgency VISIBLE pressure,
  // regardless of faction -- mirrors dialogue-core.ts's own private
  // pressureHintForWorld exactly (getVisiblePressures + highest-urgency-first
  // + formatPressureForDialogue), computed here against the FULL,
  // untrimmed activePressures[] (before the faction-scoped trim above), so a
  // rival faction's crisis the whole zone is talking about reaches the
  // prompt even when it isn't the speaker's own faction's business.
  let worldPressureHint: string | undefined;
  if (activePressures) {
    const visible = getVisiblePressures(activePressures);
    if (visible.length > 0) {
      let highest = visible[0];
      for (let i = 1; i < visible.length; i++) {
        if (visible[i].urgency > highest.urgency) highest = visible[i];
      }
      worldPressureHint = formatPressureForDialogue(highest);
    }
  }

  // F-d8184410: speaker-scoped highest-urgency open opportunity -- mirrors
  // dialogue-core.ts's own private opportunityHintForSpeaker's selection
  // logic exactly (status 'available'|'accepted', visibility !== 'hidden',
  // highest-urgency-first), sourced from the activeOpportunities param (see
  // that param's own doc comment above for why this reads a threaded
  // parameter rather than getPersistedOpportunities(world)).
  let opportunityHint: string | undefined;
  if (activeOpportunities) {
    const open = getOpportunitiesForNpc(activeOpportunities, npcId)
      .filter((o) => (o.status === 'available' || o.status === 'accepted') && o.visibility !== 'hidden');
    if (open.length > 0) {
      let highest = open[0];
      for (let i = 1; i < open.length; i++) {
        if (open[i].urgency > highest.urgency) highest = open[i];
      }
      opportunityHint = formatOpportunityForDialogue(highest);
    }
  }

  // F-4e8dbbad / WO-A4-5: the sixth argument buildNpcProfile already
  // accepts — obligations were never threaded to it before this wave, so
  // goal derivation and the loyalty breakpoint were blind to favors owed,
  // debts, and betrayals. `obligations` (the param) wins when a caller
  // passes one explicitly; otherwise this reads world truth directly,
  // same as the getPersistedNpcObligations(world) reads the getters
  // elsewhere in this codebase use post-A4.
  //
  // WO-A5-6: hoisted out of the `if (npc.ai)` block below (was previously
  // scoped inside it, computed only to feed buildNpcProfile) so
  // deriveObligationStanding can read it unconditionally -- the "Standing
  // with you" line reflects the raw obligation ledger, not the NPC's `ai`
  // profile, so it must not be gated on `npc.ai` the way goal/agency
  // derivation legitimately is.
  const npcObligations = obligations ?? getPersistedNpcObligations(world).get(npcId);
  const npcObligationStanding = deriveObligationStanding(npcObligations, world.playerId);

  // v1.2: NPC agency context
  let npcGoal: string | undefined;
  let npcStance: string | undefined;
  let npcRecentAction: string | undefined;
  let isLying = false;
  let isBargaining = false;
  let isWarning = false;
  let npcAgencyPresence: string | undefined;
  // F-ff0b4af6 (texture half)
  let textureHint: string | undefined;

  if (npc.ai) {
    const profile = buildNpcProfile(world, npcId, world.playerId, activePressures ?? [], playerRumors, npcObligations);
    const topGoal = profile.goals[0];
    if (topGoal) {
      npcGoal = topGoal.label;
      isLying = topGoal.verb === 'lie' || topGoal.verb === 'conceal';
      isBargaining = topGoal.verb === 'bargain';
      isWarning = topGoal.verb === 'warn';
    }
    npcAgencyPresence = buildNpcPresenceForDialogue(profile);

    // Derive stance label from relationship
    const rel = profile.relationship;
    const stanceParts: string[] = [];
    if (rel.fear > 60) stanceParts.push('frightened');
    if (rel.trust < -30) stanceParts.push('hostile');
    else if (rel.trust > 30) stanceParts.push('friendly');
    if (rel.greed > 60) stanceParts.push('mercenary');
    if (stanceParts.length > 0) npcStance = stanceParts.join(', ');

    // F-ff0b4af6: zone-scoped body-language hint from the engine's own
    // generateNpcTextures, fed the SAME profile just derived above (one
    // buildNpcProfile call already paid for goal/stance derivation) --
    // fully self-contained (no persisted-namespace dependency, unlike
    // worldPressureHint/opportunityHint/partyPresence above): it reads only
    // `profile` + `world.entities` (zone lookups) + `world.playerId`, all
    // already live and required.
    const textureHints = generateNpcTextures([profile], world, world.playerId);
    if (textureHints.length > 0) textureHint = textureHints[0];
  }

  // Check for recent NPC action.
  // F-5c8be67d: source authoritatively from persisted world state (mirrors
  // dialogue-core.ts's own private dialogueHintForSpeaker) when the caller
  // doesn't explicitly pass one, instead of silently producing no hint the
  // way an omitted optional param used to. The one production caller
  // (dialogue-mind.ts's generateDialogue) delivers real hints via its own
  // explicit lastNpcActions argument, which takes precedence here (`??`
  // only falls through when the caller omits it entirely).
  // Coordinator ruling (b) (wave-13 RULING-persisted-namespaces.md): the
  // getPersistedNpcLastActions(world) fallback was removed — at the time,
  // world.modules['npc-agency'] was never populated in this app (npc/
  // agency.ts's tickNpcAgency returned its NpcActionResult[] directly to
  // game.ts, which never called setPersistedNpcState), so the fallback
  // would always have resolved to [] anyway. STALE AS OF slice A2-core
  // (WO-A2-7): runWorldTick's own step 5a now calls setPersistedNpcState
  // every round a named NPC exists, so the namespace this function still
  // doesn't read IS populated in production today. The ruling's OUTCOME
  // (threaded param is the sole source here) is UNCHANGED this wave — no
  // signature change (ADDENDUM-narrative-llm.md, WO-A2-7) — this is a
  // documentation-only correction; A4 is where readers are rewired to read
  // world truth directly, which may revisit this fallback's absence.
  const effectiveLastActions = lastNpcActions ?? [];
  const recentActionHint = getNpcDialogueHint(npcId, effectiveLastActions);
  if (recentActionHint) npcRecentAction = recentActionHint;

  return {
    npcName: npc.name,
    npcType: npc.type,
    personality,
    morale: cognition?.morale ?? 50,
    suspicion: cognition?.suspicion ?? 30,
    beliefs,
    recentMemories: memories,
    faction,
    rumors,
    playerRelationship: relationship,
    playerUtterance,
    tone,
    playerPresence,
    hearerRumors,
    activePressures: factionPressures,
    worldPressureHint,
    opportunityHint,
    textureHint,
    partyPresence,
    npcGoal,
    npcObligationStanding,
    npcStance,
    npcRecentAction,
    isLying,
    isBargaining,
    isWarning,
    npcAgencyPresence,
  };
}
