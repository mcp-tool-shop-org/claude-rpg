# Test Coverage Baseline — Post Sprint A/B/C

Captured 2026-03-19 after 139 tests across 15 test files.
Used to set Sprint D coverage floors.

## Global Coverage

| Metric     | Value  |
|------------|--------|
| Statements | 30.37% |
| Branches   | 60.35% |
| Functions  | 51.94% |

## Critical Runtime Directories

These directories contain product truth, continuity, and failure handling.

### src/llm/ (Claude boundary seam)

| Metric     | Value  |
|------------|--------|
| Statements | 72.34% |
| Branches   | 96.29% |
| Functions  | 60.00% |

Strongest coverage — adapter + error types fully tested.

### src/session/ (persistence + chronicle export)

| Metric     | Value  |
|------------|--------|
| Statements | 50.83% |
| Branches   | 65.39% |
| Functions  | 53.84% |

history.ts 100%, chronicle-export.ts 92%, session.ts 46%, chronicle.ts 37%.

### src/game/ (extracted seams)

| Metric     | Value  |
|------------|--------|
| Statements | 27.20% |
| Branches   | 44.68% |
| Functions  | 52.77% |

game-narration.ts 85%, game-presenter.ts 57%, game-state.ts 21%.
game-state.ts is large (925 LOC) and mostly tested through integration paths.

### src/ root (game.ts + turn-loop.ts)

| Metric       | Stmts  | Branches | Functions |
|--------------|--------|----------|-----------|
| game.ts      | 18.91% | 50.00%   | 47.76%    |
| turn-loop.ts | 49.41% | 57.69%   | 66.66%    |

game.ts still contains ~1600 LOC of complex mutations (leverage, NPC agency, crafting).
turn-loop.ts well-tested through integration harness.

## Chosen Thresholds

### Layer 1 — Global hygiene floor

| Metric     | Floor | Rationale |
|------------|-------|-----------|
| Statements | 20%   | Current: 30%. Low floor — stops total collapse, not the main defense. |
| Branches   | 45%   | Current: 60%. Generous margin for branch-heavy untested code. |
| Functions  | 30%   | Current: 52%. Allows growth without penalty. |

### Layer 2 — Runtime-critical floors (statements only)

| Path          | Floor | Current | Rationale |
|---------------|-------|---------|-----------|
| src/llm/**    | 70%   | 72.34%  | Tightest — this is the failure boundary. |
| src/session/** | 40%  | 50.83%  | Persistence must not regress. |
| src/game/**   | 25%   | 27.20%  | Low because game-state.ts is large; will ratchet after deeper extraction. |

### Why not higher?

- game.ts inline mutations (leverage, crafting, NPC) are untested and not yet extracted
- Setting floors too high would force junk tests to pass gates
- These floors defend against regression, not measure quality
- Ratchet upward after Sprint E+ proof passes
