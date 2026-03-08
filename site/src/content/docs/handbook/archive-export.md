---
title: Archive & Export
description: Browse completed campaigns and export chronicles as markdown or JSON.
sidebar:
  order: 8
---

## Campaign archive

After completing a campaign with `/conclude` and saving, the campaign is marked as completed. Use `/archive` to browse all finished campaigns.

```
/archive
```

The archive shows each campaign with:

- **Title** and pack name
- **Dominant arc** and **resolution class**
- **Turn count**
- **Companions** who joined the journey
- **Relics** of significance
- **Chronicle highlights** (top events by importance)

You can also browse archives from the CLI without starting a game:

```bash
claude-rpg archive
```

## Exporting campaigns

Three export formats are available during play:

### Markdown chronicle

```
/export md
```

Produces a full campaign document with:

- Summary (arc, resolution, turn count)
- Key moments ranked by significance
- Faction fates table (outcome, reputation, cohesion)
- NPC fates table (outcome, last event)
- Companion journey sections
- District conditions table
- Legacy entries with significance stars
- Epilogue seeds

### JSON chronicle

```
/export json
```

Structured data export with the same information as markdown, suitable for external tools or analysis.

### Finale document

```
/export finale
```

A standalone epilogue-focused document (only available after `/conclude`):

- Resolution and dominant arc
- The full epilogue narration
- Faction, NPC, and district fates in narrative form
- Legacy entries

## Export location

All exports are saved to `~/.claude-rpg/exports/` with timestamped filenames. The full path is printed to the terminal after each export.

## Significance stars

Events and legacy entries are marked with significance stars:

| Stars | Significance |
|-------|-------------|
| ★★★  | 0.8 or higher |
| ★★   | 0.5 to 0.79 |
| ★    | Below 0.5 |
