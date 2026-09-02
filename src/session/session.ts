// Session management: save/load game state + turn history
// v0.2: character profile persistence
// v0.3: player rumor persistence
// v0.4: world pressure persistence
// v0.5: resolved pressure / fallout persistence
// v0.7: leverage snapshot + enhanced save summaries

import { readFile, writeFile, mkdir, readdir, rename, unlink, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { CURRENT_SCHEMA_VERSION, migrateSave, isValidPlayerRumor, isValidWorldPressure } from './migrate.js';
import { isDebugEnabled } from '../game/debug-logger.js';
import { VALID_SUPPLY_CATEGORIES, capPlayerRumors } from '../game/game-state.js';
import type { Engine } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import { serializeProfile, deserializeProfile } from '@ai-rpg-engine/character-profile';
import { type PlayerRumor, type WorldPressure, type PressureFallout, type NpcActionResult, type NpcProfile, type NpcObligationLedger, type ConsequenceChain, type PartyState, createPartyState, type DistrictEconomy, type OpportunityState, type OpportunityFallout, type ArcSnapshot, type EndgameTrigger } from '@ai-rpg-engine/modules';
import { CampaignJournal, type CampaignRecord, type FinaleOutline } from '@ai-rpg-engine/campaign-memory';
import { TurnHistory } from './history.js';
// F-462792bb (SLATE-2, persisted per Director ruling R2): ConversationExchange
// is prompts/dialogue-npc.ts's own type (narrative-llm-owned, already landed
// for real — only its consumer wiring is this wave's gap).
import type { ConversationExchange } from '../prompts/dialogue-npc.js';
// WO-A4-3 (slice A4 §4, design lock 5): type-only — see game.ts's identical
// import doc comment (runtime-foundry owns the proposeWorld/instantiateWorld
// split in world-gen.ts; this file only serializes an already-validated
// proposal object through to the save).
import type { WorldGenProposal } from '../foundry/world-gen.js';
// WO-A5-5 (slice A5 §7): the "world moved" ledger entry shape — shared with
// game.ts (src/game/world-moved.ts is within this domain's src/game/**
// glob), so both sides agree on what a WorldMovedEntry looks like without
// this file re-declaring its own copy.
import { VALID_WORLD_MOVED_KINDS, type WorldMovedEntry } from '../game/world-moved.js';

export type SavedSession = {
  schemaVersion: number;
  createdWithVersion?: string;
  version: string; // legacy compat — always '1.4.0' for new saves
  engineState: string;
  turnHistory: ReturnType<TurnHistory['toJSON']>;
  worldPrompt?: string;
  tone: string;
  savedAt: string;
  // v0.2.0 fields
  profile?: string;
  packId?: string;
  characterName?: string;
  characterLevel?: number;
  characterTitle?: string;
  /**
   * LEGACY READ-ONLY as of schema v3 (WO-A3-1, design lock 2): world truth
   * from A2 on. A v3 writer (saveSession) NEVER emits this field — the
   * engine's own player-rumor namespace (world truth) is what a v3
   * `engineState` carries instead. Kept on the TYPE only so v1/v2 readers
   * (migrate.ts's pipeline, the load-time seed in game/world-truth-seed.ts)
   * can still read a save written before adoption.
   */
  // v0.3.0 fields
  playerRumors?: string;
  /** LEGACY READ-ONLY as of schema v3 — see playerRumors' doc comment above. */
  // v0.4.0 fields
  activePressures?: string;
  genre?: string;
  /** LEGACY READ-ONLY as of schema v3 — see playerRumors' doc comment above. */
  // v0.5.0 fields
  resolvedPressures?: string;
  // v0.6.0 fields
  chronicleRecords?: string;
  /** LEGACY READ-ONLY as of schema v3 — see playerRumors' doc comment above. */
  // v0.7.0 fields
  leverageSnapshot?: string;
  /** LEGACY READ-ONLY as of schema v3 — see playerRumors' doc comment above. */
  // v0.8.0 fields
  npcAgencySnapshot?: string;
  /** LEGACY READ-ONLY as of schema v3 — see playerRumors' doc comment above. */
  // v0.9.0 fields
  npcObligations?: string;
  /** LEGACY READ-ONLY as of schema v3 — see playerRumors' doc comment above. */
  // v1.0.0 fields
  consequenceChains?: string;
  /** LEGACY READ-ONLY as of schema v3 — see playerRumors' doc comment above. */
  // v1.1.0 fields
  partyState?: string;
  /** LEGACY READ-ONLY as of schema v3 — see playerRumors' doc comment above. */
  // v1.2.0 fields
  districtEconomies?: string;
  /** LEGACY READ-ONLY as of schema v3 — see playerRumors' doc comment above. */
  // v1.3.0 fields
  activeOpportunities?: string;
  /**
   * NOT legacy — still WRITTEN by a v3 saveSession (design doc §1/§3): this
   * is session HISTORY (expiry fallout appended by runWorldRound, player-
   * resolved fallout appended by resolveOpportunity), not world truth — the
   * engine's opportunity-core namespace only ever holds the LIVE list.
   */
  resolvedOpportunities?: string;
  // v1.4.0 fields
  arcSnapshot?: string;
  endgameTriggers?: string;
  finaleOutline?: string;
  campaignStatus?: 'active' | 'completed';
  /**
   * F-8c3e32b7: the presentation state (combat/dialogue/aftermath/menu/
   * exploration — @ai-rpg-engine/presentation's PresentationState) the
   * session was in when saved, so a reload can restore the same
   * presentation context instead of always resuming narrateScene's
   * presentationState hint at 'exploration'. Persisted as a plain string
   * (not JSON) since it's already a small label, not a serialized blob —
   * see loadPresentationStateFromSession() for the read side.
   */
  presentationState?: string;
  /**
   * F-462792bb (SLATE-2, persisted per Director ruling R2): per-NPC recent
   * conversation history (GameSession.npcConversations), keyed by NPC id.
   * Serialized the same way as npcObligations above — JSON.stringify of
   * Object.fromEntries(map), omitted entirely when empty. See
   * loadNpcConversationsFromSession() for the read side.
   */
  npcConversations?: string;
  /**
   * WO-A3-2 (slice A3 §3): JSON of the admitted `@ai-rpg-engine/rumor-system`
   * RumorEngine's `EngineSnapshot` (`{ rumors, stances }`, from
   * `rumorEngine.serialize()` — dead rumors omitted per the engine's own
   * default). GameSession.getRumorEngineSnapshot() produces this string for
   * the save path; GameConfig.rumorEngineSnapshot (game.ts) restores it via
   * `RumorEngine.deserializeSafe`. Absent on every pre-v3 save (the engine
   * did not exist in the session yet) and on a v3 session that has never
   * mirrored a rumor.
   */
  rumorEngine?: string;
  /**
   * WO-A4-3 (slice A4 §4, design lock 5): JSON of the `WorldGenProposal` a
   * PACKLESS (generated) session was instantiated from —
   * GameSession.getWorldGenProposal() (game.ts) supplies the object;
   * saveSession stringifies it here, and only when the session has no
   * `packId` (a pack session's own `packId` is its reconstruction key
   * instead — see SavedSession.packId). Absent on every pre-A4 save and on
   * every pack session's save. `runLoad`'s generated branch (cli-display)
   * parses this back and feeds it, with `worldSeed` below, to
   * `instantiateWorld` to rebuild the identical world — closing the
   * wave-5 finding that a generated world had no resume path.
   */
  worldGenProposal?: string;
  /**
   * WO-A4-3: the seed `instantiateWorld` used to build this packless
   * session's world, carried the same way worldGenProposal is (gated on
   * the same `!packId` condition) so a resumed generated world rebuilds
   * from the identical proposal + seed pair.
   */
  worldSeed?: number;
  /**
   * WO-A5-5 (slice A5 §7): JSON of GameSession.worldMovedLedger (the
   * round-by-round "the world moved" ledger — see src/game/world-moved.ts's
   * WorldMovedEntry doc comment), from
   * GameSession.getWorldMovedSnapshot(). Same "omit when nothing to
   * persist" convention as resolvedOpportunities/endgameTriggers above.
   * Absent on every pre-A5 save and on a v3+ session that has never
   * accumulated an entry.
   */
  worldMoved?: string;
};

export type SaveSlotSummary = {
  filename: string;
  savedAt: string;
  characterName?: string;
  characterLevel?: number;
  characterTitle?: string;
  packId?: string;
  tone: string;
  chronicleEvents?: number;
  campaignAge?: number;
  leverageHighlight?: string;
  hottestPressure?: string;
  companionCount?: number;
  lastZoneName?: string;
};

/**
 * PB-005: Single-object input for saveSession — replaces 23 positional
 * params.
 *
 * WO-A3-1 (slice A3 §1/§2, design lock 2): as of schema v3 this type NO
 * LONGER carries the ten legacy world-truth fields (playerRumors,
 * activePressures, resolvedPressures, npcProfiles/npcActions —
 * npcAgencySnapshot's two source fields, npcObligations, consequenceChains,
 * partyState, districtEconomies, activeOpportunities) — the engine's own
 * `engine.serialize()` (already the first field written below) carries all
 * of them inside its world-truth namespaces now, so a v3 `saveSession` has
 * nothing left to compute from these. Removing them here is the deliberate
 * compile-error tripwire design lock 2 calls for: any caller still building
 * one of these into a SaveSessionInput object fails to compile instead of
 * silently double-writing world truth. `resolvedOpportunities` is NOT
 * legacy (see SavedSession.resolvedOpportunities's doc comment) and stays.
 */
export type SaveSessionInput = {
  engine: Engine;
  history: TurnHistory;
  tone: string;
  savePath: string;
  worldPrompt?: string;
  profile?: CharacterProfile | null;
  packId?: string;
  genre?: string;
  journal?: CampaignJournal;
  resolvedOpportunities?: OpportunityFallout[];
  arcSnapshot?: ArcSnapshot | null;
  endgameTriggers?: EndgameTrigger[];
  finaleOutline?: FinaleOutline | null;
  campaignStatus?: 'active' | 'completed';
  /** F-8c3e32b7: see SavedSession.presentationState. */
  presentationState?: string;
  /** F-462792bb (SLATE-2, persisted per Director ruling R2): see SavedSession.npcConversations. */
  npcConversations?: Map<string, ConversationExchange[]>;
  /**
   * WO-A3-2 (slice A3 §3): pre-serialized RumorEngine snapshot — see
   * SavedSession.rumorEngine's doc comment. GameSession.getRumorEngineSnapshot()
   * produces this string; saveSession writes it through unchanged (same
   * pass-through discipline as presentationState above).
   */
  rumorEngine?: string;
  /**
   * WO-A4-3 (slice A4 §4, design lock 5): the already-validated proposal
   * object — GameSession.getWorldGenProposal() (game.ts) supplies it;
   * saveSession JSON.stringifies it into SavedSession.worldGenProposal,
   * and only when `packId` is absent (see saveSession's own doc comment
   * on the write-side gate). Undefined for a pack-launched session.
   */
  worldGenProposal?: WorldGenProposal;
  /** WO-A4-3: see worldGenProposal's doc comment; the seed instantiateWorld used. */
  worldSeed?: number;
  /**
   * WO-A5-5 (slice A5 §7): pre-serialized by
   * GameSession.getWorldMovedSnapshot() — saveSession writes it through
   * unchanged, same pass-through discipline as rumorEngine above. See
   * SavedSession.worldMoved's doc comment.
   */
  worldMoved?: string;
};

export async function saveSession(input: SaveSessionInput): Promise<void> {
  const {
    engine, history, tone, savePath, worldPrompt, profile, packId,
    genre, journal, resolvedOpportunities,
    arcSnapshot, endgameTriggers, finaleOutline, campaignStatus,
    presentationState, npcConversations, rumorEngine,
    worldGenProposal, worldSeed, worldMoved,
  } = input;

  const session: SavedSession = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    version: '1.4.0',
    engineState: engine.serialize(),
    turnHistory: history.toJSON(),
    worldPrompt,
    tone,
    savedAt: new Date().toISOString(),
    profile: profile ? serializeProfile(profile) : undefined,
    packId,
    characterName: profile?.build.name,
    characterLevel: profile?.progression.level,
    characterTitle: profile?.custom.title as string | undefined,
    genre,
    chronicleRecords: journal && journal.size() > 0
      ? JSON.stringify(journal.serialize())
      : undefined,
    // WO-A3-1 (design lock 2): the ten legacy world-truth fields
    // (playerRumors, activePressures, resolvedPressures, npcAgencySnapshot,
    // npcObligations, consequenceChains, partyState, districtEconomies,
    // activeOpportunities, leverageSnapshot) are NEVER written by a v3
    // saveSession — engine.serialize() above already carries all of them
    // inside the engine's own world-truth namespaces. resolvedOpportunities
    // is NOT one of the ten (session history, not world truth — see its
    // own SavedSession doc comment) and is still written below.
    resolvedOpportunities: resolvedOpportunities && resolvedOpportunities.length > 0
      ? JSON.stringify(resolvedOpportunities)
      : undefined,
    arcSnapshot: arcSnapshot
      ? JSON.stringify(arcSnapshot)
      : undefined,
    endgameTriggers: endgameTriggers && endgameTriggers.length > 0
      ? JSON.stringify(endgameTriggers)
      : undefined,
    finaleOutline: finaleOutline
      ? JSON.stringify(finaleOutline)
      : undefined,
    campaignStatus: campaignStatus ?? 'active',
    presentationState,
    // F-462792bb (SLATE-2, persisted per Director ruling R2): identical
    // shape to npcObligations above.
    npcConversations: npcConversations && npcConversations.size > 0
      ? JSON.stringify(Object.fromEntries(npcConversations))
      : undefined,
    // WO-A3-2 (slice A3 §3): pre-serialized by GameSession.getRumorEngineSnapshot() —
    // passed through unchanged, same discipline as presentationState above.
    rumorEngine,
    // WO-A4-3 (slice A4 §4, design lock 5): written ONLY when the session
    // has no packId — a pack session's own packId is its reconstruction
    // key instead, so a pack session's save carries neither field (the
    // proposal/seed pair would be meaningless for it). See
    // SavedSession.worldGenProposal's doc comment.
    worldGenProposal: !packId && worldGenProposal
      ? JSON.stringify(worldGenProposal)
      : undefined,
    worldSeed: !packId ? worldSeed : undefined,
    // WO-A5-5 (slice A5 §7): pre-serialized by
    // GameSession.getWorldMovedSnapshot() — passed through unchanged, same
    // discipline as rumorEngine above.
    worldMoved,
  };

  const dir = dirname(savePath);
  await mkdir(dir, { recursive: true });

  // PB-002: Atomic save with race-condition protection.
  // Sequence: (1) write tmp, (2) rename existing→.bak, (3) rename tmp→save.
  // If step 3 fails, restore .bak. Clean up tmp on any failure.
  const tmpPath = savePath + '.tmp.' + randomBytes(4).toString('hex');
  const bakPath = savePath + '.bak';
  let hasBak = false;
  let hadPreviousSave = false;

  try {
    const json = JSON.stringify(session, null, 2);

    // Step 1: Write to temp file
    await writeFile(tmpPath, json, 'utf-8');

    // Step 2: If a previous save exists, rename it to .bak.
    // Only ENOENT means "no previous save — first write". Any other stat()
    // failure, or a rename() failure once we know a previous save exists
    // (hadPreviousSave), must NOT be silently treated as "no previous save":
    // that would let step 3 overwrite the original save with no backup ever
    // created, defeating the atomic-save/backup guarantee (PB-002).
    try {
      await stat(savePath);
      hadPreviousSave = true;
    } catch (statErr) {
      if ((statErr as NodeJS.ErrnoException).code !== 'ENOENT') throw statErr;
    }

    if (hadPreviousSave) {
      try { await unlink(bakPath); } catch { /* no previous backup */ }
      await rename(savePath, bakPath);
      hasBak = true;
    }

    // Step 3: Rename tmp → save
    try {
      await rename(tmpPath, savePath);
    } catch (renameErr) {
      // Step 3 failed — restore backup if we moved it
      if (hasBak) {
        try { await rename(bakPath, savePath); } catch { /* best effort */ }
      }
      throw renameErr;
    }
  } catch (err) {
    // Clean up tmp on any failure
    try { await unlink(tmpPath); } catch { /* may not exist */ }
    throw err;
  }
}

export class SaveValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveValidationError';
  }
}

export type LoadResult = {
  session: SavedSession;
  migrated: boolean;
  sourceVersion: number;
  stepsApplied: number;
};

/** Maximum allowed save file size: 10 MB */
const MAX_SAVE_FILE_BYTES = 10 * 1024 * 1024;

export async function loadSession(savePath: string): Promise<LoadResult> {
  // B-006: Reject oversized files before parsing to prevent DoS via huge JSON
  const fileStat = await stat(savePath);
  if (fileStat.size > MAX_SAVE_FILE_BYTES) {
    throw new SaveValidationError(
      `Save file is too large (${(fileStat.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 10 MB.`,
    );
  }

  const raw = await readFile(savePath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new SaveValidationError(
      `Save file is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SaveValidationError('Save file is not a JSON object');
  }

  // Run migration pipeline
  const result = migrateSave(parsed as Record<string, unknown>);
  const session = validateSaveShape(result.data);

  return {
    session,
    migrated: result.stepsApplied > 0,
    sourceVersion: result.sourceVersion,
    stepsApplied: result.stepsApplied,
  };
}

/** Validate that parsed/migrated JSON has the required SavedSession shape. */
export function validateSaveShape(data: unknown): SavedSession {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    throw new SaveValidationError('Save file is not a JSON object');
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.schemaVersion !== 'number') {
    throw new SaveValidationError('Save file missing required field: schemaVersion (migration may have failed)');
  }
  if (typeof obj.engineState !== 'string') {
    throw new SaveValidationError('Save file missing required field: engineState');
  }
  if (obj.turnHistory == null || typeof obj.turnHistory !== 'object') {
    throw new SaveValidationError('Save file missing required field: turnHistory');
  }
  if (typeof obj.tone !== 'string') {
    throw new SaveValidationError('Save file missing required field: tone');
  }
  if (typeof obj.savedAt !== 'string') {
    throw new SaveValidationError('Save file missing required field: savedAt');
  }

  return data as SavedSession;
}

/** Load and deserialize the profile from a saved session (null for v0.1.0 saves). */
export function loadProfileFromSession(session: SavedSession): CharacterProfile | null {
  if (!session.profile) return null;
  const result = deserializeProfile(session.profile);
  return result.profile;
}

/**
 * F-8c3e32b7: load the persisted presentation-state label from a saved
 * session (undefined for a save predating this field). Returned as a plain
 * string rather than the narrower PresentationState type — this module
 * doesn't depend on @ai-rpg-engine/presentation, and an untrusted/hand-edited
 * save could carry an arbitrary string here regardless of the field's
 * declared type. The caller (GameConfig.restoredPresentationState, game.ts)
 * is responsible for validating/casting before handing it to
 * ImmersionRuntime's PresentationStateMachine.
 */
export function loadPresentationStateFromSession(session: SavedSession): string | undefined {
  return session.presentationState;
}

/**
 * Load player rumors from a saved session.
 *
 * F-b6456823: the previous `JSON.parse(x) as PlayerRumor[]` cast trusted a
 * syntactically valid but wrong-shape element unexamined — e.g. game.ts's
 * `/status` handler reads array-position fields off this same rumor/pressure
 * array family unguarded (see loadPressuresFromSession's doc comment below).
 * Mirrors loadOpportunitiesFromSession's per-entry validate/drop-with-warning
 * discipline. isValidPlayerRumor is migrate.ts's own predicate — already
 * proven against real legacy-shape fixtures during v1->v2 migration —
 * exported and shared here instead of re-derived.
 *
 * F-fd5e8eec: also applies capPlayerRumors on the way out, so a save already
 * over MAX_PLAYER_RUMORS (written before that cap existed, or hand-edited)
 * self-heals on this load instead of carrying its unbounded growth forward
 * — mirrors TurnHistory.fromJSON applying trimCompactedChunks() on load
 * (F-dfd125bb).
 */
export function loadRumorsFromSession(session: SavedSession): PlayerRumor[] {
  if (!session.playerRumors) return [];
  try {
    const parsed: unknown = JSON.parse(session.playerRumors);
    if (!Array.isArray(parsed)) return [];
    const result: PlayerRumor[] = [];
    for (const [index, value] of parsed.entries()) {
      if (value != null && typeof value === 'object' && isValidPlayerRumor(value as Record<string, unknown>)) {
        result.push(value);
      } else if (isDebugEnabled()) {
        console.warn(`[session] Dropping malformed playerRumors entry at index ${index} on load — shape mismatch.`);
      }
    }
    return capPlayerRumors(result);
  } catch {
    return [];
  }
}

/**
 * Load world pressures from a saved session.
 *
 * F-b6456823: shares the unguarded-cast shape loadRumorsFromSession had (see
 * its doc comment) — same per-entry validate/drop-with-warning fix.
 * processInput() (game.ts) has no enclosing try/catch around its `/status`
 * slash-command branch, and reads `this.activePressures[0].description`/
 * `.urgency` unguarded — a malformed first element throws uncaught out of
 * processInput() every time the player runs `/status` on that save.
 */
export function loadPressuresFromSession(session: SavedSession): WorldPressure[] {
  if (!session.activePressures) return [];
  try {
    const parsed: unknown = JSON.parse(session.activePressures);
    if (!Array.isArray(parsed)) return [];
    const result: WorldPressure[] = [];
    for (const [index, value] of parsed.entries()) {
      if (value != null && typeof value === 'object' && isValidWorldPressure(value as Record<string, unknown>)) {
        result.push(value);
      } else if (isDebugEnabled()) {
        console.warn(`[session] Dropping malformed activePressures entry at index ${index} on load — shape mismatch.`);
      }
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * F-b6456823: shape guard for a single PressureResolution embedded within a
 * parsed PressureFallout entry. character/session-recap.ts's
 * computeFactionDeltas does `f.resolution.resolvedBy` unguarded, and
 * `f.effects.some((e) => e.type === 'reputation' && ...)` right after —
 * mirrors isValidOpportunityResolution's validation depth for the same
 * class of problem.
 */
function isValidPressureResolution(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.pressureId === 'string' &&
    typeof r.pressureKind === 'string' &&
    typeof r.resolutionType === 'string' &&
    typeof r.resolvedBy === 'string' &&
    typeof r.resolvedAtTick === 'number' &&
    typeof r.resolutionVisibility === 'string'
  );
}

/**
 * F-b6456823: shape guard for a single PressureFallout entry within a parsed
 * resolvedPressures array. Mirrors isValidOpportunityFallout's per-entry
 * validation depth for the same class of problem: character/session-recap.ts's
 * computeFactionDeltas dereferences `.resolution.resolvedBy` and iterates
 * `.effects` fully unguarded when building the post-session recap.
 */
function isValidPressureFallout(value: unknown): value is PressureFallout {
  if (value == null || typeof value !== 'object') return false;
  const f = value as Record<string, unknown>;
  return (
    isValidPressureResolution(f.resolution) &&
    Array.isArray(f.effects) &&
    typeof f.summary === 'string'
  );
}

/**
 * Load resolved pressures (fallout history) from a saved session.
 *
 * F-b6456823: shares the unguarded-cast shape loadRumorsFromSession had (see
 * its doc comment) — same per-entry validate/drop-with-warning fix.
 */
export function loadResolvedPressuresFromSession(session: SavedSession): PressureFallout[] {
  if (!session.resolvedPressures) return [];
  try {
    const parsed: unknown = JSON.parse(session.resolvedPressures);
    if (!Array.isArray(parsed)) return [];
    const result: PressureFallout[] = [];
    for (const [index, value] of parsed.entries()) {
      if (isValidPressureFallout(value)) {
        result.push(value);
      } else if (isDebugEnabled()) {
        console.warn(`[session] Dropping malformed resolvedPressures entry at index ${index} on load — shape mismatch.`);
      }
    }
    return result;
  } catch {
    return [];
  }
}

/** Load chronicle journal from a saved session. */
export function loadChronicleFromSession(session: SavedSession): CampaignJournal {
  if (!session.chronicleRecords) return new CampaignJournal();
  try {
    const records = JSON.parse(session.chronicleRecords) as CampaignRecord[];
    return CampaignJournal.deserialize(records);
  } catch (err) {
    // Engine 2.9.x validates records on deserialize (CA-06) — a refusal here
    // means the save's chronicle is corrupt. Starting an empty journal keeps
    // the session playable, but the loss must not be silent to someone
    // running with diagnostics on (F-34078c07: gated behind the same
    // --debug/CLAUDE_RPG_DEBUG condition debug-logger.ts's DebugLogger
    // already checks, so a normal player's terminal doesn't get raw
    // diagnostic text mixed into the styled game screen on every load of an
    // old or hand-edited save).
    if (isDebugEnabled()) {
      console.warn(
        `[session] Chronicle could not be restored from this save — starting an empty journal. ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return new CampaignJournal();
  }
}

/**
 * F-0b05c26c: shape guard for a single NpcRelationship record and a single
 * NpcGoal entry — together back isValidNpcProfile below. Mirrors
 * isValidNpcObligation's per-field validation depth for the same class of
 * problem: a bare `??` fallback only substitutes for null/undefined, never
 * validates shape.
 */
function isValidNpcRelationship(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.trust === 'number' &&
    typeof r.fear === 'number' &&
    typeof r.greed === 'number' &&
    typeof r.loyalty === 'number'
  );
}

function isValidNpcGoal(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  const g = value as Record<string, unknown>;
  return (
    typeof g.id === 'string' &&
    typeof g.label === 'string' &&
    typeof g.priority === 'number' &&
    typeof g.verb === 'string' &&
    typeof g.reason === 'string'
  );
}

/**
 * F-0b05c26c: shape guard for a single NpcProfile entry within a parsed
 * npcAgencySnapshot's `.profiles` array. Mirrors isValidNpcObligation/
 * isValidConsequenceStep/isValidArcSignal's per-element validation depth.
 * The compiled @ai-rpg-engine/modules generateNpcTextures() dereferences
 * `profile.npcId`, `profile.relationship.{fear,trust,greed}`, and
 * `profile.goals[0].verb` unguarded for every profile in the array.
 */
function isValidNpcProfile(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.npcId === 'string' &&
    typeof p.name === 'string' &&
    (p.factionId === null || typeof p.factionId === 'string') &&
    Array.isArray(p.goals) && p.goals.every(isValidNpcGoal) &&
    isValidNpcRelationship(p.relationship) &&
    typeof p.breakpoint === 'string' &&
    typeof p.dominantAxis === 'string' &&
    typeof p.leverageAngle === 'string' &&
    Array.isArray(p.knownRumors) &&
    typeof p.underPressure === 'boolean'
  );
}

/**
 * F-0b05c26c: shape guard for a single NpcActionResult entry within a parsed
 * npcAgencySnapshot's `.actions` array. The compiled @ai-rpg-engine/modules
 * formatNpcAgencyForNarrator() reads `.narratorHint` off every element
 * unguarded (`results.slice(0, 2).map((r) => r.narratorHint)`).
 */
function isValidNpcActionResult(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  return (
    a.action != null && typeof a.action === 'object' &&
    Array.isArray(a.effects) &&
    typeof a.narratorHint === 'string'
  );
}

/**
 * Load NPC agency state from a saved session.
 *
 * F-0b05c26c: the previous `{ profiles: data.profiles ?? [], actions:
 * data.actions ?? [] }` pattern only substituted defaults for
 * null/undefined — a syntactically valid but wrong-shaped snapshot (e.g.
 * `{"profiles":[],"actions":42}`) passed straight through unexamined into
 * game.ts's processInput() -> getVisiblePressureContext() ->
 * formatNpcAgencyForNarrator()/generateNpcTextures() (compiled
 * @ai-rpg-engine/modules), which throw on a non-array actions/profiles
 * field or a malformed element. Unlike every sibling loader in this file,
 * that call site sits in processInput() with no enclosing try/catch, so the
 * crash aborted the entire turn and repeated identically on every
 * subsequent turn for the rest of the session. Now validated per-field and
 * per-element, mirroring loadObligationsFromSession/
 * loadConsequenceChainsFromSession/loadPartyFromSession/
 * loadArcSnapshotFromSession's shape-guard pattern: a field that isn't an
 * array, or whose elements don't validate, falls back to the empty default
 * for that field alone rather than trusting either unexamined.
 */
export function loadNpcAgencyFromSession(session: SavedSession): { profiles: NpcProfile[]; actions: NpcActionResult[] } {
  if (!session.npcAgencySnapshot) return { profiles: [], actions: [] };
  try {
    const parsed: unknown = JSON.parse(session.npcAgencySnapshot);
    if (parsed == null || typeof parsed !== 'object') return { profiles: [], actions: [] };
    const data = parsed as Record<string, unknown>;
    const profiles = Array.isArray(data.profiles) && data.profiles.every(isValidNpcProfile)
      ? (data.profiles as NpcProfile[])
      : [];
    const actions = Array.isArray(data.actions) && data.actions.every(isValidNpcActionResult)
      ? (data.actions as NpcActionResult[])
      : [];
    return { profiles, actions };
  } catch {
    return { profiles: [], actions: [] };
  }
}

/**
 * F-cb8a8337: shape guard for a single NpcObligation entry within a parsed
 * NpcObligationLedger's `.obligations` array. Mirrors migrate.ts's
 * isValidPlayerRumor/isValidWorldPressure per-entry validation depth for the
 * same class of problem: JSON.parse succeeds *syntactically* on a
 * wrong-shape value, so a bare cast trusts it unexamined. Validated so a
 * ledger whose top-level shape looks right but whose array holds a
 * malformed obligation still can't reach tickObligations()'s
 * `ledger.obligations.map(...)` (game.ts's tickNpcAgencyTurn, via the
 * compiled @ai-rpg-engine/modules implementation).
 */
function isValidNpcObligation(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.kind === 'string' &&
    typeof o.direction === 'string' &&
    typeof o.npcId === 'string' &&
    typeof o.counterpartyId === 'string' &&
    typeof o.magnitude === 'number' &&
    typeof o.sourceTag === 'string' &&
    typeof o.createdAtTick === 'number' &&
    (o.decayTurns === null || typeof o.decayTurns === 'number')
  );
}

/**
 * F-cb8a8337: shape guard for a single NpcObligationLedger entry (one Map
 * value), mirroring session.ts's own isValidPartyState pattern below.
 */
function isValidNpcObligationLedger(value: unknown): value is NpcObligationLedger {
  if (value == null || typeof value !== 'object') return false;
  const l = value as Record<string, unknown>;
  return Array.isArray(l.obligations) && l.obligations.every(isValidNpcObligation);
}

/**
 * Load NPC obligations from a saved session.
 *
 * F-cb8a8337: the previous `try { return new
 * Map(Object.entries(JSON.parse(x))) } catch { return new Map() }` pattern
 * only fell back to an empty Map on a genuine JSON *syntax* error — a
 * syntactically valid object whose values were the wrong shape (e.g. a
 * hand-edited or schema-drifted save missing `.obligations`) was trusted
 * unexamined into tickNpcAgencyTurn()'s first statement, which throws on
 * that shape every turn for the rest of the session (see the compiled
 * @ai-rpg-engine/modules tickObligations implementation). Each entry is now
 * validated individually; a malformed entry is dropped (with a warning)
 * instead of poisoning the whole Map or the whole load.
 */
export function loadObligationsFromSession(
  session: SavedSession,
): Map<string, NpcObligationLedger> {
  if (!session.npcObligations) return new Map();
  try {
    const parsed: unknown = JSON.parse(session.npcObligations);
    if (parsed == null || typeof parsed !== 'object') return new Map();
    const result = new Map<string, NpcObligationLedger>();
    for (const [npcId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isValidNpcObligationLedger(value)) {
        result.set(npcId, value);
      } else {
        // F-34078c07: gated behind --debug/CLAUDE_RPG_DEBUG — see the
        // loadChronicleFromSession comment above for why.
        if (isDebugEnabled()) {
          console.warn(`[session] Dropping malformed npcObligations entry for "${npcId}" on load — shape mismatch.`);
        }
      }
    }
    return result;
  } catch {
    return new Map();
  }
}

/**
 * F-dd2851cb: shape guard for a single ConsequenceStep entry within a parsed
 * ConsequenceChain's `.steps` array. Mirrors isValidNpcObligation's
 * per-element validation depth for the same class of problem: Array.isArray
 * alone lets a malformed element (e.g. null) through unexamined.
 * resolveConsequenceChainStep (compiled @ai-rpg-engine/modules) does
 * `step.verb` / `step.description` on chain.steps[chain.currentStep] and
 * `chain.steps[nextStep].delayTurns` on the next entry, all unguarded.
 */
function isValidConsequenceStep(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.delayTurns === 'number' &&
    typeof s.verb === 'string' &&
    typeof s.description === 'string'
  );
}

/**
 * F-5bfeeab2: shape guard for a single ConsequenceChain entry (one Map
 * value). Validates exactly the fields shouldResolveChainStep/
 * tickConsequenceChain dereference unguarded in the compiled
 * @ai-rpg-engine/modules implementation (`chain.currentStep <
 * chain.steps.length`), plus the chain's own identity fields.
 *
 * F-dd2851cb: Array.isArray(c.steps) alone only proves `.steps` is an array
 * — it does not prove each element is a well-shaped ConsequenceStep. A chain
 * whose steps array contained a malformed element (e.g. null) passed this
 * validator unchanged and crashed resolveConsequenceChainStep every
 * subsequent turn (see isValidConsequenceStep's doc comment above). Each
 * step is now validated individually via isValidConsequenceStep.
 */
function isValidConsequenceChain(value: unknown): value is ConsequenceChain {
  if (value == null || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.npcId === 'string' &&
    typeof c.kind === 'string' &&
    typeof c.trigger === 'string' &&
    Array.isArray(c.steps) &&
    c.steps.every(isValidConsequenceStep) &&
    typeof c.currentStep === 'number' &&
    typeof c.turnsUntilNext === 'number' &&
    typeof c.resolved === 'boolean' &&
    typeof c.createdAtTick === 'number'
  );
}

/**
 * Load consequence chains from a saved session.
 *
 * F-5bfeeab2: shares the exact same unguarded-cast pattern
 * loadObligationsFromSession had (see its doc comment above) — same fix
 * shape, applied to the sibling loader tickNpcAgencyTurn() also calls
 * unconditionally every turn (`tickConsequenceChain`/
 * `shouldResolveChainStep` over `this.activeConsequenceChains`).
 */
export function loadConsequenceChainsFromSession(
  session: SavedSession,
): Map<string, ConsequenceChain> {
  if (!session.consequenceChains) return new Map();
  try {
    const parsed: unknown = JSON.parse(session.consequenceChains);
    if (parsed == null || typeof parsed !== 'object') return new Map();
    const result = new Map<string, ConsequenceChain>();
    for (const [npcId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isValidConsequenceChain(value)) {
        result.set(npcId, value);
      } else {
        // F-34078c07: gated behind --debug/CLAUDE_RPG_DEBUG — see the
        // loadChronicleFromSession comment above for why.
        if (isDebugEnabled()) {
          console.warn(`[session] Dropping malformed consequenceChains entry for "${npcId}" on load — shape mismatch.`);
        }
      }
    }
    return result;
  } catch {
    return new Map();
  }
}

/**
 * F-c2d4ba19: shape guard for a single CompanionState entry within a parsed
 * PartyState's `.companions` array. Mirrors isValidNpcObligation/
 * isValidConsequenceStep/isValidArcSignal's per-element validation depth for
 * the same class of problem: Array.isArray(p.companions) alone proves the
 * field is an array but never validates what's inside it. The compiled
 * @ai-rpg-engine/modules companion-core.js dereferences `.npcId` unguarded in
 * addCompanion/getCompanion/isCompanion/setCompanionActive/
 * adjustCompanionMorale, `.active` unguarded in getActiveCompanions/
 * computePartyCohesion, and `.morale` unguarded in computePartyCohesion/
 * adjustCompanionMorale — validated at minimum here, matching the fields
 * actually dereferenced unguarded across those 8 of ~10 companion-core
 * exports.
 */
function isValidCompanion(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.npcId === 'string' &&
    typeof c.active === 'boolean' &&
    typeof c.morale === 'number'
  );
}

/**
 * F-1357a6e0: shape guard for PartyState. JSON.parse can succeed
 * *syntactically* on a value that is the wrong shape entirely (e.g. the bare
 * number 42) — that only throws if the string isn't valid JSON at all, so a
 * bare `JSON.parse(x) as PartyState` cast trusts it unexamined. Mirrors the
 * isValidPlayerRumor/isValidWorldPressure shape-guard pattern in migrate.ts
 * for this exact class of problem.
 *
 * F-c2d4ba19: Array.isArray(p.companions) alone only proves `.companions` is
 * an array — it does not prove each element is a well-shaped CompanionState.
 * A party whose companions array contained a malformed element (e.g. null)
 * passed this validator unchanged and reached
 * `this.partyState.companions.some((c) => c.npcId === effect.npcId)`
 * (game.ts:1458) and every companion-core call gated behind
 * `this.partyState.companions.length > 0` (game.ts:873) unexamined. Each
 * companion is now validated individually via isValidCompanion.
 */
function isValidPartyState(value: unknown): value is PartyState {
  if (value == null || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    Array.isArray(p.companions) &&
    p.companions.every(isValidCompanion) &&
    typeof p.maxSize === 'number' &&
    typeof p.cohesion === 'number'
  );
}

/** Load party state from a saved session. */
export function loadPartyFromSession(session: SavedSession): PartyState {
  if (!session.partyState) return createPartyState();
  try {
    const parsed: unknown = JSON.parse(session.partyState);
    return isValidPartyState(parsed) ? parsed : createPartyState();
  } catch {
    return createPartyState();
  }
}

/**
 * F-afe91227: shape guard for a single SupplyLevel entry within a parsed
 * DistrictEconomy's `.supplies` map — just the field tickDistrictEconomy
 * dereferences unguarded (see isValidDistrictEconomy below).
 */
function isValidSupplyLevel(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  return typeof (value as Record<string, unknown>).level === 'number';
}

/**
 * F-afe91227: shape guard for a single DistrictEconomy entry (one Map
 * value). The compiled @ai-rpg-engine/modules tickDistrictEconomy — called
 * every turn via game-state.ts's tickDistrictEconomies() over every Map
 * entry — iterates its own fixed 8-category ALL_CATEGORIES list (not
 * Object.keys(economy.supplies)) and does `const prev =
 * economy.supplies[cat]; let level = prev.level;` UNGUARDED for each. A
 * `.supplies` missing even one category, or holding a non-object at one,
 * throws "Cannot read properties of undefined (reading 'level')" — and
 * because tickDistrictEconomies runs inside game.ts's single PB-001
 * try/catch, that throw doesn't crash the session, it recurs every
 * subsequent turn and silently skips every subsystem listed after it in
 * that try block (NPC agency, item recognition, companion reactions, rumor
 * propagation, pressure/opportunity/arc/endgame evaluation). Validated
 * against VALID_SUPPLY_CATEGORIES (game-state.ts) rather than a re-declared
 * list, so the two can't drift apart.
 */
function isValidDistrictEconomy(value: unknown): value is DistrictEconomy {
  if (value == null || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  if (e.supplies == null || typeof e.supplies !== 'object') return false;
  const supplies = e.supplies as Record<string, unknown>;
  for (const cat of VALID_SUPPLY_CATEGORIES) {
    if (!isValidSupplyLevel(supplies[cat])) return false;
  }
  return (
    typeof e.tradeVolume === 'number' &&
    typeof e.blackMarketActive === 'boolean' &&
    typeof e.lastUpdateTick === 'number'
  );
}

/**
 * Load district economies from a saved session.
 *
 * F-afe91227: the previous `JSON.parse(x) as Record<string, DistrictEconomy>`
 * cast trusted a syntactically valid but wrong-shape entry unexamined into
 * tickDistrictEconomies()'s per-category `.level` read (see
 * isValidDistrictEconomy's doc comment). Mirrors
 * loadObligationsFromSession's per-entry try/validate/drop-with-warning
 * discipline: a malformed entry is dropped individually instead of
 * poisoning the whole Map or the whole load.
 */
export function loadEconomiesFromSession(
  session: SavedSession,
): Map<string, DistrictEconomy> {
  if (!session.districtEconomies) return new Map();
  try {
    const parsed: unknown = JSON.parse(session.districtEconomies);
    if (parsed == null || typeof parsed !== 'object') return new Map();
    const result = new Map<string, DistrictEconomy>();
    for (const [districtId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isValidDistrictEconomy(value)) {
        result.set(districtId, value);
      } else {
        if (isDebugEnabled()) {
          console.warn(`[session] Dropping malformed districtEconomies entry for "${districtId}" on load — shape mismatch.`);
        }
      }
    }
    return result;
  } catch {
    return new Map();
  }
}

/**
 * F-afe91227: shape guard for a single OpportunityState entry within a
 * parsed activeOpportunities array. Validates the fields dereferenced
 * unguarded downstream: tickOpportunities (compiled @ai-rpg-engine/modules,
 * run every turn over the whole array via game.ts's opportunity tick) reads
 * `.status`/`.turnsRemaining`/`.createdAtTick`/`.visibility` on every entry
 * with no object-shape check first — a `null`/non-object entry throws
 * inside that per-turn loop; formatOpportunityForDirector (game.ts's
 * '/director' path, formatOpportunityListForDirector) does
 * `opp.kind.toUpperCase()` unguarded, so a missing/wrong-type `.kind`
 * throws whenever director mode lists the opportunity board.
 */
function isValidOpportunityState(value: unknown): value is OpportunityState {
  if (value == null || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.kind === 'string' &&
    typeof o.status === 'string' &&
    typeof o.title === 'string' &&
    (o.turnsRemaining === null || typeof o.turnsRemaining === 'number') &&
    typeof o.createdAtTick === 'number' &&
    typeof o.visibility === 'string'
  );
}

/**
 * Load active opportunities from a saved session.
 *
 * F-afe91227: the previous `JSON.parse(x) as OpportunityState[]` cast
 * trusted a syntactically valid but wrong-shape element unexamined into
 * every downstream per-entry read (see isValidOpportunityState's doc
 * comment). A malformed element is dropped individually — same discipline
 * as every Map-shaped loader in this file, applied here to an array.
 */
export function loadOpportunitiesFromSession(session: SavedSession): OpportunityState[] {
  if (!session.activeOpportunities) return [];
  try {
    const parsed: unknown = JSON.parse(session.activeOpportunities);
    if (!Array.isArray(parsed)) return [];
    const result: OpportunityState[] = [];
    for (const [index, value] of parsed.entries()) {
      if (isValidOpportunityState(value)) {
        result.push(value);
      } else if (isDebugEnabled()) {
        console.warn(`[session] Dropping malformed activeOpportunities entry at index ${index} on load — shape mismatch.`);
      }
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * F-afe91227: shape guard for a single OpportunityResolution embedded
 * within a parsed OpportunityFallout entry.
 */
function isValidOpportunityResolution(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.opportunityId === 'string' &&
    typeof r.opportunityKind === 'string' &&
    typeof r.resolutionType === 'string' &&
    typeof r.resolvedAtTick === 'number'
  );
}

/**
 * F-afe91227: shape guard for a single OpportunityFallout entry within a
 * parsed resolvedOpportunities array. character/session-recap.ts's
 * computeOpportunityRecapEntries does `fallout.resolution` then
 * `res.resolutionType`/`res.opportunityId`/`res.opportunityKind` two levels
 * deep, fully unguarded — a fallout entry whose `.resolution` is missing or
 * the wrong shape throws "Cannot read properties of undefined" building the
 * post-session recap. Nested one level, mirroring isValidConsequenceChain's
 * per-step validation depth in this same file.
 */
function isValidOpportunityFallout(value: unknown): value is OpportunityFallout {
  if (value == null || typeof value !== 'object') return false;
  const f = value as Record<string, unknown>;
  return (
    isValidOpportunityResolution(f.resolution) &&
    Array.isArray(f.effects) &&
    typeof f.summary === 'string'
  );
}

/**
 * Load resolved opportunities (fallout history) from a saved session.
 *
 * F-afe91227: shares the unguarded-cast shape loadEconomiesFromSession had
 * (see its doc comment) — same per-entry validate/drop-with-warning fix,
 * applied to this array.
 */
export function loadResolvedOpportunitiesFromSession(session: SavedSession): OpportunityFallout[] {
  if (!session.resolvedOpportunities) return [];
  try {
    const parsed: unknown = JSON.parse(session.resolvedOpportunities);
    if (!Array.isArray(parsed)) return [];
    const result: OpportunityFallout[] = [];
    for (const [index, value] of parsed.entries()) {
      if (isValidOpportunityFallout(value)) {
        result.push(value);
      } else if (isDebugEnabled()) {
        console.warn(`[session] Dropping malformed resolvedOpportunities entry at index ${index} on load — shape mismatch.`);
      }
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * WO-A5-5 (slice A5 §7): shape guard for a single WorldMovedEntry —
 * mirrors isValidOpportunityFallout's per-entry validate/drop-with-warning
 * discipline immediately above.
 */
function isValidWorldMovedEntry(value: unknown): value is WorldMovedEntry {
  if (value == null || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.tick === 'number' &&
    typeof e.kind === 'string' &&
    (VALID_WORLD_MOVED_KINDS as readonly string[]).includes(e.kind) &&
    typeof e.headline === 'string'
  );
}

/**
 * WO-A5-5 (slice A5 §7): load the "the world moved" ledger from a saved
 * session — same per-entry validate/drop-with-warning shape as
 * loadResolvedOpportunitiesFromSession immediately above. [] on a
 * pre-A5 save (no `worldMoved` field) or a session that never
 * accumulated an entry.
 */
export function loadWorldMovedFromSession(session: SavedSession): WorldMovedEntry[] {
  if (!session.worldMoved) return [];
  try {
    const parsed: unknown = JSON.parse(session.worldMoved);
    if (!Array.isArray(parsed)) return [];
    const result: WorldMovedEntry[] = [];
    for (const [index, value] of parsed.entries()) {
      if (isValidWorldMovedEntry(value)) {
        result.push(value);
      } else if (isDebugEnabled()) {
        console.warn(`[session] Dropping malformed worldMoved entry at index ${index} on load — shape mismatch.`);
      }
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * F-1c412093: shape guard for a single ArcSignal entry within a parsed
 * ArcSnapshot's `.signals` array. Mirrors isValidNpcObligation/
 * isValidConsequenceStep's per-element validation depth for the same class
 * of problem: Array.isArray alone lets a malformed element (e.g. null)
 * through unexamined. buildArcSnapshot's compiled @ai-rpg-engine/modules
 * implementation does `previous.signals.find((s) => s.kind ===
 * signal.kind)` unguarded, and game.ts's '/status' command handler does
 * `this.arcSnapshot.signals.find((s) => s.kind === ...)` directly too.
 */
function isValidArcSignal(value: unknown): boolean {
  if (value == null || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.kind === 'string' &&
    typeof s.strength === 'number' &&
    typeof s.momentum === 'string' &&
    Array.isArray(s.primaryDrivers) &&
    typeof s.turnsActive === 'number'
  );
}

/**
 * F-d521bb19: shape guard for a parsed ArcSnapshot, mirroring
 * isValidPartyState. buildArcSnapshot()'s compiled implementation does
 * `previous.signals.find(...)` unguarded whenever `previous` is truthy
 * (@ai-rpg-engine/modules), and the `/status` command (game.ts) reads
 * `.signals.find(...)` directly too.
 *
 * F-1c412093: Array.isArray(a.signals) alone only proves `.signals` is an
 * array — it does not prove each element is a well-shaped ArcSignal. A
 * snapshot whose signals array contained a malformed element (e.g. null)
 * passed this validator unchanged and crashed both consumers above every
 * subsequent turn (see isValidArcSignal's doc comment above). Each signal is
 * now validated individually via isValidArcSignal.
 */
function isValidArcSnapshot(value: unknown): value is ArcSnapshot {
  if (value == null || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  return (
    Array.isArray(a.signals) &&
    a.signals.every(isValidArcSignal) &&
    (a.dominantArc === null || typeof a.dominantArc === 'string') &&
    typeof a.tick === 'number'
  );
}

/**
 * Load arc snapshot from a saved session.
 *
 * F-d521bb19: the previous `JSON.parse(x) as ArcSnapshot | null` cast
 * trusted a syntactically valid but wrong-shape value unexamined — falls
 * back to null (mirroring loadPartyFromSession's createPartyState()
 * fallback) so buildArcSnapshot() never receives a malformed `previous`
 * argument.
 */
export function loadArcSnapshotFromSession(session: SavedSession): ArcSnapshot | null {
  if (!session.arcSnapshot) return null;
  try {
    const parsed: unknown = JSON.parse(session.arcSnapshot);
    return isValidArcSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * F-afe91227: shape guard for a single EndgameTrigger entry within a parsed
 * endgameTriggers array. formatEndgameForNarrator (compiled
 * @ai-rpg-engine/modules, reached every turn via game-state.ts's
 * getEndgameContext whenever an unacknowledged trigger exists) does
 * `trigger.resolutionClass.replace(/-/g, ' ')` unguarded — a missing or
 * wrong-type `.resolutionClass` throws "Cannot read properties of undefined
 * (reading 'replace')" building the narrator context on every subsequent
 * turn. evaluateEndgame also maps `.resolutionClass` over the full
 * `previousTriggers` array on every turn (endgame-detection.ts).
 */
function isValidEndgameTrigger(value: unknown): value is EndgameTrigger {
  if (value == null || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === 'string' &&
    typeof t.resolutionClass === 'string' &&
    typeof t.detectedAtTick === 'number' &&
    typeof t.reason === 'string' &&
    (t.dominantArc === null || typeof t.dominantArc === 'string') &&
    typeof t.acknowledged === 'boolean'
  );
}

/**
 * Load endgame triggers from a saved session.
 *
 * F-afe91227: shares the unguarded-cast shape loadEconomiesFromSession had
 * (see its doc comment) — same per-entry validate/drop-with-warning fix,
 * applied to this array.
 */
export function loadEndgameTriggersFromSession(session: SavedSession): EndgameTrigger[] {
  if (!session.endgameTriggers) return [];
  try {
    const parsed: unknown = JSON.parse(session.endgameTriggers);
    if (!Array.isArray(parsed)) return [];
    const result: EndgameTrigger[] = [];
    for (const [index, value] of parsed.entries()) {
      if (isValidEndgameTrigger(value)) {
        result.push(value);
      } else if (isDebugEnabled()) {
        console.warn(`[session] Dropping malformed endgameTriggers entry at index ${index} on load — shape mismatch.`);
      }
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * F-afe91227: shape guard for a parsed FinaleOutline. finale-narrator.ts's
 * narrateFinale does `outline.factionFates.length` / `.districtFates.length`
 * / `.companionFates.length` unguarded — a missing array field throws
 * "Cannot read properties of undefined (reading 'length')" the moment a
 * resumed-and-completed campaign's /conclude runs. Only the top-level shape
 * is validated (array-ness of the array fields, primitive types of the
 * scalars) — mirrors this file's existing depth for single-object guards
 * (isValidArcSnapshot, isValidPartyState): enough to keep a
 * syntactically-valid-but-wrong-shape save from reaching an unguarded
 * top-level read, without re-validating every nested
 * NpcFate/FactionFate/DistrictFate/LegacyEntry field.
 */
function isValidFinaleOutline(value: unknown): value is FinaleOutline {
  if (value == null || typeof value !== 'object') return false;
  const f = value as Record<string, unknown>;
  return (
    typeof f.resolutionClass === 'string' &&
    (f.dominantArc === null || typeof f.dominantArc === 'string') &&
    typeof f.campaignDuration === 'number' &&
    typeof f.totalChronicleEvents === 'number' &&
    Array.isArray(f.keyMoments) &&
    Array.isArray(f.npcFates) &&
    Array.isArray(f.factionFates) &&
    Array.isArray(f.districtFates) &&
    Array.isArray(f.companionFates) &&
    Array.isArray(f.legacy) &&
    Array.isArray(f.epilogueSeeds)
  );
}

/**
 * Load finale outline from a saved session.
 *
 * F-afe91227: the previous `JSON.parse(x) as FinaleOutline` cast trusted a
 * syntactically valid but wrong-shape value unexamined (see
 * isValidFinaleOutline's doc comment) — falls back to null, mirroring
 * loadArcSnapshotFromSession's fallback, so handleConclude() never receives
 * a malformed outline.
 */
export function loadFinaleFromSession(session: SavedSession): FinaleOutline | null {
  if (!session.finaleOutline) return null;
  try {
    const parsed: unknown = JSON.parse(session.finaleOutline);
    return isValidFinaleOutline(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * F-462792bb (SLATE-2, persisted per Director ruling R2): shape guard for a
 * single ConversationExchange entry within a parsed npcConversations Map
 * value's array. Mirrors isValidNpcObligation's per-entry validation depth
 * for the same class of problem — JSON.parse succeeds *syntactically* on a
 * wrong-shape value, so a bare cast trusts it unexamined.
 */
function isValidConversationExchange(value: unknown): value is ConversationExchange {
  if (value == null || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return typeof e.speaker === 'string' && typeof e.text === 'string';
}

/**
 * Load NPC conversation history from a saved session.
 *
 * F-462792bb (SLATE-2, persisted per Director ruling R2): mirrors
 * loadObligationsFromSession's per-entry try/validate/drop-with-warning
 * discipline exactly — a syntactically valid but wrong-shape entry (e.g. a
 * hand-edited or schema-drifted save) is dropped individually instead of
 * poisoning the whole Map or the whole load.
 */
export function loadNpcConversationsFromSession(
  session: SavedSession,
): Map<string, ConversationExchange[]> {
  if (!session.npcConversations) return new Map();
  try {
    const parsed: unknown = JSON.parse(session.npcConversations);
    if (parsed == null || typeof parsed !== 'object') return new Map();
    const result = new Map<string, ConversationExchange[]>();
    for (const [npcId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every(isValidConversationExchange)) {
        result.set(npcId, value);
      } else {
        // F-34078c07: gated behind --debug/CLAUDE_RPG_DEBUG — see
        // loadObligationsFromSession's identical gate above.
        if (isDebugEnabled()) {
          console.warn(`[session] Dropping malformed npcConversations entry for "${npcId}" on load — shape mismatch.`);
        }
      }
    }
    return result;
  } catch {
    return new Map();
  }
}

/**
 * List completed (archived) campaigns from save files.
 *
 * Spawn-task follow-up to F-afe91227 (wave-2, run swarm-1788171999-5dc0):
 * this function used to re-implement inline `JSON.parse(x) as T` casts for
 * finaleOutline / arcSnapshot / chronicleRecords instead of reusing this
 * file's guarded loaders. Because the whole per-file body sits in one
 * try/catch, a syntactically-valid-but-wrong-shape field didn't crash the
 * command — it silently DROPPED the entire completed campaign from the
 * archive listing. The guarded loaders degrade per-field (null outline/
 * snapshot, empty journal) so the entry stays listed. The old partyState
 * parse was dead — parsed, never read — and is deleted rather than guarded.
 *
 * `dir` is a testability seam; production callers pass nothing.
 */
export async function listArchivedCampaigns(
  dir: string = getDefaultSaveDir(),
): Promise<ArchivedCampaignSummary[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const results: ArchivedCampaignSummary[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await readFile(join(dir, file), 'utf-8');
      const session = JSON.parse(raw) as SavedSession;
      if (session.campaignStatus !== 'completed') continue;

      const outline = loadFinaleFromSession(session);
      const arcSnap = loadArcSnapshotFromSession(session);
      const journal = loadChronicleFromSession(session);

      // Top 3 most significant chronicle events as highlights
      const highlights = [...journal.query({})]
        .sort((a, b) => b.significance - a.significance)
        .slice(0, 3)
        .map((r) => r.description);

      // Companion fates
      const companionFates = outline?.companionFates?.map(
        (c: { name: string; outcome: string }) => `${c.name} (${c.outcome})`,
      ) ?? [];

      // Relic names from item chronicle if profile exists
      const relicNames: string[] = [];
      if (session.profile) {
        try {
          const profile = JSON.parse(session.profile);
          const itemChronicle = profile?.itemChronicle ?? {};
          for (const [itemId, entries] of Object.entries(itemChronicle)) {
            if (Array.isArray(entries) && entries.length >= 3) {
              relicNames.push(itemId);
            }
          }
        } catch {
          // Skip if profile can't be parsed
        }
      }

      results.push({
        filename: file,
        packId: session.packId,
        title: session.characterName ?? session.packId ?? 'Unknown',
        dominantArc: outline?.dominantArc ?? arcSnap?.dominantArc ?? null,
        resolutionClass: outline?.resolutionClass ?? null,
        turnCount: outline?.campaignDuration ?? journal.size(),
        chronicleHighlights: highlights,
        companionFates,
        relicNames,
      });
    } catch {
      // Skip corrupted saves
    }
  }

  return results;
}

export type ArchivedCampaignSummary = {
  filename: string;
  packId?: string;
  title: string;
  dominantArc: string | null;
  resolutionClass: string | null;
  turnCount: number;
  chronicleHighlights: string[];
  companionFates: string[];
  relicNames: string[];
};

/**
 * F-5feeb5af: the exact shape read from a save's parsed engineState when
 * listSaves() peeks a save's current zone name. This is the ONE place in
 * this domain that reaches into @ai-rpg-engine/core's Engine.serialize()
 * internal output shape ({ world: { state, rngState }, actionLog } —
 * engine.ts:462-468) instead of a supported public accessor — no "read a
 * save's headline fields without reconstructing modules" peek API exists
 * today (engine-side ask filed in the slice plan). Verified NOT broken by
 * the 3.9 bump: this shape is unchanged 2.9->3.9. But neither this cast nor
 * the analogous rngState reach in bin.ts's runLoad (outside this domain) is
 * covered by any type contract, only informal shape agreement — if a future
 * engine bump changes WorldStore.serialize()'s internal shape, grep this
 * file for `.world?.state?` before assuming save-listing still works.
 * Narrowed to exactly the two fields read below (locationId, and one
 * zones[id].name) so this cast can't silently claim to trust more than it
 * does.
 */
type EngineStateZonePeek = {
  world?: {
    state?: {
      locationId?: string;
      zones?: Record<string, { name?: string }>;
      playerId?: string;
      entities?: Record<string, { custom?: Record<string, string | number | boolean> }>;
      modules?: {
        'world-tick'?: { pressures?: Array<{ urgency?: number; description?: string }> };
        'companion-core'?: { party?: { companions?: unknown[] } };
      };
    };
  };
};

/** List all saves with summary info for display. */
export async function listSaves(): Promise<SaveSlotSummary[]> {
  const dir = getDefaultSaveDir();
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const summaries: SaveSlotSummary[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await readFile(join(dir, file), 'utf-8');
      const session = JSON.parse(raw) as SavedSession;
      // Count chronicle events if present
      let chronicleEvents: number | undefined;
      let campaignAge: number | undefined;
      if (session.chronicleRecords) {
        try {
          const records = JSON.parse(session.chronicleRecords) as CampaignRecord[];
          chronicleEvents = records.length;
          if (records.length > 0) {
            campaignAge = records[records.length - 1].tick - records[0].tick;
          }
        } catch {
          // Skip chronicle stats for corrupted data
        }
      }

      // Extract hottest pressure from save
      // Coordinator stitch (slice A3): a v3 save carries no legacy fields — the
      // listing summaries derive from the engineState peek (world-tick
      // pressures, companion-core party, the player entity's leverage) and
      // fall back to the legacy fields for v1/v2 saves.
      let peek: EngineStateZonePeek | undefined;
      try { peek = JSON.parse(session.engineState) as EngineStateZonePeek; } catch { peek = undefined; }
      const peekState = peek?.world?.state;
      let hottestPressure: string | undefined;
      const peekPressures = peekState?.modules?.['world-tick']?.pressures;
      if (peekPressures && peekPressures.length > 0) {
        const hottest = peekPressures.reduce((a, b) => ((a.urgency ?? 0) > (b.urgency ?? 0) ? a : b));
        hottestPressure = hottest.description;
      } else if (session.activePressures) {
        try {
          const pressures = JSON.parse(session.activePressures) as WorldPressure[];
          if (pressures.length > 0) {
            const hottest = pressures.reduce((a, b) => (a.urgency > b.urgency ? a : b));
            hottestPressure = hottest.description;
          }
        } catch {
          // Skip corrupted pressure data
        }
      }

      // Extract companion count from party state
      let companionCount: number | undefined;
      const peekCompanions = peekState?.modules?.['companion-core']?.party?.companions;
      if (peekCompanions && peekCompanions.length > 0) {
        companionCount = peekCompanions.length;
      } else if (session.partyState) {
        try {
          const party = JSON.parse(session.partyState) as { companions?: unknown[] };
          if (party.companions && party.companions.length > 0) {
            companionCount = party.companions.length;
          }
        } catch {
          // Skip corrupted party data
        }
      }

      // Extract last zone name from engine state (F-5feeb5af: see
      // EngineStateZonePeek's doc comment above for why this cast exists).
      let lastZoneName: string | undefined;
      try {
        const engineData = JSON.parse(session.engineState) as EngineStateZonePeek;
        const locationId = engineData?.world?.state?.locationId;
        const zones = engineData?.world?.state?.zones;
        if (locationId && zones && zones[locationId]?.name) {
          lastZoneName = zones[locationId].name;
        }
      } catch {
        // Skip corrupted engine data
      }

      summaries.push({
        filename: file,
        savedAt: session.savedAt,
        characterName: session.characterName,
        characterLevel: session.characterLevel,
        characterTitle: session.characterTitle,
        packId: session.packId,
        tone: session.tone,
        chronicleEvents,
        campaignAge,
        leverageHighlight: session.leverageSnapshot,
        hottestPressure,
        companionCount,
        lastZoneName,
      });
    } catch {
      // Skip corrupted saves
    }
  }

  return summaries.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function getDefaultSaveDir(): string {
  return join(homedir(), '.claude-rpg', 'saves');
}

export function getSavePath(name: string): string {
  return join(getDefaultSaveDir(), `${name}.json`);
}
