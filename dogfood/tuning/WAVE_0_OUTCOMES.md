# Wave T0 — baseline (no lever)

**Program:** slice A6, the post-proof balance tuning of the living world
(`docs/living-world-slice-a6-phase9.md` §4; ruling R5: mandatory before Phase 10).
**Discipline:** one lever per wave; null + failure hypothesis; the same 13-world
× 30-round matrix with the same seeds every wave; P0 / P1 / P2; an outcomes
doc every wave; exit on zero P0 in the last three waves, no repeating P1,
convergence.
**Sheet:** `dogfood/tuning/matrix-baseline.json` — written by
`test/integration/phase9-living-world.test.ts` with `LIVING_WORLD_MATRIX_WRITE=1`
on main after wave 9 (composed proof 93/93; byte-identical across two runs).
Every world booted with a character profile built from its pack's first
archetype and background (milestones need one; player rumors spawn from
milestones).
**Entry gate:** the A5 played-scene proofs are green (15/15), the Phase-9
composed proof is green on every pack and the generated fixture, and the
Phase-9 transcript (`dogfood/phase9/transcript-starter-fantasy.txt`) shows the
scene. The Director's play-through of `docs/living-world-play-session.md` is
the human gate and is still open at the time of this baseline.

## The baseline, one row per world (30 rounds each)

| world | kills | heat max | pressures S/R/E | median survival | faction actions | opps S/A/E | ambushes | price Δ | mood | rumors C/M/H | stance believe/doubt | prompt max/median |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ashfall-dead | 5 | 25 | 2/0/1 | 13 | 2 | 2/1/1 | 1 | — | 2 | 0/0/0 | 0/0 | 1425/1219 |
| black-flag-requiem | 2 | 10 | 8/0/0 | — | 9 | 5/1/2 | 1 | — | 2 | 2/0/1 | 1/0 | 1661/1357 |
| chapel-threshold | 3 | 15 | 5/0/2 | 12 | 2 | 2/1/1 | 1 | 13 | 2 | 2/0/0 | 0/0 | 1766/1337 |
| crimson-court | 3 | 15 | 1/0/0 | — | 3 | 2/1/1 | 1 | — | 3 | 2/0/0 | 0/0 | 1685/976 |
| dust-devils-bargain | 2 | 10 | 2/0/1 | 13 | 3 | 2/1/2 | 2 | — | 2 | 0/0/0 | 0/0 | 1637/1254 |
| gaslight-detective | 2 | 10 | 1/0/0 | — | 3 | 3/1/1 | 1 | — | 2 | 1/0/0 | 0/0 | 1425/1195 |
| generated-phase9-fixture | 2 | 10 | 5/0/0 | — | 6 | 2/1/1 | 1 | — | 2 | 0/0/0 | 0/0 | 1332/1046 |
| hue-and-cry | 1 | 5 | 0/0/0 | — | 3 | 2/1/2 | 1 | — | 2 | 7/1/1 | 7/0 | 1441/1313 |
| iron-colosseum | 3 | 15 | 4/0/0 | — | 4 | 2/1/2 | 0 | — | 2 | 2/0/1 | 2/0 | 1603/1258 |
| jade-veil | 3 | 15 | 2/0/1 | 13 | 3 | 3/1/1 | 1 | — | 4 | 2/0/1 | 2/0 | 1585/1288 |
| neon-lockbox | 2 | 10 | 2/0/1 | 13 | 2 | 2/1/1 | 0 | — | 2 | 1/0/0 | 0/0 | 1606/973 |
| salt-road-ledger | 2 | 10 | 5/0/2 | 12 | 2 | 2/1/3 | 1 | — | 2 | 9/0/2 | 16/0 | 1693/1540 |
| signal-loss | 5 | 25 | 2/0/1 | 13 | 2 | 1/1/1 | 2 | — | 4 | 0/0/0 | 0/0 | 1622/1206 |

Heat decay onset: never observed (the decay grace is 37 quiet rounds; the
matrix is 30 rounds). Narration fallbacks: 0 on every world.

## Classification

### P0 — none

No world stopped producing turns, no heat spiral, no unbounded prompt (max
1766 chars on any turn). Tuning may proceed.

### P1 — drift, one lever each, in this order

1. **Rumor stance divergence is 0 on every world (16 believe, 0 doubt across
   the matrix).** The stance rule (`game.ts`, WO-A5-4) believes when faction
   uptake includes the hearer's faction OR the hearer's suspicion is below
   `rumorBelieveSuspicionBelow` (50); `DEFAULT_SUSPICION` is 0, so the second
   clause is always true. Lever: `rumorBelieveSuspicionBelow` (T1 candidate:
   1 — suspicion must be zero to believe outright) and, if the metric does
   not move, a second axis in the rule (a hostile faction doubts). Target
   band: doubt ≥ 1 on at least 6 of the 9 rumor-producing worlds.
2. **Rumor reach is thin: NPC hearers ≤ 2 on every world; 0 on four of the
   nine rumor-producing worlds.** The spread sweep reaches named NPCs in the
   player's district only; the fixed script leaves the player where the
   milestone fired (often a district with no named NPC). Lever:
   `rumorSpreadScope` is the wrong direction (zone is narrower); the
   candidate is a spread across adjacent districts, or a per-round decay of
   the "already heard" filter — both engine-adjacent. Target band: hearers
   ≥ 2 on every rumor-producing world.
3. **Pressures never resolve by faction agency within 30 rounds
   (pressuresResolved 0 on all 13; expiries at a median survival of 12–13
   ticks).** Wave 4 observed a bounty resolved the round after it spawned;
   the A2–A5 driver now shows the opposite. Engine-side constant (faction
   agency response cadence) — file with this sheet as evidence; app-side
   no lever exists. Target band: ≥ 1 resolution on worlds with ≥ 2
   pressures spawned.
4. **A quoted price moves on one world only (chapel-threshold, +13).**
   `quoteBuyPrice` prices from `GENRE_BUYABLE_STOCK` / `DEFAULT_BUYABLE_STOCK`
   (trade-core), fixed generic item ids that match no other pack's catalog.
   Engine ask (pack catalogs should feed buyable stock); no app lever.
5. **Named NPC agency fires on three worlds only** (chapel-threshold,
   salt-road-ledger, hue-and-cry); npc-agency's own alert / reputation /
   heat thresholds are never crossed elsewhere by this script. Lever
   candidates are engine thresholds; measured, filed with the sheet.

### P2 — noted, not blocking

- Ambushes are 0 on iron-colosseum and neon-lockbox: their hostiles are
  placed in zones directly, not registered through encounter-spawn. Content
  choice; a pack-authoring ask, not a tuning lever.
- Heat reaches the escalation threshold (25) on ashfall-dead and
  signal-loss within 30 rounds with five kills — every active pressure
  sharpens each round from there. Watch after T1–T2; no lever yet.
- The interpreter's fast path does not strip a leading article ("attack
  the X" costs an LLM round-trip). Hardening item, not balance.
- Heat decay onset is unobservable in a 30-round matrix; a 45-round
  variant would measure it. Runner option, not a lever.

## Wave T1 — proposed (one lever)

**Lever:** `rumorBelieveSuspicionBelow` 50 → 1 (P1 #1).
**Null hypothesis:** stanceDoubtCount ≥ 1 on ≥ 6 of the 9 rumor-producing
worlds; every other column of the sheet byte-identical (the lever touches
stance only).
**Failure hypothesis:** believe drops to 0 everywhere (the threshold alone
cannot produce a MIX; the rule needs a second axis) — then T2 is the
rule's shape, not its number.
**Run:** `LIVING_WORLD_MATRIX_WRITE=1 LIVING_WORLD_MATRIX_LABEL=t1 npx vitest run
test/integration/phase9-living-world.test.ts` with the lever set in the
runner's `GameConfig.tuning`; diff `matrix-t1.json` against the baseline.
