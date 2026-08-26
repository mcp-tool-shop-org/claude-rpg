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
import { CURRENT_SCHEMA_VERSION, migrateSave } from './migrate.js';
import type { Engine } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import { serializeProfile, deserializeProfile } from '@ai-rpg-engine/character-profile';
import { getLeverageState, formatLeverageStatus, type PlayerRumor, type WorldPressure, type PressureFallout, type NpcActionResult, type NpcProfile, type NpcObligationLedger, type ConsequenceChain, type PartyState, createPartyState, type DistrictEconomy, type OpportunityState, type OpportunityFallout, type ArcSnapshot, type EndgameTrigger } from '@ai-rpg-engine/modules';
import { CampaignJournal, type CampaignRecord, type FinaleOutline } from '@ai-rpg-engine/campaign-memory';
import { TurnHistory } from './history.js';

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
  // v0.3.0 fields
  playerRumors?: string;
  // v0.4.0 fields
  activePressures?: string;
  genre?: string;
  // v0.5.0 fields
  resolvedPressures?: string;
  // v0.6.0 fields
  chronicleRecords?: string;
  // v0.7.0 fields
  leverageSnapshot?: string;
  // v0.8.0 fields
  npcAgencySnapshot?: string;
  // v0.9.0 fields
  npcObligations?: string;
  // v1.0.0 fields
  consequenceChains?: string;
  // v1.1.0 fields
  partyState?: string;
  // v1.2.0 fields
  districtEconomies?: string;
  // v1.3.0 fields
  activeOpportunities?: string;
  resolvedOpportunities?: string;
  // v1.4.0 fields
  arcSnapshot?: string;
  endgameTriggers?: string;
  finaleOutline?: string;
  campaignStatus?: 'active' | 'completed';
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

/** PB-005: Single-object input for saveSession — replaces 23 positional params. */
export type SaveSessionInput = {
  engine: Engine;
  history: TurnHistory;
  tone: string;
  savePath: string;
  worldPrompt?: string;
  profile?: CharacterProfile | null;
  packId?: string;
  playerRumors?: PlayerRumor[];
  activePressures?: WorldPressure[];
  genre?: string;
  resolvedPressures?: PressureFallout[];
  journal?: CampaignJournal;
  npcProfiles?: NpcProfile[];
  npcActions?: NpcActionResult[];
  npcObligations?: Map<string, NpcObligationLedger>;
  consequenceChains?: Map<string, ConsequenceChain>;
  partyState?: PartyState;
  districtEconomies?: Map<string, DistrictEconomy>;
  activeOpportunities?: OpportunityState[];
  resolvedOpportunities?: OpportunityFallout[];
  arcSnapshot?: ArcSnapshot | null;
  endgameTriggers?: EndgameTrigger[];
  finaleOutline?: FinaleOutline | null;
  campaignStatus?: 'active' | 'completed';
};

export async function saveSession(input: SaveSessionInput): Promise<void> {
  const {
    engine, history, tone, savePath, worldPrompt, profile, packId,
    playerRumors, activePressures, genre, resolvedPressures, journal,
    npcProfiles, npcActions, npcObligations, consequenceChains,
    partyState, districtEconomies, activeOpportunities, resolvedOpportunities,
    arcSnapshot, endgameTriggers, finaleOutline, campaignStatus,
  } = input;

  // Compute leverage snapshot for save summary
  const leverageSnap = profile
    ? formatLeverageStatus(getLeverageState(profile.custom))
    : undefined;

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
    playerRumors: playerRumors && playerRumors.length > 0
      ? JSON.stringify(playerRumors)
      : undefined,
    activePressures: activePressures && activePressures.length > 0
      ? JSON.stringify(activePressures)
      : undefined,
    genre,
    resolvedPressures: resolvedPressures && resolvedPressures.length > 0
      ? JSON.stringify(resolvedPressures)
      : undefined,
    chronicleRecords: journal && journal.size() > 0
      ? JSON.stringify(journal.serialize())
      : undefined,
    leverageSnapshot: leverageSnap || undefined,
    npcAgencySnapshot: (npcProfiles && npcProfiles.length > 0) || (npcActions && npcActions.length > 0)
      ? JSON.stringify({ profiles: npcProfiles ?? [], actions: npcActions ?? [] })
      : undefined,
    npcObligations: npcObligations && npcObligations.size > 0
      ? JSON.stringify(Object.fromEntries(npcObligations))
      : undefined,
    consequenceChains: consequenceChains && consequenceChains.size > 0
      ? JSON.stringify(Object.fromEntries(consequenceChains))
      : undefined,
    partyState: partyState && partyState.companions.length > 0
      ? JSON.stringify(partyState)
      : undefined,
    districtEconomies: districtEconomies && districtEconomies.size > 0
      ? JSON.stringify(Object.fromEntries(districtEconomies))
      : undefined,
    activeOpportunities: activeOpportunities && activeOpportunities.length > 0
      ? JSON.stringify(activeOpportunities)
      : undefined,
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

/** Load player rumors from a saved session. */
export function loadRumorsFromSession(session: SavedSession): PlayerRumor[] {
  if (!session.playerRumors) return [];
  try {
    return JSON.parse(session.playerRumors) as PlayerRumor[];
  } catch {
    return [];
  }
}

/** Load world pressures from a saved session. */
export function loadPressuresFromSession(session: SavedSession): WorldPressure[] {
  if (!session.activePressures) return [];
  try {
    return JSON.parse(session.activePressures) as WorldPressure[];
  } catch {
    return [];
  }
}

/** Load resolved pressures (fallout history) from a saved session. */
export function loadResolvedPressuresFromSession(session: SavedSession): PressureFallout[] {
  if (!session.resolvedPressures) return [];
  try {
    return JSON.parse(session.resolvedPressures) as PressureFallout[];
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
  } catch {
    return new CampaignJournal();
  }
}

/** Load NPC agency state from a saved session. */
export function loadNpcAgencyFromSession(session: SavedSession): { profiles: NpcProfile[]; actions: NpcActionResult[] } {
  if (!session.npcAgencySnapshot) return { profiles: [], actions: [] };
  try {
    const data = JSON.parse(session.npcAgencySnapshot) as { profiles: NpcProfile[]; actions: NpcActionResult[] };
    return { profiles: data.profiles ?? [], actions: data.actions ?? [] };
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
        console.warn(`[session] Dropping malformed npcObligations entry for "${npcId}" on load — shape mismatch.`);
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
        console.warn(`[session] Dropping malformed consequenceChains entry for "${npcId}" on load — shape mismatch.`);
      }
    }
    return result;
  } catch {
    return new Map();
  }
}

/**
 * F-1357a6e0: shape guard for PartyState. JSON.parse can succeed
 * *syntactically* on a value that is the wrong shape entirely (e.g. the bare
 * number 42) — that only throws if the string isn't valid JSON at all, so a
 * bare `JSON.parse(x) as PartyState` cast trusts it unexamined. Mirrors the
 * isValidPlayerRumor/isValidWorldPressure shape-guard pattern in migrate.ts
 * for this exact class of problem.
 */
function isValidPartyState(value: unknown): value is PartyState {
  if (value == null || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    Array.isArray(p.companions) &&
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

/** Load district economies from a saved session. */
export function loadEconomiesFromSession(
  session: SavedSession,
): Map<string, DistrictEconomy> {
  if (!session.districtEconomies) return new Map();
  try {
    const obj = JSON.parse(session.districtEconomies) as Record<string, DistrictEconomy>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

/** Load active opportunities from a saved session. */
export function loadOpportunitiesFromSession(session: SavedSession): OpportunityState[] {
  if (!session.activeOpportunities) return [];
  try {
    return JSON.parse(session.activeOpportunities) as OpportunityState[];
  } catch {
    return [];
  }
}

/** Load resolved opportunities (fallout history) from a saved session. */
export function loadResolvedOpportunitiesFromSession(session: SavedSession): OpportunityFallout[] {
  if (!session.resolvedOpportunities) return [];
  try {
    return JSON.parse(session.resolvedOpportunities) as OpportunityFallout[];
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

/** Load endgame triggers from a saved session. */
export function loadEndgameTriggersFromSession(session: SavedSession): EndgameTrigger[] {
  if (!session.endgameTriggers) return [];
  try {
    return JSON.parse(session.endgameTriggers) as EndgameTrigger[];
  } catch {
    return [];
  }
}

/** Load finale outline from a saved session. */
export function loadFinaleFromSession(session: SavedSession): FinaleOutline | null {
  if (!session.finaleOutline) return null;
  try {
    return JSON.parse(session.finaleOutline) as FinaleOutline;
  } catch {
    return null;
  }
}

/** List completed (archived) campaigns from save files. */
export async function listArchivedCampaigns(): Promise<ArchivedCampaignSummary[]> {
  const dir = getDefaultSaveDir();
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

      const outline = session.finaleOutline ? JSON.parse(session.finaleOutline) as FinaleOutline : null;
      const arcSnap = session.arcSnapshot ? JSON.parse(session.arcSnapshot) as ArcSnapshot : null;
      const chronicle = session.chronicleRecords ? JSON.parse(session.chronicleRecords) as CampaignRecord[] : [];
      const party = session.partyState ? JSON.parse(session.partyState) as PartyState : null;

      // Top 3 most significant chronicle events as highlights
      const highlights = [...chronicle]
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
        turnCount: outline?.campaignDuration ?? chronicle.length,
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
      let hottestPressure: string | undefined;
      if (session.activePressures) {
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
      if (session.partyState) {
        try {
          const party = JSON.parse(session.partyState) as { companions?: unknown[] };
          if (party.companions && party.companions.length > 0) {
            companionCount = party.companions.length;
          }
        } catch {
          // Skip corrupted party data
        }
      }

      // Extract last zone name from engine state
      let lastZoneName: string | undefined;
      try {
        const engineData = JSON.parse(session.engineState) as {
          world?: { state?: { locationId?: string; zones?: Record<string, { name?: string }> } };
        };
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
