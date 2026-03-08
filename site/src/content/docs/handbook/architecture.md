---
title: Architecture
description: The 8-step pipeline from player input to narrated output, and how the engine and narrator divide responsibility.
sidebar:
  order: 6
---

## The pipeline

Every turn flows through 8 steps:

```
Player types freeform text
    |
[1] ACTION INTERPRETATION (Claude)
    Input: player text + verbs + entities + exits
    Output: { verb, targetIds, confidence }
    |
[2] ENGINE RESOLUTION (deterministic)
    engine.submitAction() → ResolvedEvent[]
    |
[3] PERCEPTION FILTERING (deterministic)
    presentForObserver() → what the player saw
    |
[4] HOOKS: pre-narration
    Zone ambient, combat alerts, death effects
    |
[5] NARRATION PLAN (Claude)
    Input: filtered scene + presentation state
    Output: NarrationPlan { text, sfx, ambient, music, UI }
    |
[6] AUDIO DIRECTOR
    Priority, ducking, cooldowns → AudioCommand[]
    |
[7] PRESENTATION
    Voice synthesis + SFX + ambient via voice-soundboard
    Text rendering to terminal
    |
[8] NPC DIALOGUE (Claude, if speaking)
    Grounded in cognition: beliefs, memories, faction, rumors
    Voice-cast per NPC
```

## Separation of concerns

**Claude's job:** interpret player intent (step 1), narrate filtered scenes (step 5), voice NPC dialogue (step 8).

**The engine's job:** resolve actions deterministically (step 2), filter perception (step 3), track all simulation state.

Claude never sees unfiltered simulation state. It receives only what the perception layer says the player character perceived. This prevents narration from leaking information the player shouldn't have.

## Engine modules

The AI RPG Engine provides 29 modules across 16 packages:

| Package | What it handles |
|---------|----------------|
| `core` | State, entities, actions, events, rules, RNG |
| `modules` | Combat, cognition, perception, factions, rumors, NPC agency, companions, leverage, strategic map, item recognition, emergent opportunities |
| `character-profile` | Progression, injuries, reputation |
| `equipment` | Items, provenance, relic growth, chronicles |
| `campaign-memory` | Cross-session memory, relationship effects |
| `presentation` | NarrationPlan schema, render contracts |
| `audio-director` | Audio cue scheduling, priority, ducking |
| `soundpack-core` | Sound pack registry and core pack |
| `content-schema` | World content validation |
| `starter-*` | 7 starter world content packs |

## Token budget

| Step | Input | Output |
|------|-------|--------|
| Action interpretation | ~800 tokens | ~100 tokens |
| Scene narration | ~1400 tokens | ~300 tokens |
| NPC dialogue | ~1400 tokens | ~100 tokens |
| **Total per turn** | **~3600 tokens** | **~500 tokens** |

Default model: `claude-sonnet-4-20250514`. World generation uses Opus for quality.

## Immersion runtime

The narrator produces a **NarrationPlan** — a structured recipe describing text, sound effects, ambient layers, music cues, and voice parameters. The immersion runtime executes this plan:

- **Presentation state machine** tracks exploration / dialogue / combat / aftermath
- **Hook lifecycle** injects context-aware audio at `enter-room`, `combat-start`, `combat-end`, `death`, `npc-speaking`
- **Voice caster** auto-maps NPCs to voice profiles by type, gender, and faction
- **Audio director** schedules cues with priority, ducking, cooldowns, and anti-spam
- **MCP bridge** translates AudioCommands to voice-soundboard tool calls
