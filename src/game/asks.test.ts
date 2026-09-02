import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import {
  chooseAskTruth,
  planAskCues,
  maybeOfferAsk,
  getOpenAsks,
  getAsk,
  getAllAsks,
  findOpenAskForEntity,
  expectedAskHelp,
  resolveAskConsequence,
  markAskHelped,
  markAskIgnored,
  dueReveals,
  askSubjectId,
  askSubjectName,
  type Ask,
} from './asks.js';
import { resolveTuning } from './tuning.js';

describe('chooseAskTruth', () => {
  it('is deterministic for the same id and seed', () => {
    expect(chooseAskTruth('ask_1', 42, 0.33)).toBe(chooseAskTruth('ask_1', 42, 0.33));
  });

  it('respects the ratio at the extremes', () => {
    expect(chooseAskTruth('ask_1', 42, 0)).toBe('genuine');
    expect(chooseAskTruth('ask_1', 42, 1)).toBe('predatory');
  });

  it('produces roughly the configured ratio of predatory asks over many ids', () => {
    let predatory = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      if (chooseAskTruth(`ask_${i}`, 7, 0.33) === 'predatory') predatory++;
    }
    const ratio = predatory / n;
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.41);
  });
});

describe('planAskCues', () => {
  it('plants exactly one cue for a genuine ask (the faction tie)', () => {
    const cues = planAskCues('lend', 'Sister Maren', 'genuine');
    expect(cues).toHaveLength(1);
    expect(cues[0].kind).toBe('faction-tie');
  });

  it('plants three cues for a predatory ask (design doc §4: two or three)', () => {
    const cues = planAskCues('lend', 'Sister Maren', 'predatory');
    expect(cues).toHaveLength(3);
    expect(cues.map((c) => c.kind).sort()).toEqual(['contradiction', 'faction-tie', 'rumor']);
  });
});

describe('maybeOfferAsk', () => {
  function findEligibleTick(engine: ReturnType<typeof createGame>, tuning = resolveTuning()): number {
    // The offer roll is deterministic per (district, tick, seed); scan a
    // small range for one that actually fires rather than assuming tick 0
    // does (avoids the test being coupled to the exact hash implementation).
    for (let tick = 0; tick < 50; tick++) {
      const result = maybeOfferAsk({ world: engine.world, tick, worldSeed: engine.world.meta.seed, tuning });
      if (result) return tick;
    }
    throw new Error('no eligible tick found in range -- offer roll never fires');
  }

  it('offers an ask with a transient petitioner seated in the player\'s zone once the roll fires (maybeOfferAsk is pure -- persists nothing itself)', () => {
    const engine = createGame();
    const tick = findEligibleTick(engine);
    const result = maybeOfferAsk({ world: engine.world, tick, worldSeed: engine.world.meta.seed, tuning: resolveTuning() });
    expect(result).toBeDefined();
    const { ask, petitionerEntity } = result!;
    expect(ask.status).toBe('open');
    expect(ask.petitioner?.zoneId).toBe(engine.world.locationId);
    expect(petitionerEntity.zoneId).toBe(engine.world.locationId);
    expect(petitionerEntity.tags).toEqual(expect.arrayContaining(['npc', 'named', 'petitioner']));
    expect(getOpenAsks(engine.world)).toHaveLength(0); // the caller persists, not this function
  });

  it('never offers a second open ask in the same district once the caller has persisted the first', () => {
    const engine = createGame();
    const tick = findEligibleTick(engine);
    const result = maybeOfferAsk({ world: engine.world, tick, worldSeed: engine.world.meta.seed, tuning: resolveTuning() });
    expect(result).toBeDefined();
    // Simulate the caller (game.ts's processAsks) persisting the offer + seating the entity.
    engine.world.entities[result!.petitionerEntity.id] = result!.petitionerEntity;
    engine.world.globals['claude_rpg.asks'] = JSON.stringify([...getAllAsks(engine.world), result!.ask]);

    const second = maybeOfferAsk({ world: engine.world, tick: tick + 1, worldSeed: engine.world.meta.seed, tuning: resolveTuning() });
    expect(second).toBeUndefined();
  });
});

describe('expectedAskHelp / resolveAskConsequence', () => {
  const baseAsk: Ask = {
    id: 'ask_1',
    petitioner: { id: 'pet_1', name: 'a woman at the chapel door', zoneId: 'chapel-entrance' },
    kind: 'lend',
    surface: 'Could you lend me a little coin?',
    truth: 'genuine',
    stake: 5,
    offeredTick: 0,
    status: 'open',
    cues: [],
  };

  it('maps lend/carry to give, guide (with a destination) to move, hold/vouch to speak', () => {
    expect(expectedAskHelp({ ...baseAsk, kind: 'lend' })).toEqual({ verb: 'give', targetId: 'pet_1' });
    expect(expectedAskHelp({ ...baseAsk, kind: 'carry' })).toEqual({ verb: 'give', targetId: 'pet_1' });
    expect(expectedAskHelp({ ...baseAsk, kind: 'guide', destinationZoneId: 'crypt-chamber' })).toEqual({ verb: 'move', targetId: 'crypt-chamber' });
    expect(expectedAskHelp({ ...baseAsk, kind: 'hold' })).toEqual({ verb: 'speak', targetId: 'pet_1' });
    expect(expectedAskHelp({ ...baseAsk, kind: 'vouch' })).toEqual({ verb: 'speak', targetId: 'pet_1' });
  });

  it('resolves lend to a coin loss of the full stake', () => {
    expect(resolveAskConsequence({ ...baseAsk, kind: 'lend', stake: 10 })).toEqual({ kind: 'coin-lost', amount: 10 });
  });

  it('resolves guide to an ambush at the destination zone when one was set', () => {
    expect(resolveAskConsequence({ ...baseAsk, kind: 'guide', destinationZoneId: 'crypt-chamber' })).toEqual({ kind: 'ambush', zoneId: 'crypt-chamber' });
  });

  it('falls back to coin-lost when hold/vouch have no faction tie', () => {
    expect(resolveAskConsequence({ ...baseAsk, kind: 'hold', stake: 5 })).toEqual({ kind: 'coin-lost', amount: 5 });
  });

  it('resolves hold with a faction tie to a faction pin', () => {
    expect(resolveAskConsequence({ ...baseAsk, kind: 'hold', stake: 5, petitioner: { ...baseAsk.petitioner!, factionId: 'chapel-undead' } }))
      .toEqual({ kind: 'faction-pin', factionId: 'chapel-undead', delta: -5 });
  });
});

describe('ask lifecycle mutators', () => {
  it('markAskHelped / markAskIgnored update status on the ledger', () => {
    const engine = createGame();
    const ask: Ask = {
      id: 'ask_1', petitioner: { id: 'pet_1', name: 'a courier', zoneId: engine.world.locationId },
      kind: 'lend', surface: 'x', truth: 'genuine', stake: 5, offeredTick: 0, status: 'open', cues: [],
    };
    engine.world.globals['claude_rpg.asks'] = JSON.stringify([ask]);

    markAskHelped(engine.world, 'ask_1');
    expect(getAsk(engine.world, 'ask_1')?.status).toBe('helped');

    const ask2: Ask = { ...ask, id: 'ask_2' };
    engine.world.globals['claude_rpg.asks'] = JSON.stringify([getAsk(engine.world, 'ask_1'), ask2]);
    markAskIgnored(engine.world, 'ask_2');
    expect(getAsk(engine.world, 'ask_2')?.status).toBe('ignored');
  });

  it('findOpenAskForEntity resolves by subject id, ignoring non-open asks', () => {
    const engine = createGame();
    const open: Ask = {
      id: 'ask_open', petitioner: { id: 'pet_1', name: 'a courier', zoneId: engine.world.locationId },
      kind: 'lend', surface: 'x', truth: 'genuine', stake: 5, offeredTick: 0, status: 'open', cues: [],
    };
    const helped: Ask = { ...open, id: 'ask_helped', petitioner: { id: 'pet_2', name: 'y', zoneId: engine.world.locationId }, status: 'helped' };
    engine.world.globals['claude_rpg.asks'] = JSON.stringify([open, helped]);

    expect(findOpenAskForEntity(engine.world, 'pet_1')?.id).toBe('ask_open');
    expect(findOpenAskForEntity(engine.world, 'pet_2')).toBeUndefined();
    expect(askSubjectId(open)).toBe('pet_1');
    expect(askSubjectName(open, engine.world)).toBe('a courier');
  });

  it('dueReveals returns only predatory asks (helped or still open) whose reveal window has elapsed', () => {
    const engine = createGame();
    const notYet: Ask = {
      id: 'a', petitioner: { id: 'p1', name: 'x', zoneId: 'z' }, kind: 'lend', surface: 's',
      truth: 'predatory', stake: 5, offeredTick: 0, status: 'helped', cues: [],
    };
    const due: Ask = { ...notYet, id: 'b', offeredTick: -10 };
    const genuine: Ask = { ...notYet, id: 'c', truth: 'genuine', offeredTick: -10 };
    const stillOpen: Ask = { ...notYet, id: 'd', offeredTick: -10, status: 'open' };
    engine.world.globals['claude_rpg.asks'] = JSON.stringify([notYet, due, genuine, stillOpen]);

    const result = dueReveals(engine.world, 0, 6);
    expect(result.map((a) => a.id)).toEqual(['b', 'd']);
  });
});
