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
} from '@ai-rpg-engine/modules';
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
import { renderDirectorHelpExtended } from './help-system.js';
import { renderCompactStatus } from './status-compact.js';
import type { ScoredMove } from '@ai-rpg-engine/modules';
import type { StatusData } from '../character/presence.js';

const DIVIDER = '─'.repeat(60);

/** Render director mode help. */
export function renderDirectorHelp(): string {
  return `
${DIVIDER}
  DIRECTOR MODE — inspect the hidden truth
${DIVIDER}

  /inspect <entity-id>          Show entity cognition state
  /faction <faction-id>         Show faction beliefs and alert
  /zone <zone-id>               Show zone properties
  /trace <entity> <subject> <key>  Trace belief provenance
  /rumors [faction-id]          Show player rumors (optionally filtered)
  /pressures                    Show active world pressures
  /world                        Show resolved pressures and fallout
  /factions                     Show faction agency (goals, actions, profiles)
  /people [zone]                Show named NPCs (goals, stance, last action)
  /npc <npc-id>                 Inspect individual NPC agency state
  /leverage                     Show player leverage currencies
  /map                          Show strategic map (districts + factions)
  /party                        Show companion party state
  /item <item-id>               Inspect item provenance, chronicle, relic state
  /districts                    Show all districts with mood + metrics
  /district <id>                Deep inspect a specific district
  /status                       Compact strategic snapshot
  /stats                        Session balance metrics
  /help leverage                Full leverage verb reference
  /help <pack-id>               Pack-specific quickstart guide
  /chronicle [mode]             View campaign chronicle (timeline|bardic|director)
  /history [entity-id]          View event history for an entity
  /snapshot                     Full simulation snapshot
  /divergences                  Show perception divergences
  /back                         Return to play mode

${DIVIDER}
`;
}

/** Execute a director command and return the rendered output. */
export function executeDirectorCommand(
  command: string,
  world: WorldState,
  playerRumors?: PlayerRumor[],
  activePressures?: WorldPressure[],
  resolvedPressures?: PressureFallout[],
  journal?: CampaignJournal,
  currentTick?: number,
  characterName?: string,
  characterTitle?: string,
  factionProfiles?: FactionProfile[],
  lastFactionActions?: FactionActionResult[],
  leverageState?: LeverageState,
  strategicMap?: StrategicMap,
  statusData?: StatusData,
  suggestedMove?: ScoredMove | null,
  situationTag?: string,
  profileCustom?: Record<string, string | number | boolean>,
  npcProfiles?: NpcProfile[],
  lastNpcActions?: NpcActionResult[],
  npcObligations?: Map<string, NpcObligationLedger>,
  partyState?: PartyState,
  profile?: CharacterProfile | null,
  itemCatalog?: ItemCatalog | null,
): string {
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
      return `\n${DIVIDER}\n${header}\n${DIVIDER}\n\n${filtered.map(formatRumorForDirector).join('\n\n')}\n`;
    }

    case '/pressures': {
      const pressures = activePressures ?? [];
      if (pressures.length === 0) return '  No active world pressures.';
      const header = `  WORLD PRESSURES (${pressures.length})`;
      return `\n${DIVIDER}\n${header}\n${DIVIDER}\n\n${pressures.map(formatPressureForDirector).join('\n\n')}\n`;
    }

    case '/world':
    case '/aftermath': {
      const resolved = resolvedPressures ?? [];
      if (resolved.length === 0) return '  No pressures have been resolved yet.';
      const header = `  RESOLUTION HISTORY (${resolved.length})`;
      return `\n${DIVIDER}\n${header}\n${DIVIDER}\n\n${resolved.map(formatFalloutForDirector).join('\n\n')}\n`;
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
        const records = journal.serialize();
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
      return renderCompactStatus({
        statusData,
        leverageState,
        topThreat,
        suggestedMove: suggestedMove ?? null,
        situationTag: situationTag ?? 'safe',
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
  lines.push(DIVIDER);
  lines.push('  SESSION STATS');
  lines.push(DIVIDER);

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
  lines.push(DIVIDER);
  lines.push('');
  return lines.join('\n');
}

function renderItemList(profile: CharacterProfile, catalog: ItemCatalog, tick: number): string {
  const lines: string[] = ['', DIVIDER, '  EQUIPMENT', DIVIDER, ''];
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

  const lines: string[] = ['', DIVIDER];
  lines.push(`  ITEM: ${getRelicEpithet(item, relic)}`);
  lines.push(DIVIDER);
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

  lines.push('', DIVIDER, '');
  return lines.join('\n');
}

function renderSnapshot(snapshot: Record<string, unknown>): string {
  const parts: string[] = [
    `${DIVIDER}`,
    `  SIMULATION SNAPSHOT — tick ${snapshot.tick ?? '?'}`,
    `${DIVIDER}`,
  ];
  if (snapshot.entityCount != null) parts.push(`  Entities: ${snapshot.entityCount}`);
  if (snapshot.factionCount != null) parts.push(`  Factions: ${snapshot.factionCount}`);
  if (snapshot.zoneCount != null) parts.push(`  Zones: ${snapshot.zoneCount}`);
  if (snapshot.eventCount != null) parts.push(`  Events: ${snapshot.eventCount}`);
  return parts.join('\n');
}
