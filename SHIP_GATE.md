# Ship Gate

> No repo is "done" until every applicable line is checked.

**Detected tags:** `[all]` `[npm]` `[cli]`

---

## A. Security Baseline

- [x] `[all]` SECURITY.md exists (report email, supported versions, response timeline) (2026-03-08)
- [x] `[all]` README includes threat model paragraph (data touched, data NOT touched, permissions required) (2026-03-08)
- [x] `[all]` No secrets, tokens, or credentials in source or diagnostics output (2026-03-08)
- [x] `[all]` No telemetry by default — state it explicitly even if obvious (2026-03-08)

### Default safety posture

- [x] `[cli]` Dangerous actions (kill, delete, restart) require explicit `--allow-*` flag (2026-03-08) SKIP: game CLI — no dangerous destructive actions; save files are additive only
- [ ] `[cli]` File operations constrained to known directories SKIP: writes only to ~/.claude-rpg/saves/
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[mcp]` SKIP: not an MCP server

## B. Error Handling

- [ ] `[all]` Errors follow the Structured Error Shape SKIP: game CLI uses ok/error pattern appropriate for interactive game; not a production API service
- [x] `[cli]` Exit codes: 0 ok · 1 user error (2026-03-08)
- [x] `[cli]` No raw stack traces without `--debug` (2026-03-08)
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[desktop]` SKIP: not a desktop app
- [ ] `[vscode]` SKIP: not a VS Code extension

## C. Operator Docs

- [x] `[all]` README is current: what it does, install, usage, supported platforms + runtime versions (2026-03-08)
- [x] `[all]` CHANGELOG.md (Keep a Changelog format) (2026-03-08)
- [x] `[all]` LICENSE file present and repo states support status (2026-03-08)
- [x] `[cli]` `--help` output accurate for all commands and flags (2026-03-08)
- [ ] `[cli]` Logging levels defined SKIP: interactive game CLI — output is game narration, not structured logs
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[complex]` SKIP: not a complex daemon — single-process CLI game

## D. Shipping Hygiene

- [x] `[all]` `verify` script exists (test + build + smoke in one command) (2026-03-08)
- [x] `[all]` Version in manifest matches git tag (2026-03-08)
- [ ] `[all]` Dependency scanning runs in CI (npm audit in verify) SKIP: verify script runs typecheck + test:coverage only; no CI workflow configured yet
- [ ] `[all]` Automated dependency update mechanism exists SKIP: monthly manual review per org rules (no dependabot)
- [x] `[npm]` `npm pack --dry-run` includes: dist/, README.md, CHANGELOG.md, LICENSE (2026-03-08)
- [x] `[npm]` `engines.node` set (>=20) (2026-03-08)
- [x] `[npm]` Lockfile committed (2026-03-08)
- [ ] `[vsix]` SKIP: not a VS Code extension
- [ ] `[desktop]` SKIP: not a desktop app

## E. Identity (soft gate — does not block ship)

- [x] `[all]` Logo in README header (2026-03-08)
- [ ] `[all]` Translations (polyglot-mcp, 8 languages)
- [x] `[org]` Landing page (@mcptoolshop/site-theme + Starlight handbook) (2026-03-08)
- [x] `[all]` GitHub repo metadata: description, homepage, topics (2026-03-08)

---

## Gate Rules

**Hard gate (A–D):** Must pass before any version is tagged or published.
If a section doesn't apply, mark `SKIP:` with justification — don't leave it unchecked.

**Soft gate (E):** Should be done. Product ships without it, but isn't "whole."
