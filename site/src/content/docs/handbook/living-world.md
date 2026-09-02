---
title: The Living World
description: How the world moves on its own in v2.0 — the tick, pressures, rumors with a stance, enemies that act, asks and recognition, and the tuning surface.
---

Since v2.0 the world runs on the engine's own tick. Every round after your
action, the engine advances heat, pressures, opportunities, encounters, and
faction moves; the game reads that truth back rather than keeping copies.
This page is what you will feel at the table, and where to look when you
want to see the machinery.

## What moves without you

| System | What you see | Where to inspect |
|---|---|---|
| **Heat and pressures** | Kills raise a district's heat; once it wakes, a faction raises a pressure (a bounty, an investigation, an alert) that later escalates, resolves, or expires. A line says so the round it happens. | `/pressures`, `/status` |
| **Opportunities** | Offers spawn and expire on their own; `accept <title>` takes one while it lasts. | `/jobs`, `/contracts` |
| **Encounters** | Entering some zones spawns an ambush or a patrol, announced as a headline. | the play screen |
| **District mood** | Commerce, morale, and safety shift with what happens; the mood colors narration and prices. | `/districts`, `/district` |
| **Rumors** | The street talks about you. NPCs hear rumors as hearers who believe or doubt; rumors spread to adjacent districts. | `/rumors` (play or director mode) |
| **Market** | One quoted price sits in the location block when the district has a market: `Market: Healing Draught 13 (+30% vs base)`; the note names the faction's standing toward you when one controls the district. | `/market`, `/trade` |

## Enemies act

A hostile that shares your zone is aware of you. An aware hostile that
decides to attack **telegraphs** first — `Crypt Stalker readies an attack
against you` — and lands the next round: `Crypt Stalker's attack finds you
— 3 damage.` Those lines live in a reserved block above the narration,
together with your own outcome (`Your strike lands — Crypt Stalker:
bloodied.`) and any kill (`The Crypt Stalker falls.`). Everyone's condition
is one of five rungs: unhurt, hurt, bloodied, reeling, down. The round you
drop into reeling, the channel says so and names the way out — `You are
reeling — flee (Chapel Nave · Vestry Passage) before you fall.` `flee`
leaves by the zone's own exits.

Enemy damage is a tuning lever (`enemyDamageScale`, default 0.5, set on the
measured sheet); `enemyAggression` can be `off`, `telegraphed`, or
`immediate`.

## Asks and recognition

People ask you for things: carry this, lend a little coin, guide me below,
hold this for me, vouch for me. Some need the help. Some are cons, and they
look the same. The game plants cues — a rumor on the board, a faction tie in
`/npc`, a contradiction in what they did — and the truth comes out later,
at a named cost if you were taken in (`… story wasn't true. 5 coin gone.`)
or for free if you walked on (`… story wasn't true. You never bit.`). A real
need left unanswered resolves badly for the petitioner, and the world says
so.

Answer with `help <name>`. Help a genuine ask and the same round says who
will remember it; the faction's standing moves, a rumor about the deed
starts, and the petitioner owes you gratitude that repays later — a warning
before an ambush, a better price, a pressure quietly resolved. Enough
standing earns an honorific, shown by `/leverage` and used in dialogue.

## Talking to the street

- A sentence typed at the NPC who just spoke to you is speech to them, not a
  request for clarification.
- A bare name talks to that NPC; a bare exit name moves there.
- `/go <exit>`, `/move <exit>`, `/zone <exit>` move; `/rumors` reads the
  board from play mode.
- An unknown slash command is answered at once — the nearest command, where
  it lives, and what you can do right now — without spending a turn.

## The tuning surface

Every living-world lever has one measured default, readable with `/tuning`
in director mode. The levers that moved on measurement in v2.0: rumors are
believed only below suspicion 0, rumors spread to adjacent districts, and
enemy damage scales to 0.5. The measurements come from a deterministic
30-round matrix over all thirteen worlds (`dogfood/tuning/` in the
repository), one lever per wave, with an outcomes document each time.

## The recap

`quit` or the end of a session prints what the world did: pressures spawned
and resolved, opportunities offered and expired, ambushes, mood transitions,
rumors mutated, asks made of you, deeds recognized, gratitude repaid, and the
marks the street left on you.
