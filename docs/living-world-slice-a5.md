# Slice A5 — the world reaches the player: the five systems' surfaces and per-hearer rumors

**Cycle:** the living-world cycle (Path A → v2.0.0), run `swarm-1788288802-f5a0`.
**Rulings this slice executes:** the kickoff's A5 mandate (every never-run
system reaches the player), the rumor-system admission (per-hearer stances in
dialogue), R6 (leverage income visible; the VERBS stay suppressed).
Ruling record: `E:/AI/testing-os/swarms/swarm-1788288802-f5a0/RULINGS-A-cycle.md`.
**Grounding:** wave-1 F-0fdf429f (two heat concepts, one help page),
F-174be483 (no event-keyed rendering surface exists), F-62f5a5e5 (ambush
timing; presentation fixed in wave 4), F-61967811 (the rumor seam map),
F-4e8dbbad (obligations, threaded in A4), F-817a391e (recap has no
living-world hook); the wave-4 observations (faction agency answers fast;
chain-kind district drift lost) and the engine's `trade-core` (prices already
compose `world.factions[f].reputation + reputation_<f>` globals).
**Prerequisites:** A2, A3, A4 on main.

## Why this slice exists

A1 through A4 make the world true. A5 makes it observable to the player: a
price change that follows a reputation change, a narrated district mood
change, NPC lines shaped by goals and obligations, a visible heat ledger with
its cooling countdown, an ambush on a zone threshold, and two NPCs holding
different stances on the same rumor. STRINGS LAW governs every line here; the
coordinator ratifies at stitch.

## Design (locked)

### 1. Prices that move (economy + reputation)

- `/market` and `/trade` (director) render, per district, the engine's live
  supply picture from `getEconomyCoreState(world)` (already the view) PLUS a
  reputation line for the district's controlling faction computed through
  the engine's own `quoteBuyPrice(world, itemId, genre)` on a representative
  item (the pack's first tradeable, or the district's first stocked
  category) — "Merchants here mark you up 15% (Chapel Undead: hostile)". No
  hand-rolled price math; the engine's quote is the number.
- A pressure-fallout or defeat-fallout reputation change reflects in the
  next `/market` quote (proof by two quotes around a kill).

### 2. District mood reaches narration and audio

- The tick's step 0c tracks the player's district tone round over round and
  queues a companion reaction on a TRANSITION; narration gets the transition
  as a `describeEvent` line only if the engine emits an event for it (the
  agent verifies the event name; if none is emitted, `runWorldRound`
  compares `getWorldTickState(world).districtTones[district]` before/after
  the tick and threads a `moodTransition?: { from, to }` param into
  `narrateScene` — rendered as one mechanical line, e.g. "The district's
  mood turns grim").
- Audio: on a transition, `immersion-runtime` re-derives the zone music
  from the new tone through the engine's `districtToneToSoundMood` (3.10) so
  the bed changes with the district, not only on zone entry.

### 3. NPC goals and obligations in dialogue

- A4 threads the obligation ledger into `buildNpcProfile`. A5 renders it:
  the dialogue prompt gains two mechanical lines per NPC — their top current
  goal (from the engine profile's goals) and their standing obligation
  toward the player ("owes you a favor" / "you owe them a debt" / "was
  betrayed by you"); the NPC's spoken reply may draw on both. Player-visible
  only through the NPC's words (no new UI line).
- `/npc <id>` (director) shows the goal + obligation lines.

### 4. Heat and leverage income visible

- `/leverage` (director) renders the ENGINE ledger alongside the currency
  wallet: `Heat: {player_heat} ({quietRounds}/{QUIET_ROUNDS_BEFORE_DECAY}
  quiet rounds to cooling)`, faction alerts above zero, and "Income this
  round: +N favor / +M influence" from the tick's leverage step (difference
  of `getLeverageState(player.custom)` before/after the round, captured in
  `runWorldRound`).
- `/status` keeps the A4 ledger line.
- The leverage help page (F-0fdf429f) is REWRITTEN by the coordinator to
  describe the one heat the game has now (the engine's: wake at 10,
  escalation at 25, decay after 37 quiet rounds, per-kill +5) and to say
  that leverage income accrues each round from reputation and milestones.
  Agents do not author this copy; cli-display leaves the render slot.

### 5. Ambush on the threshold

- Presentation already enters combat on `encounter.spawned` (wave 4). A5
  adds: the immersion combat-start hook fires the warning SFX + music
  intensify on the ambush round itself (verify; fix if still one round
  late), and the play renderer shows the ambush line ("Ambush: {name} in
  {zone}" — the describeEvent line already exists; the display surfaces it
  as the round's headline when present).
- Generated worlds: the proposal's `encounters[]` (A1) are the content;
  pack worlds: the starters' authored tables.

### 6. Per-hearer rumors in dialogue (the RumorEngine read side)

- **Spread (write side, per round, in `runWorldRound` after the mirror
  sweep):** for each active RumorEngine rumor about the player, spread once
  per round to every named NPC in the player's current district who has not
  heard it (`spreadPath` excludes them), with `spreaderId` = the rumor's
  last spreader, `receiverFactionId` via `resolveEntityFaction`,
  `environmentInstability` = 1 − (district stability / 100) clamped, and the
  engine's own mutation rules. Determinism holds by construction: the
  installed rumor-system draws its mutation rolls from a hash of rumor id,
  hop count, and rule id (engine.ts:661, mutations.ts:138), not from
  `Math.random` — the living-world-driver proof stays byte-identical.
- **Stances:** when an NPC first hears a rumor, the app sets a stance from
  the NPC's cognition: `believe` if the rumor's faction uptake includes
  their faction or their suspicion is low, `doubt` otherwise (one rule,
  documented; A6 tunes).
- **Read side:** `DialogueInput.playerRumors` (4-valence) is REPLACED by
  `hearerRumors: Array<{ claim, stance, confidence, mutationCount }>` from
  `heardBy(npcId)` + `stanceOf(npcId, rumor.id)`; the dialogue system
  prompt's valence rules become stance rules ("an NPC who doubts a rumor
  hedges; one who believes it acts on it"); `getRumorsKnownToFaction` and
  the 4-valence formatter are deleted from the dialogue path (the
  player-rumor ledger remains the mirror's source and the `/rumors` board's
  player-side list).
- **The board:** `/rumors` renders the engine's `formatRumorBoard` view of
  what the player's own rumors have become (mutation count, who has taken
  them up) — the "two hearers, two versions" moment is visible here.

### 7. Recap and chronicle

- Session recap gains a "The world moved" section from the round ledgers:
  pressures spawned/resolved/expired, opportunities offered/expired,
  ambushes, district mood transitions, rumors mutated — counts + the
  headline of each (mechanical register).
- Chronicle records for pressure resolution / faction / NPC actions already
  derive from the views (A2); add ambush and mood-transition records.

### 8. Proofs (the Phase-9 composed proof's building blocks)

Each system gets a played-scene proof through the harness with the fake
client capturing prompts and frames:

1. kill → `player_heat` +5 → heat wake → a pressure spawns → its line is in
   the narration prompt the same round → `/leverage` shows the heat.
2. reputation delta → `/market` quote moves.
3. forced district transition → narration line + music bed change.
4. an NPC with an obligation → dialogue prompt carries the obligation line.
5. zone entry with an authored encounter table → ambush line + combat state
   + combat-start cue on the same round.
6. a rumor spread to two NPCs with different stances → two different
   dialogue prompt lines; `/rumors` board shows the mutation.
7. recap "The world moved" section after ten rounds.
Determinism: the living-world-driver proof stays byte-identical.

## Out of scope

Balance values (A6), the verb surface (R6), engine combat turns, the schema
(A3 done), reader mechanics (A4 done).

## Ownership for the execute wave

- **game-core:** §1 quote data, §2 transition detection + param, §4 ledger
  data + income capture, §6 spread + stance rule, §7 recap data.
- **narrative-llm:** §3 dialogue lines, §6 `hearerRumors` + prompt rules +
  deletion of the 4-valence dialogue path, §7 recap section rendering.
- **runtime-foundry:** §2 music re-derivation on transition, §5 combat-start
  timing.
- **cli-display:** §1 `/market` `/trade` lines, §3 `/npc`, §4 `/leverage`,
  §5 ambush headline, §6 `/rumors` board (all STRINGS listed verbatim).
- **tests:** §8 proofs in `test/integration/living-world-surfaces.test.ts`.
- **ci-tooling:** honest-empty.
- **docs (coordinator):** this document; the leverage help copy; README's
  living-world section at Phase 10.
