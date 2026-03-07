// Serialize NPC cognitive state into dialogue prompt context

import type { WorldState } from '@ai-rpg-engine/core';
import {
  getCognition,
  getEntityFaction,
  getFactionCognition,
  getRumorsFrom,
  type Belief,
  type Memory,
} from '@ai-rpg-engine/modules';
import type { DialogueInput } from '../prompts/dialogue-npc.js';

/** Build the dialogue context for an NPC from their simulation state. */
export function buildNPCDialogueContext(
  world: WorldState,
  npcId: string,
  playerUtterance: string,
  tone: string,
  playerPresence?: string,
): DialogueInput | null {
  const npc = world.entities[npcId];
  if (!npc) return null;

  // Get cognition state
  const cognition = getCognition(world, npcId);
  const beliefs: DialogueInput['beliefs'] = (cognition?.beliefs ?? []).map((b: Belief) => ({
    subject: b.subject,
    key: b.key,
    value: b.value,
    confidence: b.confidence,
  }));

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
      alertLevel: fcog ? (fcog as Record<string, unknown>).alertLevel as number ?? 0 : 0,
    };
  }

  // Get rumors
  const rumorRecords = getRumorsFrom(world, npcId);
  const rumors = rumorRecords.map(
    (r) => `${r.subject ?? 'unknown'}: ${r.key ?? ''} = ${r.value ?? '?'}`,
  );

  // Determine player relationship from NPC beliefs
  const hostileBelief = beliefs.find(
    (b) => b.subject === world.playerId && b.key === 'hostile',
  );
  let relationship = 'neutral';
  if (hostileBelief) {
    relationship = hostileBelief.value ? 'hostile' : 'friendly';
  }

  // Determine personality from AI profile or tags
  const personality = npc.ai?.profileId ?? (
    npc.tags.includes('merchant') ? 'merchant' :
    npc.tags.includes('guard') ? 'cautious' :
    npc.tags.includes('hostile') ? 'aggressive' :
    'cautious'
  );

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
  };
}
