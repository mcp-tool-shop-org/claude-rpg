# Streaming Narration Contract

## Purpose

Define exactly what can stream, when, and what invariants hold during
and after a stream. Streaming improves perceived latency for the CLI
player without changing what is true.

## Non-Negotiable Law

**The engine resolves first. Streaming is presentation only.**

No partial token ever becomes canonical state. Chronicle, session,
recap, export, and history depend on the finalized narration string,
never on intermediate chunks.

## Scope

Streaming applies to:

- **Scene narration** (`narrateScene` in turn-loop)
- **Opening narration** (`generateOpeningNarration`)
- **Finale epilogue** (`generateFinaleNarration`)

Streaming does NOT apply to:

- Action interpretation (short, structured, must complete before engine resolves)
- Dialogue generation (short, structured, voice-cast depends on full text)
- Status lines, help output, error presenter output
- Save/load/chronicle/export operations

## Timeline of a Streamed Turn

```
1. Player input received
2. interpretAction() → full completion (no streaming)
3. engine.submitAction() → deterministic state change
4. narrateScene() starts streaming:
   4a. Chunks arrive → presenter renders incrementally to terminal
   4b. Full text accumulates in buffer
5. Stream completes (or fails):
   5a. Success: final text = accumulated buffer
   5b. Failure: final text = fallback narration
6. NarrationResult.narration = final text (atomic string)
7. history.record() with final narration
8. TurnResult returned with final narration
```

Between steps 4a and 5, the terminal shows partial narration text.
This text has no authority. It is not recorded, not saved, not
exported, not used for chronicle derivation.

## ClaudeClient Interface Extension

```typescript
type StreamCallback = (chunk: string) => void;

// Added to ClaudeClient:
generateStream?(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
  onChunk: StreamCallback;
}): Promise<GenerateResult>;
```

`generateStream` is **optional** on `ClaudeClient`. If not present,
callers fall back to `generate()` (non-streaming). This preserves
test fakes and legacy clients.

The returned `GenerateResult` is identical to `generate()` — it
contains the full accumulated text, not partial tokens.

## Presenter Streaming Rules

1. Chunks are written directly to stdout via `process.stdout.write()`
2. No ANSI cursor manipulation during streaming (simple append only)
3. The status bar / prompt line is suppressed during stream
4. On stream completion, the presenter emits a newline and restores
   normal display (action bar, status line, prompt)
5. On interruption (Ctrl+C during stream), the partial display is
   left as-is but the canonical narration uses fallback

## Interruption Handling

| Event | Terminal shows | Canonical narration | State |
|-------|---------------|---------------------|-------|
| Stream completes | Full text | Full text | Normal |
| Timeout mid-stream | Partial + fallback msg | Fallback string | Intact |
| Network drop | Partial + fallback msg | Fallback string | Intact |
| Ctrl+C mid-stream | Partial text | Fallback string | Intact |

"Fallback string" is the same fallback used for non-streaming
failures: `"The narrator falls silent. Your actions still stand."`

## What Must Not Change

- `NarrationResult` type: unchanged (narration is always a string)
- `TurnResult` type: unchanged
- `TurnHistory.record()`: receives final string, never chunks
- `deriveChronicleEvents`: operates on finalized turn data
- `saveSession`: serializes finalized session state
- All existing tests: must pass unchanged

## Debug Mode

When `--debug` is active:
- Stream chunks are still rendered normally
- On completion, a `[debug]` block shows: streaming=true, chunks=N,
  total_ms=T, interrupted=bool
- On failure, the debug block includes the error classification
  (same as non-streaming error presenter output)

## Test Strategy

Tests use the existing fake client (which returns full text
atomically). Streaming behavior is tested by:

1. A fake streaming client that yields chunks with delays
2. Verifying that TurnResult.narration matches full text (not partial)
3. Verifying that interrupted streams produce fallback narration
4. Verifying that history/chronicle/recap are identical whether
   narration was streamed or arrived whole
