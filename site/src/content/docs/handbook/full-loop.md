---
title: Full Campaign Loop
description: A walkthrough of a complete campaign from world generation through arc detection and epilogue.
sidebar:
  order: 7
---

## From prompt to epilogue

This page walks through a full campaign lifecycle — every phase the engine runs through from the moment you type a world prompt to the moment you read your epilogue.

### 1. World generation

Everything starts with a prompt:

```bash
claude-rpg new "A flooded gothic trade city ruled by three merchant houses"
```

The engine generates factions with goals and relationships, NPCs with beliefs and loyalties, districts with economies, items with provenance, and zone connections. All validated against the content schema before play begins.

### 2. Character creation

You pick an archetype, name your character, and receive starting equipment. The character sheet tracks resources, stats, and a progression system with milestone-driven title evolution.

### 3. Early game — exploration and leverage

Your first turns establish relationships. The engine tracks every interaction:

- **Talk** to NPCs — their cognitive state updates (beliefs, memories, mood)
- **Inspect** environments — discover items, hidden details, leverage material
- **Spread rumors** — seed information that propagates through faction networks
- **Build leverage** — accumulate Favor, Blackmail, Influence, and Legitimacy

Each NPC independently evaluates their obligations, loyalty breakpoints, and agency goals. They act on their own between your turns.

### 4. Mid game — pressure and faction dynamics

As you accumulate influence, the world pushes back:

- **Faction agency** — factions pursue their own goals, react to your reputation
- **World pressures** — escalating events with deadlines that demand response
- **Rumor propagation** — information spreads, mutates, and creates consequences
- **District economies** — trade routes shift, scarcity emerges, prices change
- **Companion reactions** — party members respond to your choices based on their values

Emergent opportunities appear based on your position — quest webs, contracts, and faction requests that only make sense given your current standing.

### 5. Late game — arc detection

The engine continuously computes narrative arc signals from accumulated state. Ten arc kinds (rising-power, hunted, kingmaker, resistance, merchant-prince, shadow-broker, peacemaker, outcast, revelation, betrayer) each carry momentum: rising, steady, or fading.

Your dominant arc shapes what endgame triggers can fire. Use `/arcs` to see your trajectory.

### 6. Endgame triggers

When thresholds cross — faction dominance, total exile, leadership overthrow, self-sacrifice — the engine fires one-shot endgame triggers. Eight resolution classes determine the tone of your conclusion.

Contextual hints escalate: first a gentle suggestion, then an urgent prompt to type `/conclude`.

### 7. Campaign epilogue

`/conclude` renders a three-part conclusion:

1. **Deterministic outline** — the engine computes faction fates, NPC outcomes, district conditions, companion fates, and your legacy from simulation state
2. **Epilogue narration** — Claude narrates the outline in a genre-appropriate voice (chronicle for fantasy, noir debrief for cyberpunk, case file for detective)
3. **World after** — a compact snapshot showing what the world looks like after your story

The epilogue is grounded in truth. Claude adds literary quality but cannot change what happened.

### 8. Post-campaign

After the epilogue you can:

- **Continue playing** in the post-conclusion world
- **Save** to archive the campaign
- **Export** via `/export md` for a markdown chronicle of the full campaign

## What runs under the hood

Every turn, the engine executes these modules in order:

1. Action interpretation and validation
2. Combat resolution (if applicable)
3. Leverage verb processing
4. Profile sync and turn increment
5. Pressure evaluation and expiry
6. Faction agency cycle
7. District economy tick
8. NPC agency cycle
9. Item recognition scan
10. Rumor propagation
11. Companion reaction evaluation
12. Opportunity lifecycle
13. Consequence chain progression
14. Arc detection
15. Endgame trigger evaluation
16. Chronicle recording
17. Contextual suggestion generation

All deterministic. All traceable. Claude narrates the result — the engine owns the truth.
