// Chronicle render modes: multiple views of the same structured truth
// v0.8: timeline (neutral), bardic (dramatic), director (forensic)

import type { CampaignRecord } from '@ai-rpg-engine/campaign-memory';
import type { CompactedChronicle, EraSummary } from '../session/chronicle.js';
import { getTerminalWidth } from '../display/play-renderer.js';
import { dim } from '../cli/colors.js';
import { wrapMenuLine } from './prompts.js';

// F-3a024f07: were both a fixed 60-char divider, uncolored, unlike every
// other divider in the display layer (play-renderer.ts's PFE-005, and
// F-38eb3dec's director-renderer.ts/status-compact.ts/archive-browser.ts/
// help-system.ts precedent), which all adapt to getTerminalWidth() and wrap
// in dim(). Computed per call (not a module-level constant) so they track
// the real terminal width.
function divider(): string {
  return dim('─'.repeat(getTerminalWidth()));
}
function heavyDivider(): string {
  return dim('═'.repeat(getTerminalWidth()));
}

/**
 * F-dd7a85ca: none of this file's three render modes wrapped long content to
 * terminal width -- renderRecordTimeline/renderRecordBardic/
 * renderDirectorChronicle each pushed one unwrapped string per CampaignRecord,
 * even though the file already imports getTerminalWidth() (used only for its
 * dividers until now). Worst case was renderDirectorChronicle's data line,
 * which appended JSON.stringify(record.data) with no length bound at all.
 * Reuses prompts.ts's wrapMenuLine (one word-wrap+hanging-indent algorithm
 * codebase-wide, not a second hand-rolled copy) rather than a dedicated
 * helper. wrapMenuLine's own budget assumes a 4-space caller indent (its doc
 * comment); this file's rows sit at a 2- or 4-space indent depending on
 * caller, so at the narrower indent lines wrap a little earlier than the
 * strict minimum requires -- the safe direction (never overflow), matching
 * wrapStatusLine's own documented rationale for a similar over-count. Every
 * returned line (first and continuation alike) gets `indent` prefixed, so
 * continuation lines land `indent.length + 2` columns in -- a hanging indent
 * relative to the first line, the same shape wrapMenuLine's own callers use.
 */
function wrapContentLine(indent: string, content: string): string {
  return wrapMenuLine(content)
    .map((line) => `${indent}${line}`)
    .join('\n');
}

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
  lines.push(heavyDivider());
  lines.push(`  CHRONICLE OF ${name.toUpperCase()} — ${chronicle.totalRecords} events`);
  lines.push(heavyDivider());

  // F-6be2f98b: the ' *' high-significance marker (renderRecordTimeline
  // below) had no legend anywhere in this mode's own output, or in
  // director-renderer.ts's /chronicle dispatch (cross-domain, prints nothing
  // around the call that would supply one) -- a player running /chronicle
  // timeline saw asterisks on some entries with no stated meaning. Shown only
  // when at least one rendered record actually carries the marker.
  if (chronicle.canonicalEvents.some((r) => r.significance >= 0.7)) {
    lines.push('  * = pivotal moment');
  }

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
  lines.push(heavyDivider());
  lines.push('');

  return lines.join('\n');
}

function renderRecordTimeline(record: CampaignRecord): string {
  const sig = record.significance >= 0.7 ? ' *' : '';
  return wrapContentLine('  ', `[Tick ${record.tick}] ${record.description} (${record.category}${sig})`);
}

function renderEraTimeline(era: EraSummary): string {
  const lines: string[] = [];
  lines.push(`  ${divider()}`);
  lines.push(`  ${era.label} (${era.eventCount} events)`);
  // F-3a024f07: within timeline mode specifically (the one mode that claims
  // to be neutral/factual), this used to sit at a double indent while
  // renderRecordTimeline's canonical events sit at a single indent -- two
  // different visual treatments for what is conceptually the same "a
  // chronicle entry happened" fact. Now single-indented to match; the hyphen
  // bullet (vs. canonical's bracket-tick) stays, since it reflects a real
  // data difference -- EraSummary.topEvents carries no tick number to show.
  // bardic's/director's own distinct per-mode voices for this same field
  // (bare quotes / '>' prefix, see renderEraBardic/renderDirectorChronicle)
  // are unchanged -- this file's own v0.8 header comment already documents
  // timeline/bardic/director as three deliberate voices.
  for (const event of era.topEvents) {
    lines.push(`  - ${event}`);
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
  lines.push(heavyDivider());
  lines.push(`  THE TALE OF ${name.toUpperCase()}${titleStr.toUpperCase()}`);
  lines.push(heavyDivider());
  lines.push('');

  if (chronicle.canonicalEvents.length === 0 && chronicle.eraSummaries.length === 0) {
    lines.push(`  The story of ${name} has yet to be written...`);
    lines.push('');
    lines.push(heavyDivider());
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
  lines.push(heavyDivider());
  lines.push('');

  return lines.join('\n');
}

function renderRecordBardic(record: CampaignRecord, name: string): string {
  const openers = BARDIC_OPENERS[record.category] ?? BARDIC_OPENERS.default;
  // F-20ec59de sibling: normalize the modulo to always be non-negative — same
  // bare-modulo-on-a-plain-number pattern as generateAmbientLine's seed bug.
  const openerIndex = ((record.tick % openers.length) + openers.length) % openers.length;
  const opener = openers[openerIndex].replace('{name}', name);
  const desc = record.description.charAt(0).toLowerCase() + record.description.slice(1);
  return wrapContentLine('  ', `${capitalize(opener)} ${desc}.`);
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
  // F-6be2f98b: timeline/bardic frame their header with the heavy divider
  // while this outer frame used the thinner one instead, for no apparent
  // semantic reason -- the same conceptual "titled top-level screen" as its
  // two siblings. Aligned to match.
  lines.push(heavyDivider());
  lines.push(`  CHRONICLE DEBUG — ${chronicle.totalRecords} records, ${chronicle.eraSummaries.length} eras`);
  lines.push(heavyDivider());
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
      wrapContentLine('  ', `${record.id} | tick:${record.tick} | ${record.category} | actor:${record.actorId}${target}${zone}`),
    );
    lines.push(
      wrapContentLine('    ', `sig:${record.significance.toFixed(2)}${witnesses} | "${record.description}"`),
    );
    if (Object.keys(record.data).length > 0) {
      // F-dd7a85ca: the worst case named by this finding -- an unbounded
      // JSON.stringify(record.data) dump with no length cap at all.
      lines.push(wrapContentLine('    ', `data:${JSON.stringify(record.data)}`));
    }
  }

  if (chronicle.canonicalEvents.length === 0 && chronicle.eraSummaries.length === 0) {
    lines.push('  No chronicle events recorded.');
  }

  lines.push('');
  lines.push(heavyDivider());
  lines.push('');

  return lines.join('\n');
}
