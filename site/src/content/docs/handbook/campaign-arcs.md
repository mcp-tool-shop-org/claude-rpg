---
title: Campaign Arcs
description: Arc detection, endgame triggers, and campaign conclusions — how the engine tracks your story trajectory.
sidebar:
  order: 5
---

## Arc detection

The engine continuously analyzes accumulated state to detect 10 narrative arc kinds:

| Arc Kind | What triggers it |
|----------|-----------------|
| `rising-power` | Growing faction influence, territory control, political capital |
| `hunted` | Multiple factions hostile, bounties placed, allies turning |
| `kingmaker` | Holding balance of power between competing factions |
| `resistance` | Fighting against dominant faction from a weaker position |
| `merchant-prince` | Economic dominance through trade, contracts, resource control |
| `shadow-broker` | Intel accumulation, rumor network manipulation, hidden influence |
| `peacemaker` | Resolving conflicts, building alliances, reducing faction tensions |
| `outcast` | Rejected by all factions, operating independently |
| `revelation` | Uncovering hidden truths, following belief provenance chains |
| `betrayer` | Breaking alliances, abandoning obligations, faction-switching |

Arc detection is on-demand — signals are computed from current state each time, not stored incrementally. Each signal carries a **momentum** value: `rising`, `steady`, or `fading`.

Use `/arcs` during play to see your current trajectory.

## Endgame triggers

When accumulated state crosses specific thresholds, the engine fires endgame triggers. These are one-shot events representing pivotal narrative moments. There are 8 resolution classes:

| Resolution Class | Condition |
|-----------------|-----------|
| `victory` | Dominant faction control with high stability |
| `exile` | Expelled from all territories with no allies |
| `overthrow` | Faction leadership change driven by the player |
| `martyrdom` | Sacrifice for a cause (high influence spent on final action) |
| `corruption` | Power gained through betrayal and manipulation |
| `revelation` | Major hidden truth exposed to all factions |
| `stalemate` | All factions locked in unresolvable tension |
| `exodus` | Abandoning the setting entirely |

Endgame triggers appear as contextual suggestions: *"A turning point approaches — type /conclude to see your legacy."*

## Campaign conclusions

`/conclude` renders a structured epilogue:

1. **Deterministic outline** — the engine builds a `FinaleOutline` from faction states, NPC fates, district conditions, arc trajectory, and endgame triggers
2. **LLM epilogue** — Claude narrates the outline as a campaign-closing scene with the tone matching your resolution class
3. **Campaign status** — the session is marked as completed

The epilogue covers:

- **Faction fates** — who rose, who fell, who survived
- **NPC outcomes** — key character resolutions based on their final cognitive state
- **District conditions** — how neighborhoods changed
- **Player legacy** — what your arc meant for the world
- **Unresolved threads** — loose ends the engine detected

The deterministic outline ensures the epilogue is grounded in simulation truth. Claude adds literary quality but can't change what happened.
