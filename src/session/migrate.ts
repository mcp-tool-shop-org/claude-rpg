// migrate.ts: Ordered save migration pipeline.
// Detects schema version, applies sequential migrations, returns canonical shape.
// Pure functions — no runtime state, no filesystem, no client.

import { SaveValidationError } from './session.js';
import { isDebugEnabled } from '../game/debug-logger.js';
import type { PlayerRumor, WorldPressure } from '@ai-rpg-engine/modules';

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
 * Shape guards for the current PlayerRumor/WorldPressure types (F-c5ff2a5c)
 * — used by the normalizers below to detect an already-conformant entry and
 * pass it through unchanged.
 *
 * F-b6456823: exported (was private) and upgraded to type predicates so
 * session.ts's loadRumorsFromSession/loadPressuresFromSession can share
 * these exact predicates for their own per-entry validation instead of
 * re-deriving an independent copy — this file's normalizers already proved
 * them against the real legacy-shape fixtures (test/fixtures/saves/
 * v1-rich.json). The type-predicate form still works as a plain boolean
 * condition at the existing call sites below (`if (isValidPlayerRumor(r))
 * return r;`), so this is additive, not a behavior change here.
 */
export function isValidPlayerRumor(entry: Record<string, unknown>): entry is PlayerRumor {
  const r = entry;
  return (
    typeof r.id === 'string' &&
    typeof r.claim === 'string' &&
    typeof r.subjectDescriptor === 'string' &&
    typeof r.sourceEvent === 'string' &&
    typeof r.confidence === 'number' &&
    typeof r.distortion === 'number' &&
    typeof r.mutationCount === 'number' &&
    typeof r.valence === 'string' &&
    Array.isArray(r.spreadTo) &&
    typeof r.originTick === 'number'
  );
}

export function isValidWorldPressure(entry: Record<string, unknown>): entry is WorldPressure {
  const p = entry;
  return (
    typeof p.id === 'string' &&
    typeof p.kind === 'string' &&
    typeof p.sourceFactionId === 'string' &&
    typeof p.description === 'string' &&
    typeof p.triggeredBy === 'string' &&
    typeof p.urgency === 'number' &&
    typeof p.visibility === 'string' &&
    (p.turnsRemaining === null || typeof p.turnsRemaining === 'number') &&
    Array.isArray(p.potentialOutcomes) &&
    Array.isArray(p.tags) &&
    typeof p.createdAtTick === 'number'
  );
}

/**
 * Map a legacy-shaped rumor entry to the current PlayerRumor field shape.
 * Returns null if unrecognizable (no id).
 *
 * F-c5ff2a5c: legacy v1 saves' playerRumors/activePressures are JSON-string
 * fields. Before this normalization step, migrateV1toV2's shallow spread
 * passed their *content* through unexamined — a pre-shape-change v1 save
 * (see test/fixtures/saves/v1-rich.json's `{id, text, source, tick}` rumor
 * and `{id, kind, description, severity}` pressure) would deserialize via
 * session.ts's unchecked `JSON.parse(...) as PlayerRumor[]`/`as
 * WorldPressure[]` casts into objects *typed* as current-shape but missing
 * required fields — e.g. `.claim` reading as `undefined` — which downstream
 * NPC dialogue/session-recap prompts interpolate as the literal string
 * 'undefined' for the rest of the campaign.
 *
 * Map whatever has a real legacy equivalent (text→claim, tick→originTick,
 * severity→urgency, etc.) and fill safe, inert defaults for the rest —
 * better than silently dropping a rumor or pressure the player actually
 * earned. An entry with no `id` at all can't be migrated meaningfully and
 * is dropped (logged), since there's no identity to preserve.
 */
function normalizeLegacyRumor(entry: unknown): Record<string, unknown> | null {
  if (entry == null || typeof entry !== 'object') return null;
  const r = entry as Record<string, unknown>;
  if (typeof r.id !== 'string') return null;
  if (isValidPlayerRumor(r)) return r;

  return {
    id: r.id,
    claim: typeof r.claim === 'string' ? r.claim
      : typeof r.text === 'string' ? r.text
      : 'an old rumor, its details lost to time',
    subjectDescriptor: typeof r.subjectDescriptor === 'string' ? r.subjectDescriptor : 'someone',
    sourceEvent: typeof r.sourceEvent === 'string' ? r.sourceEvent
      : typeof r.source === 'string' ? r.source
      : 'unknown',
    sourceMilestone: typeof r.sourceMilestone === 'string' ? r.sourceMilestone : undefined,
    originFactionId: typeof r.originFactionId === 'string' ? r.originFactionId : undefined,
    originDistrictId: typeof r.originDistrictId === 'string' ? r.originDistrictId : undefined,
    confidence: typeof r.confidence === 'number' ? r.confidence : 0.5,
    distortion: typeof r.distortion === 'number' ? r.distortion : 0,
    mutationCount: typeof r.mutationCount === 'number' ? r.mutationCount : 0,
    valence: typeof r.valence === 'string' ? r.valence : 'mysterious',
    spreadTo: Array.isArray(r.spreadTo) ? r.spreadTo : [],
    originTick: typeof r.originTick === 'number' ? r.originTick
      : typeof r.tick === 'number' ? r.tick
      : 0,
  };
}

/** Map a legacy-shaped pressure entry to the current WorldPressure field shape. Returns null if unrecognizable (no id). */
function normalizeLegacyPressure(entry: unknown): Record<string, unknown> | null {
  if (entry == null || typeof entry !== 'object') return null;
  const p = entry as Record<string, unknown>;
  if (typeof p.id !== 'string') return null;
  if (isValidWorldPressure(p)) return p;

  const legacySeverity = typeof p.severity === 'number' ? p.severity : undefined;
  return {
    id: p.id,
    kind: typeof p.kind === 'string' ? p.kind : 'unknown',
    sourceFactionId: typeof p.sourceFactionId === 'string' ? p.sourceFactionId : 'unknown',
    description: typeof p.description === 'string' ? p.description : 'an old pressure, its details lost to time',
    triggeredBy: typeof p.triggeredBy === 'string' ? p.triggeredBy : 'unknown',
    urgency: typeof p.urgency === 'number' ? p.urgency
      : legacySeverity != null ? Math.max(0, Math.min(1, legacySeverity / 5))
      : 0.5,
    visibility: typeof p.visibility === 'string' ? p.visibility : 'known',
    turnsRemaining: typeof p.turnsRemaining === 'number' ? p.turnsRemaining : null,
    potentialOutcomes: Array.isArray(p.potentialOutcomes) ? p.potentialOutcomes : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
    createdAtTick: typeof p.createdAtTick === 'number' ? p.createdAtTick : 0,
  };
}

/**
 * Parse a legacy JSON-string array field, normalize each entry, and
 * re-serialize. Non-string/non-array/unparseable input is returned
 * untouched — session.ts's own JSON.parse try/catch already handles that
 * failure mode downstream, and this step only has real work to do once
 * there's an actual array of entries to inspect.
 */
function normalizeLegacyJsonArrayField(
  raw: unknown,
  normalize: (entry: unknown) => Record<string, unknown> | null,
  fieldName: string,
): unknown {
  if (typeof raw !== 'string' || raw.length === 0) return raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!Array.isArray(parsed)) return raw;

  const normalized: Record<string, unknown>[] = [];
  let dropped = 0;
  for (const entry of parsed) {
    const result = normalize(entry);
    if (result) normalized.push(result);
    else dropped++;
  }

  // F-34078c07: gated behind --debug/CLAUDE_RPG_DEBUG — the same condition
  // debug-logger.ts's DebugLogger already checks — so a normal player's
  // terminal doesn't get raw diagnostic text mixed into the styled game
  // screen the moment an old save happens to drop a legacy entry during
  // migration. The drop itself is unaffected; only the diagnostic is gated.
  if (dropped > 0 && isDebugEnabled()) {
    console.warn(
      `[migrate] v1→v2: dropped ${dropped} unrecognizable ${fieldName} entr${dropped === 1 ? 'y' : 'ies'} during migration (missing an id).`,
    );
  }

  return JSON.stringify(normalized);
}

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
    // F-c5ff2a5c: normalize legacy-shaped rumor/pressure entries to the
    // current PlayerRumor/WorldPressure field shape (see the doc comment
    // above normalizeLegacyRumor/normalizeLegacyPressure).
    playerRumors: normalizeLegacyJsonArrayField(data.playerRumors, normalizeLegacyRumor, 'playerRumors'),
    activePressures: normalizeLegacyJsonArrayField(data.activePressures, normalizeLegacyPressure, 'activePressures'),
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
