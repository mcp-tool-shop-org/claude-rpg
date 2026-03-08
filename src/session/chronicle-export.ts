// chronicle-export — export campaign data as markdown or JSON documents

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { SavedSession } from './session.js';
import type { CampaignRecord } from '@ai-rpg-engine/campaign-memory';
import type { FinaleOutline, NpcFate, FactionFate, DistrictFate, LegacyEntry } from '@ai-rpg-engine/campaign-memory';
import type { ArcSnapshot } from '@ai-rpg-engine/modules';
import type { PartyState } from '@ai-rpg-engine/modules';

// --- Markdown Export ---

export function exportChronicleMarkdown(session: SavedSession): string {
  const packName = session.packId ?? session.characterName ?? 'Campaign';
  const outline = parseFinaleOutline(session);
  const arcSnapshot = parseArcSnapshot(session);
  const chronicle = parseChronicle(session);
  const party = parseParty(session);

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

export function exportChronicleJSON(session: SavedSession): object {
  const outline = parseFinaleOutline(session);
  const arcSnapshot = parseArcSnapshot(session);
  const chronicle = parseChronicle(session);

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

function parseFinaleOutline(session: SavedSession): FinaleOutline | null {
  if (!session.finaleOutline) return null;
  try {
    return JSON.parse(session.finaleOutline) as FinaleOutline;
  } catch {
    return null;
  }
}

function parseArcSnapshot(session: SavedSession): ArcSnapshot | null {
  if (!session.arcSnapshot) return null;
  try {
    return JSON.parse(session.arcSnapshot) as ArcSnapshot;
  } catch {
    return null;
  }
}

function parseChronicle(session: SavedSession): CampaignRecord[] {
  if (!session.chronicleRecords) return [];
  try {
    return JSON.parse(session.chronicleRecords) as CampaignRecord[];
  } catch {
    return [];
  }
}

function parseParty(session: SavedSession): PartyState | null {
  if (!session.partyState) return null;
  try {
    return JSON.parse(session.partyState) as PartyState;
  } catch {
    return null;
  }
}

function getTopEvents(records: CampaignRecord[], limit: number): CampaignRecord[] {
  return [...records]
    .sort((a, b) => b.significance - a.significance)
    .slice(0, limit);
}

function significanceStars(significance: number): string {
  if (significance >= 0.8) return '★★★';
  if (significance >= 0.5) return '★★';
  return '★';
}
