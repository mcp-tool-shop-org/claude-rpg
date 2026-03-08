# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-03-08

### Added
- Campaign arc detection: 10 arc kinds (rising-power, hunted, kingmaker, resistance, merchant-prince, shadow-broker, last-stand, community-builder, descent, reckoning) derived from accumulated state
- Endgame trigger detection: 8 resolution classes (victory, tragic-stabilization, exile, overthrow, martyrdom, quiet-retirement, puppet-master, collapse) fire when threshold conditions are met
- Deterministic finale rendering with structured epilogues (NPC fates, faction outcomes, district fates, legacy entries)
- LLM-narrated epilogue via `/conclude` command
- Arc context and endgame atmosphere woven into scene narration
- `/arcs` command to view current campaign trajectory
- `/conclude` command to trigger finale rendering and epilogue
- Arc indicator in `/status` display
- Campaign arc section in session recap
- Contextual suggestion for `/conclude` when endgame triggers fire
- Full save/load persistence for arc snapshots, endgame triggers, finale outlines, and campaign status
- Director mode commands: `/arcs`, `/endgame`, `/finale`
- Shipcheck audit compliance (SECURITY.md, threat model, CHANGELOG)
- Landing page via @mcptoolshop/site-theme
- README translations (8 languages)

## [1.1.0] - 2026-02-28

### Added
- Emergent opportunities: contracts, bounties, favors, supply runs, investigations, escorts, recovery missions, faction jobs spawn from world conditions
- Opportunity lifecycle: available → accepted → completed/failed/abandoned/betrayed
- `/jobs` and `/contracts` commands to view available opportunities
- Opportunity context woven into narration and NPC dialogue
- Crafting, salvage, and item transformation system with materials, recipes, repair, and modification
- District economy simulation: supply categories, scarcity, black markets, contextual value
- Economy context in narration showing market conditions through sensory detail
- Companion reactions to district conditions and combat outcomes

## [1.0.0] - 2026-02-15

### Added
- 7 starter worlds: fantasy, cyberpunk, detective, pirate, zombie, weird west, sci-fi colony
- Freeform text input interpreted by Claude into engine actions
- Deterministic simulation via AI RPG Engine with 29 modules
- Perception-filtered narration (Claude sees only what the character perceived)
- NPC dialogue grounded in beliefs, memories, faction loyalty, and rumors
- Multi-modal immersion runtime: voice synthesis, sound effects, ambient audio
- Director mode for inspecting hidden simulation truth
- Character creation with archetypes, disciplines, and starter gear
- Save/load with full state persistence
- NPC agency with loyalty breakpoints and consequence chains
- Companion system with morale, departure risk, and party abilities
- Player leverage: influence, favors, intel for social/rumor/diplomacy/sabotage actions
- Equipment provenance: items carry history, relics earn epithets
- Strategic map analysis and move advisor
- World pressure system with resolution and fallout
- Rumor ecology with propagation, mutation, and faction-specific knowledge
- District life: commerce, morale, safety metrics with mood derivation
