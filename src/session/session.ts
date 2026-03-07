// Session management: save/load game state + turn history
// v0.2: character profile persistence

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Engine } from '@ai-rpg-engine/core';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import { serializeProfile, deserializeProfile } from '@ai-rpg-engine/character-profile';
import { TurnHistory } from './history.js';

export type SavedSession = {
  version: '0.1.0' | '0.2.0';
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
};

export type SaveSlotSummary = {
  filename: string;
  savedAt: string;
  characterName?: string;
  characterLevel?: number;
  characterTitle?: string;
  packId?: string;
  tone: string;
};

export async function saveSession(
  engine: Engine,
  history: TurnHistory,
  tone: string,
  savePath: string,
  worldPrompt?: string,
  profile?: CharacterProfile | null,
  packId?: string,
): Promise<void> {
  const session: SavedSession = {
    version: '0.2.0',
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
      summaries.push({
        filename: file,
        savedAt: session.savedAt,
        characterName: session.characterName,
        characterLevel: session.characterLevel,
        characterTitle: session.characterTitle,
        packId: session.packId,
        tone: session.tone,
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
