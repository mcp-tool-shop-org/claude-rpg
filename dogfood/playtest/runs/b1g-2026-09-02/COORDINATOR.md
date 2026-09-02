# Coordinator reading — run b1g-2026-09-02 (fifth family playtest: damage 0.5, seeded pressure)

Five seats, forty turns, nineteen criteria, `enemyDamageScale` 0.5 (the T3
default) and a chapel-undead pressure seeded at start
(`CLAUDE_RPG_DEBUG_SEED_PRESSURE=chapel-undead:-60:70`) so the pressure
lifecycle had something to show.

## Headline

**Alive 5 of 5, would play again 5 of 5 — the first run with both at
five.** With a pressure in the world, street-raises-pressure went to 4 of 5
and pressure-line-seen to 3 of 5 (`investigation-opened: chapel-undead has
opened an investigation into the player's activities`, later resolved or
expired on its own). The wave-11 items held: alias-moved 5/5, price-seen
4/5, reply-lands-as-dialogue 4/5, recognized 4/5, ambush-on-entry 5/5,
unknown-command 4/5.

## The T3 exit condition, and why it still failed

The condition was "fewer than half the seats downed". Four of five fell
(turns 19, 21, 35, 38; gemini survived). But the transcripts change the
diagnosis:

- Every hit was **2 damage** (the 0.5 scale working as measured).
- Every downed seat was fighting **two or three hostiles at once** — Ash
  Ghoul plus Crypt Stalker, or the Crypt Warden boss — and kept typing
  `attack` (mistral: "attack Ash Ghoul! fire! charge! …") or `talk to a
  shivering pilgrim` (qwen) at **4 of 20 HP**, while `flee` sat in the
  command strip on the same screen.

So the lever did what the sheet said it would; the seats died of not
leaving. Nothing on the screen said "you are about to die". The status line
shows `HP: 4/20`, the strip offers `flee`, and neither is a warning.

## Ruling

- `enemyDamageScale` stays at 0.5 (T3 holds; a further cut would make hits
  meaningless and the sheet says 0.25 adds nothing).
- **A reeling warning in the combat channel:** the round the player's
  condition drops to `reeling`, one line names the state and the way out —
  `You are reeling — flee (Chapel Nave · Vestry Passage) before you fall.` —
  once per drop into the rung. Same channel as the telegraph, so it cannot
  be missed.
- The T3 exit condition is re-run as a sixth playtest after that line
  lands; the bar stays at fewer than half the seats downed.

## Smaller items

- price-reacts 2/5 and con-revealed-fair 2/5: unchanged bands; the con
  reveal now shows on screen and two seats cited it fairly.
- llama scored low on legibility items while alive and would play again;
  its transcript shows it never left the entrance hall until turn 16.
