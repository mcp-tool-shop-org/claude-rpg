---
title: Director Mode
description: Inspect hidden simulation truth — beliefs, factions, rumor networks, and consequence chains.
sidebar:
  order: 3
---

Director mode exposes the simulation state that the perception layer normally hides from the player. Use it to understand exactly why things happened the way they did.

## Director commands

| Command | What it reveals |
|---------|-----------------|
| `/inspect <npc>` | Beliefs, memories, morale, suspicion, faction loyalty |
| `/faction <id>` | Faction goals, relationships, territory, power level |
| `/trace <belief>` | Provenance chain — where a belief originated and how it spread |
| `/divergences` | What you thought happened vs what actually happened |
| `/npc <name>` | Breakpoints, leverage angles, active consequence chains |
| `/people` | All known NPCs with relationship summaries |
| `/districts` | District commerce, morale, safety overview |
| `/district <id>` | Detailed district state — who controls it, what's happening |
| `/item <name>` | Equipment provenance, kill chronicles, relic status |
| `/leverage` | Your political capital — influence, favors, intel |
| `/moves` | Available political actions and their costs |
| `/jobs` | Contracts and opportunities spawned by world conditions |
| `/accepted` | Work you've committed to |

## NPC cognition

Every NPC has a cognitive model that drives their behavior:

- **Beliefs** — what they think is true (with confidence levels)
- **Memories** — events they witnessed or heard about
- **Morale** — how willing they are to act
- **Suspicion** — how much they distrust you
- **Faction loyalty** — who they serve and how strongly
- **Rumors** — information they've heard through the rumor network

`/inspect` shows all of this. `/trace` follows a belief back through the rumor network to its origin.

## Consequence chains

When you push an NPC past a loyalty breakpoint, the engine creates a consequence chain. These are deterministic sequences of NPC actions that ripple through the simulation:

- A betrayed merchant might alert their faction
- The faction might revoke your trade access across a district
- District commerce drops, morale shifts, new opportunities spawn
- Other NPCs react to the changed conditions

`/npc` shows active consequence chains for a specific NPC. `/divergences` shows where your perception of events diverged from what actually happened.

## Equipment provenance

Items carry their history. `/item` shows:

- Who crafted or found the item
- Who carried it and for how long
- Kill chronicles — notable things it was used for
- Relic status — items that cross significance thresholds gain epithets
- NPC recognition — which NPCs know about this item and how they react to it
