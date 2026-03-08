// Chronicle render modes: multiple views of the same structured truth
// v0.8: timeline (neutral), bardic (dramatic), director (forensic)

import type { CampaignRecord } from '@ai-rpg-engine/campaign-memory';
import type { CompactedChronicle, EraSummary } from '../session/chronicle.js';

const DIVIDER = '─'.repeat(60);
const HEAVY_DIVIDER = '═'.repeat(60);

export type ChronicleRenderMode = 'timeline' | 'bardic' | 'director';

/** Render a chronicle in the chosen mode. */
export function renderChronicle(
  chronicle: CompactedChronicle,
  mode: ChronicleRenderMode,
  characterName?: string,
  characterTitle?: string,
): string {
  switch (mode) {
    case 'timeline':
      return renderTimeline(chronicle, characterName);
    case 'bardic':
      return renderBardic(chronicle, characterName, characterTitle);
    case 'director':
      return renderDirectorChronicle(chronicle);
    default:
      return `  Unknown chronicle mode: ${mode}. Use: timeline, bardic, director.`;
  }
}

// --- Timeline Mode (neutral, factual, tick-ordered) ---

function renderTimeline(
  chronicle: CompactedChronicle,
  characterName?: string,
): string {
  const lines: string[] = [];
  const name = characterName ?? 'Unknown';

  lines.push('');
  lines.push(HEAVY_DIVIDER);
  lines.push(`  CHRONICLE OF ${name.toUpperCase()} — ${chronicle.totalRecords} events`);
  lines.push(HEAVY_DIVIDER);
  lines.push('');

  // Era summaries first (older events)
  if (chronicle.eraSummaries.length > 0) {
    for (const era of chronicle.eraSummaries) {
      lines.push(renderEraTimeline(era));
    }
    lines.push('');
  }

  // Canonical events
  for (const record of chronicle.canonicalEvents) {
    lines.push(renderRecordTimeline(record));
  }

  if (chronicle.canonicalEvents.length === 0 && chronicle.eraSummaries.length === 0) {
    lines.push('  No notable events recorded yet.');
  }

  lines.push('');
  lines.push(HEAVY_DIVIDER);
  lines.push('');

  return lines.join('\n');
}

function renderRecordTimeline(record: CampaignRecord): string {
  const sig = record.significance >= 0.7 ? ' *' : '';
  return `  [Tick ${record.tick}] ${record.description} (${record.category}${sig})`;
}

function renderEraTimeline(era: EraSummary): string {
  const lines: string[] = [];
  lines.push(`  ${DIVIDER}`);
  lines.push(`  ${era.label} (${era.eventCount} events)`);
  for (const event of era.topEvents) {
    lines.push(`    - ${event}`);
  }
  return lines.join('\n');
}

// --- Bardic Mode (dramatic, third-person, template-based) ---

const BARDIC_OPENERS: Record<string, string[]> = {
  kill: [
    'steel met flesh, and {name} stood victorious over',
    'in a clash that echoed through the halls, {name} struck down',
    'fate demanded blood, and {name} answered — defeating',
  ],
  discovery: [
    '{name} set foot upon ground no traveler had tread, discovering',
    'the veil of mystery parted as {name} came upon',
    'drawn by whispers of the unknown, {name} found',
  ],
  alliance: [
    'an accord was forged between {name} and',
    'trust, once a stranger, found a home as {name} earned the favor of',
    'bonds were wrought in shared purpose as {name} allied with',
  ],
  betrayal: [
    'trust shattered like glass as {name} drew the ire of',
    'a shadow fell between {name} and',
    'what was harmony became discord between {name} and',
  ],
  combat: [
    'blades rang and the ground shook as {name} fought',
    'the arena of conflict welcomed {name} once more,',
    '{name} faced peril and emerged, bearing new scars from',
  ],
  action: [
    'and so it was that {name}',
    'the winds of change stirred as {name}',
    'a moment of significance came when {name}',
  ],
  default: [
    'the tale continued as {name}',
    'fate turned its wheel, and {name}',
  ],
};

function renderBardic(
  chronicle: CompactedChronicle,
  characterName?: string,
  characterTitle?: string,
): string {
  const lines: string[] = [];
  const name = characterName ?? 'the Wanderer';
  const titleStr = characterTitle ? ` "${characterTitle}"` : '';

  lines.push('');
  lines.push(HEAVY_DIVIDER);
  lines.push(`  THE TALE OF ${name.toUpperCase()}${titleStr.toUpperCase()}`);
  lines.push(HEAVY_DIVIDER);
  lines.push('');

  if (chronicle.canonicalEvents.length === 0 && chronicle.eraSummaries.length === 0) {
    lines.push(`  The story of ${name} has yet to be written...`);
    lines.push('');
    lines.push(HEAVY_DIVIDER);
    lines.push('');
    return lines.join('\n');
  }

  // Era summaries as "ages"
  for (const era of chronicle.eraSummaries) {
    lines.push(renderEraBardic(era, name));
    lines.push('');
  }

  // Canonical events as dramatic passages
  for (const record of chronicle.canonicalEvents) {
    lines.push(renderRecordBardic(record, name));
  }

  lines.push('');
  lines.push(`  And so the tale continues...`);
  lines.push('');
  lines.push(HEAVY_DIVIDER);
  lines.push('');

  return lines.join('\n');
}

function renderRecordBardic(record: CampaignRecord, name: string): string {
  const openers = BARDIC_OPENERS[record.category] ?? BARDIC_OPENERS.default;
  const opener = openers[record.tick % openers.length].replace('{name}', name);
  const desc = record.description.charAt(0).toLowerCase() + record.description.slice(1);
  return `  ${capitalize(opener)} ${desc}.`;
}

function renderEraBardic(era: EraSummary, name: string): string {
  const lines: string[] = [];
  lines.push(`  In the early days (${era.label}), ${era.eventCount} deeds marked`);
  lines.push(`  the path of ${name}:`);
  for (const event of era.topEvents) {
    lines.push(`    "${event}"`);
  }
  return lines.join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- Director Mode (forensic, raw data, all metadata) ---

function renderDirectorChronicle(chronicle: CompactedChronicle): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(DIVIDER);
  lines.push(`  CHRONICLE DEBUG — ${chronicle.totalRecords} records, ${chronicle.eraSummaries.length} eras`);
  lines.push(DIVIDER);
  lines.push('');

  // Era summaries
  for (const era of chronicle.eraSummaries) {
    lines.push(`  ERA ${era.label} | ${era.eventCount} events`);
    for (const event of era.topEvents) {
      lines.push(`    > ${event}`);
    }
  }

  if (chronicle.eraSummaries.length > 0) lines.push('');

  // Canonical events with full metadata
  for (const record of chronicle.canonicalEvents) {
    const target = record.targetId ? ` target:${record.targetId}` : '';
    const zone = record.zoneId ? ` zone:${record.zoneId}` : '';
    const witnesses = record.witnesses.length > 0
      ? ` witnesses:[${record.witnesses.join(',')}]`
      : '';
    lines.push(
      `  ${record.id} | tick:${record.tick} | ${record.category} | actor:${record.actorId}${target}${zone}`,
    );
    lines.push(
      `    sig:${record.significance.toFixed(2)}${witnesses} | "${record.description}"`,
    );
    if (Object.keys(record.data).length > 0) {
      lines.push(`    data:${JSON.stringify(record.data)}`);
    }
  }

  if (chronicle.canonicalEvents.length === 0 && chronicle.eraSummaries.length === 0) {
    lines.push('  No chronicle events recorded.');
  }

  lines.push('');
  lines.push(DIVIDER);
  lines.push('');

  return lines.join('\n');
}
