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

### v1.4.1 — Test Expansion (2026-03-25)
Expanded test suite from 195 to 302 tests across 24 files. New coverage for game state, NPC agency, narrator, action interpreter, prompt contracts, chronicle unit tests, and Claude adapter structured generation/streaming paths.

### v1.5.0 — Swarm Hardening (2026-03-31)
Dogfood swarm: 67 bug/security fixes (Stage A), 22 proactive hardening passes (Stage B+C), three feature waves. API retry with backoff, periodic autosave, fast-path inventory verbs, terminal colors + spinner, tab completion, NPC voice archetypes + conversation memory, token/cost tracking, turn history compaction, quest wiring, ambient NPC dialogue, structured announcements, save listing enrichment. 625 tests across 53 files.

## Next

### Arc H — Campaign Packs / Authored Adventure Spine
Turn claude-rpg from "a robust engine that can run a story" into "a robust engine that can host distinctive, replayable campaigns."

- Versioned campaign/module format
- World rules, factions, locations, hooks, and opening states as importable content
- Campaign-specific chronicle/recap framing
- Clean start/resume flow for a named world or module
- Compatibility contract with saves, chronicle, and migration

Smallest shippable: one module format, one bundled campaign, one clean load/start path, one save compatibility contract.
