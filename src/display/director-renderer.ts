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
} from '@ai-rpg-engine/modules';

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

    case '/help':
      return renderDirectorHelp();

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
