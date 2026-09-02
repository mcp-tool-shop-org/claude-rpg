// save-input-builder.ts — build the SaveSessionInput object every saveSession
// call site in bin.ts funnels through.
//
// Extracted from bin.ts's buildSaveInput (WO-A3-4, slice A3 design doc §2/§3)
// so save-input-builder.test.ts can exercise the real logic instead of a
// hand-copied fork — mirrors the save-listing.ts / save-selection.ts
// precedent set by F-bd2fef5a / F-d130796b for the same reason (bin.ts is a
// bare CLI entry point with no exports).
//
// WO-A3-4: as of schema v3, the ten legacy world-truth stores (playerRumors,
// activePressures, resolvedPressures, npcAgencySnapshot [built here from
// npcProfiles+npcActions], npcObligations, consequenceChains, partyState,
// districtEconomies, activeOpportunities, leverageSnapshot) are no longer
// read off GameSession here — engineState (session.engine.serialize(), via
// SaveSessionInput.engine) is their one source of truth as of slice A2, and a
// v3 SaveSessionInput drops these keys entirely, so a stale caller that still
// passed one of them would now fail to compile. `resolvedOpportunities`
// stays: it is session HISTORY, not world truth (design doc §1) — the
// engine's opportunity-core namespace holds only the live list; expiry
// fallout is appended per round by the app (GameSession.resolvedOpportunities).
//
// This file is coded against the slice A3 design doc
// (docs/living-world-slice-a3.md §2/§3) ahead of game-core's landing of the
// v3 `SaveSessionInput` type and `GameSession.getRumorEngineSnapshot()` on
// this branch — both are red until game-core's WO-A3-1/2/3 merge into this
// wave (parallel-wave contract, ADDENDUM-cli-display.md WO-A3-4: "mark
// 'green expected at merge' if game-core's branch is not on yours").
//
// WO-A4-7 (slice A4, docs/living-world-slice-a4.md §4): worldGenProposal/
// worldSeed pass through the same way — coded against ADDENDUM-game-core's
// WO-A4-3 contract (`GameSession.getWorldGenProposal()` / `getWorldSeed()`,
// `SaveSessionInput.worldGenProposal?: string` / `worldSeed?: number`) ahead
// of that merge landing here too.
import type { GameSession } from '../game.js';
import type { SaveSessionInput } from '../session/session.js';

/** Build a SaveSessionInput from a GameSession + save path. */
export function buildSaveInput(session: GameSession, savePath: string, packId?: string): SaveSessionInput {
  return {
    engine: session.engine,
    history: session.history,
    tone: session.tone,
    savePath,
    worldPrompt: session.worldPrompt,
    profile: session.profile,
    packId,
    // Conversation memory (coordinator brief item 4c, wave-18/cli-display.md,
    // director ruling R4: conversation memory IS PERSISTED): every
    // saveSession call site in bin.ts funnels through this one function,
    // so this single edit covers all of them (the SIGINT autosave, the
    // stdin-closed autosave, and the in-game "save" command).
    npcConversations: session.npcConversations,
    genre: session.genre,
    journal: session.journal,
    // WO-A3-4 (design doc §1): session HISTORY, not world truth — stays.
    resolvedOpportunities: session.resolvedOpportunities,
    // WO-A3-4 (design doc §3): the RumorEngine instance rides the save the
    // way profile and chronicle do — serialized snapshot, restored on load
    // into the GameSession constructor option (`rumorEngineSnapshot`)
    // *before* seedWorldTruth runs (see bin.ts's runLoad).
    rumorEngine: session.getRumorEngineSnapshot(),
    arcSnapshot: session.arcSnapshot,
    endgameTriggers: session.endgameTriggers,
    finaleOutline: session.finaleOutline,
    campaignStatus: session.campaignStatus,
    // WO-A4-7 (slice A4 design doc §4, ADDENDUM-COMMON lock 5): rides the
    // save the way the RumorEngine snapshot above does -- a pre-serialized
    // pass-through from the session accessors game-core lands this same
    // wave (WO-A4-3: GameSession.getWorldGenProposal() / getWorldSeed(),
    // GameConfig.worldGenProposal / worldSeed). `undefined` on a pack
    // session (or any save before this slice) is the correct "not a
    // generated world" case -- saveSession only WRITES worldGenProposal
    // when the session has no packId (design doc §4). Coded against
    // ADDENDUM-game-core.md's contract ahead of that merge landing on this
    // branch (parallel-wave honesty floor): this file cannot see
    // GameSession.getWorldGenProposal()/getWorldSeed() yet, so this line is
    // "green expected at merge", not a bug here (mirrors this file's own
    // rumorEngine precedent above, WO-A3-4).
    worldGenProposal: session.getWorldGenProposal(),
    worldSeed: session.getWorldSeed(),
    // WO-A5-5 (slice A5 §7, stitched at wave 8): the round-by-round ledger,
    // pre-serialized by game-core; undefined when empty.
    worldMoved: session.getWorldMovedSnapshot(),
  };
}
