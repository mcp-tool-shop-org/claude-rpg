// WO-A2T-2 (slice A2 §9, R1 — "the accrued ledger is honored"): unit
// coverage for the reputation-composition helpers reputation-view.ts
// exports. Pure functions over a WorldState + CharacterProfile, so this
// suite builds a minimal WorldState fixture directly rather than standing
// up a live engine — the same lightweight-fixture pattern
// src/dialogue/npc-context.test.ts's own makeWorld() already established
// (only `globals` is dereferenced by anything in this file).
import { describe, it, expect } from 'vitest';
import type { WorldState } from '@ai-rpg-engine/core';
import { createProfile, type CharacterProfile } from '@ai-rpg-engine/character-profile';
import { stampReputationBaselines, addFactionReputationGlobal, refreshReputationProfile } from './reputation-view.js';

function makeWorld(globals: Record<string, string | number | boolean> = {}): WorldState {
  return { globals } as unknown as WorldState;
}

function makeTestProfile(reputation: { factionId: string; value: number }[] = []): CharacterProfile {
  const profile = createProfile(
    { name: 'Aldric', archetypeId: 'penitent-knight', backgroundId: 'oath-breaker', traitIds: [] },
    { vigor: 5, instinct: 5, will: 5 },
    { hp: 20, stamina: 8 },
    [],
    'chapel-threshold',
  );
  return { ...profile, reputation };
}

describe('stampReputationBaselines', () => {
  it('stamps world.globals[claude_rpg.rep_baseline_<f>] from the profile\'s current value, for every faction the profile knows', () => {
    const world = makeWorld();
    const profile = makeTestProfile([
      { factionId: 'chapel-undead', value: 20 },
      { factionId: 'raiders', value: -5 },
    ]);

    stampReputationBaselines(profile, world);

    expect(world.globals['claude_rpg.rep_baseline_chapel-undead']).toBe(20);
    expect(world.globals['claude_rpg.rep_baseline_raiders']).toBe(-5);
    expect(world.globals['claude_rpg.rep_baselined']).toBe(1);
  });

  it('is idempotent: a second call with a DIFFERENT profile value never overwrites the first-stamped baseline', () => {
    const world = makeWorld();
    stampReputationBaselines(makeTestProfile([{ factionId: 'chapel-undead', value: 20 }]), world);

    stampReputationBaselines(makeTestProfile([{ factionId: 'chapel-undead', value: 999 }]), world);

    expect(world.globals['claude_rpg.rep_baseline_chapel-undead']).toBe(20);
  });

  it('a profile with no reputation entries at all still stamps the marker (a fresh world composes 0 + accrued going forward)', () => {
    const world = makeWorld();
    stampReputationBaselines(makeTestProfile(), world);
    expect(world.globals['claude_rpg.rep_baselined']).toBe(1);
  });
});

describe('addFactionReputationGlobal', () => {
  it('ADDs to the accrued ledger rather than setting it', () => {
    const world = makeWorld();
    addFactionReputationGlobal(world, 'chapel-undead', -10);
    addFactionReputationGlobal(world, 'chapel-undead', -5);
    expect(world.globals['reputation_chapel-undead']).toBe(-15);
  });

  it('treats an absent global as 0 before adding', () => {
    const world = makeWorld();
    addFactionReputationGlobal(world, 'raiders', 7);
    expect(world.globals['reputation_raiders']).toBe(7);
  });

  it('skips a non-finite delta (parity with character-profile\'s own adjustReputation NaN guard, F-586e744e)', () => {
    const world = makeWorld({ 'reputation_chapel-undead': 5 });
    addFactionReputationGlobal(world, 'chapel-undead', NaN);
    expect(world.globals['reputation_chapel-undead']).toBe(5);
  });
});

describe('refreshReputationProfile (R1: baseline + accrued composition)', () => {
  it('composes baseline + a kill delta + a pressure-fallout delta into one number the profile reports', () => {
    const world = makeWorld();
    let profile = makeTestProfile([{ factionId: 'chapel-undead', value: 20 }]);
    stampReputationBaselines(profile, world); // baseline = 20

    addFactionReputationGlobal(world, 'chapel-undead', -10); // a kill delta (defeat-fallout shape)
    addFactionReputationGlobal(world, 'chapel-undead', -5); // a pressure-fallout delta

    profile = refreshReputationProfile(profile, world);

    expect(profile.reputation).toEqual([{ factionId: 'chapel-undead', value: 5 }]); // 20 + (-10) + (-5)
  });

  it('R1: a pre-existing accrued global (kill history from BEFORE this faction was ever on the profile) composes in as baseline 0 + accrued', () => {
    const world = makeWorld({ 'reputation_raiders': -30 });
    const profile = makeTestProfile(); // the profile has never heard of 'raiders'

    const refreshed = refreshReputationProfile(profile, world);

    expect(refreshed.reputation).toEqual([{ factionId: 'raiders', value: -30 }]);
  });

  it('clamps the composed value to [-100, 100], matching adjustReputation\'s own historical clamp', () => {
    const world = makeWorld();
    let profile = makeTestProfile([{ factionId: 'chapel-undead', value: 90 }]);
    stampReputationBaselines(profile, world);
    addFactionReputationGlobal(world, 'chapel-undead', 500);

    profile = refreshReputationProfile(profile, world);
    expect(profile.reputation[0].value).toBe(100);
  });

  it('two refresh passes in a row (save/load twice) never double-count — the SAME globals always compose to the SAME value', () => {
    const world = makeWorld();
    let profile = makeTestProfile([{ factionId: 'chapel-undead', value: 20 }]);
    stampReputationBaselines(profile, world);
    addFactionReputationGlobal(world, 'chapel-undead', -10);

    profile = refreshReputationProfile(profile, world);
    const first = profile.reputation[0].value;
    profile = refreshReputationProfile(profile, world);
    const second = profile.reputation[0].value;

    expect(second).toBe(first);
    expect(second).toBe(10);
  });

  it('preserves the profile\'s existing faction order and appends any faction known only to globals, sorted', () => {
    const world = makeWorld({ 'reputation_zealots': 3, 'reputation_bandits': -1 });
    const profile = makeTestProfile([{ factionId: 'chapel-undead', value: 0 }]);

    const refreshed = refreshReputationProfile(profile, world);

    expect(refreshed.reputation.map((r) => r.factionId)).toEqual(['chapel-undead', 'bandits', 'zealots']);
  });
});
