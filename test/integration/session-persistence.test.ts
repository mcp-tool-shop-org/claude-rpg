// Persistence tests: save/load round-trip, corruption handling, write integrity.
// Uses real filesystem via temp directories.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// F-b7e5bb95: control flags let individual tests force node:fs/promises's
// rename() to fail at specific points inside saveSession()'s atomic-write
// sequence (src/session/session.ts's Step 3 tmp -> save rename, and its
// "best effort" backup-restore recovery attempt in that step's catch
// block), while every other rename() call -- and every other fs/promises
// function used by this file and by session.ts -- keeps its real behavior.
// vi.hoisted() is required because vi.mock() factories run before normal
// module-scope const/let bindings would otherwise be initialized.
const renameControl = vi.hoisted(() => ({
  failNextTmpRename: false,
  failNextBakRestore: false,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: vi.fn(async (...args: Parameters<typeof actual.rename>) => {
      const src = String(args[0]);
      // session.ts's Step 3 is rename(tmpPath, savePath); tmpPath is always
      // `${savePath}.tmp.${randomHex}`, so '.tmp.' in the source uniquely
      // identifies this call versus the Step 2 backup rename (savePath ->
      // .bak) and the backup-restore rename below, neither of which ever
      // has '.tmp.' in its source path.
      if (renameControl.failNextTmpRename && src.includes('.tmp.')) {
        renameControl.failNextTmpRename = false;
        throw new Error('simulated rename failure (tmp -> save)');
      }
      // The backup-restore rename (bakPath -> savePath, inside Step 3's own
      // catch block) is the only rename() call whose source ends in '.bak'.
      if (renameControl.failNextBakRestore && src.endsWith('.bak')) {
        renameControl.failNextBakRestore = false;
        throw new Error('simulated rename failure (backup restore)');
      }
      return actual.rename(...args);
    }),
  };
});

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
  // Defensive reset: the one-shot flags are cleared by the mock itself the
  // moment they trigger, but a test that fails before triggering one (or an
  // assertion that throws first) could otherwise leave a flag set and bleed
  // into the next test.
  renameControl.failNextTmpRename = false;
  renameControl.failNextBakRestore = false;
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

    await saveSession({ engine, history, tone: 'dark fantasy', savePath: path });
    const result = await loadSession(path);
    const loaded = result.session;

    expect(loaded.schemaVersion).toBe(3) /* stitch: schema v3 (slice A3) */;
    expect(loaded.tone).toBe('dark fantasy');
    expect(loaded.engineState).toBeTruthy();
    expect(loaded.turnHistory).toBeTruthy();
    expect(loaded.savedAt).toBeTruthy();
    expect(loaded.campaignStatus).toBe('active');
    expect(result.migrated).toBe(false);
  });

  it('session with history survives round-trip', async () => {
    const engine = createGame();
    const history = new TurnHistory();
    history.record({ tick: 1, playerInput: 'look', verb: 'look', narration: 'You see a chapel.' });
    history.record({ tick: 2, playerInput: 'go nave', verb: 'move', narration: 'You enter the nave.' });

    const path = savePath();
    await saveSession({ engine, history, tone: 'dark fantasy', savePath: path });
    const result = await loadSession(path);
    const loaded = result.session;

    // turnHistory is { turns: TurnRecord[], ... } (from TurnHistory.toJSON())
    const turnData = loaded.turnHistory as unknown as { turns: Array<{ verb: string }> };
    const turns = turnData.turns;
    expect(turns).toHaveLength(2);
    expect(turns[0].verb).toBe('look');
    expect(turns[1].verb).toBe('move');
  });

  it('missing optional fields deserialize to safe defaults', async () => {
    // Simulate an old v0.1.0 save with minimal fields (schema v1 — will be migrated)
    const minimal = {
      version: '0.1.0',
      engineState: '{}',
      turnHistory: { turns: [] },
      tone: 'grim',
      savedAt: new Date().toISOString(),
    };
    const path = savePath();
    await writeFile(path, JSON.stringify(minimal), 'utf-8');

    const result = await loadSession(path);
    expect(result.migrated).toBe(true);
    const loaded = result.session;
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
    await saveSession({ engine, history, tone: 'dark fantasy', savePath: path });

    const result = await loadSession(path);
    // Engine state should contain the zone we moved to
    expect(result.session.engineState).toContain('chapel-nave');
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
    // No version or schemaVersion — migration can't detect schema
    await writeFile(path, JSON.stringify({ tone: 'x', engineState: '{}', turnHistory: {}, savedAt: 'x' }), 'utf-8');

    await expect(loadSession(path)).rejects.toThrow(SaveValidationError);
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

    const result = await loadSession(path);
    const loaded = result.session;
    // Should not crash — individual loaders catch and return defaults
    expect(loadRumorsFromSession(loaded)).toEqual([]);
    expect(loadPressuresFromSession(loaded)).toEqual([]);
    // partyState: '42' is valid JSON but not a valid PartyState (F-1357a6e0) —
    // isValidPartyState's guard (session.ts) should fall back to the default
    // party shape the same way the round-trip test above verifies at line 95.
    expect(loadPartyFromSession(loaded)).toHaveProperty('companions');
  });
});

// ─── validateSaveShape unit tests ─────────────────────────────

describe('validateSaveShape', () => {
  it('accepts a valid minimal save', () => {
    const valid = {
      schemaVersion: 2,
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
    await saveSession({ engine, history, tone: 'dark fantasy', savePath: path });
    const firstContent = await readFile(path, 'utf-8');

    // Second save (should create .bak)
    history.record({ tick: 1, playerInput: 'look', verb: 'look', narration: 'test' });
    await saveSession({ engine, history, tone: 'dark fantasy', savePath: path });

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

    await saveSession({ engine, history, tone: 'dark fantasy', savePath: path });

    const files = await readdir(tmpDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp.'));
    expect(tmpFiles).toHaveLength(0);
  });

  it('save creates parent directories', async () => {
    const engine = createGame();
    const history = new TurnHistory();
    const deepPath = join(tmpDir, 'a', 'b', 'c', 'save.json');

    await saveSession({ engine, history, tone: 'dark fantasy', savePath: deepPath });
    const result = await loadSession(deepPath);
    expect(result.session.schemaVersion).toBe(3) /* stitch: schema v3 (slice A3) */;
  });
});

// ─── Write Integrity — Rename-Failure Recovery (F-b7e5bb95) ───
//
// The success-path tests above never force a failure inside saveSession()'s
// write-tmp -> rename-to-.bak -> rename-tmp-to-final sequence, so neither
// direction of its recovery logic (src/session/session.ts:255-264) was ever
// verified: does restoring the .bak actually put the original save back
// when the final rename fails, and what happens to the player's save if
// the restore-of-backup ALSO fails. Both cases mock only node:fs/promises's
// rename() (see renameControl above) -- every other write in the sequence
// runs against the real filesystem via the shared tmpDir.

describe('write integrity: rename failure recovery', () => {
  it('restores the previous save from .bak when the tmp -> save rename fails, and the failure surfaces to the caller', async () => {
    const engine = createGame();
    const history = new TurnHistory();
    const path = savePath();

    // Establish a real, successful first save to recover back to.
    await saveSession({ engine, history, tone: 'dark fantasy', savePath: path });
    const firstContent = await readFile(path, 'utf-8');

    // Force only this second save's Step 3 rename (tmp -> save) to fail.
    // Step 2 (save -> .bak) and the Step-3-catch backup-restore rename
    // (.bak -> save) both run for real and are expected to succeed.
    history.record({ tick: 1, playerInput: 'look', verb: 'look', narration: 'test' });
    renameControl.failNextTmpRename = true;

    await expect(
      saveSession({ engine, history, tone: 'dark fantasy', savePath: path }),
    ).rejects.toThrow('simulated rename failure (tmp -> save)');

    // The failed save must not have clobbered the original: session.ts's
    // "Step 3 failed -- restore backup if we moved it" should have put the
    // first save's content back at `path`.
    const contentAfterFailure = await readFile(path, 'utf-8');
    expect(contentAfterFailure).toBe(firstContent);

    // And it must still be a valid, loadable save -- not just byte-identical.
    const result = await loadSession(path);
    expect(result.session.schemaVersion).toBe(3) /* stitch: schema v3 (slice A3) */;

    // No leaked tmp file from the failed attempt (session.ts's outer catch
    // unlinks tmpPath on any failure).
    const files = await readdir(tmpDir);
    expect(files.filter((f) => f.includes('.tmp.'))).toHaveLength(0);
  });

  it('leaves the save discoverable at .bak, not silently lost, when the backup-restore rename also fails', async () => {
    const engine = createGame();
    const history = new TurnHistory();
    const path = savePath();

    await saveSession({ engine, history, tone: 'dark fantasy', savePath: path });
    const firstContent = await readFile(path, 'utf-8');

    history.record({ tick: 1, playerInput: 'look', verb: 'look', narration: 'test' });
    renameControl.failNextTmpRename = true;
    renameControl.failNextBakRestore = true;

    // session.ts's backup-restore attempt is wrapped in an empty catch
    // ("best effort", no re-throw/log) -- when it ALSO fails, the ORIGINAL
    // Step 3 error must still be the one that reaches the caller, not
    // something the restore failure swallows in its place.
    await expect(
      saveSession({ engine, history, tone: 'dark fantasy', savePath: path }),
    ).rejects.toThrow('simulated rename failure (tmp -> save)');

    // The content is not lost -- it survives at .bak, even though nothing
    // is left at the primary path. This is the discoverability the finding
    // calls for: a human (or recovery tooling) can find it at <path>.bak
    // instead of it vanishing with no trace anywhere.
    await expect(readFile(path, 'utf-8')).rejects.toThrow();
    const bakContent = await readFile(path + '.bak', 'utf-8');
    expect(bakContent).toBe(firstContent);

    // No leaked tmp file even in this double-failure branch.
    const files = await readdir(tmpDir);
    expect(files.filter((f) => f.includes('.tmp.'))).toHaveLength(0);
  });
});
