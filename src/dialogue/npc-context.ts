// Serialize NPC cognitive state into dialogue prompt context

import type { WorldState } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import { getReputation } from '@ai-rpg-engine/character-profile';
import {
  getCognition,
  getEntityFaction,
  getFactionCognition,
  getRumorsFrom,
  deriveStance,
  getReputationConsequence,
  getRumorsKnownToFaction,
  getPressuresForFaction,
  buildNpcProfile,
  type Belief,
  type Memory,
  type PlayerRumor,
  type WorldPressure,
  type NpcActionResult,
} from '@ai-rpg-engine/modules';
import type { DialogueInput } from '../prompts/dialogue-npc.js';
import { buildNpcPresenceForDialogue, getNpcDialogueHint } from '../npc/presence.js';

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

  // Get player rumors known to this NPC's faction
  const knownPlayerRumors = playerRumors && factionId
    ? getRumorsKnownToFaction(playerRumors, factionId)
        .filter((r) => r.confidence > 0.3)
        .slice(0, 3)
        .map((r) => ({
          claim: r.claim,
          confidence: r.confidence,
          distortion: r.distortion,
          valence: r.valence,
        }))
    : undefined;

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

  // v1.2: NPC agency context
  let npcGoal: string | undefined;
  let npcStance: string | undefined;
  let npcRecentAction: string | undefined;
  let isLying = false;
  let isBargaining = false;
  let isWarning = false;
  let npcAgencyPresence: string | undefined;

  if (npc.ai) {
    const profile = buildNpcProfile(world, npcId, world.playerId, activePressures ?? [], playerRumors);
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
  }

  // Check for recent NPC action
  if (lastNpcActions) {
    const hint = getNpcDialogueHint(npcId, lastNpcActions);
    if (hint) npcRecentAction = hint;
  }

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
    playerRumors: knownPlayerRumors,
    activePressures: factionPressures,
    npcGoal,
    npcStance,
    npcRecentAction,
    isLying,
    isBargaining,
    isWarning,
    npcAgencyPresence,
  };
}
