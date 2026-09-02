# Coordinator reading — run b1-2026-09-02c (third family playtest, slice B1 exit gate)

Same five seats, script, and fifteen criteria; the game carried the reveal
announcements and interpreter tracing (`stderr.txt` per seat).

## Headline

**Alive 5 of 5, would play again 5 of 5.** Across the three runs of this
day: recap, coherence, unknown-command answered at 5 of 5 every time; mood
shift 5 of 5; enemies act (took-damage 3–4 of 5 per run, the misses are seats
that never entered a hostile zone).

## The asks, end to end, in play

- **Recognition proven twice:** qwen typed `help the one-armed veteran` and
  got the acknowledgment the same round ("a one-armed veteran will remember
  who carried the load."), a rumor about the deed on the board, and later
  **gratitude repaid** ("sends word just in time — trouble is waiting for you
  ahead"); gemini's Brother Aldric spoke of a debt owed.
- **Reveals now land on the play screen** on every seat that saw an ask:
  `[a woman at the chapel door's story wasn't true. You never bit.]`,
  `[a shivering pilgrim needed help that never came.]` — the critic scored
  con-revealed-fair on two seats (both "never bit" reveals: the con showed
  its hand, the player had walked on). No seat helped a con in this run, so a
  con with a named cost on screen is still unwitnessed in play; the code path
  is proven by the reactive-street proof and by run b's ledger.
- **The traced `help`:** the one `help <petitioner>` in this run went through
  the interpreter's fast path (`speak`, reasoning "Help a one-armed veteran
  with: …") and resolved. Run b's two unregistered helps did not recur; their
  cause is still unknown and stays on the watch list with tracing kept on.

## Exit-gate ruling

**Slice B1's exit gate is met.** The four fixes are proven in play (combat
legibility, enemies act with a telegraph, unknown commands answered without a
turn, the readline leak gone), asks are visible and answerable, a genuine
petitioner was helped and recognized with a later repayment, and cons reveal
on screen. One open item is carried, not blocking: a helped con revealed with
its cost, witnessed in play.

## Carried to wave 11 (unchanged from the b reading, plus)

Free-prose replies to an NPC question; `/go` `/move` `/zone` `/rumors` from
play mode; bare NPC name defaults to talk; price legibility (0 of 5 across
all three runs — a scripted nudge or a district-view quote); pressure
lifecycle on screen; the Ash Ghoul's level-1 lethality; the run-b help misses.
