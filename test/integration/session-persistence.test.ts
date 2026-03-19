// Persistence tests: save/load round-trip, corruption handling, write integrity.
// Uses real filesystem via temp directories.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { TurnHistory } from '../../src/session/history.js';
import {
  saveSession,
  loadSession,
  validateSaveShape,
  SaveValidationError,
  loadRumorsFromSession,
  loadPressuresFromSession,
  loadPartyFromSession,
  loadEconomiesFromSession,
  loadArcSnapshotFromSession,
  loadEndgameTriggersFromSession,
  loadFinaleFromSession,
} from '../../src/session/session.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'claude-rpg-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function savePath(name = 'test'): string {
  return join(tmpDir, `${name}.json`);
}

// ─── Round-Trip ───────────────────────────────────────────────

describe('save/load round-trip', () => {
  it('new session saves and loads with required fields intact', async () => {
    const engine = createGame();
    const history = new TurnHistory();
    const path = savePath();

    await saveSession(engine, history, 'dark fantasy', path);
    const loaded = await loadSession(path);

    expect(loaded.version).toBe('1.4.0');
    expect(loaded.tone).toBe('dark fantasy');
    expect(loaded.engineState).toBeTruthy();
    expect(loaded.turnHistory).toBeTruthy();
    expect(loaded.savedAt).toBeTruthy();
    expect(loaded.campaignStatus).toBe('active');
  });

  it('session with history survives round-trip', async () => {
    const engine = createGame();
    const history = new TurnHistory();
    history.record({ tick: 1, playerInput: 'look', verb: 'look', narration: 'You see a chapel.' });
    history.record({ tick: 2, playerInput: 'go nave', verb: 'move', narration: 'You enter the nave.' });

    const path = savePath();
    await saveSession(engine, history, 'dark fantasy', path);
    const loaded = await loadSession(path);

    // turnHistory is TurnRecord[] (from TurnHistory.toJSON())
    const turns = loaded.turnHistory as unknown as Array<{ verb: string }>;
    expect(turns).toHaveLength(2);
    expect(turns[0].verb).toBe('look');
    expect(turns[1].verb).toBe('move');
  });

  it('missing optional fields deserialize to safe defaults', async () => {
    // Simulate an old v0.1.0 save with minimal fields
    const minimal = {
      version: '0.1.0',
      engineState: '{}',
      turnHistory: { turns: [] },
      tone: 'grim',
      savedAt: new Date().toISOString(),
    };
    const path = savePath();
    await writeFile(path, JSON.stringify(minimal), 'utf-8');

    const loaded = await loadSession(path);
    expect(loadRumorsFromSession(loaded)).toEqual([]);
    expect(loadPressuresFromSession(loaded)).toEqual([]);
    expect(loadPartyFromSession(loaded)).toHaveProperty('companions');
    expect(loadEconomiesFromSession(loaded).size).toBe(0);
    expect(loadArcSnapshotFromSession(loaded)).toBeNull();
    expect(loadEndgameTriggersFromSession(loaded)).toEqual([]);
    expect(loadFinaleFromSession(loaded)).toBeNull();
  });

  it('engine state serialization is preserved', async () => {
    const engine = createGame();
    // Move to a different zone to change state
    engine.submitAction('move', { targetIds: ['chapel-nave'] });

    const path = savePath();
    const history = new TurnHistory();
    await saveSession(engine, history, 'dark fantasy', path);

    const loaded = await loadSession(path);
    // Engine state should contain the zone we moved to
    expect(loaded.engineState).toContain('chapel-nave');
  });
});

// ─── Corruption and Validation ────────────────────────────────

describe('save corruption handling', () => {
  it('malformed JSON returns SaveValidationError, not crash', async () => {
    const path = savePath();
    await writeFile(path, 'this is not json {{{', 'utf-8');

    await expect(loadSession(path)).rejects.toThrow(SaveValidationError);
    await expect(loadSession(path)).rejects.toThrow('not valid JSON');
  });

  it('empty file returns SaveValidationError', async () => {
    const path = savePath();
    await writeFile(path, '', 'utf-8');

    await expect(loadSession(path)).rejects.toThrow(SaveValidationError);
  });

  it('JSON array instead of object is rejected', async () => {
    const path = savePath();
    await writeFile(path, '[]', 'utf-8');

    await expect(loadSession(path)).rejects.toThrow(SaveValidationError);
    await expect(loadSession(path)).rejects.toThrow('not a JSON object');
  });

  it('missing version field is rejected', async () => {
    const path = savePath();
    await writeFile(path, JSON.stringify({ tone: 'x', engineState: '{}', turnHistory: {}, savedAt: 'x' }), 'utf-8');

    await expect(loadSession(path)).rejects.toThrow(SaveValidationError);
    await expect(loadSession(path)).rejects.toThrow('version');
  });

  it('missing engineState field is rejected', async () => {
    const path = savePath();
    await writeFile(path, JSON.stringify({ version: '1.0.0', tone: 'x', turnHistory: {}, savedAt: 'x' }), 'utf-8');

    await expect(loadSession(path)).rejects.toThrow(SaveValidationError);
    await expect(loadSession(path)).rejects.toThrow('engineState');
  });

  it('missing tone field is rejected', async () => {
    const path = savePath();
    await writeFile(path, JSON.stringify({ version: '1.0.0', engineState: '{}', turnHistory: {}, savedAt: 'x' }), 'utf-8');

    await expect(loadSession(path)).rejects.toThrow(SaveValidationError);
    await expect(loadSession(path)).rejects.toThrow('tone');
  });

  it('truncated JSON is detected', async () => {
    const path = savePath();
    await writeFile(path, '{"version":"1.0.0","engineState":"{}","turnHisto', 'utf-8');

    await expect(loadSession(path)).rejects.toThrow(SaveValidationError);
  });

  it('nonexistent file throws filesystem error', async () => {
    await expect(loadSession(join(tmpDir, 'nope.json'))).rejects.toThrow();
  });

  it('corrupted optional fields fall back to defaults', async () => {
    const save = {
      version: '1.4.0',
      engineState: '{}',
      turnHistory: { turns: [] },
      tone: 'grim',
      savedAt: new Date().toISOString(),
      playerRumors: 'NOT VALID JSON!!',
      activePressures: '{broken',
      partyState: '42',
    };
    const path = savePath();
    await writeFile(path, JSON.stringify(save), 'utf-8');

    const loaded = await loadSession(path);
    // Should not crash — individual loaders catch and return defaults
    expect(loadRumorsFromSession(loaded)).toEqual([]);
    expect(loadPressuresFromSession(loaded)).toEqual([]);
  });
});

// ─── validateSaveShape unit tests ─────────────────────────────

describe('validateSaveShape', () => {
  it('accepts a valid minimal save', () => {
    const valid = {
      version: '1.4.0',
      engineState: '{}',
      turnHistory: { turns: [] },
      tone: 'dark',
      savedAt: '2026-01-01T00:00:00Z',
    };
    expect(() => validateSaveShape(valid)).not.toThrow();
  });

  it('rejects null', () => {
    expect(() => validateSaveShape(null)).toThrow(SaveValidationError);
  });

  it('rejects string', () => {
    expect(() => validateSaveShape('hello')).toThrow(SaveValidationError);
  });
});

// ─── Write Integrity ──────────────────────────────────────────

describe('write integrity', () => {
  it('save creates .bak of previous file', async () => {
    const engine = createGame();
    const history = new TurnHistory();
    const path = savePath();

    // First save
    await saveSession(engine, history, 'dark fantasy', path);
    const firstContent = await readFile(path, 'utf-8');

    // Second save (should create .bak)
    history.record({ tick: 1, playerInput: 'look', verb: 'look', narration: 'test' });
    await saveSession(engine, history, 'dark fantasy', path);

    const bakContent = await readFile(path + '.bak', 'utf-8');
    const secondContent = await readFile(path, 'utf-8');

    // Backup matches first save
    expect(bakContent).toBe(firstContent);
    // Current save is different (has history)
    expect(secondContent).not.toBe(firstContent);
  });

  it('save does not leave temp files on success', async () => {
    const engine = createGame();
    const history = new TurnHistory();
    const path = savePath();

    await saveSession(engine, history, 'dark fantasy', path);

    const files = await readdir(tmpDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp.'));
    expect(tmpFiles).toHaveLength(0);
  });

  it('save creates parent directories', async () => {
    const engine = createGame();
    const history = new TurnHistory();
    const deepPath = join(tmpDir, 'a', 'b', 'c', 'save.json');

    await saveSession(engine, history, 'dark fantasy', deepPath);
    const loaded = await loadSession(deepPath);
    expect(loaded.version).toBe('1.4.0');
  });
});
