// resume-path.ts — WO-A4-7 (slice A4 design doc §4, ADDENDUM-COMMON lock 5)
//
// Extracted from bin.ts's runLoad() (mirrors save-listing.ts / save-selection.ts /
// save-input-builder.ts's precedent, F-bd2fef5a-style: bin.ts is a bare CLI
// entry point with no exports and an unconditional main() call, so its
// branch-selection logic gets a small pure helper here so it can be tested
// directly instead of only through a hand-copied fork in a test file).
//
// A save resumes down exactly one of three paths:
//   - 'pack': savedSession.packId is present -- the pre-A4 path, recreate
//     the engine from the named pack.
//   - 'generated': packId is absent but worldGenProposal is present (design
//     doc §4 -- closes the wave-5 finding that generated worlds had no
//     resume path at all) -- rebuild the engine via instantiateWorld.
//   - 'refuse': neither is present -- nothing bin.ts can restore an engine
//     from. Refused through the EXISTING generic load presenter (no new
//     copy) via the same `if (!engine)` fallback runLoad already had before
//     this slice.
export type ResumePathDecision =
  | { kind: 'pack'; packId: string }
  | { kind: 'generated'; proposalJson: string; seed: number | undefined }
  | { kind: 'refuse' };

/**
 * Pure decision: given the packId/worldGenProposal/worldSeed fields off a
 * loaded SavedSession, which restore branch should runLoad take? Takes a
 * narrow structural type (not the real SavedSession) so this file has no
 * dependency on session/session.ts (out of this domain's owned globs) --
 * bin.ts passes its own `savedSession` object straight in, structurally
 * compatible once game-core's WO-A4-3 lands `worldGenProposal`/`worldSeed`
 * on SavedSession (parallel-wave contract: this compiles and is exercised
 * directly today via the narrow type below; bin.ts's own call site is
 * "green expected at merge").
 */
export function decideResumePath(savedSession: {
  packId?: string;
  worldGenProposal?: string;
  worldSeed?: number;
}): ResumePathDecision {
  if (savedSession.packId) {
    return { kind: 'pack', packId: savedSession.packId };
  }
  if (savedSession.worldGenProposal) {
    return { kind: 'generated', proposalJson: savedSession.worldGenProposal, seed: savedSession.worldSeed };
  }
  return { kind: 'refuse' };
}
