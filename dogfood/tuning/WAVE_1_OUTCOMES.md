# Wave T1 — lever: `rumorBelieveSuspicionBelow` 50 → 0

**Program:** slice A6 (`docs/living-world-slice-a6-phase9.md` §4). Baseline:
`WAVE_0_OUTCOMES.md`. Sheet: `dogfood/tuning/matrix-t1.json` (same 13 worlds,
same seeds, same 30-round script; runner passthrough
`LIVING_WORLD_TUNING_JSON='{"rumorBelieveSuspicionBelow":0}'`).

**Correction to T0's proposal.** T0 proposed 1. The rule reads `suspicion <
threshold`, and default suspicion is 0, so 1 still admits every hearer — the
T1 dry run at 1 produced a sheet byte-identical to the baseline. The lever
value that means "suspicion alone never earns belief" is 0. Recorded here so
the off-by-one is not repeated.

**Null hypothesis:** `stanceDoubtCount ≥ 1` on ≥ 6 of the 9 rumor-producing
worlds; every other column byte-identical.
**Failure hypothesis:** believe collapses to 0 everywhere (the threshold alone
cannot produce a mix).

## Result — diff against the baseline

| world | believe / doubt (T0) | believe / doubt (T1) | every other column |
|---|---|---|---|
| hue-and-cry | 7 / 0 | 0 / 7 | identical |
| jade-veil | 2 / 0 | 1 / 1 | identical |
| salt-road-ledger | 16 / 0 | 8 / 8 | identical |
| the other ten worlds | — | unchanged | identical |

- **Attribution is clean:** the lever touched stance and nothing else (all
  other columns byte-identical on all 13 worlds).
- **Doubt now exists.** Wherever a hearer's faction had not already taken the
  rumor up, the hearer doubts; where it had, the hearer believes. Two worlds
  show a real mix (jade-veil, salt-road-ledger); `rumorTwoStances` is now
  true on both — the design doc's original item 6 occurs on 2 of 13 worlds.
- **Null hypothesis NOT met (3 of 9, target 6).** The six worlds that did not
  move have one or zero NPC hearers (T0 P1 #2, reach); a stance lever cannot
  act on a hearer who never hears. hue-and-cry went all-doubt (its hearers'
  faction is never in uptake) — the failure hypothesis's signature on one
  world, not a collapse.

## Classification

- **P0:** none.
- **P1 (carried, repeat of T0 #2):** reach — NPC hearers ≤ 2 on every world,
  0 on four rumor-producing worlds. This is now the binding constraint on
  every rumor metric. T2's lever.
- **P1 (new, from T1):** with suspicion out of the rule, stance is decided by
  faction uptake alone — a binary by faction. A second axis (the hearer's
  disposition toward the player's own faction, or reputation) would give a
  spectrum. Not before reach is fixed; T3 candidate.
- **P2:** `rumorTwoStances` true on 2 of 13 worlds is below any sensible band
  but is reach-limited; re-measure after T2.

## Decision

**The lever converges for what it governs and becomes the default:**
`DEFAULT_LIVING_WORLD_TUNING.rumorBelieveSuspicionBelow = 0` (a hearer
believes a rumor about the player only when their faction has already taken
it up; otherwise they doubt it until the street convinces them). The defaults
proof and the `/tuning` view's `(default)` marker follow the new value.
Byte-identical-at-defaults now means byte-identical to `matrix-t1.json`, the
sheet every later wave diffs against.

## Wave T2 — proposed (one lever)

**Lever:** rumor reach. Candidate: `rumorSpreadScope` gains a third value,
`'adjacent-districts'` (named NPCs in the player's district AND every
neighboring district hear once per round), replacing the current binary.
**Null hypothesis:** `rumorHearers ≥ 2` on every rumor-producing world;
stance columns move only as a consequence of new hearers; every non-rumor
column byte-identical.
**Failure hypothesis:** hearers jump to every named NPC in the world within a
round or two (over-reach) — the signature is `rumorHearers` equal to the
world's named-NPC count on round one of the rumor.
**Run:** `LIVING_WORLD_MATRIX_LABEL=t2 LIVING_WORLD_TUNING_JSON='{"rumorSpreadScope":"adjacent-districts"}'`
after the scope value lands (a structural change: its own proof, red first).
