// Session management: save/load game state + turn history
// v0.2: character profile persistence
// v0.3: player rumor persistence
// v0.4: world pressure persistence
// v0.5: resolved pressure / fallout persistence
// v0.7: leverage snapshot + enhanced save summaries

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Engine } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import { serializeProfile, deserializeProfile } from '@ai-rpg-engine/character-profile';
import { getLeverageState, formatLeverageStatus, type PlayerRumor, type WorldPressure, type PressureFallout } from '@ai-rpg-engine/modules';
import { CampaignJournal, type CampaignRecord } from '@ai-rpg-engine/campaign-memory';
import { TurnHistory } from './history.js';

export type SavedSession = {
  version: '0.1.0' | '0.2.0' | '0.3.0' | '0.4.0' | '0.5.0' | '0.6.0' | '0.7.0';
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
): Promise<void> {
  // Compute leverage snapshot for save summary
  const leverageSnap = profile
    ? formatLeverageStatus(getLeverageState(profile.custom))
    : undefined;

  const session: SavedSession = {
    version: '0.7.0',
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
  };

  await mkdir(dirname(savePath), { recursive: true });
  await writeFile(savePath, JSON.stringify(session, null, 2), 'utf-8');
}

export async function loadSession(savePath: string): Promise<SavedSession> {
  const raw = await readFile(savePath, 'utf-8');
  return JSON.parse(raw) as SavedSession;
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
