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
import { multiTurnJournal } from '../helpers/chronicle-fixtures.js';

// ─── Session Builders ─────────────────────────────────────────

function minimalSave(overrides: Partial<SavedSession> = {}): SavedSession {
  return {
    version: '1.4.0',
    engineState: '{}',
    turnHistory: [],
    tone: 'dark fantasy',
    savedAt: new Date().toISOString(),
    campaignStatus: 'active',
    ...overrides,
  } as any;
}

function richSave(): SavedSession {
  const journal = multiTurnJournal();
  return minimalSave({
    characterName: 'Kael',
    characterLevel: 5,
    characterTitle: 'the Bloodied',
    packId: 'fantasy',
    genre: 'fantasy',
    chronicleRecords: JSON.stringify(journal.serialize()),
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
    delete (save as any).finaleOutline;
    const md = exportChronicleMarkdown(save);
    expect(md).toContain('# Campaign Chronicle');
    // No crash
  });

  it('handles missing chronicle records', () => {
    const save = richSave();
    delete (save as any).chronicleRecords;
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

  it('key moments are sorted by significance', () => {
    const obj = exportChronicleJSON(richSave()) as Record<string, unknown>;
    const moments = obj.keyMoments as Array<{ significance: number }>;
    if (moments.length >= 2) {
      for (let i = 1; i < moments.length; i++) {
        expect(moments[i].significance).toBeLessThanOrEqual(moments[i - 1].significance);
      }
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
