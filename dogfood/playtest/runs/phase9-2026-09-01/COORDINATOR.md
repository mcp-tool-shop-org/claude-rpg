# Phase 9 family playtest — coordinator reading (run `phase9-2026-09-01`)

**What ran:** five model players from five families outside ours (DeepSeek
V3.1, Gemini 2.5 Flash, Llama 3.3 70B, Mistral Small 2603, Qwen3 30B) each
played forty turns of starter-fantasy against the shipped Claude narrator
(claude-sonnet-4 through OpenRouter's Anthropic endpoint), from one scripted
character (Penitent Knight / Oath-Breaker / Glass Faith, one point in each
stat), then each critiqued its own transcript at temperature 0 against the
play-session doc's criteria. Runner: `ai-playtest` v0.1.0 (private repo).
The machine-aggregated report is `REPORT.md` beside this file; the five
transcripts and critiques are in the seat directories. Nothing below is the
players' opinion restated; every claim here was checked against the
transcripts and, where it mattered, reproduced through the real turn loop.

## The verdicts, and what they are worth

| | deepseek | google | llama | mistral | qwen |
|---|---|---|---|---|---|
| alive | yes | yes | yes | yes | yes |
| would play again | yes | yes | yes | no | yes |

Five of five alive is real but shallow: every seat grounded "alive" in the
two things every seat saw — the district mood transition and the save
recap's **THE WORLD MOVED** section (5/5 each) — plus the ambush headline on
the three seats that walked into a patrol. The criteria that need the world
to react to *the player's violence* were met by almost nobody:

| criterion | met | why, checked against the transcripts |
|---|---|---|
| ambush-on-entry | 3/5 | the two misses never entered a zone with an encounter table |
| street-raises-pressure | 1/5 | the one "yes" (gemini, t42) is the economy's black-market boom, not a faction reacting to kills — no seat ever reached heat 5 |
| pressure-moves-on-its-own | 3/5 | the same black-market pressure expiring in the recap |
| price-reacts | 1/5 | only mistral looked at `/market` |
| rumor-with-stance | 2/5 | deepseek's is a stretch (Brother Aldric's general talk of "knights who strayed"); no seat had a milestone rumor because no seat killed anything |
| district-mood-shift | 5/5 | genuine, on every seat |
| npc-acts-unprompted | 3/5 | `/people` last-actions on the seats that opened it |
| recap-of-world-moves | 5/5 | genuine, on every seat |
| coherent-no-contradiction | 5/5 | no seat saw an error screen; five saw a `MaxListenersExceededWarning` on stderr they could not see |
| player-understood-what-to-do | 3/5 | mistral and qwen said no, and their transcripts bear it out (below) |

## Finding 1 (structural): forty turns, five players, zero kills — so the kill → heat → pressure → faction spine never fired for anyone

Every seat ended at heat 0 (`Heat 0 (18/37 quiet)` on the ledger lines that
appeared; player HP 20/20 on every screen of every seat). The deepseek seat
typed fourteen attack inputs. Reproduced through the real turn loop with the
real interpreter and the real narrator:

- "attack the crypt stalker" maps to the `attack` verb with high confidence
  and the authored stalker (8 hp) dies in **three** hits; heat becomes 5.
- A Chapel Patrol spawned on entering the nave (two members, 12 and 8 hp);
  the first member dies in **four** hits by name; heat becomes 5.
- In ten rounds of combat against two hostiles the player took **no damage**.

So kills are reachable, and the seats did not reach them, for two reasons
the transcripts show:

1. **The play screen shows nothing about the enemy.** Fourteen attacks
   produced prose about wounds, shrieks and retreats and never a number, a
   condition, or a "the stalker falls" line the player could act on. The
   deepseek player alternated targets ("the wounded stalker", "the ash ghoul",
   "the stalker") — the interpreter mapped "ash ghoul" to the only visible
   enemy with medium confidence — and spread its hits across a patrol it
   could not see. The A5 transcript killed in eight swings because the
   fixed script never changed target.
2. **Enemies do not hit back.** HP never moved in any seat or in either
   probe. Combat carries no risk and no tempo; nothing tells the player
   the fight is real, so nothing keeps them in it.

Both are game-side. The first is a display gap (the status line carries
player HP only; a hostile's condition belongs on it during combat). The
second is an engine or pack question (enemy turns never landed a hit in any
of the twelve probe rounds; whether the patrol templates attack at all is
the next thing to verify). Together they gate every downstream criterion —
heat, pressures, faction alerts, milestone rumors, the price the street
charges an enemy of the Chapel Undead — and they explain the whole right
half of the table above. **This is the Phase-9 ruling's substance:** the
world's own motion (mood, patrols, opportunities, recap) is alive and every
family saw it; the world's reaction *to the player* was never provoked,
because the player could not tell they were fighting.

## Finding 2: the command surface confused two of five families

- **Unknown slash commands in play mode fall through to the LLM
  interpreter** and cost a turn: qwen typed `/pressures` five times (a
  director-mode command) and each time got "I'm not sure what you mean.
  Did you want to opportunity or inspect?" — nine interpreter fallbacks in
  one session. Play mode should answer an unknown `/word` with the known
  list and say that `/pressures`, `/rumors`, `/npc`, `/market` live behind
  `/director`.
- **`/npc Suspicious Pilgrim` reads only the first word** ("NPC
  \"Suspicious\" not found"). Multi-word arguments must be joined.
- **Movement and loot phrasing:** mistral tried `/go chapel nave`, `go
  Chapel Nave`, `/search corpses`, `inspect corpse`; the game never said
  how to move or that corpses hold nothing.
- **Opportunities expire with no visible way to accept them.** Every seat's
  recap listed "Investigate the black market activity" expiring; gemini and
  mistral both asked why; the hint said "accept or decline soon" and never
  said how.

## Finding 3: hint spam

"Black market activity detected — contraband may be available" printed on
20 to 38 of each seat's 42 screens. Three seats named it as the thing that
"lost its impact". A hint that repeats every turn is noise; it needs a
cooldown or a once-per-cause rule. "Not enough heat" (deepseek t3) and
"Try bribe or intimidate" are the same family: they surface currencies the
player has no way to read as a beginner.

## Finding 4: the stderr warning

Every seat's game process printed `MaxListenersExceededWarning: 11 close
listeners added to [Interface]` — a readline close-listener leak per turn
(the `once('close')` guard in the prompt helper is never released on the
happy path). Invisible to players in the terminal; visible in any log.

## What the families praised, in their own words' substance

Atmosphere and voice (all five), the ambush headline landing as a real
event (deepseek, google, llama), the recap making the session legible
(all five), the district turning "dangerous and despairing" while the
player was in it (deepseek, google), NPC stances in `/people` (mistral).

## Recommended ruling and next levers

**Ruling proposed to the Director:** the scene is alive in its own motion
and not yet alive in its reaction to the player. Phase 10 waits on two
game-side fixes and one verification, then a second playtest run:

1. Combat legibility on the play screen: the targeted hostile's condition
   (and a kill line) in the status block during combat.
2. Play-mode unknown-slash handling, `/npc` multi-word arguments, an
   opportunity-accept hint that names the input, and a hint cooldown.
3. Verify whether spawned patrol members ever attack (engine/pack); if
   not, it is an engine ask filed with this run as evidence.
4. Fix the readline listener leak.

Then rerun `ai-playtest` with the same five seats and compare the table.
The transcripts also give the A6 program a real-player baseline for the
first time: forty turns of a beginner reach one district transition, one
patrol, one economy pressure, and no kill.
