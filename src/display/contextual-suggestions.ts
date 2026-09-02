// contextual-suggestions — turn-end hint generation
// Deterministic. Driven by move advisor + game state. Max 2 per turn.
// v1.1: Campaign UX & Product Hardening

import type { LeverageState, WorldPressure, LeverageResolution, MoveRecommendation } from '@ai-rpg-engine/modules';

export type ContextualSuggestion = {
  text: string;     // max ~20 tokens
  trigger: string;  // debug: why this was suggested
};

/**
 * WO-B1-19 (slice B1 §3, lock 6): rotates through a hint kind's 2-3
 * coordinator-ratified phrasing variants by the ledger's fire count
 * (game-core's HintLedger supplies the count -- not yet on this branch, see
 * `hintFireCounts` on generateSuggestions' opts below; "green expected at
 * merge" for the real count wiring, this rotation itself is exercised
 * directly). `variants[0]` is always the ORIGINAL string every caller before
 * this wave already rendered, so an absent/0 fire count is byte-identical to
 * the old unconditional text -- no existing caller's output changes.
 */
function rotatePhrasing(variants: readonly string[], fireCount: number | undefined): string {
  const idx = (fireCount ?? 0) % variants.length;
  return variants[idx];
}

// WO-B1-19: black-market hint variants. index 0 preserves the pre-B1 text
// exactly; the reveal doc (§3) reframes this hint as a "once-per-district
// notice" now that game-core's HintLedger caps it to firing once per
// district -- later variants lean into that "notice" framing so a player who
// re-triggers it (a new district, per the ledger's re-arm rule) doesn't read
// verbatim-identical copy twice.
const BLACK_MARKET_HINT_VARIANTS = [
  'Black market activity detected — contraband may be available',
  'Notice: this district has a black market for now — contraband may be available',
] as const;

/** WO-B1-19: opportunity hints name the exact `accept <title>` input per
 * lock 6 ("stated inline ... with the exact input") whenever game-core
 * supplies the title; falls back to the pre-B1 generic text when it does
 * not (older callers, or a title genuinely unavailable). */
const NEW_OPPORTUNITY_HINT_VARIANTS = (title: string) => [
  `A new opportunity is available — type accept ${title} to take it`,
  `Something's on offer here — accept ${title} if you want in`,
] as const;

const EXPIRING_OPPORTUNITY_HINT_VARIANTS = (title: string) => [
  `An opportunity is about to expire — accept ${title} or let it lapse`,
  `Last call: accept ${title} before it expires`,
] as const;

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
  endgameTriggerCount?: number;
  /**
   * WO-B1-19: the open opportunity's title, when known, so the hint can
   * name the exact `accept <title>` input instead of a generic "type /jobs"
   * pointer. Absent falls back to the pre-B1 text.
   */
  newOpportunityTitle?: string;
  expiringOpportunityTitle?: string;
  /**
   * WO-B1-19: per-hint-kind fire counts from game-core's HintLedger (not yet
   * on this branch -- see rotatePhrasing's doc comment). Keyed by this
   * file's own `trigger` strings. Absent/0 keeps every hint's original,
   * pre-B1 phrasing.
   */
  hintFireCounts?: Partial<Record<'black-market' | 'new-opportunity' | 'expiring-opportunity', number>>;
}): ContextualSuggestion[] {
  const suggestions: ContextualSuggestion[] = [];
  const { turnCount, recommendation, hasUsedLeverage, lastLeverageResolution, recentMilestone, activePressures, hasSupplyCrisis, hasBlackMarket, hasCraftingShortage, hasCraftableMaterials, hasNewOpportunity, hasExpiringOpportunity, hasStaleAcceptedOpportunity, hasEndgameDetected, endgameTriggerCount, newOpportunityTitle, expiringOpportunityTitle, hintFireCounts } = opts;

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
      text: rotatePhrasing(BLACK_MARKET_HINT_VARIANTS, hintFireCounts?.['black-market']),
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
  // F-d6f7107e: dropped 'or "salvage"' -- F-4fc952ae's coordinator-locked
  // verb allowlist (turn-loop.ts) suppresses 'salvage' from the
  // interpreter's visible surface, and renderPlayHelp's CRAFTING section
  // (help-system.ts) only ever documented 'craft'. This mid-play nudge was
  // the one surface in this domain still telling players to type a verb the
  // interpreter won't accept.
  if (suggestions.length < 2 && hasCraftableMaterials && !hasCraftingShortage) {
    suggestions.push({
      text: 'You have materials — type "craft" to use them',
      trigger: 'crafting-hint',
    });
  }

  // 11. New opportunity available → suggest /jobs (v1.9)
  // WO-B1-19: names the exact `accept <title>` input when game-core hands us
  // the title; falls back to the pre-B1 generic pointer otherwise.
  if (suggestions.length < 2 && hasNewOpportunity) {
    suggestions.push({
      text: newOpportunityTitle
        ? rotatePhrasing(NEW_OPPORTUNITY_HINT_VARIANTS(newOpportunityTitle), hintFireCounts?.['new-opportunity'])
        : 'A new opportunity is available — type /jobs to see contracts',
      trigger: 'new-opportunity',
    });
  }

  // 12. Opportunity expiring within 3 turns → suggest action (v1.9)
  if (suggestions.length < 2 && hasExpiringOpportunity) {
    suggestions.push({
      text: expiringOpportunityTitle
        ? rotatePhrasing(EXPIRING_OPPORTUNITY_HINT_VARIANTS(expiringOpportunityTitle), hintFireCounts?.['expiring-opportunity'])
        : 'An opportunity is about to expire — accept or decline soon',
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

  // 14. Endgame detected → escalating urgency by trigger count (v2.0, v2.1)
  if (suggestions.length < 2 && hasEndgameDetected) {
    const count = endgameTriggerCount ?? 1;
    const text = count >= 2
      ? 'Multiple endgame conditions detected — type /conclude to see your legacy'
      : 'A turning point approaches — type /conclude to see your legacy';
    suggestions.push({ text, trigger: 'endgame-detected' });
  }

  // F-ecf4e179: past turn 10, this used to filter `suggestions` down to a
  // hardcoded allowlist of 12 trigger string literals, hand-kept in sync
  // with the 14 distinct `trigger:` values the rules above actually push --
  // the same "two independently maintained lists" shape this codebase has
  // already fixed 7+ times elsewhere (see world-flag.ts's own comment:
  // F-223de079/F-8da2e6f7/F-f1eb58cb/F-5cc4d0d9/F-623e763f/F-c5ff2a5c/
  // F-aaaa105f). A future 15th rule whose trigger a contributor forgot to
  // add to that allowlist would have silently stopped firing for every
  // player past turn 10 -- the bulk of actual campaign playtime -- with no
  // test failure, since nothing reconciled trigger literals against it.
  //
  // The only two triggers that allowlist ever excluded ('early-intro',
  // 'leverage-discovery') are already unreachable here on their own: rule 2
  // above guards on `turnCount <= 3` and rule 6 guards on `turnCount <= 10`,
  // so neither can ever be present in `suggestions` once turnCount > 10,
  // with or without a filter. "Deriving the post-10 behavior from the rules
  // themselves" therefore means there is nothing left TO filter -- removing
  // the redundant, driftable allowlist is the fix, not replacing it with a
  // differently-shaped list that could drift the same way. See this file's
  // test suite for the end-to-end regression coverage (every non-early
  // trigger verified to survive turnCount > 10 by actually calling this
  // function, not by comparing two hardcoded lists against each other).
  return suggestions.slice(0, 2);
}

/**
 * WO-B1-18 (slice B1 §3, lock 5): the per-context command strip -- derived
 * from state only (never invented), REPLACING the generic "TRY:" list per
 * the design doc's own wording. Honesty floor: the only per-turn "TRY:"-
 * style list this file's read of the current tree actually found is
 * help-system.ts's renderFirstTurnOrientation, a one-shot FIRST-turn
 * onboarding card (untouched here, out of this function's reach and still
 * useful on its own terms) -- there is no other per-turn generic try-list
 * live today for this to literally replace. This function is still the
 * correct build: a real per-turn, state-derived, always-true affordance
 * list where none existed, matching the design doc's five example slots
 * (talk / go / attack / flee / accept) in that fixed order, each included
 * only when the state that would make it TRUE is present. Capped at 5
 * total entries (the doc's own example has exactly 5 slots); when more
 * than 5 would qualify (e.g. several exits or several aware hostiles), the
 * fixed slot order above decides which entries survive the cap, not an
 * arbitrary array order.
 */
export function generateCommandStrip(opts: {
  /** Named NPCs present in the player's current zone, most-relevant first (game-core's ordering). */
  namedNpcsHere?: string[];
  /** The current zone's neighboring zone names (exits). */
  exits?: string[];
  /** Hostiles sharing the player's zone -- same shape as play-renderer.ts's `hostiles` opt (lock 1's `describeHostiles`). */
  hostiles?: Array<{ name: string; aware: boolean }>;
  /** The nearest open opportunity's title, if any (lock 5: "accept <open opportunity title>"). */
  openOpportunityTitle?: string;
}): string[] {
  const entries: string[] = [];

  const npc = opts.namedNpcsHere?.[0];
  if (npc) entries.push(`talk to ${npc}`);

  for (const exit of opts.exits ?? []) {
    entries.push(`go ${exit}`);
  }

  const awareHostiles = (opts.hostiles ?? []).filter((h) => h.aware);
  for (const h of awareHostiles) {
    entries.push(`attack ${h.name}`);
  }
  if (awareHostiles.length > 0) {
    entries.push('flee');
  }

  if (opts.openOpportunityTitle) {
    entries.push(`accept ${opts.openOpportunityTitle}`);
  }

  return entries.slice(0, 5);
}
