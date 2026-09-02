# Coordinator reading — run b1f-2026-09-02 (fourth family playtest, on the wave-11 build)

Five seats, forty turns, nineteen criteria (the fifteen from run c plus the
four this wave added). Four seats judged; mistral's critique was cut off
mid-array by the critic's 1,800-token budget and failed to parse twice
(ai-playtest fix: 6,000 tokens, an error-bearing retry).

## Headline

**Alive 3 of 4, would play again 3 of 4.** The wave-11 items landed in play:

| Criterion (new this wave) | Met | Note |
|---|---|---|
| reply-lands-as-dialogue | 3/4 | "I seek the truth of this place…" typed at the pilgrim got a reply, not a clarification. |
| alias-moved | 4/4 | `/go Chapel Nave` moved the player on every seat that tried it. |
| price-seen | 4/4 | `Market: Healing Draught 13 (+30% vs base)` on the play screen at turn 2; the faction form (`+160% vs base · Chapel Undead: wavering`) on qwen. |
| pressure-line-seen | 1/4 | No pressure spawned, escalated, resolved, or expired in any of the five transcripts, so the line had nothing to announce; the one "yes" is the recap's alert-pressure note. Not a defect; the criterion needs a run where a pressure exists. |

Carried criteria held or rose: recognized 4/4 (every judged seat helped a
petitioner and was thanked the same round), took-damage 4/4, ambush-on-entry
4/4, price-reacts 2/4 (up from 0 across three runs; the market line is what
made it reachable).

## The finding that matters

**Every seat died.** All five characters fell between turns 21 and 33, after
four to six hits, at level 1 with 20 HP, and no seat fled or healed its way
out. The matrix says the same thing about the scripted walker: at the wave-10
default (`enemyDamageScale: 1`) it is downed on 12 of 13 worlds by median
round 12. This was run as the A6 lever T3 the same night
(`dogfood/tuning/WAVE_3_OUTCOMES.md`): at 0.5 no world downs the walker in
30 rounds while every world still lands hits and kills rise; 0.25 adds
nothing. **Ruling: `enemyDamageScale` default becomes 0.5.** One lever; the
Ash Ghoul's stats and the engine formula are untouched.

## Smaller items

- unknown-command-answered 3/4: deepseek never typed an unknown command.
- kill-line-seen 3/4: deepseek was downed before landing a kill.
- llama's reply-lands-as-dialogue "no": the seat never answered an NPC's
  question with a plain sentence.

## Carried forward

- A fifth run after the damage default lands, with a pressure-bearing world
  (or a scripted nudge) so pressure-line-seen can fire; the exit condition
  for T3 is fewer than half the seats downed.
- The pressure lifecycle line is implemented and proven by fixture; it has
  not yet been witnessed in play.
