// Director mode renderer: inspect simulation truth

import type { WorldState } from '@ai-rpg-engine/core';
import {
  inspectEntity,
  inspectFaction,
  inspectZone,
  formatEntityInspection,
  formatFactionInspection,
  traceEntityBelief,
  formatBeliefTrace,
  createSnapshot,
  getDivergences,
  formatRumorForDirector,
  getRumorsKnownToFaction,
  formatPressureForDirector,
  formatFalloutForDirector,
  formatFactionProfilesForDirector,
  formatLeverageForDirector,
  formatStrategicMapForDirector,
  formatNpcProfileForDirector,
  formatNpcPeopleForDirector,
  formatAllDistrictsForDirector,
  formatDistrictForDirector,
  getAllDistrictIds,
  getDistrictState,
  getDistrictDefinition,
  computeDistrictMood,
  computeDistrictModifiers,
  formatPartyForDirector,
  evaluateDepartureRisk,
  formatAllDistrictEconomiesForDirector,
  formatEconomyForDirector,
  deriveEconomyDescriptor,
  // Crafting (v1.8)
  getMaterialInventory,
  getAvailableRecipes,
  formatAvailableRecipesForDirector,
  formatMaterialsForDirector,
  formatMaterialsCompact,
  salvageItem,
  formatSalvagePreview,
  // Opportunities (v1.9)
  getAvailableOpportunities,
  getAcceptedOpportunities,
  getOpportunityById,
  formatOpportunityListForDirector,
  formatOpportunityForDirector,
  type PlayerRumor,
  type WorldPressure,
  type PressureFallout,
  type FactionProfile,
  type FactionActionResult,
  type NpcProfile,
  type NpcActionResult,
  type NpcObligationLedger,
  type LeverageState,
  type StrategicMap,
  type PartyState,
  type DistrictEconomy,
  type OpportunityState,
  // Arc Detection + Endgame (v2.0)
  formatArcForDirector,
  formatEndgameForDirector,
  type ArcSnapshot,
  type EndgameTrigger,
} from '@ai-rpg-engine/modules';
import { formatFinaleForDirector, type FinaleOutline } from '@ai-rpg-engine/campaign-memory';
import type { CharacterProfile } from '@ai-rpg-engine/character-profile';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import {
  formatProvenanceForDirector,
  getItemHistory,
  getItemKillCount,
  getItemAge,
  evaluateRelicGrowth,
  getRelicEpithet,
  TIER_LABELS,
  EQUIPMENT_SLOTS,
} from '@ai-rpg-engine/equipment';
import type { CampaignJournal } from '@ai-rpg-engine/campaign-memory';
import { compactChronicle } from '../session/chronicle.js';
import { renderChronicle, type ChronicleRenderMode } from '../character/chronicle-renderer.js';
import { renderDirectorHelpExtended, wrapWords } from './help-system.js';
import { renderCompactStatus } from './status-compact.js';
import { getTerminalWidth } from './play-renderer.js';
import type { ScoredMove } from '@ai-rpg-engine/modules';
import type { StatusData } from '../character/presence.js';
import { bold, dim } from '../cli/colors.js';

// F-38eb3dec: was a fixed 60-char divider regardless of terminal size,
// unlike play-renderer.ts's own dividers (PFE-005). Computed per call (not
// a module-level constant) so it tracks the real terminal width, matching
// play-renderer.ts's makeDivider() pattern.
function divider(): string {
  return dim('─'.repeat(getTerminalWidth()));
}

/**
 * F-1367afd9: renderDirectorHelp()'s command table used to be hand-typed
 * text with three concrete defects -- only '/inspect' colored (with no
 * reason given), the description column drifting on rows whose command ran
 * long, and the '/chronicle [mode]' row hard-wrapping past an 80-column
 * terminal with no hanging indent. Rebuilt as data + a row renderer:
 * padEnd for the name column, wrapWords (help-system.ts -- the same
 * word-wrap renderArcHelp/renderConcludeHelp already use via
 * renderNameDescriptionRow) for the hanging-indent wrap, and no color on
 * any row -- matching the plain-name convention every sibling reference
 * table in this domain already uses.
 */
const DIRECTOR_COMMANDS: { cmd: string; desc: string }[] = [
  { cmd: '/inspect <entity-id>', desc: 'Show entity cognition state' },
  { cmd: '/faction <faction-id>', desc: 'Show faction beliefs and alert' },
  { cmd: '/zone <zone-id>', desc: 'Show zone properties' },
  { cmd: '/trace <entity> <subject> <key>', desc: 'Trace belief provenance' },
  { cmd: '/rumors [faction-id]', desc: 'Show player rumors (optionally filtered)' },
  { cmd: '/pressures', desc: 'Show active world pressures' },
  { cmd: '/world', desc: 'Show resolved pressures and fallout' },
  { cmd: '/factions', desc: 'Show faction agency (goals, actions, profiles)' },
  { cmd: '/people [zone]', desc: 'Show named NPCs (goals, stance, last action)' },
  { cmd: '/npc <npc-id>', desc: 'Inspect individual NPC agency state' },
  { cmd: '/leverage', desc: 'Show player leverage currencies' },
  { cmd: '/map', desc: 'Show strategic map (districts + factions)' },
  { cmd: '/party', desc: 'Show companion party state' },
  { cmd: '/item <item-id>', desc: 'Inspect item provenance, chronicle, relic state' },
  { cmd: '/districts', desc: 'Show all districts with mood + metrics' },
  { cmd: '/district <id>', desc: 'Deep inspect a specific district' },
  { cmd: '/market', desc: 'Show all district economies at a glance' },
  { cmd: '/trade <district-id>', desc: 'Detailed district economy + value modifiers' },
  { cmd: '/craft', desc: 'List available recipes and material costs' },
  { cmd: '/materials', desc: 'Show current material inventory' },
  { cmd: '/salvage <item-id>', desc: 'Preview salvage yields without executing' },
  { cmd: '/jobs', desc: 'Available + accepted opportunities' },
  { cmd: '/contracts', desc: 'Alias for /jobs' },
  { cmd: '/contract <id>', desc: 'Detailed opportunity view' },
  { cmd: '/accepted', desc: 'List accepted/in-progress opportunities' },
  { cmd: '/arcs', desc: 'Campaign arc signals + dominant arc' },
  { cmd: '/endgame', desc: 'Endgame trigger history' },
  { cmd: '/finale', desc: 'Campaign finale outline (if concluded)' },
  { cmd: '/status', desc: 'Compact strategic snapshot' },
  { cmd: '/stats', desc: 'Session balance metrics' },
  { cmd: '/help leverage', desc: 'Full leverage verb reference' },
  { cmd: '/help <pack-id>', desc: 'Pack-specific quickstart guide' },
  { cmd: '/chronicle [mode]', desc: 'View campaign chronicle (timeline|bardic|director)' },
  { cmd: '/history [entity-id]', desc: 'View event history for an entity' },
  { cmd: '/snapshot', desc: 'Full simulation snapshot' },
  { cmd: '/divergences', desc: 'Show perception divergences' },
  { cmd: '/back', desc: 'Return to play mode' },
];

// Longest command ('/trace <entity> <subject> <key>') is 31 chars; +3 keeps
// a minimum 3-space gap before the description column on every row.
const DIRECTOR_COMMAND_NAME_WIDTH = 34;

/**
 * Renders one "name, padded, then word-wrapped description" row, hanging
 * subsequent wrapped lines under the name column -- same algorithm as
 * help-system.ts's renderNameDescriptionRow, but keeping this screen's own
 * 2-space indent (its divider/header lines already use it) instead of that
 * helper's hardcoded 4-space convention.
 */
function renderCommandRow(cmd: string, desc: string): string {
  const indent = '  ';
  const available = Math.max(10, getTerminalWidth() - indent.length - DIRECTOR_COMMAND_NAME_WIDTH);
  const wrapped = wrapWords(desc, available);
  const rows = [`${indent}${cmd.padEnd(DIRECTOR_COMMAND_NAME_WIDTH)}${wrapped[0]}`];
  for (let i = 1; i < wrapped.length; i++) {
    rows.push(`${indent}${' '.repeat(DIRECTOR_COMMAND_NAME_WIDTH)}${wrapped[i]}`);
  }
  return rows.join('\n');
}

/** Render director mode help. */
export function renderDirectorHelp(): string {
  const commandRows = DIRECTOR_COMMANDS.map((c) => renderCommandRow(c.cmd, c.desc)).join('\n');
  return `
${divider()}
  ${bold('DIRECTOR MODE')} ${dim('— inspect the hidden truth')}
${divider()}

${commandRows}

${divider()}
`;
}

/**
 * Options for {@link executeDirectorCommand}. Collapsed from a 29-parameter
 * positional signature (F-783f1de1) — many fields share a type (e.g. the
 * adjacent characterName/characterTitle strings, several Map<string, X>
 * params), so TypeScript's structural typing could not catch two same-typed
 * arguments transposed at a call site. Passing every field by name makes
 * that class of bug a compile error instead of a silent mislabeling.
 */
export type ExecuteDirectorCommandOptions = {
  command: string;
  world: WorldState;
  playerRumors?: PlayerRumor[];
  activePressures?: WorldPressure[];
  resolvedPressures?: PressureFallout[];
  journal?: CampaignJournal;
  currentTick?: number;
  characterName?: string;
  characterTitle?: string;
  factionProfiles?: FactionProfile[];
  lastFactionActions?: FactionActionResult[];
  leverageState?: LeverageState;
  strategicMap?: StrategicMap;
  statusData?: StatusData;
  suggestedMove?: ScoredMove | null;
  situationTag?: string;
  profileCustom?: Record<string, string | number | boolean>;
  npcProfiles?: NpcProfile[];
  lastNpcActions?: NpcActionResult[];
  npcObligations?: Map<string, NpcObligationLedger>;
  partyState?: PartyState;
  profile?: CharacterProfile | null;
  itemCatalog?: ItemCatalog | null;
  districtEconomies?: Map<string, DistrictEconomy>;
  genre?: string;
  activeOpportunities?: OpportunityState[];
  arcSnapshot?: ArcSnapshot | null;
  endgameTriggers?: EndgameTrigger[];
  finaleOutline?: FinaleOutline | null;
};

/** Execute a director command and return the rendered output. */
export function executeDirectorCommand(opts: ExecuteDirectorCommandOptions): string {
  const {
    command, world, playerRumors, activePressures, resolvedPressures, journal,
    currentTick, characterName, characterTitle, factionProfiles, lastFactionActions,
    leverageState, strategicMap, statusData, suggestedMove, situationTag, profileCustom,
    npcProfiles, lastNpcActions, npcObligations, partyState, profile, itemCatalog,
    districtEconomies, genre, activeOpportunities, arcSnapshot, endgameTriggers, finaleOutline,
  } = opts;

  const parts = command.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  switch (cmd) {
    case '/inspect': {
      const entityId = parts[1];
      if (!entityId) return '  Usage: /inspect <entity-id>';
      const inspection = inspectEntity(world, entityId);
      if (!inspection) return `  Entity "${entityId}" not found.`;
      return formatEntityInspection(inspection);
    }

    case '/faction': {
      const factionId = parts[1];
      if (!factionId) return '  Usage: /faction <faction-id>';
      const inspection = inspectFaction(world, factionId);
      if (!inspection) return `  Faction "${factionId}" not found.`;
      return formatFactionInspection(inspection);
    }

    case '/zone': {
      const zoneId = parts[1] ?? world.locationId;
      const inspection = inspectZone(world, zoneId);
      if (!inspection) return `  Zone "${zoneId}" not found.`;
      return renderZoneInspection(inspection);
    }

    case '/trace': {
      const [, entityId, subject, key] = parts;
      if (!entityId || !subject || !key) {
        return '  Usage: /trace <entity-id> <subject> <key>';
      }
      const trace = traceEntityBelief(world, entityId, subject, key);
      if (!trace) return `  No belief trace found.`;
      return formatBeliefTrace(trace);
    }

    case '/snapshot': {
      const snapshot = createSnapshot(world);
      return renderSnapshot(snapshot);
    }

    case '/rumors': {
      const rumors = playerRumors ?? [];
      if (rumors.length === 0) return '  No player rumors yet.';
      const factionFilter = parts[1];
      const filtered = factionFilter
        ? getRumorsKnownToFaction(rumors, factionFilter)
        : rumors;
      if (filtered.length === 0) return `  No rumors known to faction "${factionFilter}".`;
      const header = factionFilter
        ? `  PLAYER RUMORS — faction "${factionFilter}" (${filtered.length})`
        : `  PLAYER RUMORS (${filtered.length})`;
      return `\n${divider()}\n${header}\n${divider()}\n\n${filtered.map(formatRumorForDirector).join('\n\n')}\n`;
    }

    case '/pressures': {
      const pressures = activePressures ?? [];
      if (pressures.length === 0) return '  No active world pressures.';
      const header = `  WORLD PRESSURES (${pressures.length})`;
      return `\n${divider()}\n${header}\n${divider()}\n\n${pressures.map(formatPressureForDirector).join('\n\n')}\n`;
    }

    case '/world':
    case '/aftermath': {
      const resolved = resolvedPressures ?? [];
      if (resolved.length === 0) return '  No pressures have been resolved yet.';
      const header = `  RESOLUTION HISTORY (${resolved.length})`;
      return `\n${divider()}\n${header}\n${divider()}\n\n${resolved.map(formatFalloutForDirector).join('\n\n')}\n`;
    }

    case '/factions': {
      const profiles = factionProfiles ?? [];
      const actions = lastFactionActions ?? [];
      if (profiles.length === 0) return '  No faction data available.';
      return formatFactionProfilesForDirector(profiles, actions);
    }

    case '/people': {
      const profiles = npcProfiles ?? [];
      const actions = lastNpcActions ?? [];
      if (profiles.length === 0) return '  No named NPCs found.';
      // Optional zone filter
      const zoneFilter = parts[1];
      const filtered = zoneFilter
        ? profiles.filter((p) => {
            const entity = world.entities[p.npcId];
            return entity?.zoneId === zoneFilter;
          })
        : profiles;
      if (filtered.length === 0) return `  No named NPCs in zone "${zoneFilter}".`;
      return formatNpcPeopleForDirector(filtered, actions, npcObligations);
    }

    case '/npc': {
      const npcId = parts[1];
      if (!npcId) return '  Usage: /npc <npc-id>';
      const profiles = npcProfiles ?? [];
      const actions = lastNpcActions ?? [];
      const profile = profiles.find((p) => p.npcId === npcId);
      if (!profile) return `  NPC "${npcId}" not found (or not a named NPC).`;
      const lastAction = actions.find((a) => a.action.npcId === npcId);
      const obligations = npcObligations?.get(npcId);
      return formatNpcProfileForDirector(profile, lastAction, obligations);
    }

    case '/leverage': {
      if (!leverageState) return '  No leverage data available.';
      return formatLeverageForDirector(leverageState);
    }

    case '/map': {
      if (!strategicMap) return '  No strategic map data available.';
      return formatStrategicMapForDirector(strategicMap);
    }

    case '/districts': {
      return formatAllDistrictsForDirector(world);
    }

    case '/district': {
      const districtId = parts[1];
      if (!districtId) return '  Usage: /district <district-id>';
      const dState = getDistrictState(world, districtId);
      const dDef = getDistrictDefinition(world, districtId);
      if (!dState || !dDef) return `  District "${districtId}" not found.`;
      const mood = computeDistrictMood(dState, dDef.tags);
      const mods = computeDistrictModifiers(mood);
      return formatDistrictForDirector(districtId, dDef, dState, mood, mods);
    }

    case '/market': {
      if (!districtEconomies || districtEconomies.size === 0) return '  No economy data available.';
      const entries: { districtId: string; districtName: string; economy: DistrictEconomy }[] = [];
      for (const [districtId, economy] of districtEconomies) {
        const dDef = getDistrictDefinition(world, districtId);
        entries.push({ districtId, districtName: dDef?.name ?? districtId, economy });
      }
      return formatAllDistrictEconomiesForDirector(entries);
    }

    case '/trade': {
      const districtId = parts[1];
      if (!districtId) return '  Usage: /trade <district-id>';
      if (!districtEconomies) return '  No economy data available.';
      const economy = districtEconomies.get(districtId);
      if (!economy) return `  No economy data for district "${districtId}".`;
      const dDef = getDistrictDefinition(world, districtId);
      const descriptor = deriveEconomyDescriptor(economy);
      return formatEconomyForDirector(districtId, dDef?.name ?? districtId, economy, descriptor);
    }

    case '/chronicle': {
      if (!journal || journal.size() === 0) return '  No chronicle events recorded yet.';
      const mode = (parts[1] ?? 'timeline') as ChronicleRenderMode;
      if (!['timeline', 'bardic', 'director'].includes(mode)) {
        return '  Usage: /chronicle [timeline|bardic|director]';
      }
      const tick = currentTick ?? 0;
      const compacted = compactChronicle(journal, tick);
      return renderChronicle(compacted, mode, characterName, characterTitle);
    }

    case '/history': {
      if (!journal) return '  No chronicle available.';
      const entityId = parts[1];
      if (!entityId) {
        const records = journal.serialize().records;
        const span = records.length > 0 ? records[records.length - 1].tick - records[0].tick : 0;
        return `  Chronicle: ${records.length} events recorded across ${span} ticks.`;
      }
      const records = journal.getInvolving(entityId);
      if (records.length === 0) return `  No events involving "${entityId}".`;
      return records
        .map((r) => `  [tick ${r.tick}] ${r.category}: ${r.description}`)
        .join('\n');
    }

    case '/divergences': {
      const divs = getDivergences(world);
      if (divs.length === 0) return '  No perception divergences recorded.';
      return divs
        .slice(-10)
        .map(
          (d) =>
            `  [tick ${d.tick}] ${d.objectiveType} (observer: ${d.observerId}, clarity: ${d.clarity ?? '?'})`,
        )
        .join('\n');
    }

    case '/status': {
      if (!statusData || !leverageState) return '  No status data available.';
      const topThreat = (activePressures ?? []).length > 0
        ? { description: activePressures![0].description, urgency: activePressures![0].urgency }
        : null;
      // Build economy summary for status line
      let economySummary: string | undefined;
      if (districtEconomies && districtEconomies.size > 0) {
        const scarceParts: string[] = [];
        const surplusParts: string[] = [];
        for (const [, econ] of districtEconomies) {
          const desc = deriveEconomyDescriptor(econ);
          for (const s of desc.scarcities) {
            if (!scarceParts.includes(s.category)) scarceParts.push(s.category);
          }
          for (const s of desc.surpluses) {
            if (!surplusParts.includes(s.category)) surplusParts.push(s.category);
          }
        }
        const parts: string[] = [];
        if (scarceParts.length > 0) parts.push(`${scarceParts.join(', ')} scarce`);
        if (surplusParts.length > 0) parts.push(`${surplusParts.join(', ')} plentiful`);
        if (parts.length > 0) economySummary = parts.join(', ');
      }
      // Build opportunity summary
      let opportunitySummary: string | undefined;
      const opps = activeOpportunities ?? [];
      const acceptedCount = getAcceptedOpportunities(opps).length;
      const availableCount = getAvailableOpportunities(opps).length;
      if (acceptedCount > 0 || availableCount > 0) {
        const parts: string[] = [];
        if (acceptedCount > 0) parts.push(`${acceptedCount} active`);
        if (availableCount > 0) parts.push(`${availableCount} available`);
        opportunitySummary = parts.join(', ');
      }
      // Materials summary (mirrors /materials, /craft)
      const materialsSummary = profileCustom
        ? formatMaterialsCompact(getMaterialInventory(profileCustom))
        : undefined;
      // Arc indicator (mirrors /arcs)
      const arcIndicator = arcSnapshot?.dominantArc
        ? `${arcSnapshot.dominantArc} (${arcSnapshot.signals.find((s) => s.kind === arcSnapshot.dominantArc)?.momentum ?? 'steady'})`
        : undefined;
      // Endgame indicator (mirrors /endgame) — only unacknowledged triggers
      const unacknowledgedTriggers = (endgameTriggers ?? []).filter((t) => !t.acknowledged);
      const endgameIndicator = unacknowledgedTriggers.length > 0
        ? unacknowledgedTriggers.map((t) => `${t.resolutionClass} (turn ${t.detectedAtTick})`).join(', ')
        : undefined;
      return renderCompactStatus({
        statusData,
        leverageState,
        topThreat,
        suggestedMove: suggestedMove ?? null,
        situationTag: situationTag ?? 'safe',
        economySummary,
        materialsSummary,
        opportunitySummary,
        arcIndicator,
        endgameIndicator,
      });
    }

    case '/stats': {
      if (!profileCustom) return '  No stats data available.';
      return renderStats(profileCustom);
    }

    case '/help': {
      const sub = parts[1];
      if (sub) return renderDirectorHelpExtended(sub);
      return renderDirectorHelp();
    }

    case '/party': {
      if (!partyState || partyState.companions.length === 0) {
        return '  No companions recruited. Use /recruit <npc-id> in play mode.';
      }
      // Build companion profiles for display
      const companionProfiles = (npcProfiles ?? [])
        .filter((p) => partyState.companions.some((c) => c.npcId === p.npcId))
        .map((p) => ({
          npcId: p.npcId,
          name: world.entities[p.npcId]?.name ?? p.npcId,
          breakpoint: p.breakpoint,
          goals: p.goals.map((g) => ({ label: g.verb, priority: g.priority })),
        }));
      // Build departure risks
      const departureRisks: Record<string, { risk: string; reason?: string }> = {};
      for (const comp of partyState.companions) {
        const profile = (npcProfiles ?? []).find((p) => p.npcId === comp.npcId);
        const assessment = evaluateDepartureRisk(comp, profile?.breakpoint);
        departureRisks[comp.npcId] = assessment;
      }
      return formatPartyForDirector(partyState, companionProfiles, departureRisks);
    }

    case '/item': {
      const itemId = parts[1];
      if (!itemId) {
        // List all equipped/inventory items
        if (!profile || !itemCatalog) return '  No profile or item catalog loaded.';
        return renderItemList(profile, itemCatalog, currentTick ?? 0);
      }
      if (!profile || !itemCatalog) return '  No profile or item catalog loaded.';
      return renderItemInspection(itemId, profile, itemCatalog, currentTick ?? 0);
    }

    // --- Opportunity Commands (v1.9) ---

    case '/jobs':
    case '/contracts': {
      const opps = activeOpportunities ?? [];
      if (opps.length === 0) return '  No opportunities available.';
      return formatOpportunityListForDirector(opps);
    }

    case '/contract': {
      const oppId = parts[1];
      if (!oppId) return '  Usage: /contract <opportunity-id>';
      const opps = activeOpportunities ?? [];
      const opp = getOpportunityById(opps, oppId);
      if (!opp) return `  Opportunity "${oppId}" not found.`;
      return formatOpportunityForDirector(opp);
    }

    case '/accepted': {
      const accepted = getAcceptedOpportunities(activeOpportunities ?? []);
      if (accepted.length === 0) return '  No accepted opportunities.';
      return formatOpportunityListForDirector(accepted);
    }

    // --- Crafting Commands (v1.8) ---

    case '/craft': {
      if (!profileCustom) return '  No profile loaded.';
      const recipes = getAvailableRecipes(genre ?? 'fantasy');
      const materials = getMaterialInventory(profileCustom);
      return formatAvailableRecipesForDirector(recipes, materials);
    }

    case '/materials': {
      if (!profileCustom) return '  No profile loaded.';
      const materials = getMaterialInventory(profileCustom);
      return formatMaterialsForDirector(materials);
    }

    case '/salvage': {
      const itemId = parts[1];
      if (!itemId) return '  Usage: /salvage <item-id>';
      if (!itemCatalog) return '  No item catalog loaded.';
      const item = itemCatalog.items.find(
        (i) => i.id.toLowerCase().includes(itemId.toLowerCase()) ||
          i.name.toLowerCase().includes(itemId.toLowerCase()),
      );
      if (!item) return `  Item "${itemId}" not found.`;
      const result = salvageItem(item);
      return formatSalvagePreview(item, result);
    }

    case '/arcs': {
      if (!arcSnapshot) return '  No arc data yet — play a few turns first.';
      return formatArcForDirector(arcSnapshot);
    }

    case '/endgame': {
      if (!endgameTriggers || endgameTriggers.length === 0) {
        return '  No endgame triggers detected yet.';
      }
      const lines: string[] = ['', `  ${divider()}`, '  ENDGAME TRIGGERS', `  ${divider()}`, ''];
      for (const trigger of endgameTriggers) {
        lines.push(formatEndgameForDirector(trigger));
        lines.push('');
      }
      return lines.join('\n');
    }

    case '/finale': {
      if (!finaleOutline) return '  No finale generated yet. Use /conclude in play mode to generate one.';
      return formatFinaleForDirector(finaleOutline);
    }

    default:
      return `  Unknown command: ${cmd}. Type /help for available commands.`;
  }
}

function renderZoneInspection(z: Record<string, unknown>): string {
  const parts: string[] = [`  Zone: ${z.name ?? z.id}`];
  if (z.tags) parts.push(`  Tags: ${(z.tags as string[]).join(', ')}`);
  if (z.light != null) parts.push(`  Light: ${z.light}`);
  if (z.noise != null) parts.push(`  Noise: ${z.noise}`);
  if (z.stability != null) parts.push(`  Stability: ${z.stability}`);
  if (z.entityCount != null) parts.push(`  Entities: ${z.entityCount}`);
  return parts.join('\n');
}

function renderStats(custom: Record<string, string | number | boolean>): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(divider());
  lines.push('  SESSION STATS');
  lines.push(divider());

  // Leverage action counts
  const actionKeys = Object.keys(custom).filter((k) => k.startsWith('stats.action.'));
  if (actionKeys.length > 0) {
    lines.push('');
    lines.push('  ACTIONS USED');
    for (const key of actionKeys.sort()) {
      const label = key.replace('stats.action.', '').replace('.', ' > ');
      lines.push(`    ${label}: ${custom[key]}`);
    }
  }

  // Leverage currency flow
  const gainKeys = Object.keys(custom).filter((k) => k.startsWith('stats.leverage.') && k.endsWith('.gained'));
  if (gainKeys.length > 0) {
    lines.push('');
    lines.push('  LEVERAGE FLOW');
    for (const key of gainKeys.sort()) {
      const currency = key.replace('stats.leverage.', '').replace('.gained', '');
      const gained = custom[key] ?? 0;
      const spent = custom[`stats.leverage.${currency}.spent`] ?? 0;
      lines.push(`    ${currency}: +${gained} / -${spent}`);
    }
  }

  if (actionKeys.length === 0 && gainKeys.length === 0) {
    lines.push('');
    lines.push('  No leverage actions taken yet.');
  }

  lines.push('');
  lines.push(divider());
  lines.push('');
  return lines.join('\n');
}

function renderItemList(profile: CharacterProfile, catalog: ItemCatalog, tick: number): string {
  const lines: string[] = ['', divider(), '  EQUIPMENT', divider(), ''];
  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = profile.loadout.equipped[slot];
    if (!itemId) {
      lines.push(`  ${slot}: (empty)`);
      continue;
    }
    const item = catalog.items.find((i) => i.id === itemId);
    if (!item) {
      lines.push(`  ${slot}: ${itemId} (unknown)`);
      continue;
    }
    const chronicle = getItemHistory(profile.itemChronicle, itemId);
    const relic = evaluateRelicGrowth(item, chronicle, tick);
    const name = relic.currentEpithet ?? item.name;
    const tierLabel = relic.tier > 0 ? ` [${TIER_LABELS[relic.tier]}]` : '';
    lines.push(`  ${slot}: ${name} (${item.rarity})${tierLabel}`);
  }
  if (profile.loadout.inventory.length > 0) {
    lines.push('');
    lines.push('  INVENTORY');
    for (const itemId of profile.loadout.inventory) {
      const item = catalog.items.find((i) => i.id === itemId);
      lines.push(`    ${item?.name ?? itemId}`);
    }
  }
  lines.push('', `  Use /item <item-id> to inspect a specific item.`, '');
  return lines.join('\n');
}

function renderItemInspection(itemId: string, profile: CharacterProfile, catalog: ItemCatalog, tick: number): string {
  const item = catalog.items.find((i) => i.id === itemId);
  if (!item) return `  Item "${itemId}" not found in catalog.`;

  const chronicle = getItemHistory(profile.itemChronicle, itemId);
  const relic = evaluateRelicGrowth(item, chronicle, tick);
  const isEquipped = Object.values(profile.loadout.equipped).includes(itemId);

  const lines: string[] = ['', divider()];
  lines.push(`  ITEM: ${getRelicEpithet(item, relic)}`);
  lines.push(divider());
  lines.push('');
  lines.push(`  Slot: ${item.slot} | Rarity: ${item.rarity} | Equipped: ${isEquipped ? 'yes' : 'no'}`);

  // Provenance
  lines.push(`  ${formatProvenanceForDirector(item, chronicle)}`);

  // Relic state
  if (relic.tier > 0) {
    lines.push(`  Relic tier: ${relic.tier} (${TIER_LABELS[relic.tier]}) | Epithet: "${relic.currentEpithet}"`);
  }

  // Chronicle stats
  const killCount = getItemKillCount(profile.itemChronicle, itemId);
  const age = getItemAge(profile.itemChronicle, itemId, tick);
  lines.push(`  Kill count: ${killCount} | Age: ${age} ticks`);

  // Chronicle (last 5)
  if (chronicle.length > 0) {
    lines.push('');
    lines.push('  Chronicle (last 5):');
    const recent = chronicle.slice(-5);
    for (const entry of recent) {
      const zone = entry.zoneId ? ` [${entry.zoneId}]` : '';
      lines.push(`    tick ${entry.tick}: ${entry.event} — ${entry.detail}${zone}`);
    }
  }

  // Stat mods
  if (item.statModifiers && Object.keys(item.statModifiers).length > 0) {
    const mods = Object.entries(item.statModifiers).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ');
    lines.push(`  Stat mods: ${mods}`);
  }

  // Tags
  if (item.grantedTags && item.grantedTags.length > 0) {
    lines.push(`  Tags: ${item.grantedTags.join(', ')}`);
  }

  lines.push('', divider(), '');
  return lines.join('\n');
}

function renderSnapshot(snapshot: Record<string, unknown>): string {
  const parts: string[] = [
    `${divider()}`,
    `  SIMULATION SNAPSHOT — tick ${snapshot.tick ?? '?'}`,
    `${divider()}`,
  ];
  if (snapshot.entityCount != null) parts.push(`  Entities: ${snapshot.entityCount}`);
  if (snapshot.factionCount != null) parts.push(`  Factions: ${snapshot.factionCount}`);
  if (snapshot.zoneCount != null) parts.push(`  Zones: ${snapshot.zoneCount}`);
  if (snapshot.eventCount != null) parts.push(`  Events: ${snapshot.eventCount}`);
  return parts.join('\n');
}
