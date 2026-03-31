import { describe, it, expect } from 'vitest';
import { exportChronicleMarkdown, exportChronicleJSON } from './chronicle-export.js';
import type { SavedSession } from './session.js';

function makeSession(overrides: Partial<SavedSession> = {}): SavedSession {
  return {
    schemaVersion: 14,
    version: '1.4.0',
    engineState: '{}',
    turnHistory: [],
    tone: 'dramatic',
    savedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('exportChronicleMarkdown', () => {
  it('renders header and summary for empty session', () => {
    const md = exportChronicleMarkdown(makeSession());
    expect(md).toContain('# Campaign Chronicle:');
    expect(md).toContain('## Summary');
    expect(md).toContain('Arc: none');
    expect(md).toContain('Resolution: in progress');
  });

  it('includes character info when provided', () => {
    const md = exportChronicleMarkdown(makeSession({
      characterName: 'Aldric',
      characterTitle: 'The Brave',
      characterLevel: 5,
      packId: 'chapel-threshold',
    }));
    expect(md).toContain('**Aldric**');
    expect(md).toContain('"The Brave"');
    expect(md).toContain('Lv5');
    expect(md).toContain('chapel-threshold');
  });

  it('renders key moments from chronicle records', () => {
    const records = [
      { id: '1', tick: 1, category: 'combat', actorId: 'player', description: 'Slew the ghoul', significance: 0.9, witnesses: [], data: {} },
      { id: '2', tick: 3, category: 'alliance', actorId: 'player', description: 'Allied with merchants', significance: 0.6, witnesses: [], data: {} },
    ];
    const md = exportChronicleMarkdown(makeSession({
      chronicleRecords: JSON.stringify(records),
    }));
    expect(md).toContain('Slew the ghoul');
    expect(md).toContain('Allied with merchants');
    expect(md).toContain('## Key Moments');
  });

  it('renders faction fates from finale outline', () => {
    const outline = {
      dominantArc: 'power-struggle',
      resolutionClass: 'victory',
      campaignDuration: 20,
      totalChronicleEvents: 15,
      keyMoments: [],
      factionFates: [{
        factionId: 'thieves-guild',
        outcome: 'disbanded',
        playerReputation: -30,
        cohesion: 10,
      }],
      npcFates: [],
      companionFates: [],
      districtFates: [],
      legacy: [],
      epilogueSeeds: [],
    };
    const md = exportChronicleMarkdown(makeSession({
      finaleOutline: JSON.stringify(outline),
    }));
    expect(md).toContain('## Faction Fates');
    expect(md).toContain('thieves-guild');
    expect(md).toContain('disbanded');
  });

  it('shows no significant events message for empty chronicle', () => {
    const md = exportChronicleMarkdown(makeSession());
    expect(md).toContain('No significant events recorded');
  });

  it('renders epilogue seeds from finale outline', () => {
    const outline = {
      dominantArc: 'redemption',
      resolutionClass: 'bittersweet',
      campaignDuration: 30,
      totalChronicleEvents: 25,
      keyMoments: [],
      factionFates: [],
      npcFates: [],
      companionFates: [],
      districtFates: [],
      legacy: [],
      epilogueSeeds: ['The chapel doors remain open.', 'A new order emerges.'],
    };
    const md = exportChronicleMarkdown(makeSession({
      finaleOutline: JSON.stringify(outline),
    }));
    expect(md).toContain('## Epilogue');
    expect(md).toContain('> The chapel doors remain open.');
    expect(md).toContain('> A new order emerges.');
  });
});

describe('exportChronicleJSON', () => {
  it('returns structured object for empty session', () => {
    const result = exportChronicleJSON(makeSession()) as Record<string, unknown>;
    expect(result).toHaveProperty('meta');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('keyMoments');
    expect(result).toHaveProperty('factionFates');
    expect(result).toHaveProperty('npcFates');
    expect(result).toHaveProperty('legacy');
  });

  it('populates meta from session fields', () => {
    const result = exportChronicleJSON(makeSession({
      packId: 'neon-lockbox',
      characterName: 'Zyx',
      characterLevel: 10,
      genre: 'cyberpunk',
    })) as { meta: Record<string, unknown> };
    expect(result.meta.packId).toBe('neon-lockbox');
    expect(result.meta.characterName).toBe('Zyx');
    expect(result.meta.characterLevel).toBe(10);
    expect(result.meta.genre).toBe('cyberpunk');
  });

  it('includes campaign duration from chronicle length when no finale', () => {
    const records = [
      { id: '1', tick: 1, category: 'combat', actorId: 'player', description: 'A', significance: 0.5, witnesses: [], data: {} },
      { id: '2', tick: 2, category: 'combat', actorId: 'player', description: 'B', significance: 0.5, witnesses: [], data: {} },
    ];
    const result = exportChronicleJSON(makeSession({
      chronicleRecords: JSON.stringify(records),
    })) as { summary: { campaignDuration: number; totalChronicleEvents: number } };
    expect(result.summary.campaignDuration).toBe(2);
    expect(result.summary.totalChronicleEvents).toBe(2);
  });
});
