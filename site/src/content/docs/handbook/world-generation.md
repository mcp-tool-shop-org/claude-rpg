---
title: World Generation
description: Generate custom worlds from text prompts with factions, NPCs, districts, and genre-specific modules.
sidebar:
  order: 4
---

## Generating a world

Any text prompt becomes a playable world:

```bash
claude-rpg new "A flooded gothic trade city ruled by three merchant houses"
```

World generation uses Claude Opus. The engine builds:

- **Factions** with goals, relationships, territory, and power levels
- **NPCs** with beliefs, memories, faction loyalty, and personality
- **Districts** with commerce, morale, safety, and controlling factions
- **Items** with stats and initial provenance
- **Zone connections** with exits and terrain

## What makes a good prompt

Prompts that generate richer worlds tend to include:

- **Power dynamics** — who's in charge, who's fighting for control
- **Tension** — what conflict drives the world
- **Setting details** — geography, technology level, atmosphere
- **Faction hints** — groups with competing interests

Examples:

```bash
# Political intrigue
claude-rpg new "A desert oasis kingdom where the water guild controls everything and the sand nomads are planning a revolution"

# Horror
claude-rpg new "A Victorian asylum where the patients are sane and the doctors are conducting rituals in the basement"

# Sci-fi
claude-rpg new "A generation ship where the AI overseer has been dead for a century but nobody noticed"
```

## Starter worlds vs generated worlds

Starter worlds are hand-crafted content packs shipped as engine packages. They have more detailed NPCs, richer faction webs, and pre-built narrative hooks. Generated worlds are created on the fly from your prompt — they're playable immediately but may have simpler initial faction structures.

Both use the same engine. All 29 simulation modules (combat, cognition, perception, factions, rumors, NPC agency, companions, leverage, strategic maps, item recognition, equipment provenance, emergent opportunities, arc detection, endgame triggers) run identically on starter and generated worlds.

## Content validation

Generated worlds are validated against the engine's content schema before play begins. The schema enforces:

- Valid entity types and relationships
- Required fields for NPCs, factions, and zones
- Consistent zone connectivity (no orphaned exits)
- Valid item stat ranges
