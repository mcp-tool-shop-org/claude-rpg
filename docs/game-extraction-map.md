# game.ts Extraction Map

Seam classification for every method/block in `GameSession` (3235 LOC).
Used to guide Sprint C refactoring without accidental architecture drift.

## Classification Key

| Tag | Destination | Rule |
|-----|-------------|------|
| **STATE** | `game-state.ts` | Pure deterministic logic. No client, no console, no file IO. |
| **NARRATION** | `game-narration.ts` | LLM-facing assembly + fallback. Consumes canonical state, never authors it. |
| **PRESENTER** | `game-presenter.ts` | Terminal-facing output. Consumes decided outcomes, never mutates state. |
| **LOOP** | `game-loop.ts` | Turn progression sequencing. Composes state/narration/presenter. |
| **COMMAND** | `game-commands.ts` | Slash command parsing + dispatch. No state mutation, no client calls. |
| **PERSIST** | stays in game.ts or session | Save/load/export touchpoints. |
| **GLUE** | stays in game.ts (facade) | Wiring, constructor, lifecycle, verb registration. |

---

## Imports (L1–195)

Massive import block. After extraction, each seam file inherits only its needed imports.
game.ts facade retains only orchestration-level imports.

## Type exports + Class declaration (L196–269)

- `GameConfig` → **GLUE** — stays in game.ts as the public config shape
- `GameSession` class fields (L214–247) → **GLUE** — state lives on the session object
- `constructor` (L249–269) → **GLUE** — wiring + initialization

## getWelcome (L271–274)

**PRESENTER** — pure output formatting, no state mutation.

## getPresence (L277–281)

**STATE** — derives presence from profile + catalog. Pure read.

## getStatusData (L284–287)

**STATE** — derives status from profile + catalog. Pure read.

## applyProfileHints (L290–407)

**STATE** — deterministic state mutation from turn result.
- XP grant, injury, reputation, milestone, title evolution, pressure resolution, turn increment, resource sync.
- Has `console.log` for level-up and title (PRESENTER leak — extract to return value).
- Has chronicle recording (PERSIST leak — extract to caller).
- Spawns rumors (STATE — rumor spawning is deterministic).

### Dependencies
- Engine tick, world state, profile
- No client, no terminal formatting

### Extraction notes
- Return a structured `ProfileUpdateResult` with mutation + side effects (title changed, level up, chronicle sources, rumors spawned).
- Caller (loop) dispatches chronicle and console output.

## getOpeningNarration (L410–454)

**NARRATION + PRESENTER** — mixed. Calls narrator (LLM), then renders output.
Split into:
1. NARRATION: assemble context + call narrator
2. PRESENTER: render play screen + onboarding

## processInput (L457–754)

**LOOP** — the main turn coordinator. This is the monolith's core.

### Sub-sections:
- L458–463: Meta commands (quit/exit) → **COMMAND**
- L466–476: Director mode toggle → **COMMAND**
- L479–512: Director mode commands → **COMMAND** (delegates to existing renderer)
- L515–583: Play mode slash commands → **COMMAND**
  - /help, /status, /map, /leverage, /jobs, /arcs, /conclude, /recruit, /dismiss, /archive, /export
- L586–619: Turn execution — build context, call `executeTurn()` → **LOOP**
- L622–625: Post-turn processing (leverage, craft, profile hints) → **LOOP** (calls STATE)
- L631–634: Chronicle + leverage tick → **LOOP** (calls STATE/PERSIST)
- L637–694: System ticks (faction, economy, NPC, items, companions, rumors, pressures, opportunities, arcs, endgame) → **LOOP** (calls STATE)
- L697–731: Move advisor + suggestions → **PRESENTER** (computes then renders)
- L733–753: Build party status + render play screen → **PRESENTER**

## getTitleEvolutions (L757–763)

**STATE** — pure data constant. No dependencies.

## propagateRumors (L766–809)

**STATE** — deterministic rumor spread. Uses district mood + companion abilities.
No client, no terminal output.

## getPlayerDistrictId (L812–814)

**STATE** — pure world read.

## getDistrictDescriptor (L817–825)

**STATE** — pure world read + formatting for narrator context.

## getPartyPresence (L828–835)

**STATE** — pure world read.

## getEconomyContext (L838–845)

**STATE** — pure world read.

## getCraftingContext (L848–866)

**STATE** — pure profile + catalog read.

## getPlayerZoneFaction (L869–878)

**STATE** — pure world read.

## getVisiblePressureContext (L881–911)

**STATE/NARRATION boundary** — assembles narrator hints from pressures/factions/NPCs/leverage.
Produces strings for the narrator, but logic is deterministic.
→ **STATE** (it's context derivation, not LLM interaction).

## evaluateAndTickPressures (L914–931)

**STATE** — deterministic pressure evaluation + tick.

## resolvePressure (L934–963)

**STATE** — deterministic fallout computation + chronicle recording.
Chronicle recording is a PERSIST leak — extract to return value.

## applyFalloutEffects (L966–1055)

**STATE** — deterministic effect application. Large switch on effect types.
Has `console.log` on title evolution (PRESENTER leak).

## buildPressureInputs (L1058–1115)

**STATE** — pure data assembly from session state.

## buildOpportunityInputs (L1120–1158)

**STATE** — pure data assembly from session state.

## evaluateAndTickOpportunities (L1161–1178)

**STATE** — deterministic opportunity tick + evaluation.

## processOpportunityAction (L1181–1230)

**STATE** — deterministic opportunity verb resolution. Has chronicle recording (PERSIST leak).

## resolveOpportunity (L1233–1272)

**STATE** — deterministic opportunity resolution + fallout. Has chronicle recording (PERSIST leak).

## applyOpportunityFalloutEffects (L1275–1395)

**STATE** — deterministic effect application. Large switch, mirrors applyFalloutEffects.

## getOpportunityContext (L1398–1404)

**STATE** — pure data read.

## buildArcInputs (L1409–1462)

**STATE** — pure data assembly. Fast mode scaling is deterministic.

## tickArcDetection (L1465–1469)

**STATE** — deterministic arc signal evaluation.

## evaluateEndgameTrigger (L1472–1496)

**STATE** — deterministic endgame evaluation. Has direct journal.record (PERSIST leak).

## getArcContext (L1499–1503)

**STATE** — pure data read.

## getEndgameContext (L1506–1511)

**STATE** — pure data read.

## buildFinale (L1514–1576)

**STATE** — deterministic finale outline construction. Has journal.record (PERSIST leak).

## handleConclude (L1579–1616)

**NARRATION + PRESENTER** — builds finale, calls LLM for epilogue, formats output.
Split into:
1. STATE: buildFinale (already extracted)
2. NARRATION: narrateFinale call
3. PRESENTER: terminal formatting

## handleArchive (L1619–1622)

**COMMAND** — delegates to existing session/display modules.

## handleExport (L1625–1660)

**COMMAND/PERSIST** — export dispatch. Delegates to existing chronicle-export module.

## buildSavedSessionSnapshot (L1663–1689)

**PERSIST** — pure data assembly for save.

## getThinking (L1692–1694)

**PRESENTER** — pure output.

## recordChronicleEvents (L1697–1788)

**PERSIST** — chronicle recording from turn result. Complex: handles turn events, item acquisition, companion combat, item kill chronicles.
This is a persistence orchestration method — belongs in LOOP (calls into persist layer).

## initializeDistrictEconomies (L1793–1803)

**GLUE** — constructor initialization.

## tickDistrictEconomies (L1806–1818)

**STATE** — deterministic economy tick.

## applyEconomyShiftEffect (L1821–1836)

**STATE** — deterministic economy mutation.

## tickFactionAgency (L1839–1886)

**STATE** — deterministic faction agency tick. Has chronicle recording (PERSIST leak).

## applyFactionEffects (L1889–1961)

**STATE** — deterministic effect application.

## tickNpcAgencyTurn (L1966–2137)

**STATE** — deterministic NPC agency tick. Large method with consequence chains.
Has chronicle recording throughout (PERSIST leak).

## tickItemRecognition (L2142–2226)

**STATE** — deterministic item recognition. Has chronicle recording (PERSIST leak).

## registerLeverageVerbs (L2231–2264)

**GLUE** — engine verb registration.

## processLeverageAction (L2271–2522)

**STATE** — deterministic leverage resolution. Very large (~250 LOC).
Has district/companion modifier application, side-effect rolls, district drift.

## applyLeverageEffects (L2525–2615)

**STATE** — deterministic effect application.

## tickPlayerLeverage (L2618–2659)

**STATE** — deterministic leverage tick.

## buildCurrentStrategicMap (L2664–2678)

**STATE** — pure data assembly.

## buildMoveRecommendation (L2681–2710)

**STATE** — pure data assembly + advisor call.

## hasEverUsedLeverage (L2713–2718)

**STATE** — pure profile read.

## handleRecruit (L2723–2758)

**COMMAND + STATE** — command parsing + companion recruitment. Has chronicle recording.

## handleDismiss (L2762–2786)

**COMMAND + STATE** — command parsing + companion dismissal. Has chronicle recording.

## addRumor (L2789–2805)

**STATE** — deterministic rumor addition with companion suppression.

## processCompanionReactions (L2808–2841)

**STATE** — deterministic companion reaction evaluation.

## buildCraftingContext (L2846–2863)

**STATE** — pure data assembly.

## getPlayerFactionAccess (L2866–2879)

**STATE** — pure profile read.

## processCraftAction (L2882–2905)

**STATE** — craft verb dispatch.

## handleSalvage (L2908–2956)

**STATE** — deterministic salvage resolution. Has chronicle recording.

## handleCraft (L2959–3006)

**STATE** — deterministic craft resolution. Has chronicle recording.

## handleRepairAction (L3009–3061)

**STATE** — deterministic repair resolution. Has chronicle recording.

## handleModify (L3064–3130)

**STATE** — deterministic modify resolution. Has chronicle recording.

## applyCraftEffects (L3133–3181)

**STATE** — deterministic effect application.

## handleCompanionDeparture (L3185–3220)

**STATE** — deterministic companion removal. Has chronicle recording.

## sanitizeFilename (L3224–3226)

**GLUE** — standalone utility.

## simpleHashNum (L3229–3235)

**STATE** — standalone deterministic hash.

---

## Dependency Direction (enforced)

```
game-state  →  no dependency on narration, presenter, or client
game-narration  →  depends on adapted client + canonical turn result
game-presenter  →  depends on canonical state + narration result (read-only)
game-loop (processInput)  →  composes state + narration + presenter
game.ts (facade)  →  wires runtime entrypoints, exposes public API
```

### Forbidden inversions
- game-state must NOT import narration or presenter
- game-state must NOT import ClaudeClient
- game-presenter must NOT mutate canonical state
- narration output must NEVER be used as state truth

---

## Cross-cutting pattern: chronicle recording

~15 methods contain direct `journal.record()` or `deriveChronicleEvents()` calls.
These are PERSIST leaks inside STATE methods.

**Extraction strategy:** STATE methods return chronicle sources as part of their result.
The LOOP layer dispatches them to the journal. This keeps STATE pure and chronicle recording centralized.

---

## Extraction order

1. **game-state.ts** — all STATE-tagged methods. ~2000 LOC. Largest win.
2. **game-narration.ts** — getOpeningNarration (LLM call), handleConclude (LLM call). ~100 LOC.
3. **game-presenter.ts** — renderPlayScreen assembly, suggestion computation, status formatting. ~150 LOC.
4. **game-commands.ts** (optional) — slash command dispatch from processInput. ~100 LOC.
5. **game.ts (facade)** — constructor, processInput (thin coordinator), public API. ~300 LOC.
