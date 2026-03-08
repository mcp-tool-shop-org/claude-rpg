// NPC presence strings — token-budget-optimized summaries for prompts
// Mirrors character/presence.ts pattern for NPCs
// v1.2: NPC Agency phase 1

import type { NpcProfile, NpcActionResult } from '@ai-rpg-engine/modules';

// --- Dialogue Presence ---

/**
 * Compact NPC state summary for dialogue prompt injection (~40 tokens).
 * Tells Claude what the NPC wants, feels, and knows.
 */
export function buildNpcPresenceForDialogue(profile: NpcProfile): string {
  const parts: string[] = [];
  const rel = profile.relationship;

  // Primary goal
  const topGoal = profile.goals[0];
  if (topGoal) {
    parts.push(`Goal: ${topGoal.label}`);
  }

  // Stance from relationship axes
  const stanceParts: string[] = [];
  if (rel.trust < -30) stanceParts.push('hostile');
  else if (rel.trust < 0) stanceParts.push('wary');
  else if (rel.trust > 30) stanceParts.push('friendly');

  if (rel.fear > 60) stanceParts.push('frightened');
  else if (rel.fear > 30) stanceParts.push('nervous');

  if (rel.greed > 60) stanceParts.push('mercenary');
  if (rel.loyalty > 70) stanceParts.push('faction-loyal');
  else if (rel.loyalty < 20 && profile.factionId) stanceParts.push('disloyal');

  if (stanceParts.length > 0) {
    parts.push(`Stance: ${stanceParts.join(', ')}`);
  }

  // Pressure
  if (profile.underPressure) {
    parts.push('Under faction pressure');
  }

  // Top known rumor
  if (profile.knownRumors.length > 0) {
    parts.push(`Knows: "${profile.knownRumors[0]}"`);
  }

  return parts.join('. ') + '.';
}

// --- Narrator Presence ---

/**
 * Compact NPC action hints for narration prompt injection (~15 tokens each).
 * Describes observable NPC behavior without revealing motive.
 */
export function buildNpcPresenceForNarrator(
  results: NpcActionResult[],
): string[] {
  return results.slice(0, 2).map((r) => r.narratorHint);
}

/**
 * Build a compact dialogue hint string for a specific NPC.
 * Returns undefined if the NPC has no active agency action.
 */
export function getNpcDialogueHint(
  npcId: string,
  lastActions: NpcActionResult[],
): string | undefined {
  const action = lastActions.find((a) => a.action.npcId === npcId);
  return action?.dialogueHint;
}
