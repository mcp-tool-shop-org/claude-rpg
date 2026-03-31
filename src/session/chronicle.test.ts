import { describe, it, expect, vi } from 'vitest';
import {
  computeSignificance,
  deriveChronicleEvents,
  compactChronicle,
  buildChronicleContext,
} from './chronicle.js';
import type { ChronicleEventSource } from './chronicle.js';
import type { ProfileUpdateHints } from '../turn-loop.js';
import { CampaignJournal } from '@ai-rpg-engine/campaign-memory';
import { getDefaultSaveDir, loadSession } from './session.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { writeFile, mkdir, unlink, rmdir } from 'node:fs/promises';

// --- Helpers ---

const emptyHints: ProfileUpdateHints = { xpGained: 0 };
const playerId = 'player-1';

function makeJournalWithRecords(
  records: Array<{ tick: number; category: string; significance: number; description: string }>,
): CampaignJournal {
  const journal = new CampaignJournal();
  for (const r of records) {
    journal.record({
      tick: r.tick,
      category: r.category as any,
      actorId: playerId,
      description: r.description,
      significance: r.significance,
      witnesses: [],
      data: {},
    });
  }
  return journal;
}

// --- computeSignificance ---

describe('computeSignificance', () => {
  it('returns base significance for death category', () => {
    expect(computeSignificance('death', emptyHints)).toBe(1.0);
  });

  it('returns base significance for action category', () => {
    expect(computeSignificance('action', emptyHints)).toBe(0.2);
  });

  it('adds 0.1 for milestone triggered', () => {
    const hints: ProfileUpdateHints = {
      xpGained: 10,
      milestoneTriggered: { label: 'First Blood', description: 'Killed an enemy', tags: ['combat'] },
    };
    const sig = computeSignificance('combat', hints);
    expect(sig).toBeCloseTo(0.5); // 0.4 base + 0.1 milestone
  });

  it('adds bonus for boss-kill milestone', () => {
    const hints: ProfileUpdateHints = {
      xpGained: 10,
      milestoneTriggered: { label: 'Boss Slain', description: 'Killed the boss', tags: ['boss-kill'] },
    };
    const sig = computeSignificance('kill', hints);
    // 0.8 base + 0.1 milestone + 0.1 boss-kill = 1.0
    expect(sig).toBe(1.0);
  });

  it('adds 0.05 for large reputation delta', () => {
    const hints: ProfileUpdateHints = {
      xpGained: 0,
      reputationDelta: { factionId: 'guild', delta: 15 },
    };
    const sig = computeSignificance('action', hints);
    expect(sig).toBeCloseTo(0.25); // 0.2 + 0.05
  });

  it('caps at 1.0', () => {
    const hints: ProfileUpdateHints = {
      xpGained: 100,
      milestoneTriggered: { label: 'Epic', description: 'Epic moment', tags: ['boss-kill'] },
      reputationDelta: { factionId: 'guild', delta: 50 },
    };
    expect(computeSignificance('death', hints)).toBe(1.0);
  });

  it('returns 0.2 for unknown category', () => {
    expect(computeSignificance('nonexistent' as any, emptyHints)).toBe(0.2);
  });
});

// --- deriveChronicleEvents ---

describe('deriveChronicleEvents', () => {
  it('derives kill event from combat.entity.defeated', () => {
    const source: ChronicleEventSource = {
      kind: 'turn',
      events: [{ type: 'combat.entity.defeated', payload: { entityId: 'npc-1', entityName: 'Goblin' }, targetIds: ['npc-1'] } as any],
      hints: emptyHints,
      tick: 5,
      zoneId: 'cave',
    };
    const records = deriveChronicleEvents(source, playerId);
    expect(records).toHaveLength(1);
    expect(records[0].category).toBe('kill');
    expect(records[0].description).toContain('Goblin');
  });

  it('derives discovery from zone.entered with landmark tag', () => {
    const source: ChronicleEventSource = {
      kind: 'turn',
      events: [{ type: 'world.zone.entered', payload: { zoneName: 'Ancient Ruins', tags: ['landmark'], zoneId: 'ruins' }, targetIds: [] } as any],
      hints: emptyHints,
      tick: 10,
      zoneId: 'ruins',
    };
    const records = deriveChronicleEvents(source, playerId);
    expect(records).toHaveLength(1);
    expect(records[0].category).toBe('discovery');
    expect(records[0].description).toContain('Ancient Ruins');
  });

  it('derives pressure-resolved event', () => {
    const source: ChronicleEventSource = {
      kind: 'pressure-resolved',
      fallout: {
        resolution: { pressureId: 'p1', pressureKind: 'security', resolutionType: 'resolved-by-player', resolvedBy: 'player', resolutionVisibility: 'known' },
        summary: 'Guard threat neutralized',
        effects: [],
      } as any,
      tick: 20,
    };
    const records = deriveChronicleEvents(source, playerId);
    expect(records).toHaveLength(1);
    expect(records[0].category).toBe('combat');
    expect(records[0].actorId).toBe(playerId);
  });

  it('derives title-change event', () => {
    const source: ChronicleEventSource = {
      kind: 'title-change',
      oldTitle: 'Wanderer',
      newTitle: 'Legendary Wanderer',
      tick: 30,
    };
    const records = deriveChronicleEvents(source, playerId);
    expect(records).toHaveLength(1);
    expect(records[0].description).toContain('Wanderer');
    expect(records[0].description).toContain('Legendary Wanderer');
  });

  it('derives rumor-spawned event', () => {
    const source: ChronicleEventSource = {
      kind: 'rumor-spawned',
      rumor: { id: 'r1', claim: 'They say the hero is cursed', valence: 'fearsome' } as any,
      tick: 15,
    };
    const records = deriveChronicleEvents(source, playerId);
    expect(records).toHaveLength(1);
    expect(records[0].description).toContain('cursed');
  });

  it('derives companion-joined event', () => {
    const source: ChronicleEventSource = {
      kind: 'companion-joined',
      npcId: 'npc-2',
      npcName: 'Aria',
      role: 'scout',
      tick: 25,
    };
    const records = deriveChronicleEvents(source, playerId);
    expect(records).toHaveLength(1);
    expect(records[0].category).toBe('companion-joined');
    expect(records[0].description).toContain('Aria');
  });

  it('derives companion-died event with max significance', () => {
    const source: ChronicleEventSource = {
      kind: 'companion-died',
      npcId: 'npc-3',
      npcName: 'Gareth',
      tick: 50,
    };
    const records = deriveChronicleEvents(source, playerId);
    expect(records).toHaveLength(1);
    expect(records[0].significance).toBe(1.0);
  });

  it('derives item-acquired event', () => {
    const source: ChronicleEventSource = {
      kind: 'item-acquired',
      itemId: 'sword-1',
      itemName: 'Flameblade',
      source: 'looted from boss',
      tick: 12,
    };
    const records = deriveChronicleEvents(source, playerId);
    expect(records).toHaveLength(1);
    expect(records[0].category).toBe('item-acquired');
    expect(records[0].description).toContain('Flameblade');
  });

  it('derives opportunity-completed event', () => {
    const source: ChronicleEventSource = {
      kind: 'opportunity-completed',
      opportunity: { id: 'o1', kind: 'contract', title: 'Deliver Cargo' } as any,
      tick: 40,
    };
    const records = deriveChronicleEvents(source, playerId);
    expect(records).toHaveLength(1);
    expect(records[0].category).toBe('opportunity-completed');
    expect(records[0].significance).toBe(0.7);
  });

  it('derives opportunity-expired event with world actor', () => {
    const source: ChronicleEventSource = {
      kind: 'opportunity-expired',
      opportunity: { id: 'o2', kind: 'bounty', title: 'Hunt the Fugitive' } as any,
      tick: 45,
    };
    const records = deriveChronicleEvents(source, playerId);
    expect(records).toHaveLength(1);
    expect(records[0].actorId).toBe('world');
  });

  it('derives faction-action event', () => {
    const source: ChronicleEventSource = {
      kind: 'faction-action',
      action: { factionId: 'guild', verb: 'retaliate', description: 'Guild retaliates' } as any,
      tick: 55,
    };
    const records = deriveChronicleEvents(source, playerId);
    expect(records).toHaveLength(1);
    expect(records[0].category).toBe('combat');
  });

  it('derives supply-crisis event', () => {
    const source: ChronicleEventSource = {
      kind: 'supply-crisis',
      districtId: 'docks',
      category: 'food',
      level: 2,
      tick: 60,
    };
    const records = deriveChronicleEvents(source, playerId);
    expect(records).toHaveLength(1);
    expect(records[0].description).toContain('food');
    expect(records[0].description).toContain('docks');
  });
});

// --- compactChronicle ---

describe('compactChronicle', () => {
  it('returns empty compaction for empty journal', () => {
    const journal = new CampaignJournal();
    const result = compactChronicle(journal, 100);
    expect(result.canonicalEvents).toHaveLength(0);
    expect(result.eraSummaries).toHaveLength(0);
    expect(result.totalRecords).toBe(0);
  });

  it('keeps high-significance events in canonical regardless of age', () => {
    const journal = makeJournalWithRecords([
      { tick: 1, category: 'death', significance: 0.9, description: 'Ancient death' },
      { tick: 90, category: 'action', significance: 0.1, description: 'Recent minor' },
    ]);
    const result = compactChronicle(journal, 100);
    const descs = result.canonicalEvents.map((e) => e.description);
    expect(descs).toContain('Ancient death');
  });

  it('keeps recent moderate-significance events in canonical', () => {
    const journal = makeJournalWithRecords([
      { tick: 95, category: 'action', significance: 0.4, description: 'Recent action' },
    ]);
    const result = compactChronicle(journal, 100, 20, 15);
    expect(result.canonicalEvents).toHaveLength(1);
  });

  it('groups older low-significance events into era summaries', () => {
    const records = Array.from({ length: 20 }, (_, i) => ({
      tick: i,
      category: 'action',
      significance: 0.15,
      description: `Minor event ${i}`,
    }));
    const journal = makeJournalWithRecords(records);
    const result = compactChronicle(journal, 100, 20, 5);
    expect(result.eraSummaries.length).toBeGreaterThan(0);
    expect(result.eraSummaries[0].eventCount).toBeGreaterThan(0);
  });

  it('trims canonical to maxCanonical limit', () => {
    const records = Array.from({ length: 30 }, (_, i) => ({
      tick: 80 + i,
      category: 'kill',
      significance: 0.8,
      description: `Kill ${i}`,
    }));
    const journal = makeJournalWithRecords(records);
    const result = compactChronicle(journal, 110, 50, 10);
    expect(result.canonicalEvents.length).toBeLessThanOrEqual(10);
  });

  it('re-sorts canonical events by tick after trimming', () => {
    const records = [
      { tick: 5, category: 'death', significance: 1.0, description: 'Early death' },
      { tick: 50, category: 'kill', significance: 0.8, description: 'Mid kill' },
      { tick: 90, category: 'alliance', significance: 0.7, description: 'Late alliance' },
    ];
    const journal = makeJournalWithRecords(records);
    const result = compactChronicle(journal, 100, 20, 15);
    for (let i = 1; i < result.canonicalEvents.length; i++) {
      expect(result.canonicalEvents[i].tick).toBeGreaterThanOrEqual(result.canonicalEvents[i - 1].tick);
    }
  });
});

// --- buildChronicleContext ---

describe('buildChronicleContext', () => {
  it('returns undefined for empty journal', () => {
    const journal = new CampaignJournal();
    expect(buildChronicleContext(journal, 100)).toBeUndefined();
  });

  it('returns a string containing event count', () => {
    const journal = makeJournalWithRecords([
      { tick: 1, category: 'kill', significance: 0.8, description: 'Slew a dragon' },
      { tick: 10, category: 'discovery', significance: 0.6, description: 'Found the temple' },
    ]);
    const ctx = buildChronicleContext(journal, 20);
    expect(ctx).toContain('2 events');
  });

  it('includes the top significant events', () => {
    const journal = makeJournalWithRecords([
      { tick: 1, category: 'kill', significance: 0.9, description: 'Slew the Lich King' },
      { tick: 5, category: 'action', significance: 0.1, description: 'Opened a door' },
    ]);
    const ctx = buildChronicleContext(journal, 10)!;
    expect(ctx).toContain('Lich King');
  });

  it('limits to 5 events max in context', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      tick: i,
      category: 'kill',
      significance: 0.9 - i * 0.05,
      description: `Event-${i}`,
    }));
    const journal = makeJournalWithRecords(records);
    const ctx = buildChronicleContext(journal, 20)!;
    // Count distinct events by matching pattern
    const mentions = records.filter((r) => ctx.includes(r.description));
    expect(mentions.length).toBeLessThanOrEqual(5);
  });
});

// B-004: getDefaultSaveDir uses homedir instead of cwd
describe('getDefaultSaveDir', () => {
  it('uses homedir not cwd', () => {
    const dir = getDefaultSaveDir();
    const expected = join(homedir(), '.claude-rpg', 'saves');
    expect(dir).toBe(expected);
  });

  it('does not contain process.cwd()', () => {
    const dir = getDefaultSaveDir();
    // Unless homedir happens to equal cwd, the path should be home-based
    expect(dir.startsWith(homedir())).toBe(true);
  });
});

// B-006: loadSession rejects oversized files
describe('loadSession — file size limit', () => {
  const tmpDir = join(homedir(), '.claude-rpg-test-tmp');
  const bigFilePath = join(tmpDir, 'too-big.json');

  it('rejects files larger than 10MB', async () => {
    // Create a tmp dir and write a >10MB file
    await mkdir(tmpDir, { recursive: true });
    // 11MB of JSON-like data
    const bigContent = '{"data":"' + 'x'.repeat(11 * 1024 * 1024) + '"}';
    await writeFile(bigFilePath, bigContent);

    try {
      await expect(loadSession(bigFilePath)).rejects.toThrow(/too large/);
    } finally {
      await unlink(bigFilePath).catch(() => {});
      await rmdir(tmpDir).catch(() => {});
    }
  });
});
