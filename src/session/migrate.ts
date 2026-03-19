// migrate.ts: Ordered save migration pipeline.
// Detects schema version, applies sequential migrations, returns canonical shape.
// Pure functions — no runtime state, no filesystem, no client.

import { SaveValidationError } from './session.js';

/** Current schema version. Increment when save shape changes. */
export const CURRENT_SCHEMA_VERSION = 2;

export type MigrationResult = {
  data: Record<string, unknown>;
  sourceVersion: number;
  targetVersion: number;
  stepsApplied: number;
};

/**
 * Detect the schema version of a raw save object.
 * Returns the integer schema version, or throws if unsupported.
 */
export function detectSchemaVersion(data: Record<string, unknown>): number {
  // New-style: explicit integer schemaVersion
  if (typeof data.schemaVersion === 'number') {
    return data.schemaVersion;
  }

  // Legacy: string version field ('0.1.0' through '1.4.0')
  if (typeof data.version === 'string' && /^\d+\.\d+\.\d+$/.test(data.version)) {
    return 1;
  }

  throw new SaveValidationError(
    'Save file has no recognizable version field. Cannot determine schema version.',
  );
}

/**
 * Validate that the detected version is within supported range.
 * Throws on future versions (too new) and completely unknown formats.
 */
export function validateVersion(version: number): void {
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new SaveValidationError(
      `This save was created with a newer version of claude-rpg (schema v${version}). ` +
      `This version supports up to schema v${CURRENT_SCHEMA_VERSION}. Please upgrade.`,
    );
  }
  if (version < 1) {
    throw new SaveValidationError(
      `Unsupported save schema version: ${version}. Minimum supported is 1.`,
    );
  }
}

// ─── Migration Steps ────────────────────────────────────────

type MigrationFn = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrate from schema v1 (legacy string version) to v2.
 * Adds schemaVersion integer, createdWithVersion, preserves all existing fields.
 */
function migrateV1toV2(data: Record<string, unknown>): Record<string, unknown> {
  return {
    ...data,
    schemaVersion: 2,
    createdWithVersion: data.version as string,
    // campaignStatus: ensure 'active' default for pre-1.4.0 saves
    campaignStatus: data.campaignStatus ?? 'active',
  };
}

/** Ordered list of migrations: index 0 = v1→v2, index 1 = v2→v3, etc. */
const MIGRATIONS: MigrationFn[] = [
  migrateV1toV2,
];

// ─── Public API ─────────────────────────────────────────────

/**
 * Run the full migration pipeline on raw parsed save JSON.
 * Returns the data in current canonical shape plus migration metadata.
 *
 * Throws SaveValidationError on:
 * - unrecognizable format
 * - future version (newer than supported)
 * - corrupted version metadata
 */
export function migrateSave(raw: Record<string, unknown>): MigrationResult {
  const sourceVersion = detectSchemaVersion(raw);
  validateVersion(sourceVersion);

  let data = { ...raw };
  let stepsApplied = 0;

  // Apply migrations sequentially from sourceVersion to current
  for (let v = sourceVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const migrationIndex = v - 1; // v1→v2 is index 0, v2→v3 is index 1, etc.
    const migrateFn = MIGRATIONS[migrationIndex];
    if (!migrateFn) {
      throw new SaveValidationError(
        `Missing migration from schema v${v} to v${v + 1}. This is a bug.`,
      );
    }
    data = migrateFn(data);
    stepsApplied++;
  }

  return {
    data,
    sourceVersion,
    targetVersion: CURRENT_SCHEMA_VERSION,
    stepsApplied,
  };
}
