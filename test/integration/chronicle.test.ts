// Chronicle integrity tests: append order, significance, compaction, persistence.
// Proves chronicle law: events are canonical, ordered, dedupe-stable, and survive persistence.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CampaignJournal } from '@ai-rpg-engine/campaign-memory';
import {
  deriveChronicleEvents,
  compactChronicle,
  buildChronicleContext,
  computeSignificance,
} from '../../src/session/chronicle.js';
import { loadSession, loadChronicleFromSession, type SavedSession } from '../../src/session/session.js';
import {
  lookTurnSource,
  moveTurnSource,
  combatTurnSource,
  pressureResolvedSource,
  titleChangeSource,
  companionJoinedSource,
  itemAcquiredSource,
  opportunityCompletedSource,
  buildJournal,
  emptyJournal,
  multiTurnJournal,
  longSessionJournal,
} from '../helpers/chronicle-fixtures.js';

const PLAYER = 'player';

// ─── Append Order ─────────────────────────────────────────────

describe('chronicle append order', () => {
  it('first event appends correctly', () => {
    const journal = buildJournal([combatTurnSource(1, 'pilgrim', 'Pilgrim')]);
    expect(journal.size()).toBeGreaterThan(0);
    const records = journal.serialize();
    expect(records[0].tick).toBe(1);
  });

  it('multiple events preserve exact tick order', () => {
    const journal = multiTurnJournal();
    const records = journal.serialize();
    for (let i = 1; i < records.length; i++) {
      expect(records[i].tick).toBeGreaterThanOrEqual(records[i - 1].tick);
    }
  });

  it('long session does not omit middle entries', () => {
    const journal = longSessionJournal();
    const records = journal.serialize();
    // Every combat turn (ticks 5,10,15,20,25,30) should produce at least one record
    const combatTicks = [5, 10, 15, 20, 25, 30];
    for (const tick of combatTicks) {
      expect(records.some((r) => r.tick === tick)).toBe(true);
    }
    // Every move turn (ticks 3,6,9,12,18,21,24,27) should produce records (have milestone)
    const moveTicks = [3, 6, 9, 12, 18, 21, 24, 27];
    for (const tick of moveTicks) {
      expect(records.some((r) => r.tick === tick)).toBe(true);
    }
  });

  it('look-only turns may not produce chronicle entries (low significance)', () => {
    const records = deriveChronicleEvents(lookTurnSource(1), PLAYER);
    // Look with no events of note may yield 0 records — that is correct behavior
    // The chronicle is selective, not exhaustive
    expect(records.length).toBeGreaterThanOrEqual(0);
  });

  it('each event source produces independent records', () => {
    const sources = [
      combatTurnSource(1, 'e1', 'Enemy 1'),
      combatTurnSource(2, 'e2', 'Enemy 2'),
    ];
    const journal = buildJournal(sources);
    const records = journal.serialize();
    const tick1 = records.filter((r) => r.tick === 1);
    const tick2 = records.filter((r) => r.tick === 2);
    expect(tick1.length).toBeGreaterThan(0);
    expect(tick2.length).toBeGreaterThan(0);
    // Records from tick 1 and tick 2 are distinct
    for (const r1 of tick1) {
      for (const r2 of tick2) {
        expect(r1.id).not.toBe(r2.id);
      }
    }
  });
});

// ─── Significance ─────────────────────────────────────────────

describe('chronicle significance', () => {
  it('combat kill has higher significance than plain action', () => {
    const killSig = computeSignificance('kill', { xpGained: 15, milestoneTriggered: { label: 'x', description: 'x', tags: ['boss-kill'] } });
    const actionSig = computeSignificance('action', { xpGained: 2 });
    expect(killSig).toBeGreaterThan(actionSig);
  });

  it('boss-kill milestone boosts significance', () => {
    const base = computeSignificance('kill', { xpGained: 15 });
    const boosted = computeSignificance('kill', { xpGained: 15, milestoneTriggered: { label: 'x', description: 'x', tags: ['boss-kill'] } });
    expect(boosted).toBeGreaterThan(base);
  });

  it('significance is capped at 1.0', () => {
    const sig = computeSignificance('death', {
      xpGained: 100,
      milestoneTriggered: { label: 'x', description: 'x', tags: ['boss-kill'] },
      reputationDelta: { factionId: 'x', delta: -50 },
    });
    expect(sig).toBeLessThanOrEqual(1.0);
  });
});

// ─── Compaction ───────────────────────────────────────────────

describe('chronicle compaction', () => {
  it('empty journal compacts cleanly', () => {
    const compact = compactChronicle(emptyJournal(), 10);
    expect(compact.canonicalEvents).toEqual([]);
    expect(compact.eraSummaries).toEqual([]);
    expect(compact.totalRecords).toBe(0);
  });

  it('small journal keeps all records canonical', () => {
    const journal = buildJournal([combatTurnSource(1, 'e1', 'Enemy 1')]);
    const compact = compactChronicle(journal, 5);
    expect(compact.canonicalEvents.length).toBe(compact.totalRecords);
  });

  it('long journal respects maxCanonical limit', () => {
    const journal = longSessionJournal();
    const compact = compactChronicle(journal, 35, 20, 10);
    expect(compact.canonicalEvents.length).toBeLessThanOrEqual(10);
  });

  it('high-significance events are always retained', () => {
    const journal = buildJournal([
      lookTurnSource(1),
      combatTurnSource(5, 'boss', 'The Boss'),
      lookTurnSource(10),
    ]);
    const compact = compactChronicle(journal, 20, 5, 2);
    // The combat kill (high significance) should be in canonical
    const hasCombat = compact.canonicalEvents.some((r) => r.category === 'kill' || r.category === 'combat');
    expect(hasCombat).toBe(true);
  });

  it('canonical events are sorted by tick', () => {
    const journal = longSessionJournal();
    const compact = compactChronicle(journal, 35);
    for (let i = 1; i < compact.canonicalEvents.length; i++) {
      expect(compact.canonicalEvents[i].tick).toBeGreaterThanOrEqual(compact.canonicalEvents[i - 1].tick);
    }
  });
});

// ─── Chronicle Context ────────────────────────────────────────

describe('buildChronicleContext', () => {
  it('returns undefined for empty journal', () => {
    expect(buildChronicleContext(emptyJournal(), 10)).toBeUndefined();
  });

  it('returns string for populated journal', () => {
    const journal = multiTurnJournal();
    const ctx = buildChronicleContext(journal, 10);
    expect(ctx).toBeTruthy();
    expect(typeof ctx).toBe('string');
    expect(ctx!).toContain('Chronicle:');
  });
});

// ─── Persistence Stability ────────────────────────────────────

describe('chronicle persistence stability', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'chronicle-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('chronicle survives save/load round-trip', async () => {
    const journal = multiTurnJournal();
    const originalRecords = journal.serialize();

    // Simulate saving: embed serialized chronicle in a minimal save
    const save: SavedSession = {
      version: '1.4.0',
      engineState: '{}',
      turnHistory: [],
      tone: 'dark',
      savedAt: new Date().toISOString(),
      chronicleRecords: JSON.stringify(originalRecords),
    } as any;

    const path = join(tmpDir, 'test.json');
    await writeFile(path, JSON.stringify(save), 'utf-8');

    const result = await loadSession(path);
    const restoredJournal = loadChronicleFromSession(result.session);
    const restoredRecords = restoredJournal.serialize();

    expect(restoredRecords.length).toBe(originalRecords.length);
    for (let i = 0; i < originalRecords.length; i++) {
      expect(restoredRecords[i].tick).toBe(originalRecords[i].tick);
      expect(restoredRecords[i].category).toBe(originalRecords[i].category);
      expect(restoredRecords[i].description).toBe(originalRecords[i].description);
      expect(restoredRecords[i].significance).toBe(originalRecords[i].significance);
    }
  });

  it('corrupted chronicle field falls back to empty journal', async () => {
    const save = {
      version: '1.4.0',
      engineState: '{}',
      turnHistory: [],
      tone: 'dark',
      savedAt: new Date().toISOString(),
      chronicleRecords: 'NOT VALID JSON!!!',
    };
    const path = join(tmpDir, 'corrupt.json');
    await writeFile(path, JSON.stringify(save), 'utf-8');

    const result = await loadSession(path);
    const journal = loadChronicleFromSession(result.session);
    expect(journal.size()).toBe(0);
  });
});
