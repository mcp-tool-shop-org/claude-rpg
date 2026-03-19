---
title: Runtime Guarantees
description: How claude-rpg proves its runtime spine — turn integrity, save migration, streaming law, and failure handling.
sidebar:
  order: 8
---

## The foundation

v1.4.0 introduced seven runtime-proofing sprints that harden the boundary between the engine and the player. This page documents what those guarantees are, how they're enforced, and what they mean for players and developers.

## Turn integrity

Every turn runs through a deterministic pipeline: interpret → resolve → filter → narrate → present. The turn-loop integration harness tests this with a fake Claude client that returns canned responses, proving that:

- Valid commands complete all 5 stages
- Engine results are preserved regardless of narration quality
- Invalid commands are rejected without state corruption
- Narration failures (timeout, auth, rate-limit) trigger fallback narration without losing engine state

The harness uses `ExecuteTurnOpts` — a typed options object that makes field miswires compile-time errors instead of silent bugs.

## Save migration

Saves carry a `schemaVersion` integer. When the format changes, the migration pipeline runs ordered steps to upgrade old saves:

```
v1 save → detectSchemaVersion() → migrateSave() → v2 save → validateSaveShape() → load
```

Migration rules:
- Pure functions, no runtime state access
- Ordered steps, one version increment at a time
- Historical fixture tests prove round-trip stability
- Future-version saves are rejected with a clear message
- Missing-version saves are flagged as unrecognized

Atomic writes with `.bak` recovery protect against interrupted saves.

## Streaming narration

Text can arrive incrementally at the terminal via the streaming presenter. The streaming law:

> **The engine resolves first. Streaming is presentation only.**

What this means:
- Canonical state is finalized before streamed text matters
- Chronicle, session, recap, and export do not depend on partial tokens
- Interrupted streams cannot corrupt turn truth
- History records the final accumulated text, not partial chunks
- If the client doesn't support streaming, the system falls back to atomic narration

The `onChunk` / `onNarrationChunk` callbacks are optional fields in `NarrateSceneOpts` and `ExecuteTurnOpts`. They wire through typed contracts — not positional parameters.

## Error handling

The Claude adapter (`createAdaptedClient`) translates SDK failures into typed `NarrationError` values:

| Error kind | Player sees | What happened |
|------------|-------------|---------------|
| `timeout` | "The narrator lost the thread" | API call timed out |
| `rate-limit` | "The narrator needs a moment" | 429 from Anthropic |
| `overloaded` | "The narrator is overwhelmed" | 529 from Anthropic |
| `auth` | "API key issue" | Invalid or missing key |
| `unknown` | "Something unexpected happened" | Unclassified error |

The `--debug` flag adds a structured diagnostic block below the player-friendly message, showing error kind, raw message, and stack trace.

Migration failures get their own rendering:
- **Save file too new** — "This save was created with a newer version of claude-rpg"
- **Unrecognized save format** — "This file doesn't look like a claude-rpg save"
- **Generic corruption** — "Could not load save" with recovery hints

## Coverage floors

CI enforces per-module coverage thresholds on runtime-critical paths:

| Module | Minimum |
|--------|---------|
| `src/llm/**` | 70% statements |
| `src/session/**` | 40% statements |
| `src/game/**` | 25% statements |
| Global | 20% statements, 45% branches, 30% functions |

Changed-file regression detection surfaces coverage drops on pull requests that touch critical paths.

## Test inventory

195 tests across 19 test files:

| Category | Tests | What they prove |
|----------|-------|-----------------|
| Turn-loop integration | 18 | 5-stage pipeline, failure paths, streaming |
| Session persistence | 19 | Round-trip, corruption, atomic writes |
| Migration | 22 | Version detection, ordered steps, fixture stability |
| Chronicle | 17 | Append order, integrity, persistence |
| Streaming | 6 | Normal completion, fallback, interruption |
| Error presenter | 25 | All error kinds, debug mode, migration failures |
| Recap/export | 27 | Delta computation, archive continuity, finale |
| Claude adapter | 9 | Error classification, normalized success |
| Other | 52 | Scene context, hooks, audio, voice, history, play renderer |
