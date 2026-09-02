# A6 tuning wave 4 — T4: `maxHostileAttackersPerRound`

**Date:** 2026-09-02. **Lever:** `maxHostileAttackersPerRound` (new; default
1). **Why a new lever rather than another cut to damage:** the sixth family
playtest (`b1h-2026-09-02`) showed the seats that fell were taking hits from
two hostiles in the same round, 2–4 damage each, 20 HP gone in three rounds
whatever they typed. Halving damage again (0.25) would make single fights
meaningless (T3's sheet); capping how many hostiles *land* in one round
keeps every fight real and makes a two-hostile zone survivable long enough
to read the reeling warning and leave. A hostile held by the cap keeps its
telegraph and is announced again, so the threat stays legible.

## Null and failure hypotheses

- Null: the pile-on is not what kills; capping attackers changes nothing.
- Failure: the cap makes multi-hostile zones toothless (hits stop landing,
  kills climb for free).

## Measured — the matrix (telegraphed profile, damage 0.5)

| sheet | downed worlds | enemy hits taken | kills | ambushes |
|---|---|---|---|---|
| `matrix-t3-half` (cap unlimited) | 0 / 13 | 63 | 23 | 13 |
| `matrix-t4-cap1` (cap 1) | 0 / 13 | 60 | 26 | 13 |

The scripted walker rarely faces two aware hostiles at once, so the sheet
moves little (three fewer hits landed, three more kills); it confirms the
failure hypothesis does not hold — hits still land on every world and
ambushes are unchanged. The instrument for this lever is the family
playtest, where the seats seek fights.

## Measured — the family playtests

| run | damage | cap | reeling warning | flee `<exit>` | seats downed |
|---|---|---|---|---|---|
| b1f | 1.0 | — | — | — | 5 / 5 |
| b1g | 0.5 | — | — | — | 4 / 5 |
| b1h | 0.5 | — | yes | — | 3 / 5 |
| b1i | 0.5 | 1 | yes | yes | **1 / 5** (alive 5/5, would play again 5/5) |

## Classification

**P1.** One seat of five fell, by choice: mistral attacked the Crypt Warden
(the boss) at 8 of 20 HP and fought on past the warning. The seat that used
the mechanism (qwen: warning at 5 HP, `flee to …` twice) survived. The
Director's exit bar (fewer than half the seats downed) is met; the
enemy-damage program closes with `enemyDamageScale` 0.5 and
`maxHostileAttackersPerRound` 1 as the defaults. No P0 in the last three
waves; the P1s did not repeat; outcomes converged (5/5 → 4/5 → 3/5 → 1/5).

## Not touched

`enemyDamageScale` (0.5, T3), content stats, the engine's damage formula and
its own target selection (traced: a cautious-profile hostile can target a
co-located fellow hostile — noted for the engine, not changed here).
