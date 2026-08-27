# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.6.1] - 2026-08-26

### Changed
- **Package renamed to `@mcptoolshop/claude-rpg`.** The unscoped npm name
  `claude-rpg` belongs to an unrelated third-party project and was never
  this repo — earlier READMEs pointed install commands at it in error. The
  CLI command is unchanged (`claude-rpg`) once installed; one-shot usage is
  `npx @mcptoolshop/claude-rpg play`. First npm publish of this project
  lands at this version, with provenance via trusted publishing.
- README, handbook, and release notes corrected to the scoped name.

## [1.6.0] - 2026-08-26

A dogfood-swarm release: four health passes (correctness, proactive hardening,
behavioral humanization, terminal-visual polish) followed by a Director-ruled
feature pass — 18 waves, 263 findings filed, 252 fixed, and the test suite
grown from 625 to 1,542.

### Added
- **Three new starter worlds reachable**: Iron Colosseum (gladiator), Jade
  Veil (ronin), and Crimson Court (vampire) are now registered and selectable
  — ten worlds total. The engine dependency family moved from 2.1.x to 2.9.x
  to unblock them.
- **`--world <name>` flag**: `claude-rpg play --world gladiator` skips the
  menu straight into a named world (ten aliases, listed in `--help`); an
  unknown name exits with a structured error before anything interactive.
- **Grouped world menu**: the ten-world chooser is grouped by difficulty
  (beginner-friendly / standard / advanced) with continuous numbering.
- **Death is a setback**: player defeat now fades to a distinct death screen,
  gates ordinary actions while you are down, and resumes on `continue` —
  campaigns end deliberately through `/conclude`, never by an accidental
  combat loss. The death presentation fires exactly once per fall.
- **Streaming narration**: narration renders as it generates.
- **`/cost` command**: session token usage and estimated spend on demand,
  without burning a billed call.
- **Retry-visible spinner**: during API retries the thinking spinner reports
  the attempt count and cause ("still thinking (retry 1/2 — rate limit
  reached)") instead of spinning silently for up to a minute and a half.
- **Outage-aware fallback prose**: consecutive narration failures switch to
  an honest "this is still happening" message instead of repeating the same
  first-hiccup line verbatim.
- **Display names everywhere**: status bar, recaps, save listings, and
  session summaries resolve archetype/discipline/pack/faction ids to their
  real display names ("Penitent Knight", never "penitent-knight").
- **Humanized presentation cues**: sound and ambient cue lines render as
  natural language ("a warning tone sounds", "ambient: white noise") with a
  vocabulary-drift tripwire so new cue ids can never print raw.
- **`--debug` interpretation trace**: successful interpretations log the
  interpreter's reasoning through the debug channel.

### Fixed
- **Ambient NPC dialogue is now actually wired.** v1.5.0 advertised it, but
  the generator had zero production call sites — no player ever saw a line.
  It now fires on zone entry and quiet turns during exploration, with
  pack-flavored line pools for the worlds that need them, at zero API cost.
- **NPC conversation memory is now actually wired — and persisted.** v1.5.0
  advertised it, but no caller ever passed conversation history into
  dialogue generation. NPCs now remember recent exchanges within a session
  AND across save/load, behind a shape-guarded loader.
- **The death hook no longer re-fires every turn** the player's HP stays at
  zero — death presentation is edge-triggered per fall.
- **Narration receives the current turn's presentation state** (it lagged
  one turn behind, so death-turn prose could describe the previous state).
- 252 findings fixed across the run in total: save/load integrity (turn
  history, campaign status, and RNG stream all restore on resume), the
  immersion pipeline activated end-to-end, fatal-error turn bookkeeping,
  autosave path guards, loader shape guards, and four stages of behavioral
  and visual polish.

### Changed
- Engine family upgraded 2.1.0 → 2.9.x (five API shifts absorbed).
- Test suite: 625 → 1,542 tests across 95 files, with ratcheted per-path
  coverage floors enforced in CI.
- Campaign conclusion, finale rules, HP severity colors, dividers, and the
  first-run welcome all follow a unified width-adaptive, NO_COLOR-safe
  terminal visual language.

## [1.5.1] - 2026-03-31

### Changed
- Updated logo

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
