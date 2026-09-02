# Slice A6 + Phase 9 — the tuning program and the composed proof

**Cycle:** the living-world cycle (Path A → v2.0.0), run `swarm-1788288802-f5a0`.
**Rulings:** R5 (the tuning program is MANDATORY between the composed proof
and Phase 10; nothing ships untuned). Ruling record:
`E:/AI/testing-os/swarms/swarm-1788288802-f5a0/RULINGS-A-cycle.md`.
**Discipline:** the studio's post-proof-balance-tuning playbook
(`C:/Users/mikey/.claude/projects/F--AI/memory/post-proof-balance-tuning.md`):
ONE lever per wave; null + failure hypothesis; a fixed scenario matrix with
the same seeds; P0 / P1 / P2 classification; a `WAVE_<N>_OUTCOMES.md` every
wave; exit on zero P0 in the last three waves, no repeating P1, convergence.
**Entry gate (claude-rpg's form of the playbook's three proofs — GDOS is not
scaffolded on this game by standing rule):** the A5 played-scene proofs are
green AND the Phase-9 composed proof (§1) is green on every pack and on the
generated fixture. Tuning an unproven world is the anti-pattern the playbook
names.

## Phase 9 — the composed proof (two halves, one gate)

### 1. The automated half: `test/integration/phase9-living-world.test.ts`

For each of the 12 starter packs and the generated fixture proposal: boot a
`GameSession` through the harness with the fake client, seed nothing, and
play a **fixed 30-round scripted matrix** (the same seed per pack; inputs
drawn from a documented script: look, move along the pack's zone graph,
attack the nearest hostile when one shares the zone, talk to the nearest
named NPC, accept the first offered opportunity). Across the matrix, assert
that the six living-world links each occur at least once **per pack** (or
name the pack that structurally cannot produce one, with the reason — e.g.
a pack with no hostiles cannot ambush):

1. a kill raises `player_heat`; a pressure spawns once heat wakes; a later
   round escalates it, resolves it (faction agency), or expires it;
2. a district economy tick moves a quoted price;
3. a named NPC acts (an `npc.action.resolved` event, a last-action in the
   namespace);
4. an opportunity spawns and is accepted or expires with fallout;
5. a zone entry spawns an encounter (packs with authored tables; the
   generated fixture through its proposal encounters);
6. the world produced a rumor about the player (**ruled at the wave-9
   stitch:** the gate is this structural half; reach — an NPC hearer with
   a stance — and two hearers with two different stances are measured on
   the sheet and tuned in A6: at the default stance rule every hearer
   believes, because suspicion starts at 0 and the believe threshold is 50,
   and the fixed script often leaves the player where no named NPC can
   hear).

The proof also writes the **metrics sheet** the tuning program consumes
(`dogfood/tuning/matrix-<label>.json`, one row per pack): rounds, kills,
heat max / decay onset round, pressures spawned / resolved / expired and
median survival, faction actions, opportunities spawned / accepted /
expired, ambushes, max price delta, mood transitions, rumors created /
mutated / hearers / stance split, narration prompt size per turn (chars,
max and median), narration fallbacks. Deterministic: the sheet is
byte-identical across two runs (the living-world-driver proof's guarantee,
extended to 13 worlds).

### 2. The human half: the played scene

The studio discriminator is a playable scene a human has played. The
coordinator authors `docs/living-world-play-session.md`: a 20-minute session
script on starter-fantasy (which inputs to type, what the world should do at
each beat, which `/` commands reveal the ledger), plus a harness-captured
transcript of that exact script (`dogfood/phase9/transcript-starter-fantasy.txt`)
as the reproducible evidence. **The gate is the Director playing it.** Phase
10 does not start until that session has been played and the Director has
ruled the scene alive or named what is not.

## Slice A6 — the tuning program

### 3. What the app can tune, and what it cannot

- **App levers (this program):** the generated-world stack config
  (`encounterSpawn.baseChance` / `safetyStep`, `districtDecay`,
  `economyGenre`), the RumorEngine `stanceFadeTicks`, the app's stance rule
  threshold and spread scope (district vs zone), the app's rumor / ledger
  caps, the narration prompt budget (how many pressure / opportunity /
  rumor lines per turn), the `moodTransition` and ambush line policies.
- **Engine constants (asks, with measured evidence):** `HEAT_WAKE_THRESHOLD`,
  `HEAT_ESCALATION_THRESHOLD`, `QUIET_ROUNDS_BEFORE_DECAY`, per-kill heat,
  faction-agency response cadence (a fresh bounty resolved the next round —
  observed at wave 4), pack-authored encounter tables and district decay for
  the 12 starters. The matrix measures both world classes; app levers move
  here, engine constants are filed upstream with the sheet as evidence. That
  is honest scope, not a shortcut: the pack worlds' authored content belongs
  to the engine repo's own tuning cycle.

### 4. The wave loop, instantiated

- **Wave T0 — baseline (no lever):** run the matrix on main after A5; write
  `dogfood/tuning/WAVE_0_OUTCOMES.md` with the sheet and a first
  classification. Expected P1 candidates from what the cycle already
  observed: faction agency resolves a bounty in one round (engine ask or
  app-side pressure shielding?), ambush frequency per zone entry, rumor
  reach (do two NPCs hear the same rumor within 15 rounds?), prompt size
  growth with the living-world lines, mood-transition churn.
- **Waves T1…Tn — one lever each:** a wave doc names the lever, the null
  hypothesis (the metric moves to its target band), the failure hypothesis
  (over/undershoot signature), and runs the same matrix (same seeds).
  Classification and the outcomes doc follow the playbook. Target bands are
  set in T0 from the baseline, not guessed here; the cycle commits to
  bands, not to values.
- **P0 rule:** a P0 (a world that stops producing turns, a runaway heat
  spiral that kills every path, an unbounded prompt) halts tuning; the fix
  is a structural wave with its own proof re-run.
- **Exit:** the playbook's three conditions. Then Phase 10.

### 5. Ownership

- **tests:** the composed proof + the matrix runner and metrics sheet
  (Phase 9 §1), the per-wave matrix runs.
- **game-core:** the metrics hooks the runner reads (per-round ledger
  counters — the A5 `worldMovedLedger` extended with heat / price / prompt
  size), app-lever plumbing (config surface for the levers in §3 as
  `GameConfig.tuning?: {...}` with documented defaults).
- **runtime-foundry:** the generated-world stack config levers
  (`instantiateWorld` accepts the tuning config).
- **docs (coordinator):** this document, the play-session script, every
  `WAVE_<N>_OUTCOMES.md`, the engine asks.
- **The Director:** the played scene.

## Out of scope

Phase 10 (shipcheck, README/CHANGELOG/handbook, translations before
tag-push, v2.0.0), the verb surface (R6), engine-side constant changes
(asks only).
