# Phase 9 — the played scene (starter-fantasy, ~20 minutes)

**Cycle:** the living-world cycle (Path A → v2.0.0), run `swarm-1788288802-f5a0`.
**Why this document exists:** the studio's discriminator is a playable scene a
human has played. The automated half of Phase 9 (`test/integration/
phase9-living-world.test.ts`) proves the six living-world links occur on every
world; this half is the scene itself, scripted so the same twenty minutes can
be replayed by anyone, with a harness-captured transcript of the exact script
as the reproducible evidence (`dogfood/phase9/transcript-starter-fantasy.txt`).
**The gate is the Director playing it.** Phase 10 does not start until this
session has been played and the Director has ruled the scene alive or named
what is not.

## Setup

```bash
npm run build && node dist/bin.js play --world fantasy
```

(`--world fantasy` selects starter-fantasy, pack id `chapel-threshold`. Pick
any character build at the prompt; the script assumes a fighter-leaning
build so the crypt fights end in kills — the transcript's build took eight
swings per kill.) Type inputs exactly as written; `/`
commands cost no turn. Director mode (`/director`, `/d` to toggle) exposes
the world's books; play mode is where the world talks back.

## The map, so you know where the world can move

```
chapel-entrance ── chapel-nave ── vestry-door ── crypt-chamber ("Crypt Antechamber")
      │                                  (Crypt Stalker)   (Ash Ghoul, Crypt Warden)
 chapel-alcove
```

Districts: `chapel-grounds` (entrance, nave, alcove) and `crypt-depths`
(vestry-door, crypt-chamber; controlled by the Chapel Undead). Named NPCs at
the entrance: the Suspicious Pilgrim and Sister Maren; Brother Aldric in the
nave. Encounter tables: the nave and the vestry passage can roll a Chapel
Patrol; the crypt chamber can roll a Crypt Ambush.

## The script — twelve beats, what the world should do at each

| # | You type | What the world should do (and where to see it) |
|---|---|---|
| 1 | `look` | The scene, with the pilgrim and Sister Maren present. `/status` shows the ledger line at rest: `Heat 0 (0/37 quiet)`. |
| 2 | `talk to the pilgrim` | The pilgrim answers in character. Their dialogue prompt already carries the NPC's current goal (visible later in `/npc pilgrim` as `Current goal:`). |
| 3 | `/npc pilgrim` | Director view: the goal line and, if any, `Standing with you:`. Note there is no standing yet. |
| 4 | `go to the nave` then `talk to brother aldric` | A named NPC in a second zone; the tick moves the district's NPCs around you (`/people` lists last actions). The nave can roll a Chapel Patrol on entry: if it does, the play screen shows the red **── Ambush: Chapel Patrol in Chapel Nave ──** headline above the narration and the music intensifies the same round. |
| 5 | `go to the vestry passage` | Entering the crypt-depths district. Watch `/status`: the district tone line changes with the district. A patrol may roll here too. |
| 6 | `attack the crypt stalker` (repeat until it falls) | The first kill: Wanted rises by 5. `/leverage` shows `Heat: 5 (0/37 quiet rounds to cooling)` and, once the Chapel Undead notice you, `Alerts: chapel-undead N`. |
| 7 | `go to the crypt antechamber` then `attack the ash ghoul` (repeat until it falls) | Second kill: Wanted reaches 10, the wake threshold. Within a round or two `/pressures` lists a pressure the Chapel Undead raised (a bounty or an investigation). The narration prompt carries the pressure's line the same round it spawns. |
| 8 | `/market` then `/trade crypt-depths` | The quote line: `Merchants here quote <item> at <price> (+N% vs base · Chapel Undead: hostile)`. Your kills moved the price. |
| 9 | `/rumors` | Under **WHAT THE STREET BELIEVES**, the rumor about you with its witness count and how far it has mutated. Talk to Sister Maren afterwards (`go to the chapel entrance`, `talk to sister maren`): her prompt carries the rumor with HER stance (believe or doubt); the pilgrim's stance may differ — two hearers, two stances. |
| 10 | `look` × 3 (quiet rounds) | The street reacts without you: `/pressures` shows the pressure escalate, resolve (faction agency), or expire; `/status` counts quiet rounds toward cooling (`N/37`). |
| 11 | `/leverage` | The full ledger: heat, quiet-round countdown, alerts above zero, and `Income this round: +N <currency>` when reputation or milestones paid out. `/help leverage` explains every number in the street's own terms. |
| 12 | `save` | The session recap prints. **THE WORLD MOVED** lists what the world did on its own this session: pressures spawned/resolved/expired, opportunities, ambushes, mood transitions, rumors mutated — counts plus the latest headline of each. |

**Phrasing note.** With a real narrator the interpreter reads natural phrasing
("attack the crypt stalker"). The transcript was captured with the fake client,
which has no interpreter, so its inputs use the deterministic fast path's
article-free forms (`attack crypt stalker`, `go to chapel nave`). That the fast
path does not strip a leading article is recorded as a hardening candidate for
the A6 program (an LLM round-trip spent on `attack the X`).

## What "alive" means for this ruling

The scene is alive if, without any input that names them, the Director saw at
least: one ambush headline on a zone entry; one pressure the street raised
after the second kill and later moved on its own; one price that changed
because of what the player did; one NPC whose dialogue carried a rumor about
the player with a stance; and a recap section that recounted the world's own
moves. Anything the Director expected and did not see is named, with the beat
number, and becomes the first P0/P1 candidate of the A6 tuning program
(`dogfood/tuning/WAVE_0_OUTCOMES.md`).

## The transcript

`dogfood/phase9/transcript-starter-fantasy.txt` is this exact script played
through the test harness with the fake narrator (deterministic seed 4242):
every command's rendered output in order, so the world's mechanics — not the
prose — can be checked line by line against the table above; beat 12 appears
as the raw "world moved" ledger the recap reads, since the harness has no
save-and-quit path. Regenerate it with the capture runner named in the file's
header after any change to the living-world surfaces.
