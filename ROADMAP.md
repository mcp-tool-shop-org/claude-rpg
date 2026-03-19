# Roadmap

## Shipped

### v1.0.0 — Core Engine (2026-02-15)
7 starter worlds, freeform input, deterministic simulation, perception-filtered narration, NPC dialogue, immersion runtime, director mode, save/load, companions, player leverage, equipment provenance, rumor ecology, district economies.

### v1.1.0 — Living World (2026-02-28)
Emergent opportunities, crafting/salvage system, district economy simulation.

### v1.2.0 — Campaign Arcs (2026-03-08)
Arc detection (10 kinds), endgame triggers (8 classes), deterministic finale rendering, LLM epilogue, NPC agency, shipcheck compliance.

### v1.3.0 — Campaign Archives (2026-03-08)
Archive browser, chronicle export (md/json/finale), pack-aware finale voices, fast campaign mode, 3 new starter worlds (gladiator, ronin, vampire).

### v1.4.0 — Runtime Proofing (2026-03-19)
Streaming narration, save migration pipeline, Claude adapter with typed errors, central error presenter + `--debug`, typed `ExecuteTurnOpts`/`NarrateSceneOpts`, coverage floors. 195 tests.

## Next

### Arc H — Campaign Packs / Authored Adventure Spine
Turn claude-rpg from "a robust engine that can run a story" into "a robust engine that can host distinctive, replayable campaigns."

- Versioned campaign/module format
- World rules, factions, locations, hooks, and opening states as importable content
- Campaign-specific chronicle/recap framing
- Clean start/resume flow for a named world or module
- Compatibility contract with saves, chronicle, and migration

Smallest shippable: one module format, one bundled campaign, one clean load/start path, one save compatibility contract.
