# Persistence Versioning & Migration Policy

Defines schema versioning for durable artifacts and the rules
governing migration between versions.

## Versioned Artifacts

### 1. Session Save (`SavedSession`)

| Field | Value |
|-------|-------|
| Version field | `schemaVersion` (integer, monotonically increasing) |
| Current version | `2` |
| Location | Top-level field in save JSON |

Schema version 1 = all saves written before this sprint (version string `'0.1.0'`–`'1.4.0'`).
Schema version 2 = saves written after this sprint (adds `schemaVersion`, `createdWithVersion`).

### 2. Chronicle Records

Chronicle records are embedded inside session saves as `chronicleRecords`.
They follow the `CampaignJournal` serialization contract from `@ai-rpg-engine/campaign-memory`.
Chronicle migration is part of session migration — not a separate pipeline.

### 3. Exports (markdown/JSON)

Exports are point-in-time snapshots, not durable contracts.
They carry `exportedAt` and package version metadata but are not migrated.

## Schema Version History

| schemaVersion | Equivalent string versions | Changes |
|---------------|---------------------------|---------|
| 1 | `'0.1.0'` – `'1.4.0'` | Original format. Version as string. Optional fields accumulate per feature. |
| 2 | (current) | Adds `schemaVersion` integer. Adds `createdWithVersion`. Removes string `version` union reliance. |

## Compatibility Policy

### Forward compatibility (old saves → new code)

- **Supported range:** schemaVersion 1–2
- **Migration:** automatic, ordered, non-destructive
- **Rule:** loading always yields current canonical shape. No downstream code reasons about old versions.

### Backward compatibility (new saves → old code)

- **Not supported.** Newer saves may contain fields old code cannot interpret.
- **Behavior:** old code may load partially (existing graceful defaults) but is not guaranteed.

### Future versions (unknown schemaVersion)

- **Refused.** If `schemaVersion > CURRENT_SCHEMA_VERSION`, fail clearly.
- **Message:** "This save was created with a newer version of claude-rpg."
- **Rule:** never guess at unknown future shapes.

## Migration Rules

1. **Migrations are ordered.** Each migration step goes from version N to N+1.
2. **Migrations are pure functions.** Input: raw JSON object. Output: transformed JSON object.
3. **Migrations do not access runtime state.** No engine, no client, no filesystem.
4. **Original file is never overwritten before migration succeeds.** Backup (.bak) survives.
5. **Migration result includes metadata:** source version, target version, steps applied.
6. **Chronicle meaning is preserved.** Record order, significance, category — all survive intact.

## Detection

Schema version is detected by:
1. If `schemaVersion` field exists → use it directly.
2. If `version` field is a string matching `'0.1.0'`–`'1.4.0'` → schemaVersion 1.
3. Otherwise → unsupported, refuse to load.

## CLI Behavior

Normal mode:
- Migration succeeds silently unless noteworthy (e.g., "Save upgraded from older format.")
- Unsupported version: clear error through `error-presenter.ts`

Debug mode:
- Source version, target version, migration steps applied
