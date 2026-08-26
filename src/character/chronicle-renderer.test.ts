import { describe, it, expect } from 'vitest';
import { renderChronicle } from './chronicle-renderer.js';
import type { CampaignRecord } from '@ai-rpg-engine/campaign-memory';
import type { CompactedChronicle } from '../session/chronicle.js';

function makeRecord(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: 'rec-1',
    tick: 5,
    category: 'kill',
    actorId: 'player',
    description: 'defeated a bandit',
    significance: 0.5,
    witnesses: [],
    data: {},
    ...overrides,
  };
}

function makeChronicle(records: CampaignRecord[]): CompactedChronicle {
  return {
    canonicalEvents: records,
    eraSummaries: [],
    totalRecords: records.length,
  };
}

describe('renderChronicle bardic mode', () => {
  it('should render a dramatic passage for a positive tick', () => {
    const chronicle = makeChronicle([makeRecord({ tick: 5, category: 'kill' })]);
    const result = renderChronicle(chronicle, 'bardic', 'Kael');
    expect(result).toContain('Kael');
    expect(result).toContain('defeated a bandit');
  });

  // F-20ec59de sibling: renderRecordBardic indexes BARDIC_OPENERS[category] with
  // `record.tick % openers.length` — the same bare-modulo-on-a-plain-number pattern
  // as generateAmbientLine's seed bug. CampaignRecord.tick is typed as a plain
  // `number` with no non-negative constraint, so a negative tick would otherwise
  // index the openers array out of range and throw on the following .replace() call.
  it('should not throw and should still render for a negative tick', () => {
    const chronicle = makeChronicle([makeRecord({ tick: -1, category: 'kill' })]);
    expect(() => renderChronicle(chronicle, 'bardic', 'Kael')).not.toThrow();
    const result = renderChronicle(chronicle, 'bardic', 'Kael');
    expect(result).toContain('Kael');
    expect(result).toContain('defeated a bandit');
  });

  it('should produce deterministic output for the same negative tick', () => {
    const chronicle = makeChronicle([makeRecord({ tick: -1, category: 'kill' })]);
    const a = renderChronicle(chronicle, 'bardic', 'Kael');
    const b = renderChronicle(chronicle, 'bardic', 'Kael');
    expect(a).toBe(b);
  });
});
