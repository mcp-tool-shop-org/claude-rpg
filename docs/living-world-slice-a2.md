# Slice A2 — the driver: `runWorldTick` replaces the hand-tickers, session stores become views of world truth

**Cycle:** the living-world cycle (Path A → v2.0.0), run `swarm-1788288802-f5a0`.
**Rulings this slice executes:** R1 (honor the accrued ledger — implemented here
by the reputation composition), R6 (leverage INCOME activates; the verb surface
stays suppressed). Ruling record: `E:/AI/testing-os/swarms/swarm-1788288802-f5a0/RULINGS-A-cycle.md`.
**Grounding:** wave-1 F-16901f05 (the real turn order), F-0ae5661f (the
six-stores read/write inventory), F-9fe158f3 (hint sources), F-262c3f65
(describeEvent coverage of tick emissions), F-62f5a5e5 (ambush timing); the
engine's `packages/modules/src/world-tick.ts` header (the canonical tick
contract) and `packages/cli/src/bin.ts:704-713` (the call-site doctrine).
**Prerequisite:** slice A1 (both world sources register the strategic family —
landed fd04ec6).

## Why the driver and the stores land together

Today claude-rpg advances pressures, opportunities, NPC agency, faction agency,
district economies, and player-rumor spread by calling engine PURE functions
over `GameSession` fields, once per turn, AFTER narration (F-16901f05). The
engine's `runWorldTick` advances the same mechanics — plus encounter spawns,
district mood transitions, milestones, heat escalation/decay, leverage income,
opportunity expiry fallout, and the move advisor — over `world.modules`
namespaces and `world.globals`. Turning the driver on while the hand-tickers
keep running would simulate every system twice on two disagreeing ledgers.
So A2 does three things in one design: (1) restructures the turn so the world
reacts BEFORE narration, (2) replaces every hand-ticker with the tick, and
(3) turns the session fields into read-views of world truth so every existing
reader keeps working this slice (A4 rewires readers to world truth directly and
deletes the fields; A3 bumps the save shape and retires the redundant fields).

It lands as **two execute waves**: A2-core (turn + driver + views + deletions +
event coverage + re-pins) and A2-truth (load-time seeding of world truth from
1.x session fields, the reputation composition, leverage unification).

## Design (locked) — wave A2-core

### 1. The turn: the world reacts before narration

`executeTurn` (`src/turn-loop.ts`) gains one optional hook on `ExecuteTurnOpts`:

```ts
/** Runs after engine.submitAction resolved the player's action and before
 *  presentation inference and narration. Returns the round's additional
 *  events (NPC agency, companions, the world tick) so narration, the
 *  presentation state machine, hooks, and history all see the whole round. */
onResolved?: (actionEvents: ResolvedEvent[]) => ResolvedEvent[];
```

Placement in `executeTurn`: immediately after the `engine.submitAction` try
block succeeds, BEFORE `immersion.inferAndTransition` and BEFORE
`narrateScene`. `events = [...actionEvents, ...roundEvents]` from that point on
(narration `recentEvents`, `justDied`/player-defeat derivations, hooks,
history). **Ruling at the wave-4 stitch — the round runs on EVERY turn that
advanced the engine tick, corpse-gated only.** The engine CLI skips its world
turn on a rejected menu verb; claude-rpg deliberately deviates: the player
types free prose, most narrated turns are actions the engine cannot resolve
(`engine.submitAction` returns `[]` and records `action.declared` +
`action.rejected`), and the engine tick still advances for them. A world that
reacted only to engine-accepted verbs would stand frozen while the player
looked around or talked. The hook is wrapped: a throw inside it is logged
through `debugLog` and yields `[]` — a hint or tick failure must never kill a
turn (the standing law).

### 2. The round callback in `GameSession` (`src/game.ts`)

`runWorldRound(actionEvents)` — the engine doctrine, with end-gates:

1. Player already at zero hp or the action's events carry the player's own
   defeat → return `[]` (no tick over a corpse).
2. `followPlayer` when the zone changed (companions move with the player;
   the world then reacts to where they stand).
3. `const before = this.engine.world.eventLog.length`.
4. `runWorldTick(this.engine, { genre: this.genre, log: (m) => debugLog.warn('world-tick', m) })`
   — straight adoption, no feature flag. The result's `ok:false` is logged,
   never surfaced raw.
5. Refresh the views (§3).
6. Drain the tick's companion reactions. **Corrected at the wave-4 stitch:
   the engine has NO reaction queue** — `runWorldTick` applies companion
   reactions synchronously (district-mood transitions, combat triggers per
   hostile/companion defeat, betrayal) and emits `companion.reaction` /
   `companion.departed` onto the event log. The adapter
   `drainQueuedCompanionReactions(engine, sinceEventIndex)` reads the
   round's own delta from the pre-tick cursor and maps those events into the
   app's `CompanionReaction[]`. The app's steady-state 'district-grim' /
   'district-prosperous' per-turn reaction is DELETED (the engine fires on
   TRANSITIONS only), and so is the app's own combat-won/combat-lost
   dispatch — the tick applies combat morale itself and the two would double
   up. The ONE app dispatch that survives is 'combat-lost' on the player's
   own defeat, because the corpse gate means the tick never sees that turn.
   Engine ask (recorded): the engine's combat reactions key per kill, not per
   encounter outcome, so a kill during a retreat still reads as 'combat-won'
   to companions.
7. Return `this.engine.world.eventLog.slice(before)` — the round's delta.

The engine's `runNpcTurns` / `runCompanionTurns` (hostile and companion
combat turns) are NOT adopted in this slice: claude-rpg's combat is
player-driven with the app's own companion reactions; adopting hostile
turns is a combat-doctrine decision for a later ruling. Named as out of
scope so nobody half-adopts it.

### 3. Views: the session fields read world truth after the tick

After step 4, and after any app mutation that writes through (§4):

| session field | world-truth reader (installed 3.11 dist) |
|---|---|
| `activePressures` | `getActivePressures(world)` |
| `resolvedPressures` | `getWorldTickState(world).resolvedPressures ?? []` — the engine's ledger is the history from adoption on; the app's pre-adoption history is preserved by the A2-truth seed (§7) |
| `activeOpportunities` | `getPersistedOpportunities(world)` |
| `resolvedOpportunities` | append each `WorldTickResult.opportunitiesExpired` entry per round; player-resolved fallout keeps appending from the app's resolve path (§4) |
| `lastNpcActions` / `lastNpcProfiles` / `npcObligations` / `activeConsequenceChains` | `getPersistedNpcLastActions` / `getPersistedNpcProfiles` / `getPersistedNpcObligations` / `getPersistedNpcChains` |
| `lastFactionActions` / `lastFactionProfiles` | `getPersistedFactionLastActions` / `getPersistedFactionProfiles` |
| `districtEconomies` | `new Map(Object.entries(getEconomyCoreState(world).districts))` |
| `playerRumors` | `getPlayerRumorState(world).rumors` |

The fields stay `GameSession` properties this slice so every reader
(prompt garnish, director renderer, recaps, chronicle, save) is untouched;
they are REFRESHED, never independently advanced.

### 4. Write-through: app mutations go to world truth first

Every app path that still mutates one of these stores writes to the world and
then refreshes the view — never the field alone:

- `resolveOpportunity` / `processOpportunityAction` (player accept/complete/
  abandon) → `setPersistedOpportunities(world, next)` then refresh.
- `propagateRumors` → `_propagateRumors(getPlayerRumorState(world).rumors, …)`
  → `setPlayerRumorState(world, { …state, rumors })` then refresh. Any other
  `playerRumors` writer (item recognition's `addRumor`, dialogue paths) goes
  through one `addRumor` helper that writes the ledger.
- `resolvePressure` for a PLAYER-resolved pressure (a leverage verb resolving
  it) → mutate `getWorldTickState(world).pressures` (the returned object is
  the live namespace) and append the fallout to its `resolvedPressures`;
  expiry fallout is the tick's own job now.
- `npcObligations` / `activeConsequenceChains` mutations →
  `setPersistedNpcState(world, …)`.
- `applyEconomyShiftEffect` → mutate `getEconomyCoreState(world).districts`.

### 5. Hand-tickers DELETED (their engine step is named)

`tickFactionAgency` (tick faction-agency step), `tickDistrictEconomies` (0b),
`tickNpcAgencyTurn` (5a — including `applyNpcEffects`: the tick applies
NpcEffects itself), `evaluateAndTickPressures` (2–5), `evaluateAndTickOpportunities`
(5b / 5b-i), the per-turn steady-state district-mood companion reaction (0c
fires on transitions). What those functions did BESIDES ticking must be
re-sourced from the views after the tick, in the post-turn block:
chronicle entries for NPC and faction actions (`deriveChronicleEvents` over
`lastNpcActions` / `lastFactionActions`), the NPC forced-chain-step loop's
chronicle/recap side effects (from `getPersistedNpcRecapEntries`), and the
companion reactions to combat (unchanged, over the combined events).
`buildPressureInputs` / `buildOpportunityInputs` / `resolvePressure`'s
expiry branch / `applyNpcEffects`' engine-duplicating branches are deleted
with their callers; keep any branch the engine does not perform (the agent
lists each kept branch with the reason).

### 6. Event coverage for the narrator (narrative-llm)

`describeEvent` (`src/narrator/scene-context.ts`) gains a mechanical-register
case for every event the tick and its modules emit (the agent greps `emit(`
in world-tick.ts, encounter-spawn.ts, economy-core.ts, district-core.ts,
npc-agency.ts, faction-agency.ts, opportunity-core.ts, player-leverage.ts):
`pressure.spawned/revealed/escalated/expired`, `opportunity.spawned/expired`,
`encounter.spawned`, economy shift events, district mood transition events,
NPC-action events, faction-action events. Reuse the engine's narrator
formatters where one exists (`formatPressureForNarrator`,
`formatOpportunityForNarrator`); one line each; STRINGS listed for review.
The three-events-render-as-'spawned' collision (F-262c3f65) is closed by
naming the subject.

### 7. Proofs (A2-core)

- **Round ordering:** a real-engine turn whose tick spawns a pressure (heat
  seeded ≥ HEAT_WAKE_THRESHOLD via `world.globals`) shows that pressure's
  line inside the SAME turn's narration prompt (fake client captures the
  prompt) and in `turnResult.events`.
- **No double simulation:** with the tick on, a pressure's timer decrements
  exactly once per round (pin the count over N rounds).
- **Determinism:** two sessions from the same seed and the same scripted
  inputs produce byte-identical event logs over 10 rounds.
- **Rejected action:** an `action.rejected` turn emits no tick events.
- **Corpse gate:** a player-defeat turn emits no tick events after the death.
- **Views:** after a round, each session field deep-equals its world reader.
- **Write-through:** accepting an opportunity through the app path is
  visible in `getPersistedOpportunities` before the next tick.
- **Re-pins (tests):** every scripted-session / event-stream / transcript pin
  that shifts because tick events now enter the log is re-derived
  MECHANICALLY with the harness's embedded update guidance; a pin whose
  new value contradicts a consequence (a wrong death, a wrong victory, a
  missing narration) STOPS the line and is reported as a defect, not
  re-pinned.
- **Floor:** serial verify 3× byte-identical after merge.

## Design (locked) — wave A2-truth

### 8. Load-time seed of world truth from 1.x session fields

A 1.x save carries its pressures/opportunities/NPC state/economies/rumors in
`SavedSession` fields and NOTHING in the world namespaces. On load (bin.ts
runLoad / resumeHarness, after `initializeNamespaces`), if
`world.globals['claude_rpg.stores_seeded']` is absent: write each session
field INTO its world namespace (`setPersistedOpportunities`,
`getWorldTickState(world).pressures = …` + `resolvedPressures`,
`setPersistedNpcState`, `setPersistedFactionState`, economy districts,
`setPlayerRumorState`), then stamp the marker with the save's schemaVersion
and the engine version. Idempotent: a second load never re-seeds. A save
written AFTER adoption (marker present) ignores the fields (the world is
truth). Fixtures: a populated 1.x pack save, a populated 1.x generated save,
a veteran pack save whose `world.globals` already carries kill history.

### 9. Reputation composition (R1 — the accrued ledger is honored)

Two ledgers exist today: `CharacterProfile.reputation[]` (app writes, 7
sites) and `world.globals['reputation_<faction>']` (defeat-fallout's kill
deltas since 3.9; from A2-core also pressure/opportunity/NPC fallout applied
by the tick). The design the Director reviewed in the Group-B brief:

- **Once-only baseline:** at seed time (§8) or on the first round of a fresh
  world, stamp `world.globals['claude_rpg.rep_baseline_<faction>']` = the
  profile's current value for every faction the profile knows, and
  `claude_rpg.rep_baselined = 1`.
- **Read model:** the profile's reputation becomes a VIEW refreshed after
  every round: `value(f) = baseline(f) + globals['reputation_<f>']` for
  every faction present in either ledger. The accrued kill history composes
  in on adoption day — that is R1.
- **Write model:** every app write site (game.ts ×5, game-state.ts fallout
  case, npc/agency.ts:196 — the survivors after §5's deletions) calls one
  helper that ADDS the delta to `world.globals['reputation_<f>']`
  (`addGlobal` semantics) and refreshes the view; `adjustReputation` on the
  profile is no longer called directly anywhere. `dialogueBias` keeps reading
  the profile (the view), so its behavior is preserved by construction.
- Proof: baseline + kill deltas + a pressure-fallout delta compose to one
  number the profile reports; save/load twice never double-counts.

### 10. Leverage unification (R6: income on, verbs off)

The tick's step 5a2 accrues leverage income on the PLAYER ENTITY's `custom`
map (`getLeverageState(entity.custom)`); the app's `tickPlayerLeverage` writes
currencies onto `profile.custom`. One ledger: the app's leverage currencies
become a view of the player entity's custom map after each round; the app's
own gains (`computeLeverageGains(profileHints)`) are applied to the ENTITY's
custom map via the engine's `applyLeverageDeltas`, then the view refreshes.
The `stats.leverage.*.gained/spent` bookkeeping keys stay on the profile.
Verbs stay in `KNOWN_EXCLUDED_VERBS` (R6).

### 11. SavedSession this slice

No schema bump (A3). The existing fields are written FROM the views at save
time, so a 2.0-adoption save still opens in a 1.7 build and the fields are
correct as of the last round. `engineState` carries the truth.

## Observed at the wave-4 stitch (inputs for later slices)

- **Faction agency answers fast:** in the harness the engine's faction-agency
  step resolved a freshly spawned bounty on the very next round
  (`pressure.resolved` then `faction.action.resolved`). Correct living-world
  behavior; a candidate single-lever for the A6 tuning program (how long a
  pressure should stand before a faction moves on it).
- **Chain-kind district drift:** the app's deleted `applyNpcEffects` carried a
  bespoke district-metric drift keyed off consequence-chain kind that the
  engine's own chain resolution does not reproduce (the engine drives
  intruder-likelihood through `modifyDistrictMetric` only). Deferred to A5
  as a depth item, not re-added app-side.
- **Hidden pressures and the narrator:** `describeEvent` returns nothing for
  a pressure event whose payload visibility is `hidden`; the player has not
  learned of it, so it is not narrator context.

## Out of scope

Hostile/companion engine combat turns (runNpcTurns / runCompanionTurns),
reader rewires and field deletion (A4), player surfaces for the five systems
and RumorEngine (A5), tuning (A6), the verb surface (R6), the SavedSession
schema bump and full-fidelity fixtures (A3).

## Ownership

- **A2-core — game-core:** turn-loop.ts hook (§1), game.ts round callback,
  views, write-through, deletions (§2–§5), proofs (§7) in game.test.ts /
  turn-loop.test.ts.
- **A2-core — narrative-llm:** describeEvent coverage (§6) + prompt-pin
  updates in its own tests; npc/agency.ts's now-dead `tickNpcAgency` /
  `applyNpcEffects` branches deleted or reduced to the surviving helpers
  (`buildNpcProfilesForDirector` may become a view adapter).
- **A2-core — runtime-foundry:** companion reaction drain (§2 step 6) in
  src/companion/**; hooks.ts assumptions under mid-round ambushes (F-62f5a5e5).
- **A2-core — tests:** the re-pin sweep (§7) + the determinism and
  no-double-simulation proofs in test/integration.
- **A2-core — cli-display:** director-renderer reads the same views (no
  change expected; observation seat) + any event-line rendering for tick
  events in play-renderer (F-174be483) — small, strings reviewed.
- **A2-truth — game-core:** §9, §10 + save-time views (§11); **cli-display:**
  §8 load seed in bin.ts; **tests:** §8 fixtures + idempotency proofs;
  **narrative-llm / runtime-foundry / ci-tooling:** honest-empty.
- **docs (coordinator):** this document; the persistence-versioning contract
  note at A3.
