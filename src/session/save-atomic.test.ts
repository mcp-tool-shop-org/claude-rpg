// Tests for PB-002 (atomic save) and PB-005 (SaveSessionInput object)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, readFile, stat, mkdir, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { saveSession, loadSession, loadNpcConversationsFromSession, type SaveSessionInput } from './session.js';
import { TurnHistory } from './history.js';
import { CURRENT_SCHEMA_VERSION } from './migrate.js';
import type { WorldGenProposal } from '../foundry/world-gen.js';

// WO-A4-3 (slice A4 §4, design lock 5): minimal-but-shape-valid fixture —
// saveSession never inspects this beyond JSON.stringify, so the content
// only needs to satisfy the type, not validateWorldGenProposal.
const FIXTURE_WORLDGEN_PROPOSAL: WorldGenProposal = {
  title: 'The Sunken Wards',
  theme: 'gothic fantasy',
  toneGuide: 'grim, quiet dread',
  ruleset: { id: 'r1', name: 'Ruleset One', stats: [], resources: [] },
  zones: [],
  factions: [],
  npcs: [],
  player: { name: 'Wanderer', stats: {}, resources: {}, startZoneId: 'z1' },
  quests: [],
};

// Minimal engine mock for save/load round-trip
function createMockEngine() {
  const state = JSON.stringify({ world: { zones: {}, entities: {}, factions: {}, locationId: 'z1', playerId: 'p1' }, tick: 0 });
  return {
    serialize: () => state,
    world: { zones: {}, entities: {}, factions: {}, locationId: 'z1', playerId: 'p1' },
    tick: 0,
  } as any;
}

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), 'claude-rpg-test-' + randomBytes(4).toString('hex'));
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  try { await rm(testDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('saveSession with SaveSessionInput (PB-005)', () => {
  it('accepts a single object instead of positional params', async () => {
    const savePath = join(testDir, 'save.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'dark fantasy',
      savePath,
    };
    await saveSession(input);

    const raw = await readFile(savePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.tone).toBe('dark fantasy');
    expect(data.schemaVersion).toBeGreaterThan(0);
  });

  it('includes optional fields when provided', async () => {
    const savePath = join(testDir, 'save2.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'cyberpunk',
      savePath,
      genre: 'sci-fi',
      packId: 'test-pack',
      campaignStatus: 'completed',
    };
    await saveSession(input);

    const raw = await readFile(savePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.genre).toBe('sci-fi');
    expect(data.packId).toBe('test-pack');
    expect(data.campaignStatus).toBe('completed');
  });

  // WO-A4-3 (slice A4 §4, design lock 5): closes the wave-5 finding that a
  // generated (packless) world had no resume path — a packless session's
  // save must carry the proposal + seed pair; a pack session's save must
  // carry neither (its own packId is the reconstruction key instead).
  it('a packless session save carries both worldGenProposal and worldSeed', async () => {
    const savePath = join(testDir, 'save-worldgen-packless.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'dark fantasy',
      savePath,
      worldGenProposal: FIXTURE_WORLDGEN_PROPOSAL,
      worldSeed: 12345,
    };
    await saveSession(input);

    const raw = await readFile(savePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.packId).toBeUndefined();
    expect(JSON.parse(data.worldGenProposal)).toEqual(FIXTURE_WORLDGEN_PROPOSAL);
    expect(data.worldSeed).toBe(12345);
  });

  it('a pack session save carries neither worldGenProposal nor worldSeed', async () => {
    const savePath = join(testDir, 'save-worldgen-pack.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'dark fantasy',
      savePath,
      packId: 'test-pack',
      // A pack-launched session should never realistically carry these, but
      // the write-side gate must hold even if a caller passed them by
      // mistake — packId wins.
      worldGenProposal: FIXTURE_WORLDGEN_PROPOSAL,
      worldSeed: 12345,
    };
    await saveSession(input);

    const raw = await readFile(savePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.packId).toBe('test-pack');
    expect(data.worldGenProposal).toBeUndefined();
    expect(data.worldSeed).toBeUndefined();
  });

  // F-8c3e32b7: state-persistence expectation — the save file must carry
  // enough to restore the presentation context (combat/dialogue/aftermath/
  // menu/exploration) the player was actually in, not just world/profile
  // state.
  it('includes presentationState when provided (F-8c3e32b7)', async () => {
    const savePath = join(testDir, 'save3.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'dark fantasy',
      savePath,
      presentationState: 'combat',
    };
    await saveSession(input);

    const raw = await readFile(savePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.presentationState).toBe('combat');
  });

  it('omits presentationState when not provided', async () => {
    const savePath = join(testDir, 'save4.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'dark fantasy',
      savePath,
    };
    await saveSession(input);

    const raw = await readFile(savePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.presentationState).toBeUndefined();
  });

  // F-462792bb (SLATE-2, persisted per Director ruling R2): true disk-based
  // save -> load round trip for NPC conversation history, mirroring the
  // presentationState tests immediately above (F-8c3e32b7) exactly.
  it('round-trips npcConversations through a real save -> load cycle (F-462792bb)', async () => {
    const savePath = join(testDir, 'save5.json');
    const conversations = new Map([
      ['pilgrim', [
        { speaker: 'Player', text: 'What are you doing here?' },
        { speaker: 'Suspicious Pilgrim', text: 'Nothing. Move along.' },
      ]],
    ]);
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'dark fantasy',
      savePath,
      npcConversations: conversations,
    };
    await saveSession(input);

    const loaded = await loadSession(savePath);
    const result = loadNpcConversationsFromSession(loaded.session);

    expect(result).toEqual(conversations);
  });

  it('omits npcConversations when the map is empty or not provided', async () => {
    const savePath = join(testDir, 'save6.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'dark fantasy',
      savePath,
      npcConversations: new Map(),
    };
    await saveSession(input);

    const raw = await readFile(savePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.npcConversations).toBeUndefined();
  });
});

// WO-A3-1 (slice A3 §1/§2, design lock 2): a v3 saveSession NEVER emits the
// ten legacy world-truth fields (playerRumors, activePressures,
// resolvedPressures, npcAgencySnapshot, npcObligations, consequenceChains,
// partyState, districtEconomies, activeOpportunities, leverageSnapshot) —
// engine.serialize() (already the first field written) carries them inside
// the engine's own world-truth namespaces instead. Before this wave,
// CURRENT_SCHEMA_VERSION was 2 and SaveSessionInput still had all ten as
// live fields a caller could set and see written straight to disk.
describe('saveSession — schema v3 write path (WO-A3-1, design lock 2)', () => {
  it('writes schemaVersion: 3', async () => {
    const savePath = join(testDir, 'v3-schema.json');
    await saveSession({
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'dark fantasy',
      savePath,
    });

    const data = JSON.parse(await readFile(savePath, 'utf-8'));
    expect(data.schemaVersion).toBe(3);
    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('a v3 save has NONE of the ten legacy world-truth keys, even when SaveSessionInput carries no fields for them at all (the type no longer offers them)', async () => {
    const savePath = join(testDir, 'v3-no-legacy.json');
    await saveSession({
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'dark fantasy',
      savePath,
      resolvedOpportunities: [{ opportunityId: 'o1' } as never],
      rumorEngine: JSON.stringify({ rumors: [], stances: [] }),
    });

    const data = JSON.parse(await readFile(savePath, 'utf-8'));
    for (const key of [
      'playerRumors', 'activePressures', 'resolvedPressures', 'npcAgencySnapshot',
      'npcObligations', 'consequenceChains', 'partyState', 'districtEconomies',
      'activeOpportunities', 'leverageSnapshot',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(data, key)).toBe(false);
    }
    // resolvedOpportunities is session HISTORY, not one of the ten legacy
    // world-truth fields — it IS still written.
    expect(data.resolvedOpportunities).toBeDefined();
  });

  it('writes the rumorEngine field through unchanged (pre-serialized by GameSession.getRumorEngineSnapshot(), WO-A3-2)', async () => {
    const savePath = join(testDir, 'v3-rumor-engine.json');
    const snapshot = JSON.stringify({ rumors: [{ id: 'r1' }], stances: [] });
    await saveSession({
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'dark fantasy',
      savePath,
      rumorEngine: snapshot,
    });

    const data = JSON.parse(await readFile(savePath, 'utf-8'));
    expect(data.rumorEngine).toBe(snapshot);
  });

  it('omits rumorEngine when not provided', async () => {
    const savePath = join(testDir, 'v3-no-rumor-engine.json');
    await saveSession({
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'dark fantasy',
      savePath,
    });

    const data = JSON.parse(await readFile(savePath, 'utf-8'));
    expect(data.rumorEngine).toBeUndefined();
  });
});

describe('atomic save race-condition protection (PB-002)', () => {
  it('creates .bak when overwriting an existing save', async () => {
    const savePath = join(testDir, 'save.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'dark fantasy',
      savePath,
    };

    // First save
    await saveSession(input);
    const firstContent = await readFile(savePath, 'utf-8');

    // Second save — should create .bak
    await saveSession({ ...input, tone: 'light comedy' });
    const bakContent = await readFile(savePath + '.bak', 'utf-8');
    const newContent = await readFile(savePath, 'utf-8');

    // Backup should contain the first save's data
    expect(JSON.parse(bakContent).tone).toBe('dark fantasy');
    expect(JSON.parse(newContent).tone).toBe('light comedy');
  });

  it('first save works without .bak file', async () => {
    const savePath = join(testDir, 'fresh.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'horror',
      savePath,
    };
    await saveSession(input);

    // No .bak should exist for first save
    let bakExists = false;
    try { await stat(savePath + '.bak'); bakExists = true; } catch { /* expected */ }
    expect(bakExists).toBe(false);

    // Save file should exist
    const data = JSON.parse(await readFile(savePath, 'utf-8'));
    expect(data.tone).toBe('horror');
  });

  it('cleans up tmp files on success', async () => {
    const savePath = join(testDir, 'clean.json');
    const input: SaveSessionInput = {
      engine: createMockEngine(),
      history: new TurnHistory(),
      tone: 'test',
      savePath,
    };
    await saveSession(input);

    // No .tmp. files should remain
    const files = await readdir(testDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp.'));
    expect(tmpFiles).toHaveLength(0);
  });
});
