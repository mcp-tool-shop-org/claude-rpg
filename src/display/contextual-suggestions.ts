// contextual-suggestions — turn-end hint generation
// Deterministic. Driven by move advisor + game state. Max 2 per turn.
// v1.1: Campaign UX & Product Hardening

import type { LeverageState, WorldPressure, LeverageResolution, MoveRecommendation } from '@ai-rpg-engine/modules';

export type ContextualSuggestion = {
  text: string;     // max ~20 tokens
  trigger: string;  // debug: why this was suggested
};

export function generateSuggestions(opts: {
  turnCount: number;
  leverageState: LeverageState;
  activePressures: WorldPressure[];
  lastVerb: string;
  lastLeverageResolution: LeverageResolution | null;
  recommendation: MoveRecommendation;
  hasUsedLeverage: boolean;
  recentMilestone: boolean;
  hasSupplyCrisis?: boolean;
  hasBlackMarket?: boolean;
  hasCraftingShortage?: boolean;
  hasCraftableMaterials?: boolean;
  hasNewOpportunity?: boolean;
  hasExpiringOpportunity?: boolean;
  hasStaleAcceptedOpportunity?: boolean;
  hasEndgameDetected?: boolean;
}): ContextualSuggestion[] {
  const suggestions: ContextualSuggestion[] = [];
  const { turnCount, recommendation, hasUsedLeverage, lastLeverageResolution, recentMilestone, activePressures, hasSupplyCrisis, hasBlackMarket, hasCraftingShortage, hasCraftableMaterials, hasNewOpportunity, hasExpiringOpportunity, hasStaleAcceptedOpportunity, hasEndgameDetected } = opts;

  // 1. Crisis pressure → suggest top advisor move
  if (recommendation.situationTag === 'crisis' && recommendation.top3.length > 0) {
    const top = recommendation.top3[0];
    suggestions.push({
      text: `${top.reason}`,
      trigger: 'crisis-pressure',
    });
  }

  // 2. Turns 1-3 + never used leverage → intro hint
  if (turnCount <= 3 && !hasUsedLeverage) {
    suggestions.push({
      text: 'Try "bribe" or "intimidate" a target to spend leverage',
      trigger: 'early-intro',
    });
  }

  // 3. Failed leverage action → explain what went wrong
  if (lastLeverageResolution && !lastLeverageResolution.success && lastLeverageResolution.failReason) {
    suggestions.push({
      text: lastLeverageResolution.failReason,
      trigger: 'action-failed',
    });
  }

  // 4. Milestone triggered → suggest cashing it in
  if (recentMilestone && !hasUsedLeverage) {
    suggestions.push({
      text: 'Type "cash milestone" to convert your deed into influence',
      trigger: 'milestone-cash',
    });
  }

  // 5. New high-urgency pressure → suggest addressing it
  if (suggestions.length < 2 && activePressures.some((p) => p.urgency >= 0.6) && recommendation.top3.length > 0) {
    const relevantMove = recommendation.top3.find((m) => m.urgency >= 0.4);
    if (relevantMove && !suggestions.some((s) => s.trigger === 'crisis-pressure')) {
      suggestions.push({
        text: relevantMove.reason,
        trigger: 'pressure-hint',
      });
    }
  }

  // 6. Turns 4-10 + never used leverage → general leverage hint
  if (suggestions.length < 2 && turnCount > 3 && turnCount <= 10 && !hasUsedLeverage) {
    suggestions.push({
      text: 'Type /help leverage for social action reference',
      trigger: 'leverage-discovery',
    });
  }

  // 7. Supply crisis → suggest trade/negotiation
  if (suggestions.length < 2 && hasSupplyCrisis) {
    suggestions.push({
      text: 'Supplies are critically low — negotiate trade or find alternative sources',
      trigger: 'supply-crisis',
    });
  }

  // 8. Black market active → suggest contraband opportunities
  if (suggestions.length < 2 && hasBlackMarket && !hasSupplyCrisis) {
    suggestions.push({
      text: 'Black market activity detected — contraband may be available',
      trigger: 'black-market',
    });
  }

  // 9. Crafting shortage → suggest crafting or materials (v1.8)
  if (suggestions.length < 2 && hasCraftingShortage && hasCraftableMaterials) {
    suggestions.push({
      text: 'Components scarce — try "craft" to help restore the workshop',
      trigger: 'crafting-shortage',
    });
  }

  // 10. Has abundant materials → suggest crafting (v1.8)
  if (suggestions.length < 2 && hasCraftableMaterials && !hasCraftingShortage) {
    suggestions.push({
      text: 'You have materials — type "craft" or "salvage" to use them',
      trigger: 'crafting-hint',
    });
  }

  // 11. New opportunity available → suggest /jobs (v1.9)
  if (suggestions.length < 2 && hasNewOpportunity) {
    suggestions.push({
      text: 'A new opportunity is available — type /jobs to see contracts',
      trigger: 'new-opportunity',
    });
  }

  // 12. Opportunity expiring within 3 turns → suggest action (v1.9)
  if (suggestions.length < 2 && hasExpiringOpportunity) {
    suggestions.push({
      text: 'An opportunity is about to expire — accept or decline soon',
      trigger: 'expiring-opportunity',
    });
  }

  // 13. Stale accepted opportunity → reminder (v1.9)
  if (suggestions.length < 2 && hasStaleAcceptedOpportunity) {
    suggestions.push({
      text: 'You have an accepted contract with no recent progress',
      trigger: 'stale-opportunity',
    });
  }

  // 14. Endgame detected → suggest /conclude (v2.0)
  if (suggestions.length < 2 && hasEndgameDetected) {
    suggestions.push({
      text: 'A turning point approaches — type /conclude to see your legacy',
      trigger: 'endgame-detected',
    });
  }

  // After turn 10, only show on notable events (already handled by crisis/milestone/failed checks)
  if (turnCount > 10) {
    return suggestions.filter((s) =>
      s.trigger === 'crisis-pressure' || s.trigger === 'action-failed' ||
      s.trigger === 'milestone-cash' || s.trigger === 'pressure-hint' ||
      s.trigger === 'supply-crisis' || s.trigger === 'black-market' ||
      s.trigger === 'crafting-shortage' ||
      s.trigger === 'new-opportunity' || s.trigger === 'expiring-opportunity' ||
      s.trigger === 'stale-opportunity' || s.trigger === 'endgame-detected');
  }

  return suggestions.slice(0, 2);
}
