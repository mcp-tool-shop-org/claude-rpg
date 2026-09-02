# Coordinator reading — run b1-2026-09-02b (repeat of the second family playtest, after two fixes)

Same five seats, script, and criteria as `b1-2026-09-02`; the game carried
the two fixes from that reading (ask offers announced on the play screen; the
unknown-command valid-now list curated).

## Headline

**Alive 5 of 5, would play again 4 of 5.** Ambush-on-entry rose to 4 of 5,
took-damage to 4 of 5 (one seat died to the Ash Ghoul at turn 36 after 9 and
6 damage hits — the enemy turn is real now), unknown-command 5 of 5. The one
seat that never fought (qwen) also never saw an ask: it stayed in the
entrance hall.

## The asks, now visible

Four of five seats saw ask announcements on the play screen (2–4 each);
three answered with `help <petitioner>`. Outcomes:

| Seat | Answered | What happened |
|---|---|---|
| gemini | `help a shivering pilgrim` (t10) | Recognized the same round: "a shivering pilgrim will remember who kept faith with what was given." **Recognition proven in play.** |
| deepseek | three `help …` inputs | The first (`help a shivering pilgrim`) did not register (the pilgrim's ask later aged out: "needed help that never came"); `help a woman at the chapel door` did register and the con revealed later — but only in the recap ("story wasn't true"), so the critic scored it "no con revealed". |
| llama | `help the shivering pilgrim` | Produced dialogue from the petitioner, no recognition; the ask later revealed as a con the player "never bit" — the help did not register. |

So: **the announcement works, recognition works, and a con was helped and
revealed.** Two defects remain: (1) a reveal or an ignored ask reached only
the ledger, never the play screen; (2) two `help` commands that named the
petitioner correctly did not resolve the ask, while an identical command on
another seat did. A scoped reproduction (petitioner seated beside the pack's
own pilgrim, same zone) resolves correctly, so the in-play failure depends on
state this reading could not see.

## Fixed at this reading

- Reveals and ignored asks are announced the round they land, with the cost
  named (`… story wasn't true. 5 coin gone.` / `… needed help that never came.`).
- Interpreter tracing (`CLAUDE_RPG_DEBUG=1`, captured per seat in
  `stderr.txt`) is on for the next run so the two unregistered helps can be
  read from the interpreter's own reasoning rather than guessed.

## Still carried to wave 11

Free-prose replies to an NPC question; `/go` `/move` `/zone` `/rumors` from
play mode; bare NPC name defaults to talk; price legibility; pressure
lifecycle on screen. Plus, from this run: the Ash Ghoul's 9-damage hits at
level 1 (mistral died at turn 36) — a tuning question for `enemyDamageScale`
or the ghoul's stats, measured on the matrix before it moves.

## Exit-gate ruling

Open, pending run `b1-2026-09-02c`: it must show a con revealed on the play
screen and the traced cause of the two unregistered helps.
