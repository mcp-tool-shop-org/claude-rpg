// chronicle-export — export campaign data as markdown or JSON documents

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { SavedSession } from './session.js';
import { loadArcSnapshotFromSession, loadChronicleFromSession, loadFinaleFromSession } from './session.js';
import type { CampaignRecord } from '@ai-rpg-engine/campaign-memory';
import type { FinaleOutline, NpcFate, FactionFate, DistrictFate, LegacyEntry } from '@ai-rpg-engine/campaign-memory';

// --- Markdown Export ---

/**
 * F-5d6fe829: outline/arcSnapshot/chronicle now load through session.ts's
 * guarded loaders (loadFinaleFromSession/loadArcSnapshotFromSession/
 * loadChronicleFromSession) instead of this file's own private
 * parseFinaleOutline/parseArcSnapshot/parseChronicle — those re-implemented
 * bare `JSON.parse(x) as T` casts with a silent empty catch: a second,
 * independently-maintained, unvalidated copy of parsing session.ts's loaders
 * already perform, with none of the isValidFinaleOutline/isValidArcSnapshot/
 * CampaignJournal.deserialize validation those loaders carry today. A
 * malformed chronicleRecords value (e.g. a non-array) used to survive the
 * bare cast and throw inside getTopEvents()'s `[...records]` spread the
 * moment `/export` ran, on a save that loaded and played fine right up to
 * that instant. The export path now inherits the same validation the load
 * path has, and automatically inherits any future fix to those loaders
 * instead of needing a third parallel patch. The old parseParty was
 * additionally dead code (parsed, never read) and is deleted outright rather
 * than migrated — companion data is covered by outline.companionFates.
 */
export function exportChronicleMarkdown(session: SavedSession): string {
  const packName = session.packId ?? session.characterName ?? 'Campaign';
  const outline = loadFinaleFromSession(session);
  const arcSnapshot = loadArcSnapshotFromSession(session);
  const chronicle = loadChronicleFromSession(session).query({});

  const lines: string[] = [];

  // Header
  lines.push(`# Campaign Chronicle: ${packName}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  const arc = outline?.dominantArc ?? arcSnapshot?.dominantArc ?? 'none';
  const resolution = outline?.resolutionClass ?? 'in progress';
  const turns = outline?.campaignDuration ?? chronicle.length;
  const charLine = session.characterName
    ? `**${session.characterName}**${session.characterTitle ? ` "${session.characterTitle}"` : ''} (Lv${session.characterLevel ?? '?'})`
    : '';
  if (charLine) lines.push(charLine);
  lines.push(`Arc: ${arc} | Resolution: ${resolution} | Turns: ${turns}`);
  lines.push('');

  // Key Moments
  lines.push('## Key Moments');
  lines.push('');
  const keyMoments = outline?.keyMoments ?? getTopEvents(chronicle, 10);
  if (keyMoments.length === 0) {
    lines.push('*No significant events recorded.*');
  } else {
    for (const moment of keyMoments) {
      const sig = significanceStars(moment.significance);
      lines.push(`- **Turn ${moment.tick}** ${sig} ${moment.description}`);
    }
  }
  lines.push('');

  // Faction Fates
  if (outline?.factionFates && outline.factionFates.length > 0) {
    lines.push('## Faction Fates');
    lines.push('');
    lines.push('| Faction | Outcome | Reputation | Cohesion |');
    lines.push('|---------|---------|-----------|----------|');
    for (const f of outline.factionFates) {
      lines.push(`| ${f.factionId} | ${f.outcome} | ${f.playerReputation} | ${f.cohesion} |`);
    }
    lines.push('');
  }

  // NPC Fates
  if (outline?.npcFates && outline.npcFates.length > 0) {
    lines.push('## NPC Fates');
    lines.push('');
    lines.push('| Name | Outcome | Last Event |');
    lines.push('|------|---------|------------|');
    for (const n of outline.npcFates) {
      lines.push(`| ${n.name} | ${n.outcome} | ${n.lastSignificantEvent ?? '—'} |`);
    }
    lines.push('');
  }

  // Companion Journey
  const companions = outline?.companionFates ?? [];
  if (companions.length > 0) {
    lines.push('## Companion Journey');
    lines.push('');
    for (const c of companions) {
      lines.push(`### ${c.name}`);
      lines.push(`- Outcome: ${c.outcome}`);
      if (c.lastSignificantEvent) {
        lines.push(`- Last event: ${c.lastSignificantEvent}`);
      }
      lines.push('');
    }
  }

  // District Conditions
  if (outline?.districtFates && outline.districtFates.length > 0) {
    lines.push('## District Conditions');
    lines.push('');
    lines.push('| District | Stability | Controller | Economy |');
    lines.push('|----------|-----------|------------|---------|');
    for (const d of outline.districtFates) {
      lines.push(`| ${d.name} | ${d.stability} | ${d.controllingFaction ?? '—'} | ${d.economyTone} |`);
    }
    lines.push('');
  }

  // Legacy
  if (outline?.legacy && outline.legacy.length > 0) {
    lines.push('## Legacy');
    lines.push('');
    for (const l of outline.legacy) {
      const stars = significanceStars(l.significance);
      lines.push(`- ${stars} **${l.label}** (${l.category})`);
    }
    lines.push('');
  }

  // Epilogue seeds
  if (outline?.epilogueSeeds && outline.epilogueSeeds.length > 0) {
    lines.push('## Epilogue');
    lines.push('');
    for (const seed of outline.epilogueSeeds) {
      lines.push(`> ${seed}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Exported from claude-rpg on ${new Date().toISOString().split('T')[0]}*`);

  return lines.join('\n');
}

// --- JSON Export ---

/** F-5d6fe829: see exportChronicleMarkdown's doc comment — same guarded-loader fix. */
export function exportChronicleJSON(session: SavedSession): object {
  const outline = loadFinaleFromSession(session);
  const arcSnapshot = loadArcSnapshotFromSession(session);
  const chronicle = loadChronicleFromSession(session).query({});

  return {
    meta: {
      packId: session.packId ?? null,
      characterName: session.characterName ?? null,
      characterLevel: session.characterLevel ?? null,
      characterTitle: session.characterTitle ?? null,
      genre: session.genre ?? null,
      exportedAt: new Date().toISOString(),
    },
    summary: {
      dominantArc: outline?.dominantArc ?? arcSnapshot?.dominantArc ?? null,
      resolutionClass: outline?.resolutionClass ?? null,
      campaignDuration: outline?.campaignDuration ?? chronicle.length,
      totalChronicleEvents: outline?.totalChronicleEvents ?? chronicle.length,
    },
    keyMoments: (outline?.keyMoments ?? getTopEvents(chronicle, 10)).map((m) => ({
      tick: m.tick,
      category: m.category,
      description: m.description,
      significance: m.significance,
    })),
    factionFates: outline?.factionFates ?? [],
    npcFates: outline?.npcFates ?? [],
    companionFates: outline?.companionFates ?? [],
    districtFates: outline?.districtFates ?? [],
    legacy: outline?.legacy ?? [],
    epilogueSeeds: outline?.epilogueSeeds ?? [],
  };
}

// --- Finale Export ---

export function exportFinaleMarkdown(
  outline: FinaleOutline,
  epilogue?: string,
  genre?: string,
  packName?: string,
): string {
  const lines: string[] = [];

  lines.push(`# ${packName ?? 'Campaign'} — Campaign Finale`);
  lines.push('');
  lines.push(`> Resolution: ${outline.resolutionClass} | Arc: ${outline.dominantArc ?? 'none'}`);
  lines.push('');

  // Epilogue
  if (epilogue) {
    lines.push('## The Story Ends');
    lines.push('');
    lines.push(epilogue);
    lines.push('');
  }

  // What Became of the World
  lines.push('## What Became of the World');
  lines.push('');

  // Factions
  if (outline.factionFates.length > 0) {
    lines.push('### Factions');
    lines.push('');
    for (const f of outline.factionFates) {
      lines.push(`**${f.factionId}** — ${f.outcome}. Reputation: ${f.playerReputation}, cohesion: ${f.cohesion}.`);
    }
    lines.push('');
  }

  // People
  const allNpcs = [...outline.npcFates, ...outline.companionFates];
  if (allNpcs.length > 0) {
    lines.push('### People');
    lines.push('');
    for (const n of allNpcs) {
      const lastEvent = n.lastSignificantEvent ? ` ${n.lastSignificantEvent}.` : '';
      lines.push(`**${n.name}** — ${n.outcome}.${lastEvent}`);
    }
    lines.push('');
  }

  // Places
  if (outline.districtFates.length > 0) {
    lines.push('### Places');
    lines.push('');
    for (const d of outline.districtFates) {
      const controller = d.controllingFaction ? ` Controlled by ${d.controllingFaction}.` : '';
      lines.push(`**${d.name}** — stability ${d.stability}, ${d.economyTone}.${controller}`);
    }
    lines.push('');
  }

  // Legacy
  if (outline.legacy.length > 0) {
    lines.push('## Your Legacy');
    lines.push('');
    for (const l of outline.legacy) {
      const stars = significanceStars(l.significance);
      lines.push(`- ${stars} ${l.label}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Exported from claude-rpg on ${new Date().toISOString().split('T')[0]}*`);

  return lines.join('\n');
}

// --- File writing helpers ---

export function getExportDir(): string {
  return join(process.cwd(), '.claude-rpg', 'exports');
}

export async function writeExport(filename: string, content: string): Promise<string> {
  const dir = getExportDir();
  await mkdir(dir, { recursive: true });
  const filepath = join(dir, filename);
  await writeFile(filepath, content, 'utf-8');
  return filepath;
}

// --- Internal helpers ---

function getTopEvents(records: CampaignRecord[], limit: number): CampaignRecord[] {
  const top = [...records]
    .sort((a, b) => b.significance - a.significance)
    .slice(0, limit);
  // F-934b1183: re-sort by tick ascending so the exported "Key Moments"
  // read as a chronological timeline, mirroring the same re-sort-after-trim
  // step already used by compactChronicle()/buildChronicleContext() in
  // chronicle.ts.
  top.sort((a, b) => a.tick - b.tick);
  return top;
}

function significanceStars(significance: number): string {
  if (significance >= 0.8) return '★★★';
  if (significance >= 0.5) return '★★';
  return '★';
}
