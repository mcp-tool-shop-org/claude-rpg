# Coordinator reading — run b1h-2026-09-02 (sixth family playtest: damage 0.5, seeded pressure, reeling warning)

Five seats, forty turns, nineteen criteria; the build carries the reeling
warning from the fifth reading.

## Headline

**Alive 5 of 5, would play again 4 of 5.** Pressures and the wave-11 items
held their bands (street-raises-pressure 4/5, pressure-moves 4/5, mood 5/5,
recap 5/5, coherence 5/5, reply-lands-as-dialogue 4/5, alias-moved 4/5,
price-seen 4/5). Three of five seats were downed (turns 18, 24, 27); two
never dropped below 18 HP. The T3 exit bar (fewer than half downed) is
still not met.

## What the transcripts say this time

| Seat | Warning fired | What happened next |
|---|---|---|
| mistral | yes, at 5/20 | Typed `flee Chapel Nave; attack Ash Ghoul; talk to …` — a chained sentence, so the bare-`flee` fast path did not fire and the line went to the narrator; then `help a courier` at 5 HP; a 4-damage hit landed. |
| llama | yes, at 5/20 | Moved with `go Vestry Passage` into the next zone's hostiles and fell there. |
| qwen | no | Dropped to 2/20 on a zone entry (`go Ruined Chapel Entrance`) — the damage landed outside the hostile turn's bracket, so the warning never computed. |

Two of the three deaths are the game's, not the seats': `flee <exit>` was
not understood, and the warning's bracket only covered the hostile turn.
The third is the pile-on: two aware hostiles landing 2–4 damage each per
round takes 20 HP in three rounds whatever the player types.

## Ruling

- `flee <exit>` resolves as a move to that exit; bare `flee` stays
  `disengage`.
- The reeling warning brackets the whole turn (HP at turn start), so a hit
  taken on zone entry or from the player's own action counts.
- **A6 lever T4 — `maxHostileAttackersPerRound`, default 1:** one aware
  hostile lands per round; the others keep their telegraph and are
  announced again. The pile-on is what turned "the enemy acts" into "the
  enemy piles on"; the lever keeps every fight real and makes a two-hostile
  zone survivable long enough to read the warning and leave.
- `enemyDamageScale` stays 0.5 (the sheet's own ruling).
- Seventh playtest re-tests the bar.
