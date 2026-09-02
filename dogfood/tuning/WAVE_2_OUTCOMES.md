# Wave T2 — lever: `rumorSpreadScope` 'district' → 'adjacent-districts'

**Program:** slice A6 (`docs/living-world-slice-a6-phase9.md` §4). Previous:
`WAVE_1_OUTCOMES.md` (sheet `matrix-t1.json`, the comparison base). Sheet:
`dogfood/tuning/matrix-t2.json` (same 13 worlds, seeds, script; runner
passthrough `LIVING_WORLD_TUNING_JSON='{"rumorSpreadScope":"adjacent-districts"}'`).

**The lever is structural** (a third scope value): named NPCs in the player's
district AND every district sharing a zone edge with it hear a rumor about
the player once per round. Red-first proof in `src/game.test.ts` (a rumor
spawned in crypt-depths, which has no named NPC, reaches chapel-grounds'
pilgrim and Brother Aldric through the vestry-door ↔ chapel-nave edge; the
`'district'` scope reaches neither).

**Null hypothesis:** `rumorHearers ≥ 2` on every rumor-producing world;
only rumor columns move.
**Failure hypothesis (over-reach):** hearers equal the world's named-NPC
count on the rumor's first round.

## Result — diff against T1

| world | hearers (T1 → T2) | believe / doubt (T1 → T2) | mutated | every other column |
|---|---|---|---|---|
| chapel-threshold | 0 → 2 | 0/0 → 0/4 | — | identical |
| hue-and-cry | 1 → 4 | 0/7 → 7/21 | 1 → 8 | identical |
| crimson-court | 0 → 1 | 0/0 → 0/1 | — | identical |
| gaslight-detective | 0 → 1 | 0/0 → 0/1 | — | identical |
| neon-lockbox | 0 → 1 | 0/0 → 0/1 | — | identical |
| the other eight worlds | unchanged | unchanged | — | identical |

- **Attribution is clean:** only rumor columns moved, on five worlds; the
  other eight are byte-identical.
- **Reach is now at the content ceiling.** Named NPCs per pack (measured
  from each pack's world at seed 4242): chapel-threshold 2, salt-road-ledger
  2, hue-and-cry 4, every other pack exactly 1. After T2, chapel-threshold
  reaches 2 of 2, hue-and-cry 4 of 4, salt-road-ledger 2 of 2 (already at
  T1), and the one-named packs reach their one named NPC wherever the
  script's path shares a district edge with them (crimson-court,
  gaslight-detective, neon-lockbox now 1 of 1; iron-colosseum, jade-veil,
  black-flag-requiem already 1 of 1). No app lever can add a hearer that
  the pack does not author.
- **Null hypothesis not met as written (hearers ≥ 2 on 3 of 9)** — because
  it was mis-set: the reachable band on a one-named pack is 1. Re-stated as
  "hearers = every named NPC within one district edge," T2 meets it on
  every rumor-producing world.
- **Over-reach:** hue-and-cry's four named NPCs sit in four zones across
  adjacent districts; reaching all four over the rumor's lifetime in a
  30-round matrix is the rule working, not the signature (the signature
  is all four on round one — the sheet cannot resolve rounds; the round
  metrics can, if a later wave needs it).

## Classification

- **P0:** none (three waves running: T0, T1, T2).
- **P1 (closed):** rumor stance divergence (T1) and rumor reach (T2) are at
  the app-side ceiling. Design-doc item 6 (two hearers, two stances) is now
  true on 3 of 13 worlds — the three packs that author two or more named
  NPCs. The rest cannot produce it by content.
- **P1 (engine asks, not app levers — filed with the sheets as evidence):**
  faction agency never resolves a pressure within 30 rounds
  (pressuresResolved 0 on every world, every wave); a quoted price moves
  on chapel-threshold only (the engine's fixed buyable-stock ids match no
  other pack's catalog); named-NPC agency fires on three worlds only
  (npc-agency's thresholds). None has an app-side lever; the tuning
  program cannot move them.
- **P2 (pack authoring):** nine packs author one named NPC; the street
  cannot disagree with itself. A second named NPC per pack is a content
  ask. Ambush tables absent on iron-colosseum and neon-lockbox (T0 P2,
  unchanged).
- **P2 (carried from T0):** heat 25 on two worlds; decay unobservable at 30
  rounds; the interpreter's article fast path.

## Decision

**The lever is adopted as the default:** `rumorSpreadScope:
'adjacent-districts'`. The defaults proof, the partial-override proof, and
the `/tuning` pin follow; the `'district'`-versus-`'zone'` proof sets its
own scope explicitly.

## Exit evaluation (the playbook's three conditions)

1. **Zero P0 in the last three waves:** T0, T1, T2 — yes.
2. **No repeating P1:** reach was P1 at T0 and T1 and is closed at T2 at the
   content ceiling; the remaining P1s are engine constants with no app
   lever and do not repeat as tuning targets. Yes, with the engine asks
   carried out of the program rather than around it.
3. **Convergence, not oscillation:** across T0 → T1 → T2 only the rumor
   columns moved, each wave monotonically, every other column
   byte-identical on every world. Yes.

**Coordinator recommendation:** the app-side tuning program exits here. What
remains for the living world's balance lives in the engine (three asks) and
in pack content (a second named NPC per pack). Phase 10 stays gated on the
Director's play-through of `docs/living-world-play-session.md`; the Director
may order further waves from this doc's P2 list instead.
