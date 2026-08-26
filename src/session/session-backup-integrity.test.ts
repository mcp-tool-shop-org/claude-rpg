// Regression test for F-41805a5a: saveSession() must not silently skip the
// .bak backup when a previous save genuinely exists but the rename(savePath,
// bakPath) step fails for a reason other than "no previous save" (e.g. a
// transient file lock from antivirus/indexing/cloud-sync). Swallowing that
// failure and proceeding to step 3 would overwrite the original save with no
// backup ever created, defeating the atomic-save/backup guarantee (PB-002).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: vi.fn(actual.rename),
  };
});

import { rename, readFile, mkdir, rm, stat } from 'node:fs/promises';
import { saveSession, type SaveSessionInput } from './session.js';
import { TurnHistory } from './history.js';

const mockedRename = vi.mocked(rename);

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
  testDir = join(tmpdir(), 'claude-rpg-test-bak-' + randomBytes(4).toString('hex'));
  await mkdir(testDir, { recursive: true });
  mockedRename.mockClear();
});

afterEach(async () => {
  try { await rm(testDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('saveSession backup-failure surfacing (F-41805a5a)', () => {
  it('does not silently overwrite the save when a previous save exists but the .bak rename fails', async () => {
    const savePath = join(testDir, 'save.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'dark fantasy',
      savePath,
    };

    // First save establishes a previous save on disk (real fs — rename delegates to actual).
    await saveSession(input);
    const firstContent = await readFile(savePath, 'utf-8');

    // Force the very next rename() call — savePath -> bakPath in step 2 — to
    // fail with a non-ENOENT error, simulating a previous save that exists
    // but can't be backed up (e.g. a transient lock).
    mockedRename.mockImplementationOnce(async () => {
      const err = new Error('EBUSY: resource busy or locked') as NodeJS.ErrnoException;
      err.code = 'EBUSY';
      throw err;
    });

    await expect(saveSession({ ...input, tone: 'light comedy' })).rejects.toThrow(/EBUSY/);

    // The original save must remain exactly as it was — no silent overwrite
    // without a backup having been created.
    const afterContent = await readFile(savePath, 'utf-8');
    expect(afterContent).toBe(firstContent);

    // No .bak should exist — it was never successfully created.
    let bakExists = false;
    try { await stat(savePath + '.bak'); bakExists = true; } catch { /* expected */ }
    expect(bakExists).toBe(false);
  });

  it('still treats a genuinely absent previous save (ENOENT) as a first-time save', async () => {
    const savePath = join(testDir, 'fresh.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'horror',
      savePath,
    };

    await saveSession(input);

    let bakExists = false;
    try { await stat(savePath + '.bak'); bakExists = true; } catch { /* expected */ }
    expect(bakExists).toBe(false);

    const data = JSON.parse(await readFile(savePath, 'utf-8'));
    expect(data.tone).toBe('horror');
  });
});
