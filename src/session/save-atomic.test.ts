// Tests for PB-002 (atomic save) and PB-005 (SaveSessionInput object)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, readFile, stat, mkdir, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { saveSession, loadSession, type SaveSessionInput } from './session.js';
import { TurnHistory } from './history.js';

// Minimal engine mock for save/load round-trip
function createMockEngine() {
  const state = JSON.stringify({ world: { zones: {}, entities: {}, factions: {}, locationId: 'z1', playerId: 'p1' }, tick: 0 });
  return {
    serialize: () => state,
    world: { zones: {}, entities: {}, factions: {}, locationId: 'z1', playerId: 'p1' },
    tick: 0,
  } as any;
}

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), 'claude-rpg-test-' + randomBytes(4).toString('hex'));
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  try { await rm(testDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('saveSession with SaveSessionInput (PB-005)', () => {
  it('accepts a single object instead of positional params', async () => {
    const savePath = join(testDir, 'save.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'dark fantasy',
      savePath,
    };
    await saveSession(input);

    const raw = await readFile(savePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.tone).toBe('dark fantasy');
    expect(data.schemaVersion).toBeGreaterThan(0);
  });

  it('includes optional fields when provided', async () => {
    const savePath = join(testDir, 'save2.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'cyberpunk',
      savePath,
      genre: 'sci-fi',
      packId: 'test-pack',
      campaignStatus: 'completed',
    };
    await saveSession(input);

    const raw = await readFile(savePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.genre).toBe('sci-fi');
    expect(data.packId).toBe('test-pack');
    expect(data.campaignStatus).toBe('completed');
  });
});

describe('atomic save race-condition protection (PB-002)', () => {
  it('creates .bak when overwriting an existing save', async () => {
    const savePath = join(testDir, 'save.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'dark fantasy',
      savePath,
    };

    // First save
    await saveSession(input);
    const firstContent = await readFile(savePath, 'utf-8');

    // Second save — should create .bak
    await saveSession({ ...input, tone: 'light comedy' });
    const bakContent = await readFile(savePath + '.bak', 'utf-8');
    const newContent = await readFile(savePath, 'utf-8');

    // Backup should contain the first save's data
    expect(JSON.parse(bakContent).tone).toBe('dark fantasy');
    expect(JSON.parse(newContent).tone).toBe('light comedy');
  });

  it('first save works without .bak file', async () => {
    const savePath = join(testDir, 'fresh.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'horror',
      savePath,
    };
    await saveSession(input);

    // No .bak should exist for first save
    let bakExists = false;
    try { await stat(savePath + '.bak'); bakExists = true; } catch { /* expected */ }
    expect(bakExists).toBe(false);

    // Save file should exist
    const data = JSON.parse(await readFile(savePath, 'utf-8'));
    expect(data.tone).toBe('horror');
  });

  it('cleans up tmp files on success', async () => {
    const savePath = join(testDir, 'clean.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'test',
      savePath,
    };
    await saveSession(input);

    // No .tmp. files should remain
    const files = await readdir(testDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp.'));
    expect(tmpFiles).toHaveLength(0);
  });
});
