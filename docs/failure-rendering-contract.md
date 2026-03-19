# Failure Rendering Contract

Defines the user-facing failure categories, their normal-mode behavior,
and the debug surface. All CLI-visible error output must route through
`src/cli/error-presenter.ts`.

## Failure Classes

### 1. Timeout (`timeout`)

| Field | Value |
|-------|-------|
| Headline | `Connection timed out` |
| Explanation | The narrator took too long to respond. |
| Preserved | Your session and progress are intact. |
| Next action | Try your action again, or type `save` to keep your progress. |
| Exit code | Does not exit. Reprompt. |

### 2. Auth / Config (`auth`)

| Field | Value |
|-------|-------|
| Headline | `API key error` |
| Explanation | Your API key is invalid, expired, or missing. |
| Preserved | Your session was not modified. |
| Next action | Check ANTHROPIC_API_KEY and restart. |
| Exit code | 1 (fatal at startup). During play: does not exit, reprompt. |

### 3. Rate Limit (`rate-limit`)

| Field | Value |
|-------|-------|
| Headline | `Rate limit reached` |
| Explanation | Too many requests — the API needs a moment. |
| Preserved | Your session and progress are intact. |
| Next action | Wait a moment and try again, or type `save`. |
| Exit code | Does not exit. Reprompt. |

### 4. Network / Transport (`transport`)

| Field | Value |
|-------|-------|
| Headline | `Connection interrupted` |
| Explanation | Network error reaching the API. |
| Preserved | Your session and progress are intact. |
| Next action | Check your connection and try again, or type `save`. |
| Exit code | Does not exit. Reprompt. |

### 5. Bad Request (`bad-request`)

| Field | Value |
|-------|-------|
| Headline | `Internal error` |
| Explanation | Something went wrong building the narrator request. |
| Preserved | Your session was not modified. |
| Next action | This is a bug — please report it. |
| Exit code | Does not exit. Reprompt. |

### 6. Unexpected (`unexpected`)

| Field | Value |
|-------|-------|
| Headline | `Unexpected error` |
| Explanation | An unclassified problem occurred. |
| Preserved | Your session and progress are intact. |
| Next action | Try again, or type `save` to keep your progress. |
| Exit code | Does not exit. Reprompt. |

### 7. Save Failure (`save-failed`)

| Field | Value |
|-------|-------|
| Headline | `Save failed` |
| Explanation | Could not write the save file. |
| Preserved | Your in-memory session is still active. |
| Next action | Check disk space and permissions, then try `save` again. |
| Exit code | Does not exit. Reprompt. |

### 8. Load / Validation Error (`load-failed`)

| Field | Value |
|-------|-------|
| Headline | `Could not load save` |
| Explanation | The save file is missing, corrupted, or incompatible. |
| Preserved | N/A (no session was started). |
| Next action | Check the file, or start a new game. A .bak file may exist. |
| Exit code | 1 (cannot proceed without valid save). |

---

## Normal Mode Output Shape

Every CLI-visible error follows this layout:

```
  ⚠ {headline}
  {explanation}
  {preserved status}
  → {next action}
```

Four lines, indented, no stack trace, no raw SDK messages.

## Debug Mode (`--debug`)

When `--debug` is active, append a structured block after the normal output:

```
  [debug]
    kind: {error kind}
    request_id: {if available}
    retryable: {true/false}
    cause: {one-line cause summary}
```

Debug adds detail. Debug never replaces the normal explanation.

## Exit Code Semantics

| Code | Meaning |
|------|---------|
| 0 | Clean exit (quit, archive browse) |
| 1 | Fatal error (missing API key, unrecoverable load failure, world gen failure) |

During gameplay, recoverable errors reprompt instead of exiting.
The opening narration is the one exception: if it fails, exit 1 (cannot start game without it).

## Presentation Law

- All CLI-visible errors route through `src/cli/error-presenter.ts`
- The presenter consumes app-owned error types (`NarrationError`, `SaveValidationError`), never SDK internals
- Game/session logic does not format error strings — it throws typed errors
- `bin.ts` catch blocks call the presenter, never `console.error` directly for user-facing failures
- Stack traces are never shown in normal mode
