import { describe, it, expect, vi } from 'vitest';
import {
  loadPartyFromSession,
  loadObligationsFromSession,
  loadConsequenceChainsFromSession,
  loadArcSnapshotFromSession,
  type SavedSession,
} from './session.js';
import { createPartyState } from '@ai-rpg-engine/modules';

function makeSession(overrides: Partial<SavedSession> = {}): SavedSession {
  return {
    schemaVersion: 14,
    version: '1.4.0',
    engineState: '{}',
    turnHistory: { turns: [] },
    tone: 'dramatic',
    savedAt: new Date().toISOString(),
    ...overrides,
  };
}

// F-1357a6e0: loadPartyFromSession's `try { return JSON.parse(x) as
// PartyState } catch { return createPartyState() }` pattern only falls back
// on a genuine JSON *syntax* error. A syntactically valid but wrong-shape
// value (e.g. the bare number 42) parses successfully and is trusted as
// PartyState unexamined, reaching every consumer that expects a
// `.companions` array.
describe('loadPartyFromSession', () => {
  it('falls back to createPartyState() when partyState is syntactically valid JSON but the wrong shape', () => {
    const session = makeSession({ partyState: '42' });
    expect(loadPartyFromSession(session)).toEqual(createPartyState());
  });

  it('falls back to createPartyState() when partyState is not valid JSON', () => {
    const session = makeSession({ partyState: 'NOT VALID JSON!!' });
    expect(loadPartyFromSession(session)).toEqual(createPartyState());
  });

  it('falls back to createPartyState() when partyState is a JSON object missing required fields', () => {
    const session = makeSession({ partyState: JSON.stringify({ companions: [] }) });
    expect(loadPartyFromSession(session)).toEqual(createPartyState());
  });

  it('returns the parsed party state when it matches the PartyState shape', () => {
    const party = { companions: [], maxSize: 4, cohesion: 0.5 };
    const session = makeSession({ partyState: JSON.stringify(party) });
    expect(loadPartyFromSession(session)).toEqual(party);
  });

  it('returns createPartyState() when partyState is absent', () => {
    const session = makeSession();
    expect(loadPartyFromSession(session)).toEqual(createPartyState());
  });
});

// F-cb8a8337: loadObligationsFromSession's `try { return new
// Map(Object.entries(JSON.parse(x))) } catch { return new Map() }` pattern
// only falls back on a genuine JSON *syntax* error — same class of gap as
// F-1357a6e0's loadPartyFromSession above, but one level deeper: a
// syntactically valid object whose *values* are the wrong shape (e.g.
// missing `.obligations`) reaches tickNpcAgencyTurn()'s first statement in
// game.ts (`for (const [npcId, ledger] of this.npcObligations) {
// this.npcObligations.set(npcId, tickObligations(ledger)); }`), which does
// `ledger.obligations.map(...)` unguarded in the compiled
// @ai-rpg-engine/modules implementation. Because that call is the very first
// line of the post-turn subsystem-tick block, the throw silently skips every
// subsystem tick after it (pressures, opportunities, arc/endgame detection,
// NPC agency) for the rest of that save's session.
describe('loadObligationsFromSession (F-cb8a8337)', () => {
  const validObligation = {
    id: 'obl-1',
    kind: 'favor',
    direction: 'npc-owes-player',
    npcId: 'npc-1',
    counterpartyId: 'player',
    magnitude: 5,
    sourceTag: 'test',
    createdAtTick: 1,
    decayTurns: null,
  };

  it('returns an empty Map when npcObligations is absent', () => {
    const session = makeSession();
    expect(loadObligationsFromSession(session)).toEqual(new Map());
  });

  it('falls back to an empty Map when npcObligations is not valid JSON', () => {
    const session = makeSession({ npcObligations: 'NOT VALID JSON!!' });
    expect(loadObligationsFromSession(session)).toEqual(new Map());
  });

  it('falls back to an empty Map when the parsed value is not an object at all (e.g. a bare number)', () => {
    const session = makeSession({ npcObligations: '42' });
    expect(loadObligationsFromSession(session)).toEqual(new Map());
  });

  it('keeps a well-shaped ledger entry', () => {
    const session = makeSession({
      npcObligations: JSON.stringify({ 'npc-1': { obligations: [validObligation] } }),
    });
    const result = loadObligationsFromSession(session);
    expect(result.get('npc-1')).toEqual({ obligations: [validObligation] });
  });

  it('drops a ledger entry whose obligations field is missing/wrong-shape, with a console.warn, instead of letting it reach the Map', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A hand-edited or schema-drifted save: 'obligations' is an object, not
    // an array — the exact shape that crashes tickObligations()'s
    // `ledger.obligations.map(...)` in game.ts's post-turn tick.
    const session = makeSession({
      npcObligations: JSON.stringify({ 'npc-bad': { obligations: { not: 'an array' } } }),
    });
    const result = loadObligationsFromSession(session);
    expect(result.has('npc-bad')).toBe(false);
    expect(result.size).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('drops a ledger entry whose obligations array holds a malformed obligation (missing required fields)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      npcObligations: JSON.stringify({ 'npc-bad': { obligations: [{ id: 'obl-1' }] } }),
    });
    const result = loadObligationsFromSession(session);
    expect(result.has('npc-bad')).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('keeps valid entries while dropping invalid ones in the same save (mixed batch)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      npcObligations: JSON.stringify({
        'npc-good': { obligations: [validObligation] },
        'npc-bad': { obligations: null },
      }),
    });
    const result = loadObligationsFromSession(session);
    expect(result.size).toBe(1);
    expect(result.has('npc-good')).toBe(true);
    expect(result.has('npc-bad')).toBe(false);
    warnSpy.mockRestore();
  });
});

// F-5bfeeab2: loadConsequenceChainsFromSession shares the exact same
// unguarded-cast pattern as loadObligationsFromSession above (focus probe 2
// found both loaders in the same sibling sweep). tickNpcAgencyTurn() does
// `tickConsequenceChain(chain)` then `shouldResolveChainStep(updated)` on
// every entry of this.activeConsequenceChains every turn; the compiled
// @ai-rpg-engine/modules implementation does `chain.currentStep <
// chain.steps.length` unguarded.
describe('loadConsequenceChainsFromSession (F-5bfeeab2)', () => {
  const validChain = {
    id: 'chain-1',
    npcId: 'npc-1',
    kind: 'retaliation',
    trigger: 'test',
    steps: [{ delayTurns: 1, verb: 'warn', description: 'warns you' }],
    currentStep: 0,
    turnsUntilNext: 1,
    resolved: false,
    createdAtTick: 1,
  };

  it('returns an empty Map when consequenceChains is absent', () => {
    const session = makeSession();
    expect(loadConsequenceChainsFromSession(session)).toEqual(new Map());
  });

  it('falls back to an empty Map when consequenceChains is not valid JSON', () => {
    const session = makeSession({ consequenceChains: 'NOT VALID JSON!!' });
    expect(loadConsequenceChainsFromSession(session)).toEqual(new Map());
  });

  it('falls back to an empty Map when the parsed value is not an object at all (e.g. a bare number)', () => {
    const session = makeSession({ consequenceChains: '42' });
    expect(loadConsequenceChainsFromSession(session)).toEqual(new Map());
  });

  it('keeps a well-shaped chain entry', () => {
    const session = makeSession({
      consequenceChains: JSON.stringify({ 'npc-1': validChain }),
    });
    const result = loadConsequenceChainsFromSession(session);
    expect(result.get('npc-1')).toEqual(validChain);
  });

  it('drops a chain entry whose steps field is missing/wrong-shape, with a console.warn, instead of letting it reach the Map', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const badChain = { ...validChain, steps: undefined };
    const session = makeSession({
      consequenceChains: JSON.stringify({ 'npc-bad': badChain }),
    });
    const result = loadConsequenceChainsFromSession(session);
    expect(result.has('npc-bad')).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('drops a chain entry with a wrong-typed currentStep/turnsUntilNext/resolved field (the exact fields shouldResolveChainStep dereferences unguarded)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const badChain = { ...validChain, currentStep: 'zero' };
    const session = makeSession({
      consequenceChains: JSON.stringify({ 'npc-bad': badChain }),
    });
    const result = loadConsequenceChainsFromSession(session);
    expect(result.has('npc-bad')).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('keeps valid entries while dropping invalid ones in the same save (mixed batch)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      consequenceChains: JSON.stringify({
        'npc-good': validChain,
        'npc-bad': { ...validChain, steps: 'not-an-array' },
      }),
    });
    const result = loadConsequenceChainsFromSession(session);
    expect(result.size).toBe(1);
    expect(result.has('npc-good')).toBe(true);
    expect(result.has('npc-bad')).toBe(false);
    warnSpy.mockRestore();
  });
});

// F-d521bb19: loadArcSnapshotFromSession's `JSON.parse(x) as ArcSnapshot |
// null` cast trusts a syntactically valid but wrong-shape value unexamined.
// Two real consumers dereference `.signals` unguarded once this is restored:
// the `/status` command (game.ts: `this.arcSnapshot.signals.find(...)`,
// reachable as the player's very first command after loading a save) and
// tickArcDetection()'s buildArcSnapshot() call, which runs unconditionally
// every turn (compiled @ai-rpg-engine/modules: `previous.signals.find(...)`
// unguarded whenever `previous` is truthy).
describe('loadArcSnapshotFromSession (F-d521bb19)', () => {
  const validSnapshot = {
    signals: [{ kind: 'rising-power', strength: 0.6, momentum: 'building', primaryDrivers: [], turnsActive: 3 }],
    dominantArc: 'rising-power',
    tick: 10,
  };

  it('returns null when arcSnapshot is absent', () => {
    const session = makeSession();
    expect(loadArcSnapshotFromSession(session)).toBeNull();
  });

  it('falls back to null when arcSnapshot is not valid JSON', () => {
    const session = makeSession({ arcSnapshot: 'NOT VALID JSON!!' });
    expect(loadArcSnapshotFromSession(session)).toBeNull();
  });

  it('falls back to null when arcSnapshot is syntactically valid JSON but the wrong shape (e.g. a bare number)', () => {
    const session = makeSession({ arcSnapshot: '42' });
    expect(loadArcSnapshotFromSession(session)).toBeNull();
  });

  it('falls back to null when signals is missing/wrong-shape', () => {
    const session = makeSession({ arcSnapshot: JSON.stringify({ dominantArc: null, tick: 1 }) });
    expect(loadArcSnapshotFromSession(session)).toBeNull();
  });

  it('falls back to null when dominantArc is neither null nor a string', () => {
    const session = makeSession({
      arcSnapshot: JSON.stringify({ signals: [], dominantArc: 42, tick: 1 }),
    });
    expect(loadArcSnapshotFromSession(session)).toBeNull();
  });

  it('falls back to null when tick is missing/wrong-shape', () => {
    const session = makeSession({
      arcSnapshot: JSON.stringify({ signals: [], dominantArc: null, tick: '10' }),
    });
    expect(loadArcSnapshotFromSession(session)).toBeNull();
  });

  it('returns the parsed snapshot when it matches the ArcSnapshot shape', () => {
    const session = makeSession({ arcSnapshot: JSON.stringify(validSnapshot) });
    expect(loadArcSnapshotFromSession(session)).toEqual(validSnapshot);
  });
});
