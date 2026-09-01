# Slice A4 — read-back rewires: every consumer reads world truth directly; generated worlds resume

**Cycle:** the living-world cycle (Path A → v2.0.0), run `swarm-1788288802-f5a0`.
**Rulings this slice executes:** R2 (both world classes live the same world —
including save/resume), the kickoff's A4 mandate (every consumer re-reads world
truth post-tick; the wave-13 threading pattern stays but its sources flip).
Ruling record: `E:/AI/testing-os/swarms/swarm-1788288802-f5a0/RULINGS-A-cycle.md`.
**Grounding:** wave-1 F-9fe158f3 (the eight-hint source table), F-e54dee41
(director surfaces: group 1 reads world directly, group 2 is a pass-through of
session fields), F-817a391e (recap family), F-4e8dbbad (obligations never
reach `buildNpcProfile`), the wave-5 finding that generated worlds have no
resume path (`packId` never set in `runNew`), and the A2/A3 docs.
**Prerequisites:** A2 (views + driver + seed), A3 (schema v3 + RumorEngine) on
main.

## Why this slice exists

After A2 the session fields are views refreshed after each round and after
each write-through. That is one refresh step away from the truth, and every
reader still names a `GameSession` field. A4 removes the step: the fields
become live getters over world truth (no refresh, no stale window — a change
to the world is visible to every reader on its next access), the prompt hints
and director surfaces are re-sourced to the engine readers, `GameSession` stops
being a second place state can live, and a generated world can be saved and
resumed like a pack world.

## Design (locked)

### 1. Fields become live getters over world truth

`GameSession` replaces these properties with `get` accessors that read the
engine each access (fresh arrays; callers never mutate the result):

| getter | reads |
|---|---|
| `activePressures` | `getActivePressures(this.engine.world)` |
| `resolvedPressures` | `getResolvedPressures(this.engine.world)` |
| `activeOpportunities` | `getPersistedOpportunities(world)` |
| `lastNpcActions` / `lastNpcProfiles` / `npcObligations` / `activeConsequenceChains` | `getPersistedNpcLastActions` / `getPersistedNpcProfiles` / `getPersistedNpcObligations` / `getPersistedNpcChains` |
| `lastFactionActions` / `lastFactionProfiles` | `getPersistedFactionLastActions` / `getPersistedFactionProfiles` |
| `districtEconomies` | `new Map(Object.entries(getEconomyCoreState(world).districts))` |
| `playerRumors` | `getPlayerRumorState(world).rumors` |
| `partyState` | `getPartyState(world)` |

`resolvedOpportunities` stays a real field (session history, A3). The
profile-side views (reputation composition, leverage currencies) stay
refreshed after each round and after each write-through by a renamed
`refreshProfileViews()`; `refreshWorldViews()` is deleted. Every write path
keeps writing world-first (A2 §4); a write-through no longer needs a refresh
call for the world-backed fields. `seedWorldTruth` keeps restoring
`resolvedOpportunities` and refreshing the profile views.

A **source-text tripwire** test asserts no assignment to any of the getter
names remains in `src/game.ts` (`this.activePressures =` etc.) — the repo's
existing source-scan test pattern.

### 2. Hint sources flip to the engine readers (the wave-13 threading stays)

`processInput` still threads optional params into `executeTurn` /
`buildNPCDialogueContext`; only the SOURCES change:

| hint | source after A4 |
|---|---|
| `dialogueHint` | `getPersistedNpcLastActions(world)` (via the `lastNpcActions` getter) |
| `partyPresence` | `getPartyState(world)` + the engine's `formatPartyPresence` (already the app's formatter) |
| `pressureHint` / `worldPressureHint` | `getActivePressures(world)` (+ `getResolvedPressures`) |
| `opportunityHint` | `getPersistedOpportunities(world)` |
| `situationHint` | `getPersistedMoveRecommendation(world)` — the tick's step 7 persists it every round; the app's per-turn `buildMoveRecommendation()` duplicate is DELETED (one simulation); the 'pressured'/'crisis' gating and the try/catch-to-undefined guard stay |
| `moodHint` | the zone-entry `moodHint` already rides `describeEvent` (wave 4); narration's `districtDescriptor` keeps deriving from live district state — no new plumbing |
| `textureHint` | unchanged (self-contained) |
| `dialogueBias` | unchanged — reads the profile VIEW (baseline + globals), ruled in wave 13 and preserved by A2-truth's composition |

`buildNpcProfile` on the dialogue path (F-4e8dbbad) receives the NPC's
obligation ledger from `getPersistedNpcObligations(world).get(npcId)` — the
sixth argument the engine already accepts. Goals and breakpoints in dialogue
now reflect favors, debts, and betrayals.

### 3. Director and recap surfaces read the same truth

- Group 2 director commands (`/factions`, `/people`, `/npc`, `/leverage`,
  `/map`, `/party`, `/jobs` family, `/market`, `/trade`, `/arcs`, `/endgame`,
  `/status`) are pass-throughs of `ExecuteDirectorCommandOptions` built in
  game.ts / bin.ts from the fields — with getters they read world truth by
  construction. One inventory proof: `/pressures` after a world-side pressure
  insert (no session call) renders it.
- `/status` gains the engine's strategic ledger line: `heat` (`world.globals
  .player_heat`), faction alerts, and the current district's tone — the
  first surface of the tick's own ledger (STRINGS reviewed; the leverage help
  copy F-0fdf429f is rewritten by the coordinator in A5 alongside the
  leverage surface).
- Recap (`session-recap.ts`, `recap-delta.ts`) keeps diffing the profile
  view; no new plumbing here (A5 adds the living-world recap lines).

### 4. Generated worlds resume (closes the wave-5 finding)

- `generateWorld` is split: `proposeWorld(client, prompt)` (the LLM half,
  unchanged) and `instantiateWorld(proposal, seed, logger)` (the engine
  construction half — the same code path, now callable without a client).
- v3 `SavedSession` gains `worldGenProposal?: string` (the validated
  proposal JSON, written by `saveSession` when the session has no `packId`)
  and `worldSeed?: number` (the seed the world was instantiated with).
- `runLoad`: when `packId` is absent and `worldGenProposal` is present,
  rebuild the engine with `instantiateWorld(proposal, seed)`, then apply the
  same restore sequence as a pack world (validate + `Object.assign` state +
  `initializeNamespaces` + rng + `seedWorldTruth`). A save with neither is
  refused through the existing load presenter (no new copy).
- `runNew` passes the proposal + seed into the session so the first save
  carries them.

### 5. Proofs

- **Live getters:** insert a pressure into world truth directly
  (`getWorldTickState(world).pressures.push(...)`), read
  `session.activePressures` with no session call in between → present; the
  same for an opportunity via `setPersistedOpportunities` and a rumor via
  `setPlayerRumorState`.
- **No assignment tripwire** (§1).
- **Hint sources:** a pressure inserted into world truth appears in the next
  turn's narration prompt (fake client captures the prompt) and in the
  dialogue prompt for an NPC of its faction; an obligation ledger entry for
  an NPC changes that NPC's derived goal line in the dialogue prompt.
- **situationHint from the persisted recommendation:** after a round where
  the tick persists a 'crisis' recommendation, the next prompt carries it;
  the per-turn duplicate is gone (source-text tripwire on
  `buildMoveRecommendation` call sites in the turn path).
- **Generated-world resume:** generate (fake client) → play two rounds →
  save → load through `runLoad`'s generated branch (harness equivalent) →
  identical event log tail, views, and marker; a second save is byte-stable.
- **Floor:** serial verify 3× byte-identical; phase-9, parity, driver, seed,
  and v3 proofs stay green.

## Out of scope

Player-facing surfaces for the five systems and the per-hearer rumor flip
(A5), tuning (A6), the verb surface (R6), engine combat turns.

## Ownership for the execute wave

- **game-core:** §1 getters + tripwire, `refreshProfileViews`, §2 sources in
  `processInput` (the threading call sites), §4 session fields + `saveSession`
  + `SaveSessionInput`, `/status` ledger line data (the renderer is
  cli-display's).
- **narrative-llm:** §2 `buildNpcProfile` obligations on the dialogue path
  (`npc-context.ts`, `dialogue-mind.ts` signature, additive) + prompt proofs.
- **runtime-foundry:** §4 `proposeWorld` / `instantiateWorld` split in
  `world-gen.ts` (behavior-preserving; `generateWorld` composes the two).
- **cli-display:** §3 `/status` ledger line rendering (STRINGS reviewed),
  §4 `runLoad` generated branch + `runNew` seed/proposal plumbing.
- **tests:** §5 proofs in `test/integration/living-world-readback.test.ts` and
  `generated-world-resume.test.ts`; harness helpers as needed.
- **ci-tooling:** honest-empty.
- **docs (coordinator):** this document; persistence contract row for the two
  new v3 fields.
