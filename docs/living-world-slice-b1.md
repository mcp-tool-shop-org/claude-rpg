# Slice B1 — the reactive street

**Cycle:** the living-world cycle (Path A → v2.0.0), run `swarm-1788288802-f5a0`.
**Why this slice exists:** the Phase-9 family playtest (five model families, forty
turns each — `dogfood/playtest/runs/phase9-2026-09-01/COORDINATOR.md`) found the
world alive in its own motion and inert in its reaction to the player. No seat
killed anything: the play screen shows nothing about an enemy and enemies never
act, so the kill → heat → pressure → faction spine never fired. Two families
were confused by the command surface; one hint printed on most screens. The
Director then ordered more than the four fixes: recognition for good deeds,
predatory NPCs who con, NPCs in real need, and no at-a-glance way to tell which
is which — the ambiguity is the point.
**Research grounding:** `E:/AI/testing-os/swarms/swarm-1788288802-f5a0/study-swarm-b1/dispatch-b1.md`
(36 findings from five Opus research agents, every source retrieved; the
arXiv/DOI items pass the different-family citation gate before they bear
weight). Load-bearing choices below cite findings by number.
**Verification:** every arXiv/DOI citation resolved; 14 claims supported
outright by the different-family gate, 13 supported in gist and trimmed to
their abstracts, none fabricated (receipts in the study-swarm folder).
**Status: DRAFT for the Director's review before any code (dogfood-swarm
law 8).**

## Design (locked on ratification)

### 1. Combat you can read (findings 1, 3, 4, 5, 6, 7; 2 is the warning)

- **A condition rung, not a number, on the status line during combat.** Five
  named rungs derived from `hp / maxHp`: unhurt (100%), hurt (≥ 67%),
  bloodied (≥ 34%), reeling (> 0), down. The status block gains one line per
  hostile sharing the zone — `Crypt Stalker: bloodied · Ash Ghoul: unhurt` —
  the same token vocabulary everywhere (1, 4). A HUD readout beat every
  atmospheric alternative for health monitoring (1); the rung set is small
  and ordered so it stays discrete and precise without numerals (4); a rung
  that visibly steps down each hit is the progress indicator that keeps a
  player in a fight (3).
- **A deterministic outcome line per attack, printed the same turn, before
  the narration** (5, 7): `Your strike lands — Crypt Stalker: reeling.` and,
  on a kill, the reserved line `The Crypt Stalker falls.` These come from the
  engine's events (`combat.damage.applied`, `combat.entity.defeated`), not the
  narrator; the narration prompt receives them so the prose derives from the
  state delta (7) instead of substituting for it (2).
- **Stable target identity.** Spawned patrol members get display names the
  interpreter can resolve (`Crypt Stalker (wounded)` is not a second entity);
  `inspect <hostile>` reports the rung (6).
- **Enemy corpses leave the target list.** A downed hostile is no longer an
  attack target; the interpreter resolves "attack the stalker" to a live one.

### 2. Enemies that act (findings 8–16)

- **The hostile turn.** Each round, after the player's action resolves and
  before the world tick, every live hostile in the player's zone with an AI
  profile chooses through the engine's one-call driver
  (`selectActionForEntity`) and the app submits that action. Today nothing
  calls it; the pack's enemies carry profiles (cautious, aggressive,
  territorial) that the engine already evaluates.
- **Awareness makes aggression.** A hostile becomes aware of the player on
  the round the player enters its zone (encounter spawn or authored presence)
  and on being attacked; awareness is what lets the profiles produce attack
  intents instead of "idle: scanning" (verified against the installed engine
  at execute time — honesty floor).
- **Telegraph, then land** (16, 15, 14): the round a hostile decides to
  attack, the screen shows its intent in the reserved channel — `The Ash
  Ghoul readies a lunge at you.` — and the hit lands the next round with a
  legible line naming cause and amount: `The Ash Ghoul's claw finds your
  flank — 4 damage.` Every death is the player's own fault; every loss
  teaches (14).
- **Moderate, attainable pressure by default** (9, 10, 11; 10 supports the
  arousal effect of difficulty in turn-based play, the tactical-variation
  claim was trimmed at the gate): damage is the
  ruleset's formula (attacker vigor, minimum 1); at the starter build's 20 HP
  a stalker needs about five landed hits to down the player, and the player
  downs a stalker in three or four. HP becomes a decision weight (11).
- **Beginner safety is visible and opt-in, never hidden** (12, 13): `flee`
  (the engine's disengage) is on the command strip whenever a hostile is
  aware; the existing death-as-setback screen stays; there is no hidden
  rubber-banding. A `tuning.enemyAggression` lever (`off | telegraphed |
  immediate`, default `telegraphed`) and `tuning.enemyDamageScale` (default
  1) enter the A6 surface so the tuning program can move them with the sheet
  (13 — transparent, deterministic).

### 3. A command surface that teaches (findings 17–22)

- **Unknown slash commands are answered at the parser layer** (22, 17): a
  play-mode `/word` that is not a play command costs no turn and never
  reaches the interpreter. The reply names the nearest known command
  (`Did you mean /status?`), says which family it belongs to (`/pressures,
  /rumors, /npc, /market live in director mode — type /director`), and lists
  the two or three commands valid right now.
- **Multi-word arguments join** (`/npc Suspicious Pilgrim`, `/trade Crypt
  Depths`); entity names resolve with a leading article stripped
  (`attack the stalker`) on the fast path, saving the LLM round trip.
- **A per-context command strip replaces the generic "TRY:" block** (22):
  derived from state each turn — `talk to <named NPC here> · go <exit> ·
  attack <aware hostile> · flee · accept <open opportunity>` — kept short,
  always visible, and true (Short 2016: keep the verbs on screen).
- **Hints obey a cooldown and a budget** (18, 19, 20, 21): a hint fires at
  most twice per cause per session, then retires; a fired hint re-arms only
  on a state change (a new district, a new opportunity); phrasing rotates
  through variants; and anything the player must act on is stated inline in
  the turn's prose with the exact input (`accept <title>`), not in the
  status banner (21: banner-like interface content is ignored; the
  position mechanism is the paper's discussion, trimmed at the gate). The black-market line becomes a once-per-district
  notice.

### 4. The street's faces: asks, predators, and the needy (findings 23–29)

- **An ask is a request an NPC makes of the player**, engine-authored and
  deterministic (seeded), rendered by the narrator but never invented by it
  (25). Asks come from named NPCs and from petitioners the world tick seats
  in a district (a woman at the chapel door, a courier on the vestry stair):
  carry this, lend coin for a sick child, guide me below, hold this relic,
  vouch for me to the Guard.
- **Every ask carries a hidden truth: genuine or predatory.** The surface is
  identical. A predatory ask resolves against the player: the lent coin is
  gone, the guided path is an ambush, the held relic is stolen goods a
  faction later pins on the holder, the vouched-for petitioner burns the
  player's standing. A genuine ask, helped, resolves for the player (§5);
  ignored, it resolves badly for the petitioner — and the world says so
  later (27: the sting is productive when it has something to attach to).
- **No tell the player is supposed to read** (23). No perception stat, no
  trust meter (29). The cues are weak and fair (24, 28): each predator
  carries two or three pre-planted, re-inspectable details — a rumor on the
  board about someone matching their story, a faction tie visible in `/npc`,
  a contradiction between what they claim and what `/people` recorded them
  doing — and their dialogue shows the timing signature of a lie (a stall,
  an over-elaboration, a dodged direct question) at the weak strength the
  social-deduction data supports (24). Cross-checking catches them;
  intuition runs at 54% (23).
- **Consequences are delayed and compound** (29, 27): the con reveals itself
  three to ten rounds later through the world-moved ledger and a rumor;
  the reveal names the planted details so it reads "I missed it", never
  "the game cheated" (28).
- **Stakes scale with standing** (26: any perceived deception lowers
  ratings monotonically; the novice-sensitivity detail was trimmed at the
  gate, so the scaling rule stands on caution, not a measured moderator):
  while the player's highest faction reputation is low, predatory asks cost
  little (a few coin, a short detour); as standing rises, so do the stakes
  and the sophistication.
  Roughly one predatory ask in three at the start; the ratio and the reveal
  delay are A6 levers (`tuning.askPredatorRatio`, `tuning.askRevealRounds`).

### 5. Recognition for good deeds (findings 30–36)

- **Witnessed, named, immediate, per-faction, materially unpaid.**
  Helping a genuine ask produces, the same round: an acknowledgment line
  naming the deed (36, 33) — `Sister Maren will remember who carried the
  water.`; a reputation delta on the petitioner's faction (32: per-faction,
  never an aggregate bar); a witnessed rumor with the deed as its claim,
  spread by the existing RumorEngine and believed or doubted by the T1 rule
  (35: public beats private; the street tells it).
- **Gratitude that pays back at cost and is never computed aloud** (36): a
  helped NPC carries a gratitude state that later repays at genuine cost — a
  warning the round before an ambush, a price the merchant did not have to
  give, an intervention in a pressure — and spills to their faction and
  district. No NPC ever names the debt.
- **Titles the street uses** (34): standing above a threshold earns an
  honorific that NPCs use in dialogue and that `/leverage` shows under the
  ledger; symbolic only (31: an announced material reward would crowd the
  motive out). Unannounced material payoffs may still arrive through
  gratitude, never as a listed price.
- **Recognition is not a score.** No karma readout; the ledgers record what
  happened (29). The recap's THE WORLD MOVED gains "Deeds remembered" and
  "Marks the street left on you".

### 6. Proofs (red first; the family playtest is the exit gate)

1. Legibility: a scripted fight shows the rung stepping down and the kill
   line the turn the engine emits `combat.entity.defeated`; a downed hostile
   is no longer a target.
2. Enemy turn: an aware hostile telegraphs, then lands a hit with a
   cause-and-amount line; player HP decreases; `flee` ends the encounter;
   `enemyAggression: 'off'` reproduces today's behavior byte-identically.
3. Command surface: an unknown play-mode slash command costs no turn and
   names the near-miss; `/npc Suspicious Pilgrim` resolves; the black-market
   hint appears at most twice per district; the command strip lists only
   inputs the interpreter accepts.
4. Asks: a genuine and a predatory ask with identical surface text; the
   predator's planted details are inspectable before the reveal; the reveal
   lands within the configured window and names them; ignoring the genuine
   ask surfaces its outcome later.
5. Recognition: the acknowledgment line, the faction delta, the rumor, the
   gratitude payoff, the honorific, and the recap lines.
6. Determinism: living-world-driver byte-identical at defaults; the T2
   sheet byte-identical with the new levers at their defaults.
7. **Exit gate:** `ai-playtest` rerun with the same five seats; the report's
   right-hand columns (street reacts to the player) must move, and no seat
   may report the con as unfair. The Director rules on the second report.

### 7. Ownership for the execute wave

- **game-core:** the hostile-turn step and awareness; the asks ledger (state,
  truth, reveal scheduling, consequences) on world truth; recognition wiring
  (acknowledgment, faction delta, rumor claim, gratitude state, honorifics);
  hint policy (cooldown, budget, re-arm); the new tuning levers.
- **narrative-llm:** outcome and telegraph lines into the narration prompt;
  ask dialogue rendering from the engine-authored truth with the weak lie
  signature; acknowledgment and honorific lines; recap sections.
- **runtime-foundry:** asks and petitioners in generated worlds; combat and
  telegraph cues in the runtime.
- **cli-display:** the status hostile line, the reserved combat channel, the
  unknown-slash reply, the command strip, multi-word arguments, `/leverage`
  honorific.
- **tests:** the proofs above and the playtest rerun.
- **docs (coordinator):** this document, the strings ratification, the
  second playtest's coordinator reading.

## Out of scope

Engine-side changes (asks and gratitude live app-side on world truth;
enemy turns use the engine's existing driver); the verb surface (R6); Phase
10.
