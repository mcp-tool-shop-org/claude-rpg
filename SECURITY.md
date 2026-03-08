# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

Email: **64996768+mcp-tool-shop@users.noreply.github.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Version affected
- Potential impact

### Response timeline

| Action | Target |
|--------|--------|
| Acknowledge report | 48 hours |
| Assess severity | 7 days |
| Release fix | 30 days |

## Scope

Claude RPG is a **local CLI application** that makes outbound API calls to Anthropic.

- **Data touched:** player save files in `~/.claude-rpg/saves/`, Anthropic API (outbound HTTPS only)
- **Data NOT touched:** no local files outside the save directory, no system configuration, no other applications
- **API key handling:** read from `ANTHROPIC_API_KEY` environment variable only — never stored, logged, or transmitted beyond the Anthropic API
- **No telemetry** — no analytics, no usage tracking, no phone-home
- **No secrets in source** — no embedded tokens, credentials, or API keys
- **No inbound network** — no servers, no listeners, no open ports
