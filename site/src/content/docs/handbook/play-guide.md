---
title: Play Guide
description: Freeform input, in-game commands, save/load, and tips for getting the most out of play mode.
sidebar:
  order: 2
---

## Freeform input

There's no command syntax to memorize. Type what your character would do:

- `"I walk toward the chapel doors"` — movement
- `"Attack the pilgrim with my sword"` — combat
- `"Ask the merchant about the missing shipment"` — dialogue
- `"Search the crates for anything useful"` — investigation
- `"Lie about where I found the relic"` — deception

Claude interprets your intent, maps it to engine verbs (`move`, `attack`, `talk`, `search`, `deceive`), and the engine resolves the outcome. You see only what the perception layer says your character perceived.

## In-game commands

During play, these slash commands give you information and control:

| Command | What it does |
|---------|--------------|
| `/status` | Health, inventory, location, turn count, arc trajectory |
| `/sheet` or `/character` | Full character sheet — stats, equipment, progression |
| `/map` | Strategic map analysis — faction positions, pressure points, power balance |
| `/leverage` | Your political capital — influence, favors, intel, and available actions |
| `/jobs` | Available contracts, bounties, favors, supply runs, investigations |
| `/accepted` | Active work you've committed to |
| `/arcs` | Campaign arc signals — what trajectory the engine detects |
| `/conclude` | End the campaign with a structured epilogue |
| `/archive` | Browse completed campaigns |
| `/export md` | Export campaign chronicle as markdown |
| `/export json` | Export campaign chronicle as JSON |
| `/export finale` | Export standalone epilogue document (after `/conclude`) |
| `/director` | Enter director mode to inspect hidden truth |
| `/help` | Full command reference |
| `save` | Save the current game |
| `quit` | Exit the game |

## Perception filtering

You don't see everything. The engine tracks what your character actually perceived:

- **High clarity** — you see names, details, and intentions
- **Medium clarity** — you see shapes and general behavior
- **Low clarity** — shadowy figures, muffled sounds, vague impressions

If an NPC attacked you from behind in dim light, you might see "something struck you from behind" rather than "the merchant stabbed you." Director mode reveals the full truth.

## NPC dialogue

NPCs speak from their cognitive state — beliefs, memories, morale, suspicion level, faction loyalty, and rumors they've heard. This means:

- The same NPC gives different answers depending on what they know and how they feel about you
- NPCs can lie, and they lie for traceable reasons
- Pushing an NPC past loyalty breakpoints triggers consequence chains
- Companion NPCs have departure risk tied to morale and loyalty

## Combat

Combat is resolved deterministically by the engine. Factors include:

- Equipment stats and condition
- Position and terrain
- NPC morale (low morale NPCs may flee or surrender)
- Faction relationships (allies may intervene)

Claude narrates the engine's resolution — dramatic flourishes are narration, but the outcomes are mechanical.

## Saving

Games auto-save after each turn. Save files live in `~/.claude-rpg/saves/`.

Resume with:

```bash
claude-rpg load
```

Save files include full simulation state: NPC beliefs, faction standings, district conditions, arc snapshots, endgame triggers, and equipment provenance.
