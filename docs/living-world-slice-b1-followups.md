# Slice B1 follow-ups — what three family playtests asked for

**Cycle:** the living-world cycle (Path A → v2.0.0), run `swarm-1788288802-f5a0`,
wave 11 (feature-execute). **Law:** this document plus
`docs/living-world-slice-b1.md` (ratified) and
`E:/AI/testing-os/swarms/swarm-1788288802-f5a0/B1-COORDINATOR-STRINGS.md`
(the wave-10 rulings). **Evidence:** the three family playtests of 2026-09-02
(`dogfood/playtest/runs/b1-2026-09-02{,b,c}/COORDINATOR.md`). Slice B1's exit
gate is met; these are the items every reading carried forward. Portraits
(slice B2) are on hold by Director ruling and are not in this wave.

## The eight items, as observed

| # | Observed (seat, run) | Work order |
|---|---|---|
| 1 | "The dead do not stay buried." typed in answer to Brother Aldric's question was met with "I'm not sure what you mean" four times (gemini, run a) | **WO-B1F-1 reply-to-speaker** |
| 2 | `/go`, `/move`, `/zone` "unresponsive"; `/rumors` sent the player to director mode (qwen, mistral, runs a–c) | **WO-B1F-2 play-mode aliases** |
| 3 | `Brother Aldric` typed alone → "Did you want to inspect or move?" (mistral, run a) | **WO-B1F-3 bare name means talk** |
| 4 | price-reacts 0 of 5 in all three runs: no seat found `/market` or `/trade` | **WO-B1F-4 one quoted price in the district view** |
| 5 | pressure lifecycle visible only in the recap (all runs) | **WO-B1F-5 one line when a pressure moves** |
| 6 | the Ash Ghoul's 9- and 6-damage hits downed a level-1 character at turn 36 (mistral, run b) | **WO-B1F-6 a downed-player metric and the damage lever, measured** |
| 7 | two `help <petitioner>` inputs did not resolve the ask (deepseek, llama, run b); one traced input in run c resolved | **WO-B1F-7 the help path, traced and proven** |
| 8 | the unknown-command reply's valid-now list is fixed; the command strip already knows the state | **WO-B1F-8 valid-now from the strip** |

## Design locks

1. **Reply-to-speaker (WO-B1F-1, game-core):** when the previous turn's
   output carried NPC dialogue addressed to the player (game.ts already
   records the exchange per npcId via `recordConversationExchange`), a
   free-prose input that the fast path does not match and that contains no
   recognized verb resolves as `speak` to that NPC with the input as the
   line — before the LLM interpreter runs. Clarification prompts ("I'm not
   sure what you mean") are never the answer to a sentence typed at someone
   who just spoke. Proof: a scripted exchange where the reply lands as
   dialogue, not clarification.
2. **Play-mode aliases (WO-B1F-2, game-core + cli-display):** `/go <exit>`,
   `/move <exit>`, `/zone <exit>` resolve as the move verb in play mode;
   `/rumors` is readable from play mode (the director renderer's rumor view,
   same output); the unknown-command reply for a director-only command keeps
   saying where it lives. The play help lists the aliases. No new engine verb.
3. **Bare name (WO-B1F-3, game-core):** an input that is exactly a named
   entity in the zone (article-stripped, case-insensitive) resolves as
   `speak` to it; a bare exit name resolves as `move`. Only when neither
   matches does the interpreter ask.
4. **A quoted price (WO-B1F-4, game-core + cli-display):** the play screen's
   location block carries one line when the player's district has a market:
   `Market: <item> <price> (<standing note>)` — the item is the district's
   first buyable stock item, the price is `quoteBuyPrice`'s number, the note
   is the existing standing/markup phrase the quote already carries. Rendered
   by cli-display from a `marketQuote?: { item, price, note }` field game-core
   fills on the presenter input; absent renders nothing (byte-identical for
   every existing fixture without a market).
5. **A line when a pressure moves (WO-B1F-5, game-core + cli-display):** the
   world-moved kinds `pressure-spawned`, `pressure-resolved`,
   `pressure-expired` already exist; each now also pushes its headline
   through the announcement channel the ask lines use, once, the round it
   happens. Strings: the existing headlines, unchanged.
6. **Downed metric and the damage lever (WO-B1F-6, tests + coordinator):**
   the matrix runner gains `playerDowned` (rounds until the scripted walker
   is downed, or null) and `enemyHitsTaken`; the phase9 proof leaves
   aggression off (wave-10 ruling) but the runner exposes an
   `enemyAggression: 'telegraphed'` profile for the tuning sheet. The
   coordinator then runs the A6 lever T3 = `enemyDamageScale` on that
   profile and writes `WAVE_3_OUTCOMES.md`; the default moves only on the
   measured sheet. No content stats change in this wave.
7. **Help path (WO-B1F-7, game-core + tests):** every `help <name>` input
   logs, at debug level, which branch resolved it (entity-with-ask,
   ask-by-name, none) and why; the integration proof seeds a petitioner
   whose entity sits in another zone and one whose name collides with a
   pack NPC, and asserts both resolve. If the run-b transcripts' cause is
   found, fix it and cite the transcript line.
8. **Valid-now from the strip (WO-B1F-8, game-core + cli-display):** the
   unknown-command reply's `validNow` becomes the command strip's own
   state-derived inputs when the strip has any (`talk to …`, `go …`,
   `attack …`, `flee`, `accept …`), falling back to the curated list;
   one function feeds both surfaces.

## Strings law

Every player-visible line drafted in this wave is listed verbatim under
"Strings for coordinator review" in the envelope; the coordinator ratifies at
stitch. The lines this doc names (`Market: …`) are drafts under the same law.

## Proofs

Red first, real engine via `createHarness`, in each domain's own test files;
`npx tsc -p tsconfig.test.json --noEmit` clean; living-world-driver
byte-identical at defaults; the phase9 proof unchanged. The exit gate is a
fourth family playtest with the fifteen criteria, read by the coordinator.
