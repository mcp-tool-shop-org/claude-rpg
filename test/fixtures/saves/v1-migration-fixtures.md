# WO-A2T-6 fixtures — 1.x saves for the world-truth seed proofs (§8)

Three fixtures, each a genuine 1.x-shaped `SavedSession` (`schemaVersion: 1`,
migrated to 2 by `migrateV1toV2` on load — a real migration path exercise,
not a hand-stamped `schemaVersion: 2`). None carries
`world.globals['claude_rpg.stores_seeded']` or any
`world.globals['claude_rpg.rep_baseline_*']` key — that's the whole point:
the seed function (WO-A2T-1, `seedWorldTruthFromSession`) must find the
marker absent and write each field into its namespace.

**Provenance method (per WO-A2T-6):** the `engineState` blob in each fixture
is a REAL `Engine.serialize()` output from the installed 3.11 engine
(`createGame()` for the two pack fixtures, `generateWorld()` + a fake
Claude client + `test/helpers/world-gen-fixtures.ts`'s
`makeParityWorldGenProposal` for the generated one) — built via a scratch
script run through this repo's own install, never hand-typed. The
`SavedSession` TOP-LEVEL 1.x fields (`activePressures`, `resolvedPressures`,
`activeOpportunities`, `resolvedOpportunities`, `npcAgencySnapshot`,
`npcObligations`, `consequenceChains`, `districtEconomies`, `playerRumors`)
are the part the app's hand-tickers used to populate through live play and
that A2-core deleted (design doc §5) — those are hand-authored JSON here,
each shape checked against `src/session/session.ts`'s `isValidXXX`
per-entry validators (and `src/session/migrate.ts`'s `isValidWorldPressure`/
`isValidPlayerRumor`) so nothing gets silently dropped on load. Verified by
round-tripping all three through the real `loadSession()` + every
`loadXFromSession` loader and (for the two pack-rooted fixtures) through
`resumeHarness()` before this wave's changes landed — every store's count
matches what was authored, nothing was silently dropped.

None of the three carries any `lastFactionActions`/`lastFactionProfiles`
data — **see the finding below.**

## v1-migration-pack-rich.json

Pack world: `chapel-threshold` (starter-fantasy), fresh `createGame(101)`,
tick 0. Populated: 2 active pressures, 1 resolved-pressure fallout, 2
active opportunities (one accepted), 1 resolved-opportunity fallout, 2 NPC
profiles (`brother-aldric`, `sister-maren`) + 1 NPC action result, 1 NPC
obligation ledger, 1 consequence chain, 2 district economies
(`chapel-grounds`, `crypt-depths`, deliberately DIFFERENT levels than the
engine's own economy-core module defaults — proves the seed function
overwrites world truth from the app snapshot rather than coincidentally
matching it), 2 player rumors, 1 chronicle record, a profile with 1
reputation entry (`chapel-undead`: 15). `world.globals` is `{}` — no kills,
no marker.

## v1-migration-generated-rich.json

Generated world: `generateWorld(fakeClient, 'a generated fixture world for
A2-truth seed proofs', 303)` against `makeParityWorldGenProposal({ title:
'Seedhaven Fixture World', factions: [...] })`, faction `seedhaven-guard`,
zones `town-square`/`market`, NPC `guard-1`. Populated with the same nine
stores at smaller scale (1 each, `resolvedOpportunities: []` deliberately —
the empty-array case). **Deliberately carries NO `packId` field** — see the
finding below for why.

## v1-migration-veteran.json

Same pack (`chapel-threshold`), fresh `createGame(202)`, but with
`world.globals` HAND-STAMPED before serialize to simulate kills already
having happened pre-adoption: `player_heat: 30`, `reputation_chapel-undead:
-12`, `faction_alert_chapel-undead: 2` (defeat-fallout writes these globals
independent of A2 adoption — that module has always run). The profile
carries ONE reputation entry, `chapel-undead: 40` — the app's own ledger
value as of the LAST time it was saved, which predates the -12 kill delta
above. This is the exact R1 gap: after seeding, the composed view should
read `baseline (40) + accrued globals (-12) = 28`, not the stale 40 alone.
Sparser on the other eight stores (1 rumor, 1 pressure, no NPCs/
opportunities/economies/obligations/chains) — a save mid-campaign, not a
fresh one, but not maximally rich either; the point of this fixture is the
globals/reputation composition, not exhaustive store coverage (that's what
the other two fixtures are for).

## Finding for the coordinator / game-core (WO-A2T-1) / cli-display (WO-A2T-5)

**No SavedSession field has ever persisted faction profiles or faction last
actions.** `src/session/session.ts`'s `SavedSession` type (checked
exhaustively — `grep -n faction src/session/session.ts` before authoring
these fixtures) has no `factionProfiles`/`lastFactionActions` field and
never has; `GameSession.lastFactionActions`/`lastFactionProfiles` were
always rebuilt from world state each round (`buildFactionProfile`), never
saved. The design doc's §8 lists "faction profiles/last actions via
`setPersistedFactionState`" as one of the seeded stores, and
ADDENDUM-game-core's WO-A2T-1 repeats it — but there is no 1.x session
field to seed FROM. None of these three fixtures carries faction data for
this reason; `seedWorldTruthFromSession` should either skip
`setPersistedFactionState` entirely (nothing to seed, the tick rebuilds
factions fresh from world state on its own next run) or call it with empty
arrays only to stamp the namespace's presence — a design-doc gap, not a
fixture gap. Flagged here rather than silently working around it.

**Generated-world saves have no resume path in this app today, independent
of A2-truth.** `runNew()` (`src/bin.ts` ~line 791) constructs the
generated-world `GameSession` with no `packId` at all (`new GameSession({
engine: result.engine, client, title, tone, worldPrompt })` — no `packId`
field). `runLoad()`'s engine-restore block (`src/bin.ts` ~line 544) is
gated entirely on `if (savedSession.packId) { pack = getPackById(...) }`,
and falls to the fatal `if (!engine) throw "Cannot restore engine — unknown
pack ..."` branch when `packId` is absent — there is no alternate
reconstruction path (no "replay the same `generateWorld` proposal" hook,
no bare-`Engine.deserialize` path; `resumeHarness()` in
`test/helpers/game-harness.ts` mirrors this exactly, same gate, same
throw). A save from a generated-world session is therefore, today,
**unloadable in production** — this predates this slice and A2-truth's
seed function does not change it. `v1-migration-generated-rich.json`
deliberately omits `packId` to reflect that reality rather than inventing a
fake pack id that would misrepresent the gap. `world-truth-seed.test.ts`
proves the SEED FUNCTION itself against this fixture by reconstructing the
engine the only way available — replaying the same `generateWorld` call
with the same proposal/seed (deterministic) and hand-restoring the
fixture's serialized state onto it, exactly `resumeHarness`'s own technique
minus the `getPackById` gate — not through `resumeHarness` or any
production load path, because none exists for this case.
