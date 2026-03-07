<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/claude-rpg/readme.png" width="400" alt="Claude RPG">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# Claude RPG

A simulation-grounded terminal RPG where Claude narrates, the engine preserves truth, and the immersion runtime stages voice, sound, and presentation.

## What Is Claude RPG?

Claude RPG sits on top of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) — a deterministic simulation runtime with 17 modules covering combat, cognition, perception, factions, rumors, and belief provenance. Claude's job is to interpret, narrate, and speak. The engine's job is to own truth.

The golden rule: **Claude proposes, engine disposes.**

Players type freeform text. Claude interprets intent, the engine resolves actions deterministically, perception filters decide what the player actually saw, and then Claude narrates only what the character perceived — with voice, sound effects, and ambient audio staged by the immersion runtime.

NPCs don't recite scripts. They speak from beliefs, memories, faction loyalty, and rumors. They lie for reasons. They're uncertain for reasons. They refuse for reasons. Director mode lets you inspect exactly why.

## Install

```bash
npm install claude-rpg
```

Or run directly:

```bash
npx claude-rpg play --world fantasy
```

## Quick Start

```bash
# Play the built-in Chapel Threshold scenario
npx claude-rpg play --world fantasy

# Generate a new world from a prompt
npx claude-rpg new "A flooded gothic trade city ruled by three merchant houses"
```

Set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Why It's Different

| What | How |
|------|-----|
| **Simulation truth separate from narration** | The engine resolves combat, movement, dialogue — Claude only narrates the result. No hallucinated outcomes. |
| **NPC dialogue grounded in cognition** | Every line of NPC speech is built from their beliefs, memories, morale, suspicion, faction, and rumors. |
| **Perception-aware presentation** | Claude receives only what the player character perceived. Low-clarity entities appear as shadowy figures, not named targets. |
| **Audio/voice immersion runtime** | Structured narration plans drive voice synthesis, sound effects, ambient layers, and music through voice-soundboard. |
| **Director visibility into hidden truth** | `/inspect pilgrim` shows beliefs. `/trace` shows provenance. `/divergences` shows what you thought happened vs what actually did. |

## Architecture

```
Player types freeform text
    |
[1] ACTION INTERPRETATION (Claude)
    Input: player text + verbs + entities + exits
    Output: { verb, targetIds, confidence }
    |
[2] ENGINE RESOLUTION (deterministic)
    engine.submitAction() -> ResolvedEvent[]
    |
[3] PERCEPTION FILTERING (deterministic)
    presentForObserver() -> what the player saw
    |
[4] HOOKS: pre-narration
    Zone ambient, combat alerts, death effects
    |
[5] NARRATION PLAN (Claude)
    Input: filtered scene + presentation state
    Output: NarrationPlan { text, sfx, ambient, music, UI }
    |
[6] AUDIO DIRECTOR
    Priority, ducking, cooldowns -> AudioCommand[]
    |
[7] PRESENTATION
    Voice synthesis + SFX + ambient via voice-soundboard
    Text rendering to terminal
    |
[8] NPC DIALOGUE (Claude, if speaking)
    Grounded in cognition: beliefs, memories, faction, rumors
    Voice-cast per NPC
```

## Immersion Runtime (v0.2)

The narrator doesn't output raw prose — it produces a **NarrationPlan**: a structured recipe describing text, sound effects, ambient layers, music cues, and voice parameters.

| Module | Purpose |
|--------|---------|
| **Presentation State Machine** | Tracks exploration / dialogue / combat / aftermath — drives audio layer selection |
| **Hook Lifecycle** | `enter-room`, `combat-start`, `combat-end`, `death`, `npc-speaking` — inject context-aware audio |
| **Voice Caster** | Auto-maps NPCs to [voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard) voices by type, gender, faction |
| **Audio Director** | Schedules cues with priority, ducking, cooldowns, anti-spam |
| **Sound Registry** | Content-addressable audio entries — query by tags, mood, intensity |
| **MCP Bridge** | Translates AudioCommands to voice-soundboard tool calls |

## Three Modes

| Mode | What It Does |
|------|-------------|
| **Play** | Immersive narrated RPG. Claude narrates, NPCs speak from beliefs, actions resolve through the engine. |
| **Director** | Inspect hidden truth: `/inspect <npc>`, `/faction <id>`, `/trace <belief>`, `/divergences` |
| **Replay** | Walk the event timeline showing objective truth vs player perception side-by-side. |

## Engine Packages

Claude RPG depends on these [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) packages:

| Package | Purpose |
|---------|---------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | State, entities, actions, events, rules, RNG |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | Combat, cognition, perception, factions, rumors, belief provenance |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | NarrationPlan schema, render contracts |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | Audio cue scheduling, priority, ducking |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | Sound pack registry + core pack |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | World content validation |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Chapel Threshold starter world |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Neon District starter world |

## Token Budget

| Step | Input | Output |
|------|-------|--------|
| Action interpretation | ~800 tokens | ~100 tokens |
| Scene narration (NarrationPlan) | ~1400 tokens | ~300 tokens |
| NPC dialogue | ~1400 tokens | ~100 tokens |
| **Total per turn** | **~3600 tokens** | **~500 tokens** |

Default model: `claude-sonnet-4-20250514`. World generation uses Opus for quality.

## License

MIT
