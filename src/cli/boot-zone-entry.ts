// boot-zone-entry.ts — F-10cc3b71 (wave-2 amend)
//
// None of bin.ts's three engine-construction paths (runPlay's
// `result.pack.createGame()`, runLoad's restored-state `pack.createGame()`,
// runNew's `result.engine` from generateWorld) ever called
// `emitZoneEnteredForPlacement` -- so `world.zone.entered` never fires for
// the starting zone of a fresh campaign on any boot path, permanently
// dead-ending every listener gated on it for that first zone
// (runtime/immersion-runtime.ts:562, runtime/presentation-state.ts:126,
// session/chronicle.ts:212 discovery detection, narrator/scene-context.ts:152,
// turn-loop.ts:818). The underlying helper is not new work -- it already
// ships in the installed 3.10+ dist (`@ai-rpg-engine/modules`'s
// traversal-core) and the engine's OWN CLI already calls it from the
// equivalent spot (3.11 `packages/cli/src/bin.ts`'s `createNewSession`,
// `player?.zoneId ?? engine.world.locationId`) -- mirrored verbatim here
// rather than hand-copied logic.
//
// Extracted into its own cli/* module (matching this domain's existing
// engine-state-validator.ts/exit-autosave.ts convention, per bin.ts's own
// top-of-file comment: "we test its extractable logic patterns here...
// rather than a hand-copied fork of the logic that could silently drift
// from it") rather than defined inline in bin.ts, because bin.ts's bottom
// `main().catch(...)` runs unconditionally at module load -- importing
// bin.ts directly from a test would execute the real CLI. Living here lets
// boot-zone-entry.test.ts exercise the exact call bin.ts makes with no such
// side effect.
//
// NEVER call this from runLoad (wave-2 design lock 4): a resumed save must
// not re-fire zone-entry listeners (district events, mood asides) on every
// load -- only a FRESH session's first placement should. bin.ts is the
// enforcement point: it calls this from runPlay (post-chargen) and runNew
// (post-generateWorld) only.

import type { Engine } from '@ai-rpg-engine/core';
import { emitZoneEnteredForPlacement } from '@ai-rpg-engine/modules';

export function emitBootZoneEntry(engine: Engine): void {
  const player = engine.world.entities[engine.world.playerId];
  emitZoneEnteredForPlacement(engine, player?.zoneId ?? engine.world.locationId);
}
