---
title: Getting Started
description: Install Claude RPG, configure your API key, and play your first game.
sidebar:
  order: 1
---

## Prerequisites

- **Node.js 20+** — check with `node --version`
- **Anthropic API key** — get one at [console.anthropic.com](https://console.anthropic.com/)

## Install

Install globally for the `claude-rpg` command:

```bash
npm install -g claude-rpg
```

Or run directly without installing:

```bash
npx claude-rpg play --world fantasy
```

## Set your API key

Claude RPG reads your key from the `ANTHROPIC_API_KEY` environment variable. It's never stored, logged, or transmitted beyond the Anthropic API.

```bash
# Linux/macOS
export ANTHROPIC_API_KEY=sk-ant-...

# Windows (PowerShell)
$env:ANTHROPIC_API_KEY = "sk-ant-..."

# Windows (cmd)
set ANTHROPIC_API_KEY=sk-ant-...
```

## Play your first game

Launch play mode and choose a world interactively:

```bash
claude-rpg play
```

You'll be presented with a menu of starter worlds and then guided through character creation (name, archetype, background, traits, disciplines, and stat allocation). Once creation is complete, the game begins with a narrated opening scene. Type anything — explore, talk to NPCs, pick up items, fight, negotiate, sneak. Claude interprets your freeform text and the engine resolves what happens.

For faster campaign pacing, add the `--fast` flag:

```bash
claude-rpg play --fast
```

## Available starter worlds

The interactive world selector offers ten worlds, grouped by difficulty:

| World | Genre | `--world` alias |
|-------|-------|-----------------|
| Chapel Threshold | Mountain monastery under siege (fantasy) | `fantasy` |
| Neon Lockbox | Corporate arcology where data is currency (cyberpunk) | `cyberpunk` |
| Iron Colosseum | Blood, sand, and freedom bought bout by bout (gladiator) | `gladiator` |
| Crimson Court | Candlelit vampire politics (vampire) | `vampire` |
| Gaslight Detective | Victorian conspiracy reaching the crown (detective) | `detective` |
| Black Flag Requiem | Dying pirate republic (pirate) | `pirate` |
| Ashfall Dead | Post-outbreak survival colony (zombie) | `zombie` |
| Dust Devil's Bargain | Supernatural frontier town (weird-west) | `weird-west` |
| Jade Veil | A masterless blade in a crumbling shogunate (ronin) | `ronin` |
| Signal Loss | Deep space colony that lost Earth contact (colony) | `colony` |

Already know where you're headed? Skip the menu:

```bash
claude-rpg play --world gladiator
```

An unknown world name exits with the valid list — nothing interactive starts.

## Generate a custom world

Don't want a starter world? Generate one from any text prompt:

```bash
claude-rpg new "A flooded gothic trade city ruled by three merchant houses"
```

World generation uses Claude Opus for quality. The engine builds factions, NPCs, districts, items, and relationships from your prompt.

## Save and load

Games auto-save. To resume a previous session:

```bash
claude-rpg load
```

Save files live in `~/.claude-rpg/saves/`.
