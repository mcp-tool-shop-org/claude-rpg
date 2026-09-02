// ambush-headline.ts: the play screen's ambush headline (slice A5 §5, WO-A5-15).
//
// Coordinator stitch (wave 8): cli-display's play-renderer gained the
// `ambushHeadline` banner slot but the pass-through site (game.ts ->
// renderPlayOutput) sits under src/game/**, which no wave-8 domain owned.
// The headline is the SAME describeEvent line the narration prompt already
// carries for `encounter.spawned` ("Ambush: <name> in <zone>"), so the
// screen and the prompt cannot drift apart.

import type { ResolvedEvent } from '@ai-rpg-engine/core';
import { describeEvent } from '../narrator/scene-context.js';

/** The first encounter.spawned event's describeEvent line, or undefined when the round had no ambush. */
export function buildAmbushHeadline(events: ResolvedEvent[]): string | undefined {
  const spawned = events.find((e) => e.type === 'encounter.spawned');
  if (!spawned) return undefined;
  const line = describeEvent(spawned);
  return line.length > 0 ? line : undefined;
}
