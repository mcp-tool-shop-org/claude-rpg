# Runtime Contract

This document defines what a correct turn, a recoverable failure, and a trustworthy save mean in claude-rpg. Tests validate product law described here, not implementation details.

---

## 1. Turn Pipeline Contract

A turn is a single cycle of the 5-step pipeline: **interpret → resolve → filter → narrate → present**.

### Input

```
playerInput: string   // freeform text from stdin
```

The pipeline also receives ambient context (tone, pressure descriptions, district mood, party presence, economy, crafting, opportunity, arc, endgame), but these are read-only enrichments — they never alter the deterministic engine result.

### Step 1 — Interpret

**Function:** `interpretAction(client, world, playerInput, availableVerbs)`

**Output:** `InterpretedAction`

```typescript
{
  verb: string;
  targetIds: string[] | null;
  toolId: string | null;
  parameters: Record<string, string | number | boolean> | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  alternatives: Array<{ verb: string; targetIds: string[] }> | null;
}
```

**Contract:**
- Fast path (keyword regex) handles ~80% of inputs with `confidence: 'high'`.
- Slow path (Claude `generateStructured`) handles ambiguous inputs.
- If `confidence === 'low'`, the turn short-circuits: no engine resolution, no narration. A clarification message is returned.
- Interpretation failures (Claude timeout, malformed response) must not crash. The fallback is `{ verb: 'look', confidence: 'low' }`.

### Step 2 — Resolve (Engine)

**Function:** `engine.submitAction(verb, { targetIds, toolId, parameters })`

**Output:** `ResolvedEvent[]`

**Contract:**
- The engine is deterministic. Given identical world state and action, it always produces the same events.
- Engine resolution is the single source of truth. Nothing downstream may contradict it.
- If the engine throws (invalid verb, missing target), the turn returns a no-op: `"You try to ${verb}, but nothing happens."` No state mutation occurs.

### Step 3 — Filter (Perception)

**Function:** `presentForObserver(event, playerId, world)` per event, then `buildSceneContext()`

**Output:** `SceneContext { narrationInput, perceivedEvents }`

**Contract:**
- Only events observable by the player entity pass through.
- Entity names with clarity < 0.5 are replaced with `"a shadowy figure"`.
- Atmosphere is mapped from numeric zone values: light (dim/normal/bright), noise (quiet/moderate/noisy), stability (stable/uneasy/unstable).
- Zone transitions are detected by comparing previous and current locationId.
- Filtering errors are caught per-event; a failed filter adds observer metadata but does not drop the event.

### Step 4 — Narrate (LLM)

**Function:** `narrateScene(client, world, events, tone, recentNarration, ...contextParams)`

**Output:** `NarrationResult { narration, plan, sceneContext }`

**Contract:**
- Narration describes what the player perceives. It may embellish, but it must not contradict engine-resolved events.
- The narrator receives a `SceneNarrationInput` with ~15 context fields and a max of 500 tokens.
- Structured output: the narrator attempts to return a `NarrationPlan` (JSON with sceneText, tone, urgency, sfx, ambient, uiEffects). If JSON parsing fails, the raw text is used as plain narration.
- **Narration is non-authoritative.** If narration is unavailable (timeout, error, malformed), the turn still completes with engine truth intact. See §3 for failure behavior.

### Step 5 — Present

**Output:** `TurnResult`

```typescript
{
  playerInput: string;
  interpreted: InterpretedAction;
  events: ResolvedEvent[];
  narration: string;
  narrationPlan: NarrationPlan | null;
  dialogue: DialogueResult | null;
  audioCalls: McpToolCall[];
  tick: number;
  profileHints: ProfileUpdateHints;
}
```

**Contract:**
- TurnResult is the atomic unit of game progress.
- `events` reflects engine truth. `narration` reflects LLM output. These are independent.
- `profileHints` is extracted from events via heuristics (no LLM): XP, injuries, reputation, milestones, pressure resolution.
- After presentation, the orchestrator (GameSession) applies hints, ticks subsystems (factions, NPCs, economy, opportunities, arcs, endgame), records chronicle events, and renders the play screen.

### Post-Turn Subsystem Ticks

These run in GameSession.processInput() after executeTurn() returns:

1. Process leverage action (if verb matches)
2. Process craft action (if verb matches)
3. Apply profile hints (XP, injuries, reputation, milestones)
4. Tick player leverage
5. Record chronicle events
6. Tick faction agency
7. Tick district economies
8. Tick NPC agency
9. Tick item recognition
10. Companion zone following
11. Companion reactions
12. Propagate rumors
13. Evaluate and tick pressures
14. Evaluate and tick opportunities
15. Process opportunity actions
16. Tick arc detection
17. Evaluate endgame triggers
18. Build move recommendations
19. Generate contextual suggestions

All subsystem ticks are deterministic (no LLM calls). They read engine state and session state, and mutate session state only.

---

## 2. Persistence Contract

### Save Shape

Saves are JSON files at `~/.claude-rpg/saves/<name>.json`. Current version: `1.4.0`.

**Core fields (always present):**
- `version`: string — save format version
- `engineState`: string — serialized Engine (opaque to session layer)
- `turnHistory`: object — serialized TurnHistory
- `tone`: string
- `savedAt`: string — ISO 8601

**Optional fields (version-gated):**
- `profile`, `packId`, `characterName`, `characterLevel`, `characterTitle` (v0.2.0+)
- `playerRumors` (v0.3.0+)
- `activePressures`, `genre` (v0.4.0+)
- `resolvedPressures` (v0.5.0+)
- `chronicleRecords` (v0.6.0+)
- `leverageSnapshot` (v0.7.0+)
- `npcAgencySnapshot` (v0.8.0+)
- `npcObligations` (v0.9.0+)
- `consequenceChains` (v1.0.0+)
- `partyState` (v1.1.0+)
- `districtEconomies` (v1.2.0+)
- `activeOpportunities`, `resolvedOpportunities` (v1.3.0+)
- `arcSnapshot`, `endgameTriggers`, `finaleOutline`, `campaignStatus` (v1.4.0+)

### Serialization

All complex fields are `JSON.stringify()`-ed individually into string values within the top-level JSON. Maps are converted via `Object.fromEntries()` before stringification.

### Load Guarantees

**Required behavior:**
- Missing optional fields deserialize to safe defaults (empty array, empty map, null, or `createPartyState()`).
- A save from an older version loads successfully — missing fields use defaults.
- A save from a newer version than the running code should fail with a clear version-mismatch error, not a crash.

**Required but not yet implemented:**
- Malformed JSON must return a structured error, not an unhandled exception.
- Truncated/partial files must be detected and rejected cleanly.
- Shape validation: required fields (`version`, `engineState`, `turnHistory`, `tone`, `savedAt`) must be verified before use.

### Write Guarantees

**Required but not yet implemented:**
- Writes must use temp-file + atomic rename to prevent corruption from interrupted writes.
- After successful write, the previous save should be kept as `.bak` for one-deep recovery.
- Write failures must not destroy the existing save file.

### Save Directory

- Default: `process.cwd() + '/.claude-rpg/saves/'`
- Created on first save if absent.
- Listing reads all `.json` files and builds `SaveSlotSummary[]`.
- Archive listing filters for `campaignStatus === 'completed'`.

---

## 3. LLM Failure Contract

The Anthropic TypeScript SDK provides:
- Typed error subclasses of `APIError` (AuthenticationError, RateLimitError, etc.)
- Automatic retries for 408, 409, 429, and 5xx responses
- Configurable timeouts (default + per-request)
- `APIConnectionTimeoutError` for timeouts
- Request IDs on error objects for debugging

The app's job is to translate these into deliberate game behavior.

### Failure Classification

| SDK Error | App Classification | Game Behavior |
|-----------|-------------------|---------------|
| `AuthenticationError` | Fatal — config error | Exit with clear message: "API key invalid or missing. Set ANTHROPIC_API_KEY." No retry. |
| `RateLimitError` | Recoverable — transient | Preserve session state. Return fallback narration. Suggest player wait or save. |
| `APIConnectionTimeoutError` | Recoverable — transient | Preserve session state. Return fallback narration with engine events described plainly. |
| `APIConnectionError` (non-timeout) | Recoverable — transient | Same as timeout. |
| `InternalServerError` / 5xx | Recoverable — transient | SDK retries automatically. If exhausted, treat as timeout. |
| `BadRequestError` | Fatal — code error | Log prompt details for debugging. Return error to player. This indicates a bug. |
| JSON parse failure on success | Recoverable — degraded | Use raw text as plain narration. Log parse failure for debugging. |
| `stop_reason !== 'end_turn'` | Degraded — partial | Use whatever text was returned. Flag as potentially incomplete. |

### Invariants

1. **Engine state is never rolled back due to an LLM failure.** If the engine resolved the action, that resolution stands. Narration failure means the player gets a plain description of events, not that the turn is undone.
2. **Session state is always saveable after an LLM failure.** The save path must not depend on successful narration.
3. **Fatal errors exit cleanly.** Auth failure and bad-request errors terminate with a message, not a stack trace.
4. **Recoverable errors preserve the game loop.** The player can continue playing or save after a transient failure.

### Fallback Narration

When narration is unavailable, the game constructs a minimal description from engine events:
- Use `describeEvent()` for each resolved event
- Prepend zone name and atmosphere
- Append "The narrator is momentarily silent." or similar flavor text
- This is functional, not immersive — but it keeps the game running.

### Dialogue Failures

NPC dialogue generation (`generateDialogue`) follows the same rules:
- Timeout/rate-limit: NPC says nothing. Game continues.
- Auth failure: fatal, same as narration.
- The player is never left in a broken dialogue state.

### Action Interpretation Failures

`interpretAction` slow path (Claude call) failures:
- Any error: return `{ verb: 'look', confidence: 'low' }`.
- This triggers the clarification path, not engine resolution.
- The player's input is not lost — they can retype.

---

## 4. Boundary Summary

| Boundary | Owner | Authoritative? | Failure tolerance |
|----------|-------|----------------|-------------------|
| Engine resolution | ai-rpg-engine | Yes — single source of truth | Must not fail silently. Errors are bugs. |
| Action interpretation | claude-rpg + Claude | No — advisory | Graceful degradation to 'look' |
| Scene narration | claude-rpg + Claude | No — decorative | Fallback to event descriptions |
| NPC dialogue | claude-rpg + Claude | No — decorative | Silent NPC is acceptable |
| Perception filtering | ai-rpg-engine | Yes — determines visibility | Per-event error catch, never drops |
| Profile hints | claude-rpg heuristics | Yes — deterministic | Extracted from events, no LLM |
| Subsystem ticks | claude-rpg + engine | Yes — deterministic | No LLM, no network |
| Session persistence | claude-rpg | Yes — user trust boundary | Must validate, must not corrupt |
