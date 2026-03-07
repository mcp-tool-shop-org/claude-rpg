// Session management: save/load game state + turn history

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Engine } from '@ai-rpg-engine/core';
import { TurnHistory } from './history.js';

export type SavedSession = {
  version: '0.1.0';
  engineState: string;
  turnHistory: ReturnType<TurnHistory['toJSON']>;
  worldPrompt?: string;
  tone: string;
  savedAt: string;
};

export async function saveSession(
  engine: Engine,
  history: TurnHistory,
  tone: string,
  savePath: string,
  worldPrompt?: string,
): Promise<void> {
  const session: SavedSession = {
    version: '0.1.0',
    engineState: engine.serialize(),
    turnHistory: history.toJSON(),
    worldPrompt,
    tone,
    savedAt: new Date().toISOString(),
  };

  await mkdir(dirname(savePath), { recursive: true });
  await writeFile(savePath, JSON.stringify(session, null, 2), 'utf-8');
}

export async function loadSession(savePath: string): Promise<SavedSession> {
  const raw = await readFile(savePath, 'utf-8');
  return JSON.parse(raw) as SavedSession;
}

export function getDefaultSaveDir(): string {
  return join(process.cwd(), '.claude-rpg', 'saves');
}

export function getSavePath(name: string): string {
  return join(getDefaultSaveDir(), `${name}.json`);
}
