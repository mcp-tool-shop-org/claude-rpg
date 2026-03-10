<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/claude-rpg/readme.png" width="500" alt="Claude RPG">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/claude-rpg/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/claude-rpg"><img src="https://img.shields.io/npm/v/claude-rpg.svg" alt="npm version"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg"><img src="https://codecov.io/gh/mcp-tool-shop-org/claude-rpg/branch/main/graph/badge.svg" alt="codecov"></a>
  <a href="https://github.com/mcp-tool-shop-org/claude-rpg/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/claude-rpg/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# Claude RPG

A simulation-grounded campaign RPG where Claude stages the story, the engine preserves truth, and worlds evolve through rumor, pressure, faction, relationship, economy, and arc systems toward meaningful conclusions. Play it or build on it.

## What Is Claude RPG?

Claude RPG sits on top of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) — a deterministic simulation runtime with 29 modules covering combat, cognition, perception, factions, rumors, belief provenance, NPC agency, companions, player leverage, strategic maps, item recognition, equipment provenance, emergent opportunities, campaign arc detection, and endgame triggers. Claude's job is to interpret, narrate, and speak. The engine's job is to own truth.

The golden rule: **Claude proposes, engine disposes.**

Players type freeform text. Claude interprets intent, the engine resolves actions deterministically, perception filters decide what the player actually saw, and then Claude narrates only what the character perceived — with voice, sound effects, and ambient audio staged by the immersion runtime.

NPCs don't recite scripts. They speak from beliefs, memories, faction loyalty, and rumors. They lie for reasons. They're uncertain for reasons. They refuse for reasons. Director mode lets you inspect exactly why.

## Build Your Own

Claude RPG isn't just a game — it's a reference implementation for the AI RPG Engine ecosystem. Use it as a starting point for your own simulation-grounded narrative experiences.

| Want to... | Use |
|------------|-----|
| **Play right now** | `npx claude-rpg play --world fantasy` |
| **Create a new world** | `npx claude-rpg new "your world concept"` |
| **Author worlds visually** | [World Forge](https://github.com/mcp-tool-shop-org/world-forge) — 2D authoring studio with map editor, NPC builder, and validation |
| **Validate world data** | [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) — schema validation, storyboard testing, export pipelines |
| **Build a custom runtime** | Import [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) packages directly — swap Claude for any LLM, add your own UI |
| **Add new game modules** | Fork the engine, add modules to the resolution pipeline, and register them |

The engine is LLM-agnostic. Claude RPG uses Anthropic models, but the core engine has zero LLM dependencies — you can wire it to any model or even run fully deterministic without narration.

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

# Use the engine in your own project
npm install @ai-rpg-engine/core @ai-rpg-engine/modules
```

Set your Anthropic API key (only needed for Claude narration):

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
| **NPC agency with consequence chains** | NPCs act on goals, track obligations, and retaliate when loyalty breakpoints shift. `/npc` and `/people` surface breakpoints, leverage angles, and active consequence chains. |
| **Living districts** | Districts have commerce, morale, and safety that shift from player actions, faction moves, and NPC consequence chains. Mood flows into narration and scales gameplay. `/districts` and `/district` inspect the neighborhood pulse. |
| **Companions with departure risk** | Party members have morale, loyalty, and departure triggers. Push them too far and they leave — for reasons the engine tracks. |
| **Player leverage and political action** | Spend influence, favors, and intel on social, rumor, diplomacy, and sabotage actions. `/leverage` shows your political capital. |
| **Equipment provenance and relics** | Items carry history. A sword that kills enough becomes a relic with an epithet. NPCs recognize equipped items and react. `/item` inspects provenance and chronicles. |
| **Emergent opportunities** | Contracts, bounties, favors, supply runs, and investigations spawn from world conditions — pressure, scarcity, NPC goals, obligations. Accept, decline, abandon, or betray. `/jobs` and `/accepted` track available and active work. |
| **Campaign arcs and endgames** | The engine detects 10 narrative arc kinds (rising-power, hunted, kingmaker, resistance, etc.) and 8 endgame resolution classes (victory, exile, overthrow, martyrdom, etc.) from accumulated state. `/arcs` shows trajectory. `/conclude` renders a structured epilogue with optional LLM narration. |

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
| **Director** | Inspect hidden truth: `/inspect <npc>`, `/faction <id>`, `/trace <belief>`, `/divergences`, `/npc <name>`, `/people`, `/districts`, `/district <id>`, `/item <name>`, `/leverage`, `/moves`, `/jobs`, `/accepted` |
| **Replay** | Walk the event timeline showing objective truth vs player perception side-by-side. |

## Ecosystem

Claude RPG is one piece of a larger toolchain for building simulation-grounded narrative games:

| Project | What It Does |
|---------|-------------|
| [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) | Deterministic simulation runtime — 29 modules, zero LLM dependencies |
| [World Forge](https://github.com/mcp-tool-shop-org/world-forge) | 2D world authoring studio — map editor, NPC builder, renderer, export |
| [Cannon Archive](https://github.com/mcp-tool-shop-org/cannon-archive) | Schema validation, storyboard testing, AI RPG export pipelines |
| **Claude RPG** (this repo) | Reference runtime — Claude narration, immersion audio, director tools |

## Engine Packages

Claude RPG depends on these [@ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) packages:

| Package | Purpose |
|---------|---------|
| [`@ai-rpg-engine/core`](https://www.npmjs.com/package/@ai-rpg-engine/core) | State, entities, actions, events, rules, RNG |
| [`@ai-rpg-engine/modules`](https://www.npmjs.com/package/@ai-rpg-engine/modules) | 29 modules — combat, cognition, perception, factions, rumors, NPC agency, companions, leverage, strategic map, item recognition, emergent opportunities |
| [`@ai-rpg-engine/character-profile`](https://www.npmjs.com/package/@ai-rpg-engine/character-profile) | Character progression, injuries, reputation |
| [`@ai-rpg-engine/equipment`](https://www.npmjs.com/package/@ai-rpg-engine/equipment) | Equipment, item provenance, relic growth, chronicles |
| [`@ai-rpg-engine/campaign-memory`](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory) | Cross-session memory, relationship effects |
| [`@ai-rpg-engine/presentation`](https://www.npmjs.com/package/@ai-rpg-engine/presentation) | NarrationPlan schema, render contracts |
| [`@ai-rpg-engine/audio-director`](https://www.npmjs.com/package/@ai-rpg-engine/audio-director) | Audio cue scheduling, priority, ducking |
| [`@ai-rpg-engine/soundpack-core`](https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core) | Sound pack registry + core pack |
| [`@ai-rpg-engine/content-schema`](https://www.npmjs.com/package/@ai-rpg-engine/content-schema) | World content validation |
| [`@ai-rpg-engine/starter-fantasy`](https://www.npmjs.com/package/@ai-rpg-engine/starter-fantasy) | Chapel Threshold starter world |
| [`@ai-rpg-engine/starter-cyberpunk`](https://www.npmjs.com/package/@ai-rpg-engine/starter-cyberpunk) | Neon Lockbox starter world |
| [`@ai-rpg-engine/starter-detective`](https://www.npmjs.com/package/@ai-rpg-engine/starter-detective) | Gaslight Detective starter world |
| [`@ai-rpg-engine/starter-pirate`](https://www.npmjs.com/package/@ai-rpg-engine/starter-pirate) | Black Flag Requiem starter world |
| [`@ai-rpg-engine/starter-zombie`](https://www.npmjs.com/package/@ai-rpg-engine/starter-zombie) | Ashfall Dead starter world |
| [`@ai-rpg-engine/starter-weird-west`](https://www.npmjs.com/package/@ai-rpg-engine/starter-weird-west) | Dust Devil's Bargain starter world |
| [`@ai-rpg-engine/starter-colony`](https://www.npmjs.com/package/@ai-rpg-engine/starter-colony) | Signal Loss starter world |
| [`@ai-rpg-engine/starter-gladiator`](https://www.npmjs.com/package/@ai-rpg-engine/starter-gladiator) | Iron Colosseum starter world |
| [`@ai-rpg-engine/starter-ronin`](https://www.npmjs.com/package/@ai-rpg-engine/starter-ronin) | Jade Veil starter world |
| [`@ai-rpg-engine/starter-vampire`](https://www.npmjs.com/package/@ai-rpg-engine/starter-vampire) | Crimson Court starter world |

## Token Budget

| Step | Input | Output |
|------|-------|--------|
| Action interpretation | ~800 tokens | ~100 tokens |
| Scene narration (NarrationPlan) | ~1400 tokens | ~300 tokens |
| NPC dialogue | ~1400 tokens | ~100 tokens |
| **Total per turn** | **~3600 tokens** | **~500 tokens** |

Default model: `claude-sonnet-4-20250514`. World generation uses Opus for quality.

## Security

Claude RPG is a local CLI application that makes outbound API calls to Anthropic.

- **Data touched:** player save files in `~/.claude-rpg/saves/`, Anthropic API (outbound HTTPS only)
- **Data NOT touched:** no telemetry, no analytics, no filesystem outside the save directory
- **API key:** read from `ANTHROPIC_API_KEY` environment variable — never stored, logged, or transmitted beyond the Anthropic API
- **No secrets in source** — no embedded tokens, credentials, or API keys

See [SECURITY.md](SECURITY.md) for the full security policy and vulnerability reporting.

## License

MIT

---

Built by [MCP Tool Shop](https://mcp-tool-shop.github.io/)
