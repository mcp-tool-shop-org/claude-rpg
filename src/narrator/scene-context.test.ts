import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { setPersistedMoveRecommendation } from '@ai-rpg-engine/modules';
import { buildSceneContext } from './scene-context.js';

describe('scene-context', () => {
  it('should build scene context for the starting zone', () => {
    const engine = createGame();
    const context = buildSceneContext(
      engine.world,
      [],
      'dark fantasy',
      [],
      undefined,
    );

    // Starter-fantasy integration test: assert zone name is populated, not a specific value
    expect(typeof context.narrationInput.zoneName).toBe('string');
    expect(context.narrationInput.zoneName.length).toBeGreaterThan(0);
    expect(context.narrationInput.isNewZone).toBe(true);
    expect(context.narrationInput.tone).toBe('dark fantasy');
    expect(context.narrationInput.exits.length).toBeGreaterThan(0);
  });

  it('should mark same zone as not new', () => {
    const engine = createGame();
    const context = buildSceneContext(
      engine.world,
      [],
      'dark fantasy',
      [],
      'chapel-entrance', // Same as current
    );

    expect(context.narrationInput.isNewZone).toBe(false);
  });

  it('should include visible entities in the zone', () => {
    const engine = createGame();
    // Pilgrim is in chapel-entrance
    const context = buildSceneContext(
      engine.world,
      [],
      'dark fantasy',
      [],
    );

    expect(context.narrationInput.visibleEntities.length).toBeGreaterThan(0);
  });

  it('should include player state', () => {
    const engine = createGame();
    const context = buildSceneContext(
      engine.world,
      [],
      'dark fantasy',
      [],
    );

    expect(context.narrationInput.playerState.hp).toBeGreaterThan(0);
  });

  it('should build context efficiently with multiple entities in zone (BR-004)', () => {
    const engine = createGame();
    // Run twice — once to warm up, once to time. The fix hoists getPerceptionLog
    // outside the entity loop so it runs O(1) instead of O(n) times.
    // We verify correctness: multiple entities should still appear.
    const context = buildSceneContext(
      engine.world,
      [],
      'dark fantasy',
      [],
    );

    // The important thing: it still works correctly with entities present
    // (the fix moved getPerceptionLog outside the .map loop)
    expect(context.narrationInput.visibleEntities).toBeDefined();
    expect(Array.isArray(context.narrationInput.visibleEntities)).toBe(true);
  });

  it('should handle events through observer presentation', () => {
    const engine = createGame();
    const events = engine.submitAction('move', { targetIds: ['chapel-nave'] });

    const context = buildSceneContext(
      engine.world,
      events,
      'dark fantasy',
      [],
      'chapel-entrance',
    );

    expect(context.perceivedEvents.length).toBeGreaterThan(0);
    expect(context.narrationInput.isNewZone).toBe(true);
  });
});

// F-2218267d + coordinator ruling (b) (wave-13
// RULING-persisted-namespaces.md), suite CONVERTED from the original
// persisted-read contract: getPersistedMoveRecommendation was removed —
// this app never populates world.modules['move-advisor'], and the hint
// arrives as a threaded param, computed live and pre-gated to
// 'pressured'/'crisis' at the game.ts producer. scene-context's contract
// is forward-when-present, omit-when-absent.
describe('scene-context situationHint wiring (F-2218267d, ruling b)', () => {
  it('forwards a threaded situationHint onto narrationInput', () => {
    const engine = createGame();

    const context = buildSceneContext(
      engine.world, [], 'dark fantasy', [], undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined,
      undefined,
      'A faction patrol is closing in on this district.',
    );

    expect(context.narrationInput.situationHint).toBe('A faction patrol is closing in on this district.');
  });

  it('leaves situationHint undefined when the param is omitted — even if the (never-populated) namespace holds a value', () => {
    const engine = createGame();
    setPersistedMoveRecommendation(engine.world, {
      top3: [],
      situationTag: 'crisis',
      situationHint: 'A faction patrol is closing in on this district.',
    });

    const context = buildSceneContext(engine.world, [], 'dark fantasy', []);

    expect(context.narrationInput.situationHint).toBeUndefined();
  });
});

// F-88c8848b: 3.10's engagement-core emits 'combat.encounter.cleared' when
// the last hostile in the player's zone is defeated (engagement-core.ts
// :296-312), payload {zoneId, outcome:'victory', finalDefeatEventId,
// participants:{survivors, finalOpponent:{id,name}}}. describeEvent() had
// no case for it and fell through to the bare default arm, rendering the
// context-free fragment 'cleared' into the narration prompt's 'Recent
// events:' section at exactly the moment (winning a fight) narration
// should read strongest. Added a payload-driven case matching the
// combat.entity.defeated house style, with a fallback for when the final
// opponent's name is unavailable.
describe('describeEvent combat.encounter.cleared (F-88c8848b)', () => {
  it('names the final opponent when the payload provides one', () => {
    const engine = createGame();
    const events = [
      {
        type: 'combat.encounter.cleared',
        tick: 1,
        payload: {
          zoneId: engine.world.locationId,
          outcome: 'victory',
          finalDefeatEventId: 'evt-defeat-1',
          participants: {
            survivors: [],
            finalOpponent: { id: 'goblin-1', name: 'Goblin Raider' },
          },
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Encounter cleared: Goblin Raider defeated',
    ]);
  });

  it('falls back to a generic message when the final opponent has no name', () => {
    const engine = createGame();
    const events = [
      {
        type: 'combat.encounter.cleared',
        tick: 1,
        payload: {
          zoneId: engine.world.locationId,
          outcome: 'victory',
          finalDefeatEventId: 'evt-defeat-2',
          participants: {
            survivors: [],
            finalOpponent: { id: 'goblin-2' },
          },
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual(['Encounter cleared']);
  });

  it('still falls through to the default arm for a genuinely unknown event type', () => {
    const engine = createGame();
    const events = [{ type: 'some.made.up.event', tick: 1, payload: {} }] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual(['event']);
  });

  // F-2218267d legacy note doesn't apply here; this block covers the
  // pre-3.11 shape (no `outcome` key at all) to prove the '?? victory'
  // default (design lock 1) keeps existing 3.10 fixtures/events valid.
  it('treats a payload with no outcome key as victory (legacy 3.10 shape)', () => {
    const engine = createGame();
    const events = [
      {
        type: 'combat.encounter.cleared',
        tick: 1,
        payload: {
          zoneId: engine.world.locationId,
          finalDefeatEventId: 'evt-defeat-legacy',
          participants: {
            survivors: [],
            finalOpponent: { id: 'goblin-legacy', name: 'Old Fixture Goblin' },
          },
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Encounter cleared: Old Fixture Goblin defeated',
    ]);
  });
});

// F-3e09c128 / F-461771d2: engine 3.11 (engagement-core.ts:192-197 victory
// vs :225-272 retreat) added `outcome: 'victory' | 'retreat'` to
// combat.encounter.cleared. Before this fix, describeEvent ignored
// `outcome` entirely and always rendered the victory wording — including
// for the last-hostile-flee retreat branch (engagement-core.ts:258-272),
// which DOES populate finalOpponent.name (the fleeing entity's own name),
// so a player watching the last hostile flee would see "<Name> defeated"
// for an entity that was never defeated. OBSERVED RED (before this fix):
// both cases below returned 'Encounter cleared: <Name> defeated' /
// 'Encounter cleared' instead of the retreat wording asserted here.
describe('describeEvent combat.encounter.cleared retreat outcome (F-3e09c128, F-461771d2)', () => {
  it('names the entity that fled, and never says "defeated" (last-hostile-flee branch)', () => {
    const engine = createGame();
    const events = [
      {
        type: 'combat.encounter.cleared',
        tick: 1,
        payload: {
          zoneId: engine.world.locationId,
          outcome: 'retreat',
          disengageEventId: 'evt-flee-1',
          participants: {
            survivors: [],
            finalOpponent: { id: 'goblin-3', name: 'Goblin Raider' },
          },
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Encounter ended: Goblin Raider withdrew',
    ]);
    expect(context.narrationInput.recentEvents[0]).not.toContain('defeated');
  });

  it('falls back to a generic non-"defeated" message when the player flees (no finalOpponent)', () => {
    const engine = createGame();
    const events = [
      {
        type: 'combat.encounter.cleared',
        tick: 1,
        payload: {
          zoneId: engine.world.locationId,
          outcome: 'retreat',
          disengageEventId: 'evt-flee-2',
          participants: {
            survivors: [],
          },
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Encounter ended without a kill',
    ]);
    expect(context.narrationInput.recentEvents[0]).not.toContain('defeated');
  });
});

// F-45574e0a: engine 3.11 (traversal-core.ts:242-252 zoneMoodFields) adds an
// optional `moodHint` district-mood aside to world.zone.entered's payload.
// OBSERVED RED (before this fix): describeEvent read only
// `p.zoneName ?? p.zoneId`, so the first case below returned bare
// 'Entered Old Chapel' with the moodHint silently dropped.
describe('describeEvent world.zone.entered moodHint (F-45574e0a)', () => {
  it('appends moodHint when the payload provides one', () => {
    const engine = createGame();
    const events = [
      {
        type: 'world.zone.entered',
        tick: 1,
        payload: {
          zoneId: 'old-chapel',
          zoneName: 'Old Chapel',
          previousZoneId: 'chapel-entrance',
          tags: [],
          moodHint: 'a tense hush hangs over the district',
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Entered Old Chapel — a tense hush hangs over the district',
    ]);
  });

  it('renders byte-identical to the pre-fix output when moodHint is absent (unmapped zone)', () => {
    const engine = createGame();
    const events = [
      {
        type: 'world.zone.entered',
        tick: 1,
        payload: {
          zoneId: 'old-chapel',
          zoneName: 'Old Chapel',
          previousZoneId: 'chapel-entrance',
          tags: [],
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual(['Entered Old Chapel']);
  });
});

// WO-A2-6 (slice A2-core §6): describeEvent coverage of every event
// runWorldTick and its called modules emit (world-tick.ts, encounter-spawn.ts,
// npc-agency.ts's effects, faction-agency.ts's effects — see scene-context.ts's
// own header comment above the switch's new cases for the full grep/file
// audit). OBSERVED RED for every case below (before this fix): describeEvent
// had no case for any of these fourteen event types, so each fell through to
// the bare default arm (`event.type.split('.').pop()`), rendering a bare
// fragment like 'spawned' / 'resolved' / 'expired' / 'reaction' / 'departed' /
// 'witnessed' / 'changed' into the narration prompt's 'Recent events:' section
// — exactly the F-262c3f65 collision this wave closes (pressure.spawned /
// opportunity.spawned / encounter.spawned were all indistinguishable
// 'spawned' before these cases existed).
describe('describeEvent world-tick coverage (WO-A2-6)', () => {
  it('renders pressure.spawned via formatPressureForNarrator, naming the subject', () => {
    const engine = createGame();
    const events = [
      {
        type: 'pressure.spawned',
        tick: 1,
        payload: {
          pressureId: 'wp-1',
          kind: 'faction-crackdown',
          description: 'A crackdown is brewing',
          urgency: 0.5,
          visibility: 'visible',
          sourceFactionId: 'the-watch',
          triggeredBy: 'heat-threshold',
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Pressure surfaced: faction-crackdown: A crackdown is brewing (growing)',
    ]);
  });

  it('renders pressure.revealed distinctly from pressure.spawned', () => {
    const engine = createGame();
    const events = [
      {
        type: 'pressure.revealed',
        tick: 1,
        payload: {
          pressureId: 'wp-2',
          kind: 'ambush-plot',
          description: 'Someone is planning an ambush',
          urgency: 0.8,
          visibility: 'visible',
          sourceFactionId: 'raiders',
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Pressure revealed: ambush-plot: Someone is planning an ambush (urgent)',
    ]);
  });

  it('renders pressure.escalated with the narrator band appended', () => {
    const engine = createGame();
    const events = [
      {
        type: 'pressure.escalated',
        tick: 1,
        payload: {
          pressureId: 'wp-3',
          kind: 'supply-crisis',
          description: 'Food stores are running dry',
          urgency: 0.75,
          visibility: 'visible',
          sourceFactionId: 'merchants',
          band: 'urgent',
          heat: 30,
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Pressure escalating: supply-crisis: Food stores are running dry (urgent) [urgent]',
    ]);
  });

  it('renders pressure.expired', () => {
    const engine = createGame();
    const events = [
      {
        type: 'pressure.expired',
        tick: 1,
        payload: {
          pressureId: 'wp-4',
          kind: 'bounty-hunt',
          description: 'A bounty was posted for you',
          urgency: 0.2,
          visibility: 'visible',
          sourceFactionId: 'navy',
          summary: 'The bounty expired unclaimed',
          resolutionType: 'expired-ignored',
          effects: [],
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Pressure expired: bounty-hunt: A bounty was posted for you (distant)',
    ]);
  });

  it('renders pressure.resolved (a faction action closing a pressure directly)', () => {
    const engine = createGame();
    const events = [
      {
        type: 'pressure.resolved',
        tick: 1,
        payload: {
          pressureId: 'wp-5',
          kind: 'trade-war',
          description: 'Two factions are choking trade routes',
          urgency: 0.6,
          visibility: 'visible',
          sourceFactionId: 'guild',
          summary: 'The guild backed down',
          resolutionType: 'faction-resolved',
          effects: [],
          resolvedBy: 'guild',
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Pressure resolved: trade-war: Two factions are choking trade routes (growing)',
    ]);
  });

  it('renders opportunity.spawned from payload fields only (no turnsRemaining on this payload)', () => {
    const engine = createGame();
    const events = [
      {
        type: 'opportunity.spawned',
        tick: 1,
        payload: {
          opportunityId: 'op-1',
          kind: 'bounty',
          title: 'Clear the ratmen from the cellar',
          reason: 'evaluateOpportunities',
          urgency: 0.4,
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Opportunity offered: Clear the ratmen from the cellar',
    ]);
  });

  it('renders opportunity.expired', () => {
    const engine = createGame();
    const events = [
      {
        type: 'opportunity.expired',
        tick: 1,
        payload: {
          opportunityId: 'op-2',
          kind: 'favor',
          title: 'A favor for the innkeeper',
          summary: 'The window closed unclaimed',
          resolutionType: 'expired-ignored',
          effects: [],
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Opportunity expired: A favor for the innkeeper',
    ]);
  });

  it('renders encounter.spawned naming both the encounter and the zone', () => {
    const engine = createGame();
    const events = [
      {
        type: 'encounter.spawned',
        tick: 1,
        payload: {
          encounterId: 'enc-1',
          encounterName: 'Goblin ambush',
          composition: 'ambush',
          zoneId: 'old-road',
          zoneName: 'Old Road',
          label: 'Ambush',
          description: 'Goblins leap from the brush.',
          spawnedEntityIds: ['goblin-1'],
          spawnedEntityNames: ['Goblin Raider'],
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Ambush: Goblin ambush in Old Road',
    ]);
  });

  it('renders npc.action.resolved from narratorHint when present', () => {
    const engine = createGame();
    const events = [
      {
        type: 'npc.action.resolved',
        tick: 1,
        payload: {
          npcId: 'npc-1',
          npcName: 'Mira',
          verb: 'confide',
          description: 'Mira tells you a secret',
          narratorHint: 'Mira leans in with a proposition',
          dialogueHint: undefined,
          effects: [],
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Mira leans in with a proposition',
    ]);
  });

  it('falls back to description when npc.action.resolved carries no narratorHint', () => {
    const engine = createGame();
    const events = [
      {
        type: 'npc.action.resolved',
        tick: 1,
        payload: {
          npcId: 'npc-2',
          npcName: 'Toran',
          verb: 'wait',
          description: 'Toran waits quietly',
          narratorHint: '',
          dialogueHint: undefined,
          effects: [],
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual(['Toran waits quietly']);
  });

  it('renders npc.betrayal.witnessed', () => {
    const engine = createGame();
    const events = [
      {
        type: 'npc.betrayal.witnessed',
        tick: 1,
        payload: {
          npcId: 'npc-3',
          npcName: 'Jace',
          targetEntityId: 'player',
          description: 'sells your location to the guards',
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Betrayal: Jace — sells your location to the guards',
    ]);
  });

  it('renders faction.action.resolved from narratorHint when present', () => {
    const engine = createGame();
    const events = [
      {
        type: 'faction.action.resolved',
        tick: 1,
        payload: {
          factionId: 'the-watch',
          verb: 'patrol',
          description: 'The watch patrols the district',
          narratorHint: 'the-watch patrols are thicker in the district',
          effects: [],
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'the-watch patrols are thicker in the district',
    ]);
  });

  it('renders companion.reaction from narratorHint', () => {
    const engine = createGame();
    const events = [
      {
        type: 'companion.reaction',
        tick: 1,
        payload: {
          npcId: 'comp-1',
          trigger: 'combat-won',
          moraleDelta: 5,
          morale: 65,
          narratorHint: 'Your companion fights with renewed confidence',
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Your companion fights with renewed confidence',
    ]);
  });

  it('renders companion.departed naming the companion and the reason', () => {
    const engine = createGame();
    const events = [
      {
        type: 'companion.departed',
        tick: 1,
        payload: {
          npcId: 'comp-2',
          npcName: 'Sela',
          role: 'guard',
          reason: 'morale broke under betrayal',
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Sela has left the party: morale broke under betrayal',
    ]);
  });

  it('renders world.zone.state.changed (zone-state.ts — coverage beyond the design doc §6 file list, flagged for review)', () => {
    const engine = createGame();
    const events = [
      {
        type: 'world.zone.state.changed',
        tick: 1,
        payload: {
          zoneId: 'market-square',
          zoneName: 'Market Square',
          from: 'stable',
          to: 'strained',
          cause: 'supply-crisis',
          variantTags: ['strained'],
        },
      },
    ] as any;

    const context = buildSceneContext(engine.world, events, 'dark fantasy', []);

    expect(context.narrationInput.recentEvents).toEqual([
      'Market Square has changed: now strained',
    ]);
  });

  // WO-A5-7 (slice A5 §2, design lock 2): buildSceneContext threads the
  // trailing moodTransition param straight onto narrationInput.moodTransition
  // -- see that field's own doc comment (prompts/narrate-scene.ts) for who
  // computes it and why. RED before this wave: buildSceneContext had no such
  // trailing param at all.
  describe('WO-A5-7: moodTransition threading', () => {
    it('threads moodTransition onto narrationInput when provided', () => {
      const engine = createGame();
      const context = buildSceneContext(
        engine.world, [], 'dark fantasy', [],
        undefined, // previousLocationId
        undefined, // characterPresence
        undefined, // activePressures
        undefined, // districtDescriptor
        undefined, // partyPresence
        undefined, // economyContext
        undefined, // craftingContext
        undefined, // opportunityContext
        undefined, // arcContext
        undefined, // endgameContext
        undefined, // situationHint
        { from: 'calm', to: 'grim' }, // moodTransition
      );

      expect(context.narrationInput.moodTransition).toEqual({ from: 'calm', to: 'grim' });
    });

    it('leaves narrationInput.moodTransition undefined when omitted', () => {
      const engine = createGame();
      const context = buildSceneContext(engine.world, [], 'dark fantasy', []);

      expect(context.narrationInput.moodTransition).toBeUndefined();
    });
  });

  // WO-A6-4 (slice A6, design lock 1): buildSceneContext threads the trailing
  // budget param straight onto narrationInput.budget -- see that field's own
  // doc comment (prompts/narrate-scene.ts) for the full contract. RED before
  // this wave: buildSceneContext had no such trailing param at all.
  describe('WO-A6-4: budget threading', () => {
    it('threads budget onto narrationInput when provided', () => {
      const engine = createGame();
      const context = buildSceneContext(
        engine.world, [], 'dark fantasy', [],
        undefined, // previousLocationId
        undefined, // characterPresence
        undefined, // activePressures
        undefined, // districtDescriptor
        undefined, // partyPresence
        undefined, // economyContext
        undefined, // craftingContext
        undefined, // opportunityContext
        undefined, // arcContext
        undefined, // endgameContext
        undefined, // situationHint
        undefined, // moodTransition
        { pressureLines: 3, opportunityLines: 1 }, // budget
      );

      expect(context.narrationInput.budget).toEqual({ pressureLines: 3, opportunityLines: 1 });
    });

    it('leaves narrationInput.budget undefined when omitted', () => {
      const engine = createGame();
      const context = buildSceneContext(engine.world, [], 'dark fantasy', []);

      expect(context.narrationInput.budget).toBeUndefined();
    });
  });
});
