// Migration tests: fixture-driven round-trips, version detection, rejection, chronicle continuity.
// Uses real fixtures from test/fixtures/saves/.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  detectSchemaVersion,
  validateVersion,
  migrateSave,
  CURRENT_SCHEMA_VERSION,
} from '../../src/session/migrate.js';
import {
  loadSession,
  SaveValidationError,
  loadRumorsFromSession,
  loadPressuresFromSession,
  loadChronicleFromSession,
} from '../../src/session/session.js';

const FIXTURES = join(__dirname, '..', 'fixtures', 'saves');

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'claude-rpg-migrate-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

/** Copy a fixture to a temp path for loadSession (which needs a real file). */
async function fixtureToTmp(name: string): Promise<string> {
  const src = join(FIXTURES, name);
  const dest = join(tmpDir, name);
  await copyFile(src, dest);
  return dest;
}

// ─── detectSchemaVersion ─────────────────────────────────────

describe('detectSchemaVersion', () => {
  it('returns 1 for legacy string version', () => {
    expect(detectSchemaVersion({ version: '0.1.0' })).toBe(1);
    expect(detectSchemaVersion({ version: '1.4.0' })).toBe(1);
  });

  it('returns integer schemaVersion when present', () => {
    expect(detectSchemaVersion({ schemaVersion: 2 })).toBe(2);
    expect(detectSchemaVersion({ schemaVersion: 5 })).toBe(5);
  });

  it('prefers schemaVersion over string version', () => {
    expect(detectSchemaVersion({ schemaVersion: 2, version: '0.1.0' })).toBe(2);
  });

  it('throws on missing version metadata', () => {
    expect(() => detectSchemaVersion({ tone: 'dark' })).toThrow(SaveValidationError);
    expect(() => detectSchemaVersion({})).toThrow('no recognizable version');
  });

  it('throws on non-semver string version', () => {
    expect(() => detectSchemaVersion({ version: 'abc' })).toThrow(SaveValidationError);
  });
});

// ─── validateVersion ─────────────────────────────────────────

describe('validateVersion', () => {
  it('accepts current and past versions', () => {
    expect(() => validateVersion(1)).not.toThrow();
    expect(() => validateVersion(CURRENT_SCHEMA_VERSION)).not.toThrow();
  });

  it('rejects future versions', () => {
    expect(() => validateVersion(99)).toThrow(SaveValidationError);
    expect(() => validateVersion(99)).toThrow('newer version');
  });

  it('rejects version 0 and negative', () => {
    expect(() => validateVersion(0)).toThrow(SaveValidationError);
    expect(() => validateVersion(-1)).toThrow(SaveValidationError);
  });
});

// ─── migrateSave pipeline ────────────────────────────────────

describe('migrateSave', () => {
  it('v1 minimal → v2 with correct metadata', () => {
    const raw = { version: '0.1.0', engineState: '{}', turnHistory: { turns: [] }, tone: 'grim', savedAt: '2026-01-01T00:00:00Z' };
    const result = migrateSave(raw);

    expect(result.sourceVersion).toBe(1);
    expect(result.targetVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.stepsApplied).toBe(1);
    expect(result.data.schemaVersion).toBe(2);
    expect(result.data.createdWithVersion).toBe('0.1.0');
    expect(result.data.campaignStatus).toBe('active');
  });

  it('v1 rich → v2 preserves all optional fields', () => {
    const raw = JSON.parse('{"version":"1.4.0","engineState":"{}","turnHistory":{"turns":[]},"tone":"dark","savedAt":"2026-01-01T00:00:00Z","playerRumors":"[]","activePressures":"[]","chronicleRecords":"[]","campaignStatus":"active"}');
    const result = migrateSave(raw);

    expect(result.data.schemaVersion).toBe(2);
    expect(result.data.playerRumors).toBe('[]');
    expect(result.data.activePressures).toBe('[]');
    expect(result.data.chronicleRecords).toBe('[]');
    expect(result.data.campaignStatus).toBe('active');
  });

  it('v1 without campaignStatus gets default "active"', () => {
    const raw = { version: '1.2.0', engineState: '{}', turnHistory: { turns: [] }, tone: 'x', savedAt: 'x' };
    const result = migrateSave(raw);
    expect(result.data.campaignStatus).toBe('active');
  });

  it('v2 passes through with zero steps', () => {
    const raw = { schemaVersion: 2, version: '1.4.0', engineState: '{}', turnHistory: { turns: [] }, tone: 'dark', savedAt: 'x' };
    const result = migrateSave(raw);

    expect(result.sourceVersion).toBe(2);
    expect(result.stepsApplied).toBe(0);
    expect(result.data).toEqual(raw);
  });

  it('future version is rejected', () => {
    const raw = { schemaVersion: 99, version: '99.0.0', engineState: '{}', turnHistory: { turns: [] }, tone: 'x', savedAt: 'x' };
    expect(() => migrateSave(raw)).toThrow(SaveValidationError);
    expect(() => migrateSave(raw)).toThrow('newer version');
  });

  it('no version metadata is rejected', () => {
    const raw = { engineState: '{}', turnHistory: { turns: [] }, tone: 'x', savedAt: 'x' };
    expect(() => migrateSave(raw)).toThrow(SaveValidationError);
  });
});

// ─── Fixture-driven loadSession round-trips ──────────────────

describe('fixture round-trips via loadSession', () => {
  it('v1-minimal loads and migrates', async () => {
    const path = await fixtureToTmp('v1-minimal.json');
    const result = await loadSession(path);

    expect(result.migrated).toBe(true);
    expect(result.sourceVersion).toBe(1);
    expect(result.stepsApplied).toBe(1);
    expect(result.session.schemaVersion).toBe(2);
    expect(result.session.tone).toBe('grim');
  });

  it('v1-rich loads with all optional data intact', async () => {
    const path = await fixtureToTmp('v1-rich.json');
    const result = await loadSession(path);

    expect(result.migrated).toBe(true);
    const session = result.session;
    expect(session.characterName).toBe('Aldric');
    expect(session.characterLevel).toBe(3);

    // Optional systems survived migration
    const rumors = loadRumorsFromSession(session);
    expect(rumors).toHaveLength(1);
    expect(rumors[0].text).toContain('sealed crypt');

    const pressures = loadPressuresFromSession(session);
    expect(pressures).toHaveLength(1);

    const journal = loadChronicleFromSession(session);
    expect(journal.size()).toBe(2);
  });

  it('v1-no-campaign-status gets default after migration', async () => {
    const path = await fixtureToTmp('v1-no-campaign-status.json');
    const result = await loadSession(path);

    expect(result.migrated).toBe(true);
    expect(result.session.campaignStatus).toBe('active');
    expect(result.session.characterName).toBe('Brynn');
  });

  it('v2-current loads without migration', async () => {
    const path = await fixtureToTmp('v2-current.json');
    const result = await loadSession(path);

    expect(result.migrated).toBe(false);
    expect(result.stepsApplied).toBe(0);
    expect(result.session.schemaVersion).toBe(2);
    expect(result.session.characterName).toBe('Aldric');
  });

  it('future-v99 is rejected', async () => {
    const path = await fixtureToTmp('future-v99.json');
    await expect(loadSession(path)).rejects.toThrow(SaveValidationError);
    await expect(loadSession(path)).rejects.toThrow('newer version');
  });

  it('no-version is rejected', async () => {
    const path = await fixtureToTmp('no-version.json');
    await expect(loadSession(path)).rejects.toThrow(SaveValidationError);
  });
});

// ─── Chronicle continuity across migration ───────────────────

describe('chronicle continuity across v1→v2', () => {
  it('chronicle records survive migration intact', async () => {
    const path = await fixtureToTmp('v1-rich.json');
    const result = await loadSession(path);
    const journal = loadChronicleFromSession(result.session);

    // 2 records in fixture (cr_1, cr_2)
    expect(journal.size()).toBe(2);
    const records = journal.serialize();
    expect(records).toHaveLength(2);
    expect(records[0].id).toBe('cr_1');
    expect(records[1].id).toBe('cr_2');
  });

  it('empty chronicle is safe after migration', async () => {
    const path = await fixtureToTmp('v1-minimal.json');
    const result = await loadSession(path);
    const journal = loadChronicleFromSession(result.session);
    expect(journal.size()).toBe(0);
  });
});
