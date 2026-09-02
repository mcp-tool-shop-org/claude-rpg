# Coordinator reading — run b1-2026-09-02 (second family playtest, slice B1 exit gate)

Five OpenRouter seats (deepseek-chat-v3.1, gemini-2.5-flash, llama-3.3-70b,
mistral-small-2603, qwen3-30b-a3b), 40 scripted turns each, the same
character build, the Sonnet narrator through OpenRouter. Critics: the same
seat at temperature 0, fifteen criteria (the ten from the first run plus the
five slice B1 exit criteria added for this run).

## The headline

**Alive 5 of 5, would play again 5 of 5** (first run: 5 and 4). The world now
reacts to the player: three seats fought and saw the deterministic kill line,
the telegraph, and their own HP fall (first run: zero kills, enemies never
acted). Every seat that typed an unknown slash command got the parser-layer
reply without losing a turn (5 of 5). Recap, mood shift, unprompted NPC action,
and coherence held at 5 of 5.

## What did not land, and why

| Criterion | Met | Cause (verified in the transcripts) |
|---|---|---|
| con-revealed-fair | 1/5 | **Ask offers never reached the play screen.** Every recap listed "Asks made of you: 1–2" with the petitioner's exact words, but no seat ever saw the ask when it was made: `maybeOfferAsk` pushed the offer into the world-moved ledger only. No seat could help a petitioner or dodge a con on purpose; the one "yes" (qwen) is the free reveal of an unhelped con in the recap. |
| recognized | 1/5 | Same cause: nothing to help, nothing to recognize. |
| took-damage / kill-line-seen | 3/5 | The two misses (gemini, llama) never entered a hostile zone: gemini stayed in the chapel entrance talking; llama ended its own game at turn 15 (below). |
| price-reacts | 0/5 | No seat opened /market or /trade; unchanged from the first run (the criterion needs a scripted nudge or a quote surfaced in the district view). |
| street-raises-pressure / pressure-moves | 2/5, 1/5 | Fires when kills happen (deepseek, qwen); the pressure lifecycle is still only legible in the recap. |
| player-understood-what-to-do | 3/5 | Mistral and qwen: `/go`, `/move`, `/zone`, `/rumors` unknown in play mode; "Brother Aldric" bare (no verb) asks for clarification; a verbose chained command failed. |

**llama ended by exit at turn 15.** The unknown-command reply's "Right now you
can:" list was the first three play-mode commands alphabetically —
`/archive · /arcs · /conclude` — and the seat followed it into `/conclude`,
then `save`, `quit`. A suggestion list that hands a lost player the
end-the-game verb is a defect, not a player error.

**Gemini's conversational replies.** Answering Brother Aldric's question with
"The dead do not stay buried." was met with "I'm not sure what you mean" four
times. A free-prose reply addressed to the NPC who just spoke should resolve as
`speak` to that NPC. Noted for wave 11; not fixed here.

## Fixed at this reading (commit on main, then the run is repeated)

1. **An ask is announced the round it is offered:** `<Petitioner> asks you:
   "<surface>" (help <petitioner> to answer, or walk on)` on the play screen,
   through the same announcement channel the level-up and gratitude lines
   use. The ledger entry stays.
2. **The valid-now list is curated, not alphabetical:** play mode offers
   `/help · /status · /leverage`; director mode `/world · /people · /back`.

## Carried to wave 11 (feature-audit → execute)

- Free-prose replies to an NPC's question resolve as speech to that NPC.
- `/go`, `/move`, `/zone` as play-mode aliases (or the reply names `go <exit>`);
  `/rumors` readable from play mode or the reply says where it lives.
- A bare NPC name defaults to `talk to`.
- Price legibility: the district view carries one quoted price with the
  standing note, so `price-reacts` can be met without the player finding
  /market.
- The pressure lifecycle needs one on-screen line when a pressure escalates,
  resolves, or expires (today only the recap says so).

## Exit-gate ruling

Slice B1's four fixes are proven in play (combat legibility, enemies act,
unknown commands answered, readline leak gone: no MaxListeners warning in any
seat's stderr). The asks-and-recognition half is not yet proven in play for
the one reason above; the gate stays open until the repeated run
(`b1-2026-09-02b`) shows a seat helping a petitioner or dodging a con on
purpose.
