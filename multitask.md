# v2.1 — Polish, Balance & Publishing Surface

> **Coordination rule:** Before starting a task, mark it `[IN PROGRESS by <your-id>]`.
> Check that no other Claude has already claimed it. If claimed, pick the next unclaimed task.
> When done, mark `[DONE by <your-id>]` and note what files were changed.
> If a task depends on another, wait until the dependency is marked DONE.

## Repos

- **Engine:** `F:\AI\ai-rpg-engine` (monorepo, `packages/*`, root is `private: true`)
- **Product:** `F:\AI\claude-rpg` (CLI app, publishes as `claude-rpg` on npm)

## Current versions

- claude-rpg: 1.2.1 (published on npm)
- ai-rpg-engine packages: 2.0.x–2.1.x (all published)

---

## Track A: Balance Passes (engine-side)

These tasks modify files in `F:\AI\ai-rpg-engine\packages\modules\src\`.
After each change, run `cd F:\AI\ai-rpg-engine && npm run build && npm test` to verify (1859+ tests).

### A1. Arc detection balance review
- [DONE by A] **Review arc scoring thresholds in `packages/modules/src/arc-detection.ts`** — rising-power influence 40→50, merchant-prince avgSupply 60→45
  - Current thresholds: STRENGTH_THRESHOLD=0.1, DOMINANT_THRESHOLD=0.5, MOMENTUM_DELTA=0.05
  - 10 arc kinds each have scoring criteria. Check for:
    - `rising-power` fires too easily (influence > 40 is low for mid-game)
    - `hunted` requires ALL factions hostile — may be too strict, consider "majority hostile"
    - `merchant-prince` requires avg district supply > 60 — may never fire in scarcity-heavy packs
    - `last-stand` requires HP < 30% — confirm this isn't too late to be actionable
    - `reckoning` requires 20+ obligation magnitude — check if any starter pack generates enough obligations
  - Propose adjusted thresholds in comments, implement changes if clearly needed
  - **Files:** `arc-detection.ts`

### A2. Endgame trigger balance review
- [DONE by A] **Review endgame thresholds in `packages/modules/src/endgame-detection.ts`** — victory influence 60→50, tragic-stab turns 60→45, quiet-retire pressures 0→≤1 + legitimacy 50→40, puppet-master blackmail 40→30 + influence 50→40, collapse districts 3→2
  - 8 resolution classes checked in priority order: martyrdom → collapse → exile → overthrow → victory → puppet-master → quiet-retirement → tragic-stabilization
  - Check for:
    - `victory` requires influence >= 60 AND heat <= 20 AND <= 2 pressures — this is very hard; ensure at least one starter pack can plausibly reach it by turn 30-50
    - `quiet-retirement` requires 40+ turns AND 0 pressures AND heat <= 10 — may be unreachable if pressures keep spawning
    - `tragic-stabilization` requires 60+ turns — may be too long for most play sessions
    - `puppet-master` requires blackmail >= 40 — check if shadow-broker arc feeds into this naturally
    - `collapse` requires 5+ pressures AND 3+ districts with supply < 15 — does any pack have 3+ districts?
  - Cross-reference with starter pack district counts (chapel=2, others may vary)
  - **Files:** `endgame-detection.ts`

### A3. Leverage action cost/cooldown review
- [DONE by A] **Review leverage actions in `packages/modules/src/player-leverage.ts`** — added incite-riot sabotage action (blackmail 15 + influence 10, 6-turn cooldown). recruit-ally and broker-truce costs reasonable, no change.
  - 27 actions across 4 categories (social, rumor, diplomacy, sabotage)
  - Check for:
    - `recruit-ally` costs 25 favor + 15 influence — is this achievable by mid-game?
    - `broker-truce` costs 30 influence + 15 legitimacy with 8-turn cooldown — may be too expensive to ever use
    - Sabotage category only has 3 actions vs 7 for social — could use another option
    - Heat decay is 3/turn — confirm intimidation actions (cost 10 heat) are usable given heat gain rates
  - Check passive gain rates: favor +5 on positive rep delta, blackmail +5 on XP >= 15, legitimacy +5 on milestones
  - **Files:** `player-leverage.ts`

### A4. Starter pack campaign pacing audit
- [DONE by A] **Audit each starter pack for campaign pacing** — summary table added to endgame-detection.ts. 6/7 packs have 1 faction (political arcs unreachable). Only Dust Devil's Bargain supports resistance/kingmaker. All packs have 2 districts, 1 dialogue tree. (depends on A1, A2)
  - For each of the 7 starter packs (`packages/starter-*/src/`):
    - Count: zones, districts, NPCs, factions, items, dialogue trees
    - Estimate: which arcs are reachable, which endgames are plausible
    - Flag: packs that likely stagnate (too few factions for political play) or conclude too early (only 2 districts means collapse can't fire)
  - Create a summary table in a comment block at the top of `endgame-detection.ts`
  - Packs to check: `starter-fantasy`, `starter-cyberpunk`, `starter-detective`, `starter-pirate`, `starter-zombie`, `starter-weird-west`, `starter-colony`
  - **Files:** all `starter-*/src/content.ts` (read-only), `endgame-detection.ts` (add summary comment)

---

## Track B: Campaign Archive & Export (product-side)

These tasks modify files in `F:\AI\claude-rpg\src\`.
After each change, run `cd F:\AI\claude-rpg && npm run build && npm test` to verify (52+ tests).

### B1. Campaign archive browser
- [DONE by B] **Add `/archive` command to browse concluded campaigns** — listArchivedCampaigns() in session.ts, renderArchiveBrowser() in display/archive-browser.ts, /archive in game.ts, `claude-rpg archive` in bin.ts
  - Read existing save system in `src/session/session.ts` — `SavedSession` v1.4.0 has `campaignStatus: 'active' | 'completed'`
  - Add new function `listArchivedCampaigns()` in `src/session/session.ts` that:
    - Scans `~/.claude-rpg/saves/` for save files
    - Reads each, filters for `campaignStatus === 'completed'`
    - Returns array of `{ filename, packId, title, dominantArc, resolutionClass, turnCount, chronicleHighlights, companionFates, relicNames }`
  - Add new display function `renderArchiveBrowser(campaigns)` in a new file `src/display/archive-browser.ts`:
    - Table format: Pack | Title | Arc | Resolution | Turns | Companions | Relics
    - Color-code resolution classes (victory=green, exile=red, etc.)
    - Show "No archived campaigns" if empty
  - Wire `/archive` command in `src/game.ts` `processInput()` method (add alongside existing `/status`, `/arcs`, etc.)
  - Also wire it as a top-level CLI command in `src/bin.ts`: `claude-rpg archive`
  - **Files:** `session.ts`, new `display/archive-browser.ts`, `game.ts`, `bin.ts`

### B2. Export chronicle as markdown
- [DONE by B] **Add `/export` command to export campaign chronicle** — exportChronicleMarkdown(), exportChronicleJSON() in session/chronicle-export.ts, /export md|json wired in game.ts, writeExport() helper
  - Add new file `src/session/chronicle-export.ts` with:
    - `exportChronicleMarkdown(session: SavedSession): string` — produces a full markdown document:
      ```
      # Campaign Chronicle: <pack-name>
      ## Summary
      Arc: <dominant-arc> | Resolution: <resolution-class> | Turns: <N>
      ## Key Moments
      (top 10 events by significance, formatted as timeline)
      ## Faction Fates
      (table: Faction | Outcome | Final Rep | Cohesion)
      ## NPC Fates
      (table: Name | Outcome | Last Event)
      ## Companion Journey
      (for each companion: joined turn, departed/died turn, final morale)
      ## District Conditions
      (table: District | Stability | Economy | Controller)
      ## Equipment of Note
      (relics and significant items with provenance)
      ## Legacy
      (legacy entries from FinaleOutline)
      ## Epilogue
      (LLM epilogue text if available)
      ```
    - `exportChronicleJSON(session: SavedSession): object` — structured JSON of the same data
  - Wire `/export` command in `src/game.ts`:
    - `/export md` → writes `~/.claude-rpg/exports/<pack>-<timestamp>.md`
    - `/export json` → writes `~/.claude-rpg/exports/<pack>-<timestamp>.json`
    - Print path to terminal after export
  - Create `~/.claude-rpg/exports/` directory if it doesn't exist
  - **Files:** new `session/chronicle-export.ts`, `game.ts`, `bin.ts`

### B3. Export finale as shareable artifact
- [DONE by B] **Add `/export finale` subcommand** — exportFinaleMarkdown() in chronicle-export.ts, /export finale wired in game.ts (only available when campaignStatus === 'completed')
  - In `src/session/chronicle-export.ts`, add:
    - `exportFinaleMarkdown(outline: FinaleOutline, epilogue?: string, genre?: string): string`
    - Standalone document focused on the epilogue:
      ```
      # <Pack Name> — Campaign Finale
      > Resolution: <class> | Arc: <dominant-arc>
      ## The Story Ends
      <epilogue text>
      ## What Became of the World
      ### Factions
      (narrative-style faction fates)
      ### People
      (NPC fates as short paragraphs)
      ### Places
      (district fates)
      ## Your Legacy
      (legacy entries)
      ```
  - Wire `/export finale` in game.ts — only available if `campaignStatus === 'completed'`
  - **Files:** `session/chronicle-export.ts`, `game.ts`

---

## Track C: Finale Presentation Polish (product-side)

### C1. Pack-aware finale voices
- [DONE by C] **Add genre-specific finale narration styles** — PACK_VOICES record in finale-prompt.ts, injected at end of buildFinalePrompt()
  - In `src/prompts/finale-prompt.ts`, the `FINALE_SYSTEM` prompt currently has generic tone guidance
  - Add pack-specific voice instructions in `buildFinalePrompt()`:
    - fantasy → "epic chronicle voice, archaic turns of phrase"
    - cyberpunk → "noir data-log voice, clipped corporate language"
    - detective → "case-file summary voice, methodical deduction"
    - pirate → "ship's log voice, maritime metaphor"
    - zombie → "survivor's journal voice, terse and haunted"
    - weird-west → "frontier tall-tale voice, dust and superstition"
    - colony → "mission report voice, bureaucratic dread"
  - Map pack IDs to voice strings. Pass packId through from game.ts → narrateFinale()
  - Update `narrateFinale()` signature in `src/narrator/finale-narrator.ts` to accept `packId?: string`
  - Update the call site in `src/game.ts` `handleConclude()` to pass pack ID
  - **Files:** `finale-prompt.ts`, `finale-narrator.ts`, `game.ts`

### C2. Compact "world after" summary
- [DONE by C] **Add a deterministic "world after" block to the finale display** — buildWorldAfter() + worldAfter field in FinaleNarrationResult in finale-narrator.ts
  - In `src/narrator/finale-narrator.ts`, enhance `formatFinaleForTerminal()` (imported from engine) or add a local wrapper:
    - After the epilogue, add a compact summary block:
      ```
      ═══ WORLD AFTER ═══
      Factions:  Merchant Guild (dominant) · Iron Covenant (weakened) · Shadow Hand (destroyed)
      Districts: Market Ward (stable/prosperous) · Docks (unstable/scarce)
      Companions: Brother Aldric (alive, loyal) · Sister Maren (departed turn 15)
      Relics: Ashbane (legendary, 12 kills) · Merchant's Seal (notable)
      ```
    - Use the FinaleOutline data: `outline.factionFates`, `outline.districtFates`, `outline.npcFates`, filter for companions
    - Keep it under 10 lines — this is a glanceable snapshot, not the full chronicle
  - **Files:** `finale-narrator.ts` (or new `display/finale-display.ts`)

### C3. Better faction/NPC/district fate formatting
- [DONE by C] **Improve terminal formatting of finale output in game.ts** — CAMPAIGN CONCLUSION header with ═ dividers, worldAfter block, /export hint in footer
  - Current `handleConclude()` in `src/game.ts` returns formatted text
  - Add chalk/ANSI coloring to fate outcomes:
    - Victory/allied/dominant → green
    - Destroyed/dead/exile → red
    - Weakened/departed/hostile → yellow
    - Neutral/stable → dim white
  - Add horizontal rule separators between sections
  - Add significance stars: `★★★` for significance >= 0.8, `★★` for >= 0.5, `★` for rest
  - Check what terminal formatting utilities exist in `src/display/` — reuse patterns from `play-renderer.ts`
  - **Files:** `game.ts` (handleConclude section), possibly `display/finale-display.ts`

---

## Track D: Onboarding & Demo Hardening (product-side)

### D1. Fast campaign mode
- [DONE by C] **Add `--fast` flag to accelerate campaign pacing** — fastMode on GameConfig/GameSession, inflates totalTurns×2 + leverage×1.5 in buildArcInputs(), --fast in bin.ts, "(Fast Campaign)" in /status
  - In `src/bin.ts`, add `--fast` CLI flag to `play` command
  - Pass through to game.ts constructor
  - When fast mode is active:
    - Endgame trigger thresholds are halved (pass multiplier to engine evaluation)
    - Arc STRENGTH_THRESHOLD lowered to 0.05 (more arcs detected earlier)
    - Contextual suggestions appear more frequently (reduce turn-count gates in `contextual-suggestions.ts`)
    - Add "(Fast Campaign)" indicator in `/status` output
  - This lets new players experience the full arc → endgame → conclude loop in ~15-20 turns instead of 40+
  - **Files:** `bin.ts`, `game.ts`, `contextual-suggestions.ts`, `status-compact.ts`
  - **Engine:** May need to expose threshold overrides in arc-detection and endgame-detection function signatures

### D2. Stronger endgame approach signals
- [DONE by C] **Improve "approaching endgame" visibility** — escalating text in contextual-suggestions.ts, endgameIndicator in status-compact.ts, hasEndgameTriggers banner in play-renderer.ts, wired in game.ts
  - In `src/display/contextual-suggestions.ts`:
    - Current endgame suggestion (#14): "A turning point approaches — type /conclude to see your legacy"
    - Add escalating urgency based on trigger count:
      - 1 trigger: "A turning point approaches..."
      - 2+ triggers: "Multiple endgame conditions detected — your campaign may be reaching its conclusion"
    - Add endgame hints in `/status` output (`status-compact.ts`):
      - Show "Endgame: <resolution-class> detected (turn <N>)" if any unacknowledged triggers exist
  - In `src/display/play-renderer.ts`:
    - When endgame triggers exist, add a subtle banner above narration: `── approaching conclusion ──`
  - **Files:** `contextual-suggestions.ts`, `status-compact.ts`, `play-renderer.ts`

### D3. Guided first-turn experience
- [DONE by C] **Add first-turn onboarding prompt** — GENRE_TO_PACK map, getOnboardingByGenre(), renderFirstTurnOrientation() in help-system.ts, wired in game.ts getOpeningNarration()
  - In `src/game.ts`, after the first scene narration (turn 0), inject a brief orientation:
    - "Type anything to act. Try: look around, talk to <nearest-npc>, explore <exit-name>"
    - Pull NPC names and exit names from the current zone state
    - Only show on turn 0 for new games (not loaded saves)
  - In `src/display/help-system.ts`:
    - The pack quickstart data already exists for all 7 packs
    - Wire `getPackOnboarding(packId)` to display pack-specific tips on first turn
    - Show the "first moves" from the quickstart card: e.g., "Try: Talk to the Pilgrim" for chapel-threshold
  - **Files:** `game.ts`, `help-system.ts`

### D4. Expand /help for arcs and conclusions
- [DONE by C] **Add arc/conclusion help to the help system** — renderArcHelp(), renderConcludeHelp() in help-system.ts, wired /help arcs|conclude in game.ts, updated COMMANDS in renderPlayHelp()
  - In `src/display/help-system.ts`:
    - Add `renderArcHelp()`: explain the 10 arc kinds in plain language, how momentum works, what `/arcs` shows
    - Add `renderConcludeHelp()`: explain endgame triggers, when /conclude is available, what the epilogue includes
    - Add these to the `/help` menu: `/help arcs`, `/help conclude`
  - Wire in `src/game.ts` processInput for `/help arcs` and `/help conclude` subcommands
  - **Files:** `help-system.ts`, `game.ts`

---

## Track E: Documentation & Release (product-side)

### E1. README product sentence update
- [DONE by C] **Update the hero sentence in README.md** — updated line 19 with new product sentence
  - New product sentence: "Claude RPG is a simulation-grounded campaign RPG where Claude stages the story, the engine preserves truth, and worlds evolve through rumor, pressure, faction, relationship, economy, and arc systems toward meaningful conclusions."
  - Update in:
    - `README.md` line 14 (current: "A simulation-grounded terminal RPG where Claude narrates...")
    - `site/src/site-config.ts` `description` field and `hero.description` field
    - `package.json` `description` field
  - **Files:** `README.md`, `site/src/site-config.ts`, `package.json`

### E2. Handbook examples showing full loop
- [DONE by C] **Add "Full Campaign Loop" example to handbook** — new full-loop.md (order 7), covers all 8 campaign phases + engine module execution order, site builds (9 pages)
  - In `site/src/content/docs/handbook/`, add new page `full-loop.md` (sidebar order: 3, between play-guide and director-mode):
    - Walk through a compressed example campaign from start to conclusion:
      - Turn 1: arrive, explore, meet NPC
      - Turn 5: faction tension, leverage play
      - Turn 10: arc detected (rising-power)
      - Turn 20: endgame trigger (victory conditions approaching)
      - Turn 25: /conclude, epilogue renders
    - Show example terminal output for: `/status`, `/arcs`, `/conclude`
    - Reference actual game mechanics, not hypotheticals
  - Update `site/src/content/docs/handbook/index.md` to add the new page to the chapter list
  - Rebuild site: `cd site && npx astro build`
  - **Files:** new `site/src/content/docs/handbook/full-loop.md`, `site/src/content/docs/handbook/index.md`

### E3. Update handbook navigation
- [DONE by C] **Add archive and export to handbook** — new archive-export.md (order 8), documents /archive, /export md|json|finale, significance stars, site builds (10 pages)
  - Add new handbook page `site/src/content/docs/handbook/archive-export.md` (sidebar order: 7):
    - Document `/archive`, `/export md`, `/export json`, `/export finale`
    - Explain what's in each export format
    - Show example markdown export output
  - Update handbook index.md with the new page
  - Rebuild site
  - **Files:** new `handbook/archive-export.md`, `handbook/index.md`

### E4. Landing page text alignment
- [DONE by C] **Update landing page to match v2.1 capabilities** — updated hero description + site description, added campaign archives feature card, swapped Load→Archive in previews
  - In `site/src/site-config.ts`:
    - Update hero description with new product sentence
    - Add "Campaign Archives" feature card to the features section
    - Add "Fast Campaign" mode to the Three Modes section or make it a 4th mode card
    - Update the previews to include: `{ label: 'Archive', code: 'claude-rpg archive' }`
  - Rebuild site
  - **Files:** `site/src/site-config.ts`

---

## Track F: Version Bump & Publish

### F1. Final verification and publish
- [ ] **Bump, test, commit, publish** (depends on ALL above)
  - Run full test suites:
    - `cd F:\AI\ai-rpg-engine && npm run build && npm test` (expect 1859+)
    - `cd F:\AI\claude-rpg && npm run build && npm test` (expect 52+)
    - `cd F:\AI\claude-rpg\site && npx astro build` (expect 8+ pages)
  - If engine packages changed (Track A), bump affected packages and publish:
    - `cd packages/<changed> && npm version patch && npm publish`
    - Update claude-rpg dependency versions to match
  - Bump claude-rpg to 1.3.0 (minor bump for new features)
  - Update CHANGELOG.md with v1.3.0 entry
  - Update SHIP_GATE.md: mark translations checked if done
  - Commit: `feat: v2.1 polish, balance, campaign archive & export`
  - Push and verify CI passes: `gh run list --limit 1`
  - Publish: `npm publish`
  - Verify Pages deployment: `gh run list --workflow=pages.yml --limit 1`
  - **Files:** `package.json`, `CHANGELOG.md`, `SHIP_GATE.md`, all changed files

---

## Task Dependencies

```
A1 ──┐
A2 ──┤
A3 ──┼── A4 (needs balance review done first)
     │
B1 ──┤
B2 ──┼── B3 (export finale extends export chronicle)
     │
C1 ──┤
C2 ──┤
C3 ──┤
     │
D1 ──┤
D2 ──┤
D3 ──┤
D4 ──┤
     │
E1 ──┤
E2 ──┼── E3 (needs B1-B3 done), E4 (needs B1, C1, D1 done)
     │
ALL ─┴── F1 (final publish)
```

**Parallelizable pairs (no conflicts):**
- A1-A3 (engine balance) + B1-B2 (product archive/export) — different repos
- C1-C3 (finale polish) + D1-D4 (onboarding) — different files
- E1 (README) can run anytime — no dependencies

**Conflict zones (same files, coordinate):**
- `game.ts` is touched by B1, B2, B3, C1, C3, D1, D2, D3, D4 — claim sections, don't rewrite the whole file
- `bin.ts` is touched by B1, B2, D1 — coordinate CLI additions
- `help-system.ts` is touched by D3, D4 — coordinate help content
