---
title: Beginners
description: Everything a first-timer needs to know — what Claude RPG is, who it's for, and how to get playing in 5 minutes.
sidebar:
  order: 99
---

## What is this tool?

Claude RPG is a terminal-based role-playing game where you type freeform text and an AI narrator (Claude) interprets your actions. Under the hood, a deterministic simulation engine (the AI RPG Engine) resolves every action — combat, dialogue, movement, faction shifts, NPC decisions — through mechanical rules. Claude narrates the results but cannot change what happened.

The key idea: you get the creative freedom of a human game master with the consistency of a rules engine. NPCs speak from tracked beliefs and memories, factions pursue their own goals, and the world evolves based on your choices.

Everything runs locally in your terminal. Your game state is saved to your machine. The only network call is to the Anthropic API for narration.

## Who is this for?

- **Text RPG fans** who want a game where outcomes are deterministic and traceable, not hallucinated
- **AI curious players** who want to experience what simulation-grounded AI narration feels like
- **Game developers** looking for a reference implementation of the AI RPG Engine ecosystem
- **World builders** who want to generate playable worlds from a single text prompt

You do not need programming experience to play. You do need a terminal (command line), Node.js, and an Anthropic API key.

## Prerequisites

| Requirement | How to check | Where to get it |
|-------------|-------------|-----------------|
| **Node.js 20 or later** | Run `node --version` in your terminal | [nodejs.org](https://nodejs.org/) |
| **npm** (comes with Node.js) | Run `npm --version` | Installed with Node.js |
| **Anthropic API key** | You'll set it as an environment variable | [console.anthropic.com](https://console.anthropic.com/) |
| **A terminal** | Any terminal works — Terminal (macOS), PowerShell/cmd (Windows), or any Linux shell | Already on your system |

## Your First 5 Minutes

**Step 1: Set your API key**

Claude RPG needs your Anthropic API key to generate narration. Set it as an environment variable:

```bash
# macOS / Linux
export ANTHROPIC_API_KEY=sk-ant-...

# Windows PowerShell
$env:ANTHROPIC_API_KEY = "sk-ant-..."

# Windows cmd
set ANTHROPIC_API_KEY=sk-ant-...
```

**Step 2: Launch the game**

```bash
npx claude-rpg play
```

This downloads and runs Claude RPG without a permanent install. You'll see a world selection menu.

**Step 3: Pick a world and create a character**

Choose from 7 starter worlds (fantasy, cyberpunk, detective, pirate, zombie, weird-west, or colony). Then name your character, pick an archetype, background, traits, and disciplines. The game walks you through each step.

**Step 4: Play**

Once your character is ready, Claude narrates an opening scene. Type anything:

- `look around` — observe your surroundings
- `talk to the merchant` — start a conversation
- `search the room` — investigate for items or clues
- `attack the guard` — initiate combat

The engine resolves your action, the perception layer filters what your character actually saw, and Claude narrates the result.

**Step 5: Check your status and save**

- Type `/status` for a quick snapshot of health, location, and arc trajectory
- Type `/sheet` for your full character sheet
- Type `save` to save your progress (games also auto-save each turn)
- Type `quit` to exit

## Common Mistakes

**Forgetting the API key.** If you see "ANTHROPIC_API_KEY environment variable is required," you need to set it in your current terminal session. The key is not stored permanently — you need to set it each time you open a new terminal (or add it to your shell profile).

**Using command syntax instead of freeform text.** There is no rigid command language. Type naturally: "I sneak past the guards" works. You do not need to type `/sneak guards`. Slash commands like `/status` and `/sheet` are for information and control, not for game actions.

**Expecting Claude to decide outcomes.** Claude interprets your intent and narrates scenes, but the engine decides what actually happens. If your attack misses, it's because the engine's combat resolution determined it — Claude just describes it dramatically.

**Ignoring perception filtering.** You only see what your character perceived. If something happened behind you in dim light, you might get a vague description. Use Director mode (`/director`) to see the full truth if you're curious about what really happened.

**Not saving before risky actions.** While the game auto-saves, typing `save` before a dangerous choice gives you a named restore point. Use `claude-rpg load` to resume from any save.

## Next Steps

Once you're comfortable with basic play:

- **[Play Guide](../play-guide/)** — full command reference, combat details, NPC dialogue mechanics
- **[Director Mode](../director-mode/)** — inspect hidden simulation truth (NPC beliefs, faction states, consequence chains)
- **[World Generation](../world-generation/)** — create custom worlds from any text prompt with `claude-rpg new "your idea"`
- **[Campaign Arcs](../campaign-arcs/)** — learn how the engine detects your story trajectory and triggers endgame conclusions
- **[Architecture](../architecture/)** — understand the 8-step pipeline from your input to narrated output

## Glossary

| Term | Meaning |
|------|---------|
| **Engine** | The AI RPG Engine — the deterministic simulation runtime that resolves all actions. Has zero LLM dependencies. |
| **Claude** | The AI narrator. Interprets your freeform text, narrates scenes, and voices NPC dialogue. Does not decide outcomes. |
| **Perception layer** | Filters engine output so you only see what your character actually perceived. Low-clarity events appear vague. |
| **NarrationPlan** | A structured recipe the narrator produces describing text, sound effects, ambient audio, and voice parameters. |
| **Starter world** | A hand-crafted content pack shipped with the game (e.g., Chapel Threshold, Neon Lockbox). |
| **Generated world** | A world created on-the-fly from a text prompt using `claude-rpg new`. |
| **Faction** | An organized group with goals, territory, and relationships. Factions act autonomously between your turns. |
| **Consequence chain** | A deterministic sequence of NPC actions triggered when loyalty breakpoints shift. Ripples through the simulation. |
| **Arc detection** | The engine continuously analyzes your accumulated actions to detect 10 narrative arc kinds (rising-power, hunted, kingmaker, etc.). |
| **Endgame trigger** | A one-shot event that fires when accumulated state crosses specific thresholds, signaling a campaign climax. |
| **Director mode** | An inspection mode that reveals hidden simulation truth — NPC beliefs, faction states, equipment provenance. |
| **Leverage** | Political capital (influence, favors, intel) you spend on social, rumor, diplomacy, and sabotage actions. |
| **Chronicle** | The engine's event log tracking every significant thing that happened during your campaign. |
| **Save migration** | Automatic upgrade pipeline that converts old save files to the current schema version. |
