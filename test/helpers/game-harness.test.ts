// Regression tests for the game test harness itself. resumeHarness()
// (F-95191273) hand-mirrors bin.ts's runLoad() reconstruction because
// bin.ts has no exports to import the real thing from -- these tests prove
// it actually restores session state (not just that it compiles) and that
// a resumed session can take a real subsequent turn with that restored
// state visible to it, closing the Stage-C gap
// test/integration/session-persistence.test.ts left open: every save/load
// test there only ever exercises the standalone loadXFromSession()
// loaders directly, never through a live GameSession.processInput() before
// or after the round-trip.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProfile } from '@ai-rpg-engine/character-profile';
import { makePressure } from '@ai-rpg-engine/modules';
import { saveSession } from '../../src/session/session.js';
import { TurnHistory } from '../../src/session/history.js';
import { createHarness, resumeHarness } from './game-harness.js';

let tmpDir: string | undefined;

afterEach(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

describe('resumeHarness — session-state continuity (F-95191273)', () => {
  it('restores profile, engine location, and pressures, and a subsequent turn sees the restored pressure in its prompt', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'claude-rpg-resume-harness-'));
    const savePath = join(tmpDir, 'save.json');

    // Build up real state via a live harness, exactly like a player would
    // before quitting: move to a new zone (engine truth) and carry a named
    // profile + an active pressure (narrative truth).
    const h1 = createHarness({ gameOpts: { genre: 'fantasy' } });
    await h1.play('go to chapel-nave');
    expect(h1.session.engine.world.locationId).toBe('chapel-nave');
    const tickBeforeSave = h1.tick();

    const profile = createProfile(
      { name: 'Aldric', archetypeId: 'penitent-knight', backgroundId: 'oath-breaker', traitIds: [] },
      { vigor: 5, instinct: 5, will: 5 },
      { hp: 20, stamina: 8 },
      [],
      'chapel-threshold',
    );
    h1.session.profile = profile;

    const pressure = makePressure({
      kind: 'bounty-issued',
      sourceFactionId: 'test-faction',
      description: 'the resumed-pressure marker XJ-9 stalks the chapel halls',
      triggeredBy: 'test-setup',
      urgency: 0.9,
      visibility: 'known',
      turnsRemaining: 10,
      potentialOutcomes: ['fallout'],
      tags: ['test'],
      currentTick: tickBeforeSave,
    });
    h1.session.activePressures = [pressure];

    await saveSession({
      engine: h1.session.engine,
      history: h1.session.history,
      tone: h1.session.tone,
      savePath,
      packId: 'chapel-threshold',
      genre: h1.session.genre,
      profile: h1.session.profile,
      playerRumors: h1.session.playerRumors,
      activePressures: h1.session.activePressures,
    });

    const h2 = await resumeHarness(savePath, {
      clientOpts: { narration: 'The chapel breathes around you.' },
    });

    // Engine truth and profile survived the round-trip.
    expect(h2.session.engine.world.locationId).toBe('chapel-nave');
    expect(h2.session.profile?.build.name).toBe('Aldric');

    // Narrative truth (the pressure) survived the round-trip too.
    expect(h2.session.activePressures).toHaveLength(1);
    expect(h2.session.activePressures[0].id).toBe(pressure.id);

    // Strongest check: the resumed session can actually take a turn, and
    // the restored pressure reaches that turn's real LLM prompt (not just
    // session-state fields nobody reads) -- formatPressureForNarrator's
    // whole purpose is injecting visible pressures into narrator prompt
    // text (src/game/game-state.ts's getVisiblePressureContext, threaded
    // through narrateScene -> buildSceneContext -> buildNarratePrompt).
    const output = await h2.play('look');
    expect(output).toBeTruthy();
    expect(h2.callLog.lastGeneratePrompt).toContain('the resumed-pressure marker XJ-9 stalks the chapel halls');
  });

  // task_3ddb1c06: this is the deliberate inversion of the old faithful-mirror
  // test ("does not restore turn history") — bin.ts's runLoad() now passes the
  // restored TurnHistory into the GameSession constructor, so the resumed
  // session keeps its narration continuity, and the helper mirrors THAT.
  it('restores turn history onto the resumed session (mirrors the fixed bin.ts runLoad)', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'claude-rpg-resume-harness-history-'));
    const savePath = join(tmpDir, 'save.json');

    const h1 = createHarness();
    await h1.play('look');
    await h1.play('look');
    expect(h1.turnCount()).toBe(2);

    await saveSession({
      engine: h1.session.engine,
      history: h1.session.history,
      tone: h1.session.tone,
      savePath,
      packId: 'chapel-threshold',
      genre: h1.session.genre,
    });

    const h2 = await resumeHarness(savePath);
    expect(h2.turnCount()).toBe(2);
    expect(h2.session.history.getRecentNarration(3).length).toBeGreaterThan(0);
  });

  it('restores rng continuity from the save envelope (task_3ddb1c06 c)', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'claude-rpg-resume-harness-rng-'));
    const savePath = join(tmpDir, 'save.json');

    const h1 = createHarness();
    await h1.play('look');
    // Advance the rng stream past its seed state, then capture it at save time.
    h1.session.engine.store.rng.next();
    const stateAtSave = h1.session.engine.store.rng.getState();

    await saveSession({
      engine: h1.session.engine,
      history: h1.session.history,
      tone: h1.session.tone,
      savePath,
      packId: 'chapel-threshold',
      genre: h1.session.genre,
    });

    const h2 = await resumeHarness(savePath);
    expect(h2.session.engine.store.rng.getState()).toBe(stateAtSave);
  });

  it('throws a clear error when the save has no packId to restore an engine from', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'claude-rpg-resume-harness-nopack-'));
    const savePath = join(tmpDir, 'save.json');

    const engine = createHarness().session.engine;
    await saveSession({
      engine,
      history: new TurnHistory(),
      tone: 'dark fantasy',
      savePath,
      // packId intentionally omitted
    });

    await expect(resumeHarness(savePath)).rejects.toThrow('no packId');
  });
});
