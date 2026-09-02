# A6 tuning wave 3 — T3: `enemyDamageScale`

**Date:** 2026-09-02. **Lever:** `enemyDamageScale` (default 1 → proposed
0.5). **Profile:** the matrix runner with `enemyAggression: 'telegraphed'`
(the phase9 proof itself keeps aggression off by the wave-10 ruling; the
tuning sheet turns it on). **Sheets:** `matrix-t3-base.json` (1.0),
`matrix-t3-half.json` (0.5), `matrix-t3-quarter.json` (0.25). Same seed, same
fixed 30-round script, 13 worlds.

## Null and failure hypotheses

- Null: the scripted walker survives 30 rounds at the default; the family
  playtests' deaths were seat behavior, not the lever.
- Failure: a lower scale removes the threat entirely (no hits land, kills
  stop mattering).

## Measured

| scale | worlds where the walker is downed | median downed round | enemy hits taken (total) | kills (total) |
|---|---|---|---|---|
| 1.0 | 12 of 13 | 12 | 45 | 14 |
| 0.5 | 0 of 13 | — | 63 | 23 |
| 0.25 | 0 of 13 | — | 73 | 35 |

Per world at 1.0 the walker is downed after 3 hits (2–6), between rounds 6
and 18; only the generated fixture survives. At 0.5 every world still lands
hits (2–9 per world) and kills rise because the walker stays up long enough
to finish fights. 0.25 changes nothing structural beyond 0.5.

The fourth family playtest (`b1f-2026-09-02`, run at 1.0) agrees: all five
seats were downed between turns 21 and 33 after 4–6 hits, with a level-1,
20-HP character. Three of four judged seats still said the world felt alive
and they would play again; one critique failed to parse.

## Classification

- **P0 at 1.0:** a threat that downs the walker on 12 of 13 worlds by round
  12 is not a difficulty setting, it is the end of the scripted proof and of
  most first sessions. The null hypothesis is rejected.
- **P1 at 0.5:** the threat stays real (every world lands hits; the telegraph
  line still precedes each) and the walker survives 30 rounds. This is the
  new default.
- 0.25 is the failure direction (too soft) and is not adopted.

## Ruling

`enemyDamageScale` default becomes **0.5**. The lever stays a lever; the
Director can raise it per pack later. Entry gate for T4 (if any): the
`playerDowned` column stays null across the matrix at defaults, and the
fifth family playtest reports fewer than half the seats downed.

## Not touched

Content stats (the Ash Ghoul's strength), the engine's damage formula, and
aggression itself. One lever per wave.
