# Persistence Versioning & Migration Policy

Defines schema versioning for durable artifacts and the rules
governing migration between versions.

## Versioned Artifacts

### 1. Session Save (`SavedSession`)

| Field | Value |
|-------|-------|
| Version field | `schemaVersion` (integer, monotonically increasing) |
| Current version | `3` (slice A3 of the living-world cycle) |
| Location | Top-level field in save JSON |

Schema version 1 = all saves written before the runtime-proofing sprint (version string `'0.1.0'`–`'1.4.0'`).
Schema version 2 = saves written after that sprint (adds `schemaVersion`, `createdWithVersion`).
Schema version 3 = saves written by the living-world build (v2.0.0): the engine
world (`engineState`) is the single truth for pressures, opportunities, NPC and
faction state, district economies, party state, player rumors, and leverage;
the ten 1.x string fields for those stores are no longer written; the app's
`RumorEngine` snapshot rides the save as `rumorEngine`.

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
| 2 | | Adds `schemaVersion` integer. Adds `createdWithVersion`. Removes string `version` union reliance. |
| 3 | (current) | World truth lives in `engineState` (module namespaces, `world.globals`, the seed marker `claude_rpg.stores_seeded`, the reputation baselines). Stops writing `playerRumors`, `activePressures`, `resolvedPressures`, `npcAgencySnapshot`, `npcObligations`, `consequenceChains`, `partyState`, `districtEconomies`, `activeOpportunities`, `leverageSnapshot` (they stay readable for v1/v2 loads). Keeps `resolvedOpportunities` (session history — no engine namespace). Adds `rumorEngine` (the RumorEngine `EngineSnapshot`). |

## Compatibility Policy

### Forward compatibility (old saves → new code)

- **Supported range:** schemaVersion 1–3
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

## The two-phase load (v3 and later)

Loading is two phases, in this order, and the order is load-bearing:

1. **Pure shape migration** — `migrateSave` runs the ordered `MIGRATIONS`
   steps (v1→v2 normalizes legacy rumor/pressure entries; v2→v3 only stamps
   `schemaVersion: 3`). No step ever drops the ten legacy fields: phase 2
   needs them.
2. **Runtime seed** — after the engine state is restored and
   `initializeNamespaces` has backfilled absent module namespaces,
   `GameSession.seedWorldTruth(savedSession)` writes each legacy field into
   its engine namespace exactly once, stamps
   `world.globals['claude_rpg.stores_seeded']`, refreshes the session's
   views, and restores `resolvedOpportunities`. A save whose `engineState`
   already carries the marker (every v3 save) is never seeded again; a v1 or
   v2 save is seeded once and, when saved again, becomes v3.

The seed is app-side by design: the engine's own `SAVE_VERSION` stays
`'1.0.0'` and no engine module ships a `migrateState` hook; claude-rpg's
`SavedSession` is the versioned artifact.

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
