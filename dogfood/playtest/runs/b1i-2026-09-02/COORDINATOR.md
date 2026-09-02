# Coordinator reading — run b1i-2026-09-02 (seventh family playtest: T4 cap, flee <exit>, whole-turn reeling warning)

Five seats, forty turns, nineteen criteria, damage 0.5, one hostile landing
per round (`maxHostileAttackersPerRound` 1), a seeded chapel-undead
pressure, the reeling warning bracketing the whole turn, and `flee <exit>`
understood.

## Headline

**Alive 5 of 5, would play again 5 of 5, one seat downed of five.** The
Director's exit bar for the enemy-damage program (fewer than half the seats
downed) is met. Across the seven runs of the day: 5/5 → 4/5 → 3/5 → 1/5
downed as the damage lever, the warning, the flee alias, and the pile-on cap
landed one at a time.

## What the transcripts show

- **qwen** took the warning at 5 of 20 (`You are reeling — flee (Ruined
  Chapel Entrance · Vestry Passage) before you fall.`), typed `flee to the
  Chapel Nave` and `flee to the Crypt Antechamber`, and survived the run.
- **mistral** attacked the Crypt Warden — the boss, 45 HP — at 8 of 20,
  took the warning at 6, and fell; its last inputs were wrapped in the
  seat's own stray markdown fences. A level-one character choosing the boss
  is a choice, not a mechanism.
- **deepseek** and **llama** fought (min 9 and 12 HP) and never dropped into
  reeling; **gemini** never fought.

## Criteria

reply-lands-as-dialogue 5/5, alias-moved 5/5, npc-acts-unprompted 5/5,
player-understood-what-to-do 5/5, mood and recap 5/5, street-raises-pressure
4/5, pressure-line-seen 3/5, price-seen 4/5, recognized 3/5,
con-revealed-fair 2/5. One "no" on coherence: gemini reports Sister Maren
contradicting herself between turns 8 and 12 about Aldric and the one-armed
veteran — an NPC dialogue-consistency item for the next cycle, not a world
defect.

## Ruling

- T4 (`maxHostileAttackersPerRound` = 1) holds; classified **P1**
  (`WAVE_4_OUTCOMES.md`): one seat fell by choice against the boss, the
  mechanism (warning → flee) is proven on the seat that used it.
- The enemy-damage program closes at damage 0.5 with the cap at 1.
- v2.0.0 ships on this build.

## Carried to the next cycle

NPC dialogue consistency across turns (gemini's Maren note); price-reacts
stays low (the market line is seen, the standing note rarely moves inside
forty turns); the engine's own target selection (a cautious hostile can
target a fellow hostile); seat-side markdown fences in inputs (an
ai-playtest hygiene item: strip code fences from player inputs).
