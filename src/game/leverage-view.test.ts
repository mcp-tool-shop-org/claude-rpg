// WO-A2T-3 (slice A2 §10, R6 — "leverage income on, verbs off"): unit
// coverage for the one-ledger helpers leverage-view.ts exports. Pure
// functions over a WorldState + CharacterProfile, so this suite builds a
// minimal WorldState fixture directly (world.entities[world.playerId].custom
// is the only thing dereferenced) rather than standing up a live engine.
import { describe, it, expect } from 'vitest';
import type { WorldState } from '@ai-rpg-engine/core';
import { createProfile, type CharacterProfile } from '@ai-rpg-engine/character-profile';
import { getLeverageState } from '@ai-rpg-engine/modules';
import { refreshLeverageView, writeLeverageDeltas } from './leverage-view.js';

function makeWorld(playerCustom: Record<string, string | number | boolean> = {}): WorldState {
  return {
    playerId: 'player',
    entities: {
      player: { id: 'player', name: 'Hero', type: 'player', tags: [], custom: playerCustom },
    },
  } as unknown as WorldState;
}

function makeTestProfile(custom: Record<string, string | number | boolean> = {}): CharacterProfile {
  const profile = createProfile(
    { name: 'Aldric', archetypeId: 'penitent-knight', backgroundId: 'oath-breaker', traitIds: [] },
    { vigor: 5, instinct: 5, will: 5 },
    { hp: 20, stamina: 8 },
    [],
    'chapel-threshold',
  );
  return { ...profile, custom: { ...profile.custom, ...custom } };
}

describe('refreshLeverageView', () => {
  it('copies all six leverage.<currency> keys from the player entity onto the profile view', () => {
    const world = makeWorld({ 'leverage.favor': 7, 'leverage.heat': 12 });
    const profile = makeTestProfile();

    const refreshed = refreshLeverageView(profile, world);

    expect(getLeverageState(refreshed.custom)).toEqual({
      favor: 7, debt: 0, blackmail: 0, influence: 0, heat: 12, legitimacy: 0,
    });
  });

  it('leaves every non-leverage custom key untouched (bookkeeping, access, title, cooldowns)', () => {
    const world = makeWorld({ 'leverage.favor': 7 });
    const profile = makeTestProfile({ 'stats.leverage.favor.gained': 3, 'access.raiders': 'restricted' });

    const refreshed = refreshLeverageView(profile, world);

    expect(refreshed.custom['stats.leverage.favor.gained']).toBe(3);
    expect(refreshed.custom['access.raiders']).toBe('restricted');
  });

  it('is a no-op when there is no player entity yet', () => {
    const world = { playerId: 'player', entities: {} } as unknown as WorldState;
    const profile = makeTestProfile();
    expect(refreshLeverageView(profile, world)).toBe(profile);
  });
});

describe('writeLeverageDeltas (the ONE ledger)', () => {
  it('writes the delta onto the player ENTITY custom map, not profile.custom directly', () => {
    const world = makeWorld();
    const profile = makeTestProfile();

    writeLeverageDeltas(profile, world, { favor: 10 });

    expect(getLeverageState(world.entities['player'].custom ?? {})).toMatchObject({ favor: 10 });
  });

  it('returns the profile with its leverage view refreshed to match the entity ledger', () => {
    const world = makeWorld();
    const profile = makeTestProfile();

    const updated = writeLeverageDeltas(profile, world, { favor: 10, heat: 3 });

    expect(getLeverageState(updated.custom)).toEqual({
      favor: 10, debt: 0, blackmail: 0, influence: 0, heat: 3, legitimacy: 0,
    });
  });

  it('a write from one call site and a write from another both land on the same ledger, additively', () => {
    const world = makeWorld();
    let profile = makeTestProfile();

    // Simulates the tick's own income (a direct entity write, the same
    // shape world-tick.ts's runLeverageIncomeStep performs) landing BEFORE
    // an app-side write-through call this same round.
    world.entities['player'].custom = { ...world.entities['player'].custom, 'leverage.favor': 5 };

    profile = writeLeverageDeltas(profile, world, { favor: 10 });

    // One ledger: the tick's 5 and this call's 10 both show up on the SAME
    // number the profile reports (WO-A2T-3's own proof requirement).
    expect(getLeverageState(profile.custom).favor).toBe(15);
    expect(getLeverageState(world.entities['player'].custom ?? {}).favor).toBe(15);
  });

  it('clamps to [0, 100], matching the engine\'s own applyLeverageDeltas bound', () => {
    const world = makeWorld({ 'leverage.heat': 95 });
    const profile = makeTestProfile();

    const updated = writeLeverageDeltas(profile, world, { heat: 50 });

    expect(getLeverageState(updated.custom).heat).toBe(100);
  });

  it('is a no-op (returns profile unchanged) when there is no player entity yet', () => {
    const world = { playerId: 'player', entities: {} } as unknown as WorldState;
    const profile = makeTestProfile();
    expect(writeLeverageDeltas(profile, world, { favor: 10 })).toBe(profile);
  });
});
