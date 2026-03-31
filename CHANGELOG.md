# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.5.0] - 2026-03-31

### Added
- **API retry with exponential backoff**: transient Claude API failures retry automatically with jitter
- **Periodic autosave**: game state saves automatically at configurable intervals — no more lost progress
- **Fast-path inventory verbs**: common inventory commands (use, equip, drop, examine) resolve instantly without LLM round-trip
- **Terminal colors**: ANSI color support for richer CLI output (damage in red, healing in green, NPC names highlighted)
- **Animated spinner**: visual feedback during LLM calls so players know the narrator is thinking
- **Token/cost tracking**: per-turn and cumulative token usage and estimated cost displayed on demand
- **MaxHP status bar**: visual health bar in the HUD showing current vs maximum HP
- **Turn history compaction**: older turns are summarized to keep context windows efficient
- **Opportunity disambiguation**: when multiple opportunities match, the player is prompted to choose
- **Conditional dialogue prompts**: NPC dialogue adapts based on quest state, reputation, and prior conversations
- **NPC conversation memory**: NPCs remember what you told them and reference past exchanges
- **NPC voice archetypes**: distinct speech patterns per NPC type (scholarly, gruff, merchant, noble, etc.)
- **Tab completion**: readline tab completion for commands, NPC names, item names, and locations
- **Turn separators**: visual dividers between turns for readability
- **Structured announcements**: system messages (level up, quest complete, faction change) rendered as distinct UI blocks
- **Quest wiring**: quest objectives tracked and surfaced in narration context
- **Ambient NPC dialogue**: background NPCs chatter contextually based on district mood and events
- **Save listing enrichment**: save browser shows world name, playtime, and last location

### Changed
- Test suite expanded from 209 to 625 tests across 53 files
- Removed unused dependency

### Fixed
- 67 bug/security/quality findings from dogfood swarm Stage A
- 22 proactive findings hardened: error containment, graceful degradation, observability improvements

## [1.4.1] - 2026-03-25

### Added

- `--version` / `-v` flag for CLI

## [1.4.0] - 2026-03-19

### Added
- **Streaming narration**: optional `onChunk` / `onNarrationChunk` callbacks for incremental CLI rendering; engine resolves first, streaming is presentation only
- **Stream presenter**: `createStreamPresenter()` for terminal streaming with interruption display
- **Save migration pipeline**: versioned schema with ordered migration steps (`migrateSave`, `detectSchemaVersion`), historical fixtures, chronicle continuity through upgrades
- **Central error presenter**: `--debug` flag, structured CLI error rendering with distinct messages for future-version saves, missing-version saves, and generic corruption
- **Typed runtime contracts**: `ExecuteTurnOpts` and `NarrateSceneOpts` replace 21-param and 16-param positional signatures — field miswires are now compile-time errors
- **Claude adapter**: `createAdaptedClient()` with typed `NarrationError` (rate-limit, timeout, overloaded, auth, unknown) and streaming support
- **Coverage floors**: CI enforces per-module coverage on runtime-critical paths (session, narrator, turn-loop)
- Turn-loop integration harness with fake Claude client for deterministic testing
- Save validation guards and round-trip persistence tests
- Chronicle append-order, integrity, and persistence stability tests
- Archive/export and finale continuity proofs
- Canonical delta computation and no-drift recap tests

### Changed
- `executeTurn()` and `narrateScene()` now accept a single typed options object instead of positional parameters
- `game.ts` reduced to thin runtime coordinator; narration pipeline, presentation, and game-state helpers extracted to dedicated modules
- `loadSession()` returns `LoadResult` with migration metadata (`migrated`, `sourceVersion`, `stepsApplied`)
- `SaveValidationError` distinguishes future versions and missing version metadata

### Fixed
- Streaming callback miswire through `executeTurn` → `narrateScene` (positional arg drift; eliminated by typed opts)

## [1.3.0] - 2026-03-08

### Added
- Campaign archive browser: `/archive` command and `claude-rpg archive` CLI to browse completed campaigns
- Chronicle export: `/export md`, `/export json`, `/export finale` for campaign data export
- Pack-aware finale voices: genre-specific narration styles for epilogues (chronicle, noir, case-file, ship's log, journal, tall-tale, mission report)
- Compact "world after" summary block in campaign conclusions
- Fast campaign mode: `--fast` flag accelerates arc/endgame detection for shorter sessions
- First-turn onboarding: pack-specific orientation with suggested actions on new games
- `/help arcs` and `/help conclude` help topics
- Escalating endgame approach signals with trigger count
- "Approaching conclusion" banner in play mode when endgame triggers are active
- Endgame indicator in `/status` output
- Handbook pages: Full Campaign Loop, Archive & Export
- Campaign archives feature card on landing page

### Changed
- Finale conclusion screen now shows CAMPAIGN CONCLUSION header, world-after block, and `/export` hint
- Updated product sentence across README and landing page
- Landing page previews updated (Archive replaces Load)

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
