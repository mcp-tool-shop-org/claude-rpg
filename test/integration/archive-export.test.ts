// Archive and export tests: prove output uses canonical state, not stale narration.
// Validates structural correctness and graceful degradation for missing optional data.

import { describe, it, expect } from 'vitest';
import { CampaignJournal } from '@ai-rpg-engine/campaign-memory';
import {
  exportChronicleMarkdown,
  exportChronicleJSON,
  exportFinaleMarkdown,
} from '../../src/session/chronicle-export.js';
import { renderArchiveBrowser } from '../../src/display/archive-browser.js';
import type { SavedSession } from '../../src/session/session.js';
import { multiTurnJournal, longSessionJournal } from '../helpers/chronicle-fixtures.js';

// ─── Session Builders ─────────────────────────────────────────

function minimalSave(overrides: Partial<SavedSession> = {}): SavedSession {
  return {
    schemaVersion: 2,
    version: '1.4.0',
    engineState: '{}',
    turnHistory: { turns: [] },
    tone: 'dark fantasy',
    savedAt: new Date().toISOString(),
    campaignStatus: 'active',
    ...overrides,
  };
}

function richSave(): SavedSession {
  const journal = multiTurnJournal();
  return minimalSave({
    characterName: 'Kael',
    characterLevel: 5,
    characterTitle: 'the Bloodied',
    packId: 'fantasy',
    genre: 'fantasy',
    chronicleRecords: JSON.stringify(journal.serialize().records),
    campaignStatus: 'completed',
    arcSnapshot: JSON.stringify({
      dominantArc: 'rising-power',
      momentum: 'accelerating',
      signals: [{ kind: 'rising-power', momentum: 'accelerating' }],
    }),
    finaleOutline: JSON.stringify({
      dominantArc: 'rising-power',
      resolutionClass: 'victory',
      campaignDuration: 30,
      factionFates: [{ factionId: 'guardians', fate: 'diminished', reason: 'Player hostility' }],
      npcFates: [{ npcId: 'pilgrim', name: 'Suspicious Pilgrim', fate: 'ally', reason: 'Joined party' }],
      companionFates: [{ name: 'Suspicious Pilgrim', outcome: 'survived' }],
      districtFates: [{ districtId: 'chapel', name: 'Chapel District', fate: 'rebuilt' }],
      legacy: [{ significance: 0.9, label: 'Freed the crypt from undead' }],
      epilogueSeeds: ['The chapel bells ring again.'],
    }),
    partyState: JSON.stringify({
      companions: [{ npcId: 'pilgrim', role: 'scout', morale: 80 }],
    }),
  });
}

// ─── Markdown Export ──────────────────────────────────────────

describe('exportChronicleMarkdown', () => {
  it('produces valid markdown for rich session', () => {
    const md = exportChronicleMarkdown(richSave());
    expect(md).toContain('# Campaign Chronicle');
    expect(md).toContain('Kael');
    expect(md).toContain('rising-power');
    expect(md).toContain('victory');
    expect(md).toContain('Exported from claude-rpg');
  });

  it('degrades gracefully for minimal session', () => {
    const md = exportChronicleMarkdown(minimalSave());
    // Should not crash — just produce sparse markdown
    expect(md).toContain('# Campaign Chronicle');
    expect(typeof md).toBe('string');
  });

  it('handles missing finale outline', () => {
    const save = richSave();
    delete save.finaleOutline;
    const md = exportChronicleMarkdown(save);
    expect(md).toContain('# Campaign Chronicle');
    // No crash
  });

  it('handles missing chronicle records', () => {
    const save = richSave();
    delete save.chronicleRecords;
    const md = exportChronicleMarkdown(save);
    expect(md).toContain('# Campaign Chronicle');
  });
});

// ─── JSON Export ──────────────────────────────────────────────

describe('exportChronicleJSON', () => {
  it('produces structurally valid JSON for rich session', () => {
    const obj = exportChronicleJSON(richSave()) as Record<string, unknown>;
    expect(obj).toHaveProperty('meta');
    expect(obj).toHaveProperty('summary');
    expect(obj).toHaveProperty('keyMoments');

    const meta = obj.meta as Record<string, unknown>;
    expect(meta.characterName).toBe('Kael');
    expect(meta.characterLevel).toBe(5);

    const summary = obj.summary as Record<string, unknown>;
    expect(summary.dominantArc).toBe('rising-power');
    expect(summary.resolutionClass).toBe('victory');

    const moments = obj.keyMoments as Array<Record<string, unknown>>;
    expect(Array.isArray(moments)).toBe(true);
  });

  it('produces valid JSON for minimal session', () => {
    const obj = exportChronicleJSON(minimalSave()) as Record<string, unknown>;
    expect(obj).toHaveProperty('meta');
    const moments = obj.keyMoments as Array<unknown>;
    expect(moments).toEqual([]);
  });

  it('key moments are selected by significance but ordered chronologically (F-934b1183)', () => {
    const obj = exportChronicleJSON(richSave()) as Record<string, unknown>;
    const moments = obj.keyMoments as Array<{ tick: number }>;
    expect(moments.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < moments.length; i++) {
      expect(moments[i].tick).toBeGreaterThanOrEqual(moments[i - 1].tick);
    }
  });

  it('key moments are actually the top-10 by significance, not just "all of them" (F-21e00e6b)', () => {
    // multiTurnJournal() (used by richSave() above) only clears 7 chronicle
    // records — fewer than the cap of 10 — so "select top 10 by significance"
    // and "select everything" are indistinguishable there. longSessionJournal()
    // produces 14 records across a mix of significance 1.0 (combat) and 0.7
    // (move), which exceeds the cap and lets us tell a real selection from a
    // no-op (or a reversed/broken sort that would keep the LEAST significant
    // records instead).
    const allRecords = longSessionJournal().serialize().records;
    expect(allRecords.length).toBeGreaterThan(10);

    const save = minimalSave({ chronicleRecords: JSON.stringify(allRecords) });
    const obj = exportChronicleJSON(save) as Record<string, unknown>;
    const moments = obj.keyMoments as Array<{ tick: number; significance: number }>;

    // Capped at 10 even though 14 candidates exist.
    expect(moments.length).toBe(10);

    // The selection is genuinely by significance: nothing returned is less
    // significant than anything left out. A reversed sort (or "pick the
    // lowest instead of highest") would keep the sig-0.7 records and drop the
    // sig-1.0 ones, which this catches; a truncation bug that just takes the
    // first 10 by tick would too.
    const returnedTicks = new Set(moments.map((m) => m.tick));
    const excluded = allRecords.filter((r) => !returnedTicks.has(r.tick));
    expect(excluded.length).toBe(allRecords.length - 10);

    const minReturnedSignificance = Math.min(...moments.map((m) => m.significance));
    const maxExcludedSignificance = Math.max(...excluded.map((r) => r.significance));
    expect(minReturnedSignificance).toBeGreaterThanOrEqual(maxExcludedSignificance);

    // Still chronologically ordered (existing contract, F-934b1183).
    for (let i = 1; i < moments.length; i++) {
      expect(moments[i].tick).toBeGreaterThanOrEqual(moments[i - 1].tick);
    }
  });
});

// ─── Finale Markdown ──────────────────────────────────────────

describe('exportFinaleMarkdown', () => {
  it('produces valid finale markdown', () => {
    const outline = JSON.parse(richSave().finaleOutline!);
    const md = exportFinaleMarkdown(outline, 'The chapel bells ring once more.', 'fantasy', 'Chapel Threshold');
    expect(md).toContain('Campaign Finale');
    expect(md).toContain('Chapel Threshold');
    expect(md).toContain('victory');
    expect(md).toContain('chapel bells ring');
    expect(md).toContain('Exported from claude-rpg');
  });

  it('handles missing epilogue', () => {
    const outline = JSON.parse(richSave().finaleOutline!);
    const md = exportFinaleMarkdown(outline);
    // No crash, still has structure
    expect(md).toContain('Campaign Finale');
  });

  it('legacy entries include significance stars', () => {
    const outline = JSON.parse(richSave().finaleOutline!);
    const md = exportFinaleMarkdown(outline);
    // significance 0.9 should get ★★★
    expect(md).toContain('★');
  });
});

// ─── Archive Browser ──────────────────────────────────────────

describe('renderArchiveBrowser', () => {
  it('renders empty state message', () => {
    const text = renderArchiveBrowser([]);
    expect(text).toContain('No archived campaigns');
  });

  it('renders campaign list', () => {
    const campaigns = [{
      filename: 'kael.json',
      packId: 'fantasy',
      title: 'Kael',
      dominantArc: 'rising-power',
      resolutionClass: 'victory',
      turnCount: 30,
      chronicleHighlights: ['Defeated the Ash Ghoul', 'Freed the crypt'],
      companionFates: ['Pilgrim (survived)'],
      relicNames: ['Broken Blade'],
    }];

    const text = renderArchiveBrowser(campaigns);
    expect(text).toContain('CAMPAIGN ARCHIVE');
    expect(text).toContain('Kael');
    expect(text).toContain('VICTORY');
    expect(text).toContain('Defeated the Ash Ghoul');
    expect(text).toContain('1 completed campaign');
  });

  it('renders multiple campaigns', () => {
    const campaigns = [
      { filename: 'a.json', title: 'Alpha', dominantArc: null, resolutionClass: null, turnCount: 10, chronicleHighlights: [], companionFates: [], relicNames: [] },
      { filename: 'b.json', title: 'Beta', dominantArc: 'exile', resolutionClass: 'exile', turnCount: 20, chronicleHighlights: ['Fled the city'], companionFates: [], relicNames: [] },
    ];

    const text = renderArchiveBrowser(campaigns);
    expect(text).toContain('Alpha');
    expect(text).toContain('Beta');
    expect(text).toContain('2 completed campaign');
  });
});
