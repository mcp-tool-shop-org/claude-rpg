// Session management: save/load game state + turn history
// v0.2: character profile persistence
// v0.3: player rumor persistence
// v0.4: world pressure persistence
// v0.5: resolved pressure / fallout persistence
// v0.7: leverage snapshot + enhanced save summaries

import { readFile, writeFile, mkdir, readdir, rename, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
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
};

export async function saveSession(
  engine: Engine,
  history: TurnHistory,
  tone: string,
  savePath: string,
  worldPrompt?: string,
  profile?: CharacterProfile | null,
  packId?: string,
  playerRumors?: PlayerRumor[],
  activePressures?: WorldPressure[],
  genre?: string,
  resolvedPressures?: PressureFallout[],
  journal?: CampaignJournal,
  npcProfiles?: NpcProfile[],
  npcActions?: NpcActionResult[],
  npcObligations?: Map<string, NpcObligationLedger>,
  consequenceChains?: Map<string, ConsequenceChain>,
  partyState?: PartyState,
  districtEconomies?: Map<string, DistrictEconomy>,
  activeOpportunities?: OpportunityState[],
  resolvedOpportunities?: OpportunityFallout[],
  arcSnapshot?: ArcSnapshot | null,
  endgameTriggers?: EndgameTrigger[],
  finaleOutline?: FinaleOutline | null,
  campaignStatus?: 'active' | 'completed',
): Promise<void> {
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

  // Atomic write: temp file → rename prevents corruption from interrupted writes
  const tmpPath = savePath + '.tmp.' + randomBytes(4).toString('hex');
  const json = JSON.stringify(session, null, 2);
  await writeFile(tmpPath, json, 'utf-8');

  // Keep one-deep backup of the previous save
  try {
    await readFile(savePath, 'utf-8'); // check if previous exists
    const bakPath = savePath + '.bak';
    try { await unlink(bakPath); } catch { /* no previous backup */ }
    await rename(savePath, bakPath);
  } catch {
    // No previous save — first write
  }

  await rename(tmpPath, savePath);
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

export async function loadSession(savePath: string): Promise<LoadResult> {
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

/** Load NPC obligations from a saved session. */
export function loadObligationsFromSession(
  session: SavedSession,
): Map<string, NpcObligationLedger> {
  if (!session.npcObligations) return new Map();
  try {
    const obj = JSON.parse(session.npcObligations) as Record<string, NpcObligationLedger>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

/** Load consequence chains from a saved session. */
export function loadConsequenceChainsFromSession(
  session: SavedSession,
): Map<string, ConsequenceChain> {
  if (!session.consequenceChains) return new Map();
  try {
    const obj = JSON.parse(session.consequenceChains) as Record<string, ConsequenceChain>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

/** Load party state from a saved session. */
export function loadPartyFromSession(session: SavedSession): PartyState {
  if (!session.partyState) return createPartyState();
  try {
    return JSON.parse(session.partyState) as PartyState;
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

/** Load arc snapshot from a saved session. */
export function loadArcSnapshotFromSession(session: SavedSession): ArcSnapshot | null {
  if (!session.arcSnapshot) return null;
  try {
    return JSON.parse(session.arcSnapshot) as ArcSnapshot;
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
      });
    } catch {
      // Skip corrupted saves
    }
  }

  return summaries.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function getDefaultSaveDir(): string {
  return join(process.cwd(), '.claude-rpg', 'saves');
}

export function getSavePath(name: string): string {
  return join(getDefaultSaveDir(), `${name}.json`);
}
