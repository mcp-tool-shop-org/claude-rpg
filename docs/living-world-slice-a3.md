# Slice A3 — the save shape: schema v3, the RumorEngine instance, full-fidelity migration proofs

**Cycle:** the living-world cycle (Path A → v2.0.0), run `swarm-1788288802-f5a0`.
**Rulings this slice executes:** R3 (v2.0.0 with a real 1.x → 2.0 save migration;
old-save support REQUIRED) and the rumor-system admission (the app owns a
`RumorEngine` instance serialized into the save the way profile and chronicle
are). Ruling record: `E:/AI/testing-os/swarms/swarm-1788288802-f5a0/RULINGS-A-cycle.md`.
**Grounding:** wave-1 F-ca9f04a5 (migrate.ts ground truth), F-8f502d7f (fixture
gaps), F-61967811 (the rumor seam map), `docs/persistence-versioning.md` (the
app's own contract), and the engine's `packages/rumor-system/src/engine.ts`
(`serialize` / `deserializeSafe` / `tick` / `stanceOf` / `heardBy`).
**Prerequisites:** slice A2-core (the driver; views) and A2-truth (the
load-time seed `seedWorldTruthFromSession` + marker
`world.globals['claude_rpg.stores_seeded']`, the reputation composition, the
leverage ledger) — both on main before this slice dispatches.

## Why this slice exists

After A2 the engine world (`engineState`) is the truth for the eleven stores,
but every save still writes them a second time as the 1.x string fields, and
the load path still reads those fields to seed a world that has none. A3 ends
the double-write: schema **v3** saves carry the world and the things that are
genuinely not world truth (profile, chronicle, history, conversations,
presentation, arc/endgame, campaign status) — nothing else. Old saves (v1, v2)
keep loading with full fidelity through the migration pipeline plus the
A2-truth seed. And the admitted `@ai-rpg-engine/rumor-system` enters the game
as a host-owned `RumorEngine` whose snapshot rides the save, so A5 can flip the
dialogue surface to per-hearer stances without a second migration.

## Design (locked)

### 1. `SavedSession` schema v3

- `CURRENT_SCHEMA_VERSION = 3` (`src/session/migrate.ts`); `validateVersion`
  accepts 1–3; the refusal copy for a newer save is unchanged.
- `SavedSession` keeps every existing field name (readers of v1/v2 saves
  need them), but the eleven world-truth fields become **legacy read-only**:
  `playerRumors`, `activePressures`, `resolvedPressures`, `npcAgencySnapshot`,
  `npcObligations`, `consequenceChains`, `partyState`, `districtEconomies`,
  `activeOpportunities`, `leverageSnapshot` (ten). A v3 writer NEVER emits
  them (the type comment says so; a test pins that a v3 save has none of
  these keys). `engineState` carries them inside the world (namespaces,
  globals, the seed marker, the reputation baselines). **`resolvedOpportunities`
  stays a written field in v3**: it is session HISTORY (the engine's
  opportunity-core namespace holds only the live list; expiry fallout is
  appended per round by the app) — learned at the wave-5 stitch, where the
  seed had to restore it explicitly.
- New field: `rumorEngine?: string` — JSON of the RumorEngine `EngineSnapshot`
  (`{ rumors, stances }`, dead rumors omitted per the engine's default).
- `createdWithVersion` = the package version (already present at v2).
- Unchanged: `schemaVersion`, `version` (legacy string, still `'1.4.0'` for
  compatibility with old readers), `engineState`, `turnHistory`,
  `worldPrompt`, `tone`, `savedAt`, `profile`, `packId`, `characterName`,
  `characterLevel`, `characterTitle`, `genre`, `chronicleRecords`,
  `arcSnapshot`, `endgameTriggers`, `finaleOutline`, `campaignStatus`,
  `presentationState`, `npcConversations`.

### 2. Migration: pure shape step + runtime seed, in that order

- `migrateV2toV3(data)` is PURE (the contract's rule 3: no engine, no
  filesystem): it stamps `schemaVersion: 3` and leaves the legacy fields in
  place untouched. It is registered as `MIGRATIONS[1]`. It must not drop
  them — the seed needs them.
- The runtime seed (A2-truth's `seedWorldTruthFromSession`, called from
  bin.ts after `initializeNamespaces`) reads the legacy fields ONLY when the
  world carries no `claude_rpg.stores_seeded` marker AND at least one legacy
  field is present. **Corrected at the wave-6 stitch (the tests agent's
  data-loss finding):** a v3 save carries none of the ten fields, so a seed
  keyed on the marker alone would have overwritten real world truth with
  empty defaults for any world that never stamped the marker. Two guards
  now hold the invariant: the seed refuses a save with no legacy fields
  (stamping the marker as it does), and a fresh world stamps the marker at
  its first round (`runWorldRound`). The guard is keyed on field PRESENCE,
  not on `schemaVersion` — after `migrateSave` every loaded save reads as the
  current schema. Documented in `docs/persistence-versioning.md`.
- `buildSaveInput` (bin.ts) stops passing the eleven stores; `saveSession`
  stops serializing them; `SaveSessionInput` drops those keys (a compile
  error is the tripwire for any caller still passing them).

### 3. The `RumorEngine` instance (host-driven)

- `GameSession.rumorEngine: RumorEngine` — constructed on a new game with
  `{ stanceFadeTicks: 24 }` (per-hearer stances fade after ~24 rounds; an A6
  lever), restored on load with `RumorEngine.deserializeSafe(snapshot,
  config)` (its `warnings` go to the debug log, never the player), serialized
  at save with `rumorEngine.serialize()`.
- `runWorldRound` calls `this.rumorEngine.tick(this.engine.tick)` after
  `runWorldTick` and before the view refresh (lifecycle: spreading →
  established → fading → dead; stance decay).
- **The bridge (write side only this slice):** every player-rumor spawn —
  the five app `spawnPlayerRumor` sites (game.ts ×4, game-state.ts fallout
  case) and the tick's own NPC-originated rumors that land in the
  player-rumor ledger — is MIRRORED into the RumorEngine through one helper
  `mirrorPlayerRumor(rumor: PlayerRumor)`: `create({ claim, subject:
  'player', key: rumor.id, value: true, sourceId: rumor.originFactionId ??
  'world', originTick: rumor.originTick, confidence: rumor.confidence,
  emotionalCharge: chargeOf(rumor.valence) })` then
  `recordFactionUptake(id, originFactionId)` when present. `chargeOf` maps
  the 4-valence enum to a charge (heroic +0.6, fearsome −0.6, notorious
  −0.3, mysterious 0 — verify the enum's exact members in the installed
  dist and cover every member). Idempotent by `findBySubjectKey('player',
  rumor.id)`. After each round, ledger rumors not yet mirrored (the tick's
  NPC-originated ones) are mirrored the same way.
- The read side is UNCHANGED this slice: dialogue and the `/rumors` surface
  keep reading the 4-valence view. A5 flips readers to `stanceOf` /
  `heardBy` / `formatRumorForPlayer` (STRINGS LAW there).

### 4. Proofs

- **v3 round-trip:** save → load → save on a played session yields a
  byte-identical second save (modulo `savedAt`), with none of the eleven
  legacy keys present and the marker inside `engineState`.
- **v1 → v3 and v2 → v3 full fidelity:** each A2-truth fixture (populated
  pack, populated generated, veteran ledger) loads with `migrated: true`,
  `stepsApplied` = the version gap, the views deep-equal the fixture's
  legacy fields, and the profile reputation equals baseline + accrued
  globals (R1); a save written after that load is v3 (no legacy keys) and
  loads again with `seeded: false` and identical views.
- **RumorEngine persistence:** rumors created in a session, one spread with
  a mutation and one per-hearer stance recorded, survive save → load with
  `stanceOf` intact; a snapshot with one malformed rumor loads the rest
  (`deserializeSafe` warnings logged, world boots).
- **Mirror completeness:** after N rounds, every ledger rumor id has a
  RumorEngine rumor with `key === id`; no duplicates after a second round.
- **Future refusal:** a `schemaVersion: 4` fixture is refused with the
  existing copy; `no-version.json` still resolves to v1 and migrates.
- **Floor:** serial verify 3× byte-identical after merge; the phase-9
  composed proof and the living-world driver proof stay green.

### 5. Player-visible surfaces touched (coordinator-reviewed)

- Save listing (`src/cli/save-listing.ts`): if it prints a schema/version
  hint, v3 shows the same way v2 did — no new copy unless the listing
  already renders a version column.
- Load errors: no new copy; the existing migration/validation messages
  stand. Any agent-proposed line goes through "Strings for coordinator
  review".

## Out of scope

The dialogue surface flip to per-hearer stances (A5), reader rewires and
field deletion on GameSession (A4), tuning of `stanceFadeTicks` and rumor
mutation rates (A6), the package version bump to 2.0.0 (Phase 10), any
engine-side `migrateState` (the engine's SAVE_VERSION stays `'1.0.0'`; the
seam is app-side by design).

## Ownership for the execute wave

- **game-core:** §1 (`session.ts` types + `saveSession` write path +
  `SaveSessionInput`), §2 (`migrate.ts` v3 step + `CURRENT_SCHEMA_VERSION`),
  §3 (the RumorEngine instance on GameSession, the tick call, the mirror
  helper at the five spawn sites and the post-round sweep), plus unit tests
  in `session.test.ts` / `migrate.test.ts` / `game.test.ts`.
- **cli-display:** `buildSaveInput` stops passing the stores; the load path
  hands the `rumorEngine` snapshot to GameSession construction; save
  listing check (§5); bin-level test of a v3 save's shape.
- **tests:** §4 proofs in `test/integration/save-schema-v3.test.ts` (+ the
  `future-v99` and `no-version` fixtures re-pinned only if their message
  text moved); extend `test/helpers/game-harness.ts` so `resumeHarness`
  round-trips through a real v3 save.
- **narrative-llm / runtime-foundry / ci-tooling:** honest-empty with
  observation sweeps (dialogue rumor reads unchanged; hooks unaffected;
  fixtures excluded from the tarball).
- **docs (coordinator):** this document; `docs/persistence-versioning.md`
  (v3 row, the two-phase rule); CHANGELOG at Phase 10.
