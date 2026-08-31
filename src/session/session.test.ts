import { describe, it, expect, vi } from 'vitest';
import {
  loadPartyFromSession,
  loadObligationsFromSession,
  loadConsequenceChainsFromSession,
  loadArcSnapshotFromSession,
  loadNpcAgencyFromSession,
  loadPresentationStateFromSession,
  loadChronicleFromSession,
  loadNpcConversationsFromSession,
  loadEconomiesFromSession,
  loadOpportunitiesFromSession,
  loadResolvedOpportunitiesFromSession,
  loadEndgameTriggersFromSession,
  loadFinaleFromSession,
  type SavedSession,
} from './session.js';
import { createPartyState } from '@ai-rpg-engine/modules';
import { CampaignJournal } from '@ai-rpg-engine/campaign-memory';

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

  // F-c2d4ba19: sibling gap one level deeper than F-1357a6e0's own top-level
  // fix above — isValidPartyState checked Array.isArray(p.companions) but
  // never validated each companion's own shape, the same gap already found
  // and fixed on isValidArcSnapshot (F-1c412093) and isValidConsequenceChain
  // (F-dd2851cb). The compiled @ai-rpg-engine/modules companion-core.js
  // dereferences `.npcId` unguarded in addCompanion/getCompanion/
  // isCompanion/setCompanionActive/adjustCompanionMorale, `.active`
  // unguarded in getActiveCompanions/computePartyCohesion, and `.morale`
  // unguarded in computePartyCohesion/adjustCompanionMorale — a companions
  // array containing a malformed element (e.g. null, or missing npcId)
  // passed this validator unchanged and reached game.ts's
  // `this.partyState.companions.some((c) => c.npcId === effect.npcId)`
  // (game.ts:1458) and every companion-core call gated behind
  // `this.partyState.companions.length > 0` (game.ts:873) unexamined.
  const validCompanion = { npcId: 'npc-1', role: 'fighter', joinedAtTick: 0, abilityTags: [], morale: 50, active: true };

  it('falls back to createPartyState() when companions contains a malformed element (null), even though the array itself and every top-level field are well-typed', () => {
    const session = makeSession({
      partyState: JSON.stringify({ companions: [null], maxSize: 4, cohesion: 0.5 }),
    });
    expect(loadPartyFromSession(session)).toEqual(createPartyState());
  });

  it('falls back to createPartyState() when a companion element is missing required fields (wrong shape, not null)', () => {
    const session = makeSession({
      partyState: JSON.stringify({ companions: [{ npcId: 'npc-1' }], maxSize: 4, cohesion: 0.5 }),
    });
    expect(loadPartyFromSession(session)).toEqual(createPartyState());
  });

  it('falls back to createPartyState() when a companion element has wrong-typed active/morale fields', () => {
    const session = makeSession({
      partyState: JSON.stringify({
        companions: [{ ...validCompanion, active: 'yes', morale: '50' }],
        maxSize: 4,
        cohesion: 0.5,
      }),
    });
    expect(loadPartyFromSession(session)).toEqual(createPartyState());
  });

  it('returns the parsed party state when every companion matches the CompanionState shape', () => {
    const party = { companions: [validCompanion], maxSize: 4, cohesion: 0.5 };
    const session = makeSession({ partyState: JSON.stringify(party) });
    expect(loadPartyFromSession(session)).toEqual(party);
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

  it('drops a ledger entry whose obligations field is missing/wrong-shape, with a console.warn when debug is enabled, instead of letting it reach the Map', () => {
    // F-34078c07: this diagnostic is now gated behind --debug/
    // CLAUDE_RPG_DEBUG — see the "does not warn" test below for the
    // default (non-debug) case this finding was actually about.
    vi.stubEnv('CLAUDE_RPG_DEBUG', '1');
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
    vi.unstubAllEnvs();
  });

  it('drops a ledger entry whose obligations array holds a malformed obligation (missing required fields)', () => {
    vi.stubEnv('CLAUDE_RPG_DEBUG', '1');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      npcObligations: JSON.stringify({ 'npc-bad': { obligations: [{ id: 'obl-1' }] } }),
    });
    const result = loadObligationsFromSession(session);
    expect(result.has('npc-bad')).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
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

  it('does NOT console.warn by default (no --debug/CLAUDE_RPG_DEBUG) when dropping a malformed entry (F-34078c07)', () => {
    // Previously this warned unconditionally, mixing raw diagnostic text
    // into a normal player's terminal the moment they loaded an old or
    // hand-edited save. Routed through debug-logger.ts's isDebugEnabled()
    // gate so it's silent by default, matching every other DebugLogger-
    // gated diagnostic in this codebase.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      npcObligations: JSON.stringify({ 'npc-bad': { obligations: { not: 'an array' } } }),
    });
    const result = loadObligationsFromSession(session);
    expect(result.has('npc-bad')).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
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

  it('drops a chain entry whose steps field is missing/wrong-shape, with a console.warn when debug is enabled, instead of letting it reach the Map', () => {
    // F-34078c07: this diagnostic is now gated behind --debug/
    // CLAUDE_RPG_DEBUG — see the "does not warn" test below for the
    // default (non-debug) case this finding was actually about.
    vi.stubEnv('CLAUDE_RPG_DEBUG', '1');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const badChain = { ...validChain, steps: undefined };
    const session = makeSession({
      consequenceChains: JSON.stringify({ 'npc-bad': badChain }),
    });
    const result = loadConsequenceChainsFromSession(session);
    expect(result.has('npc-bad')).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('drops a chain entry with a wrong-typed currentStep/turnsUntilNext/resolved field (the exact fields shouldResolveChainStep dereferences unguarded)', () => {
    vi.stubEnv('CLAUDE_RPG_DEBUG', '1');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const badChain = { ...validChain, currentStep: 'zero' };
    const session = makeSession({
      consequenceChains: JSON.stringify({ 'npc-bad': badChain }),
    });
    const result = loadConsequenceChainsFromSession(session);
    expect(result.has('npc-bad')).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
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

  // F-dd2851cb: sibling gap one level deeper than F-5bfeeab2's own top-level
  // fix above — isValidConsequenceChain checked Array.isArray(c.steps) but
  // never validated each step's own shape. The compiled
  // @ai-rpg-engine/modules resolveConsequenceChainStep does `step.verb` /
  // `step.description` on chain.steps[chain.currentStep] and
  // `chain.steps[nextStep].delayTurns` on the next entry, all unguarded — a
  // chain whose steps array contains a malformed element (e.g. null) passed
  // this validator unchanged and reached game.ts's tickNpcAgencyTurn(),
  // crashing every subsequent turn for the rest of the session.
  it('drops a chain entry whose steps array contains a malformed element (null), even though the array itself and every chain-level field are well-typed', () => {
    vi.stubEnv('CLAUDE_RPG_DEBUG', '1');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const badChain = {
      ...validChain,
      steps: [null, { delayTurns: 1, verb: 'warn', description: 'warns you' }],
    };
    const session = makeSession({
      consequenceChains: JSON.stringify({ 'npc-bad': badChain }),
    });
    const result = loadConsequenceChainsFromSession(session);
    expect(result.has('npc-bad')).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('drops a chain entry whose steps array contains a step missing required fields (wrong shape, not null)', () => {
    vi.stubEnv('CLAUDE_RPG_DEBUG', '1');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const badChain = { ...validChain, steps: [{ delayTurns: 1 }] };
    const session = makeSession({
      consequenceChains: JSON.stringify({ 'npc-bad': badChain }),
    });
    const result = loadConsequenceChainsFromSession(session);
    expect(result.has('npc-bad')).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('keeps a well-shaped chain entry while dropping a sibling entry whose steps array holds a malformed element, in the same save (mixed batch)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      consequenceChains: JSON.stringify({
        'npc-good': validChain,
        'npc-bad': { ...validChain, steps: [null] },
      }),
    });
    const result = loadConsequenceChainsFromSession(session);
    expect(result.size).toBe(1);
    expect(result.has('npc-good')).toBe(true);
    expect(result.get('npc-good')).toEqual(validChain);
    expect(result.has('npc-bad')).toBe(false);
    warnSpy.mockRestore();
  });

  it('does NOT console.warn by default (no --debug/CLAUDE_RPG_DEBUG) when dropping a malformed entry (F-34078c07)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const badChain = { ...validChain, steps: undefined };
    const session = makeSession({
      consequenceChains: JSON.stringify({ 'npc-bad': badChain }),
    });
    const result = loadConsequenceChainsFromSession(session);
    expect(result.has('npc-bad')).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// F-34078c07: loadChronicleFromSession's corrupt-chronicle fallback used a
// bare, unconditional console.warn -- the same anti-pattern as
// loadObligationsFromSession/loadConsequenceChainsFromSession above, in a
// function that previously had no dedicated test coverage at all.
describe('loadChronicleFromSession (F-34078c07)', () => {
  it('returns an empty journal when chronicleRecords is absent', () => {
    const session = makeSession();
    const journal = loadChronicleFromSession(session);
    expect(journal).toBeInstanceOf(CampaignJournal);
    expect(journal.serialize().records).toEqual([]);
  });

  it('falls back to an empty journal, with a console.warn when debug is enabled, when chronicleRecords is not valid JSON', () => {
    vi.stubEnv('CLAUDE_RPG_DEBUG', '1');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({ chronicleRecords: 'NOT VALID JSON!!' });

    const journal = loadChronicleFromSession(session);

    expect(journal.serialize().records).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('Chronicle could not be restored');
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('does NOT console.warn by default (no --debug/CLAUDE_RPG_DEBUG) when chronicleRecords is corrupt (F-34078c07)', () => {
    // Previously this warned unconditionally -- raw diagnostic text mixed
    // into a normal player's terminal the moment they loaded a save whose
    // chronicle failed to restore, starting an empty journal silently in
    // every other respect except this one unstyled stderr line.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({ chronicleRecords: 'NOT VALID JSON!!' });

    const journal = loadChronicleFromSession(session);

    expect(journal.serialize().records).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
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

  // F-1c412093: sibling gap one level deeper than F-d521bb19's own top-level
  // fix above — isValidArcSnapshot checked Array.isArray(a.signals) but
  // never validated each signal's own shape. The compiled
  // @ai-rpg-engine/modules buildArcSnapshot does `previous.signals.find((s)
  // => s.kind === signal.kind)` unguarded whenever a previous snapshot is
  // passed in (tickArcDetection() does this every turn), and game.ts's
  // '/status' command handler does `this.arcSnapshot.signals.find((s) =>
  // s.kind === ...)` directly too — a snapshot whose signals array contains
  // a malformed element (e.g. null) passed this validator unchanged.
  it('falls back to null when signals contains a malformed element (null), even though the array itself and every top-level field are well-typed', () => {
    const session = makeSession({
      arcSnapshot: JSON.stringify({
        signals: [
          null,
          { kind: 'rising-power', strength: 0.6, momentum: 'building', primaryDrivers: [], turnsActive: 3 },
        ],
        dominantArc: 'rising-power',
        tick: 10,
      }),
    });
    expect(loadArcSnapshotFromSession(session)).toBeNull();
  });

  it('falls back to null when a signal element is missing required fields (wrong shape, not null)', () => {
    const session = makeSession({
      arcSnapshot: JSON.stringify({
        signals: [{ kind: 'rising-power' }],
        dominantArc: null,
        tick: 10,
      }),
    });
    expect(loadArcSnapshotFromSession(session)).toBeNull();
  });
});

// F-0b05c26c: loadNpcAgencyFromSession's `{ profiles: data.profiles ?? [],
// actions: data.actions ?? [] }` pattern only substitutes defaults for
// null/undefined — it never checked that data.profiles/data.actions are
// arrays, let alone validated element shape, unlike every sibling loader in
// this file (each guarded by its own isValidX() type predicate). A
// syntactically-valid but wrong-shaped snapshot (e.g.
// `{"profiles":[],"actions":42}`) passed straight through, reaching
// formatNpcAgencyForNarrator's `results.slice(0, 2)` (throws on a non-array)
// and generateNpcTextures' `for (const profile of profiles)` (compiled
// @ai-rpg-engine/modules) with no guard — and unlike every other loader in
// this file, this call sits in game.ts's processInput() with no enclosing
// try/catch, so the crash aborted the entire turn on the first ordinary
// action after loading the bad save, repeating identically forever.
describe('loadNpcAgencyFromSession (F-0b05c26c)', () => {
  const validProfile = {
    npcId: 'npc-1',
    name: 'Old Man Winters',
    factionId: null,
    goals: [{ id: 'g1', label: 'survive', priority: 1, verb: 'flee', reason: 'scared' }],
    relationship: { trust: 0, fear: 0, greed: 0, loyalty: 0 },
    breakpoint: 'wavering',
    dominantAxis: 'fear',
    leverageAngle: 'appeal to fear',
    knownRumors: [],
    underPressure: false,
  };
  const validAction = {
    action: { npcId: 'npc-1', verb: 'flee', description: 'flees' },
    effects: [],
    narratorHint: 'Winters bolts for the door.',
  };

  it('returns empty profiles/actions when npcAgencySnapshot is absent', () => {
    const session = makeSession();
    expect(loadNpcAgencyFromSession(session)).toEqual({ profiles: [], actions: [] });
  });

  it('falls back to empty profiles/actions when npcAgencySnapshot is not valid JSON', () => {
    const session = makeSession({ npcAgencySnapshot: 'NOT VALID JSON!!' });
    expect(loadNpcAgencyFromSession(session)).toEqual({ profiles: [], actions: [] });
  });

  it('falls back to empty profiles/actions when the parsed value is not an object at all (e.g. a bare number)', () => {
    const session = makeSession({ npcAgencySnapshot: '42' });
    expect(loadNpcAgencyFromSession(session)).toEqual({ profiles: [], actions: [] });
  });

  // The finding's own documented trigger shape: actions present but the
  // wrong type entirely — `??` alone lets this straight through unexamined.
  it('falls back to an empty actions array when actions is syntactically valid JSON but not an array (e.g. a bare number)', () => {
    const session = makeSession({
      npcAgencySnapshot: JSON.stringify({ profiles: [], actions: 42 }),
    });
    expect(loadNpcAgencyFromSession(session)).toEqual({ profiles: [], actions: [] });
  });

  it('falls back to an empty profiles array when profiles is syntactically valid JSON but not an array', () => {
    const session = makeSession({
      npcAgencySnapshot: JSON.stringify({ profiles: { not: 'an array' }, actions: [] }),
    });
    expect(loadNpcAgencyFromSession(session)).toEqual({ profiles: [], actions: [] });
  });

  it('falls back to an empty profiles array when it contains a malformed element (null), even though the array itself is well-typed', () => {
    const session = makeSession({
      npcAgencySnapshot: JSON.stringify({ profiles: [validProfile, null], actions: [] }),
    });
    expect(loadNpcAgencyFromSession(session)).toEqual({ profiles: [], actions: [] });
  });

  it('falls back to an empty actions array when it contains an element missing required fields (wrong shape, not null)', () => {
    const session = makeSession({
      npcAgencySnapshot: JSON.stringify({ profiles: [], actions: [{ action: validAction.action }] }),
    });
    expect(loadNpcAgencyFromSession(session)).toEqual({ profiles: [], actions: [] });
  });

  it('returns the parsed profiles/actions when both match shape', () => {
    const session = makeSession({
      npcAgencySnapshot: JSON.stringify({ profiles: [validProfile], actions: [validAction] }),
    });
    expect(loadNpcAgencyFromSession(session)).toEqual({ profiles: [validProfile], actions: [validAction] });
  });
});

// F-8c3e32b7: SavedSession previously carried no field describing
// presentation state (combat/dialogue/aftermath/menu/exploration), so a
// reload always resumed narrateScene's presentationState hint at
// 'exploration' regardless of what the player actually just experienced
// before saving/autosaving. This loader is the read side of that fix — see
// GameConfig.restoredPresentationState (game.ts) for how a caller applies
// the returned label to a freshly-constructed ImmersionRuntime.
describe('loadPresentationStateFromSession (F-8c3e32b7)', () => {
  it('returns undefined when the save predates this field', () => {
    const session = makeSession();
    expect(loadPresentationStateFromSession(session)).toBeUndefined();
  });

  it('returns the persisted presentation-state label', () => {
    const session = makeSession({ presentationState: 'combat' });
    expect(loadPresentationStateFromSession(session)).toBe('combat');
  });
});

// F-462792bb (SLATE-2, persisted per Director ruling R2): mirrors
// loadObligationsFromSession's exact per-entry try/validate/drop discipline
// -- npcConversations is a Map<string, ConversationExchange[]> (array value,
// not an object with a nested field), so the per-entry validator checks
// Array.isArray + every-element shape instead of a single object's fields.
describe('loadNpcConversationsFromSession (F-462792bb)', () => {
  const validExchange = { speaker: 'Player', text: 'hello there' };

  it('returns an empty Map when npcConversations is absent', () => {
    const session = makeSession();
    expect(loadNpcConversationsFromSession(session)).toEqual(new Map());
  });

  it('falls back to an empty Map when npcConversations is not valid JSON', () => {
    const session = makeSession({ npcConversations: 'NOT VALID JSON!!' });
    expect(loadNpcConversationsFromSession(session)).toEqual(new Map());
  });

  it('falls back to an empty Map when the parsed value is not an object at all (e.g. a bare number)', () => {
    const session = makeSession({ npcConversations: '42' });
    expect(loadNpcConversationsFromSession(session)).toEqual(new Map());
  });

  it('round-trips a populated map through save-shape JSON -> load (deep equality)', () => {
    const populated = new Map([
      ['pilgrim', [validExchange, { speaker: 'Suspicious Pilgrim', text: 'What do you want?' }]],
      ['sister-maren', [{ speaker: 'Player', text: 'Are you well?' }]],
    ]);
    // Identical serialization shape to saveSession()'s own
    // `JSON.stringify(Object.fromEntries(npcConversations))`.
    const session = makeSession({ npcConversations: JSON.stringify(Object.fromEntries(populated)) });

    const result = loadNpcConversationsFromSession(session);

    expect(result).toEqual(populated);
  });

  it('drops an entry whose value is not an array, with a console.warn when debug is enabled', () => {
    vi.stubEnv('CLAUDE_RPG_DEBUG', '1');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      npcConversations: JSON.stringify({ 'npc-bad': { not: 'an array' } }),
    });

    const result = loadNpcConversationsFromSession(session);

    expect(result.has('npc-bad')).toBe(false);
    expect(result.size).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('drops an entry whose array holds a malformed exchange (missing required fields)', () => {
    vi.stubEnv('CLAUDE_RPG_DEBUG', '1');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      npcConversations: JSON.stringify({ 'npc-bad': [{ speaker: 'Player' }] }),
    });

    const result = loadNpcConversationsFromSession(session);

    expect(result.has('npc-bad')).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('keeps valid entries while dropping invalid ones in the same save (mixed batch)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      npcConversations: JSON.stringify({
        'npc-good': [validExchange],
        'npc-bad': [{ speaker: 42, text: 'wrong type' }],
      }),
    });

    const result = loadNpcConversationsFromSession(session);

    expect(result.size).toBe(1);
    expect(result.has('npc-good')).toBe(true);
    expect(result.has('npc-bad')).toBe(false);
    warnSpy.mockRestore();
  });

  it('does NOT console.warn by default (no --debug/CLAUDE_RPG_DEBUG) when dropping a malformed entry', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      npcConversations: JSON.stringify({ 'npc-bad': { not: 'an array' } }),
    });

    const result = loadNpcConversationsFromSession(session);

    expect(result.has('npc-bad')).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// F-afe91227: loadEconomiesFromSession's `JSON.parse(x) as Record<string,
// DistrictEconomy>` cast trusted a syntactically valid but wrong-shape
// entry unexamined. The compiled @ai-rpg-engine/modules tickDistrictEconomy
// — called every turn via game-state.ts's tickDistrictEconomies() over
// every Map entry — iterates its own fixed 8-category list and does
// `economy.supplies[cat].level` UNGUARDED for each, so a `.supplies`
// missing even one category (or holding a non-object/non-numeric-level at
// one) throws building the very next turn.
describe('loadEconomiesFromSession (F-afe91227)', () => {
  const SUPPLY_CATEGORIES = [
    'medicine', 'weapons', 'ammunition', 'food', 'fuel', 'luxuries', 'components', 'contraband',
  ] as const;
  const validSupplies = Object.fromEntries(
    SUPPLY_CATEGORIES.map((category) => [category, { category, level: 50, trend: 'stable' }]),
  );
  const validEconomy = {
    supplies: validSupplies,
    tradeVolume: 40,
    blackMarketActive: false,
    lastUpdateTick: 3,
  };

  it('returns an empty Map when districtEconomies is absent', () => {
    const session = makeSession();
    expect(loadEconomiesFromSession(session)).toEqual(new Map());
  });

  it('falls back to an empty Map when districtEconomies is not valid JSON', () => {
    const session = makeSession({ districtEconomies: 'NOT VALID JSON!!' });
    expect(loadEconomiesFromSession(session)).toEqual(new Map());
  });

  it('falls back to an empty Map when the parsed value is not an object at all (e.g. a bare number)', () => {
    const session = makeSession({ districtEconomies: '42' });
    expect(loadEconomiesFromSession(session)).toEqual(new Map());
  });

  it('keeps a well-shaped economy entry', () => {
    const session = makeSession({
      districtEconomies: JSON.stringify({ 'district-1': validEconomy }),
    });
    const result = loadEconomiesFromSession(session);
    expect(result.get('district-1')).toEqual(validEconomy);
  });

  it("drops an entry whose supplies field is missing a category — the exact shape that crashes tickDistrictEconomy's per-category .level read, with a console.warn when debug is enabled", () => {
    vi.stubEnv('CLAUDE_RPG_DEBUG', '1');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { contraband: _contraband, ...suppliesMissingContraband } = validSupplies;
    const session = makeSession({
      districtEconomies: JSON.stringify({
        'district-bad': { ...validEconomy, supplies: suppliesMissingContraband },
      }),
    });
    const result = loadEconomiesFromSession(session);
    expect(result.has('district-bad')).toBe(false);
    expect(result.size).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('drops an entry whose supplies field is missing entirely', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      districtEconomies: JSON.stringify({
        'district-bad': { tradeVolume: 40, blackMarketActive: false, lastUpdateTick: 3 },
      }),
    });
    const result = loadEconomiesFromSession(session);
    expect(result.has('district-bad')).toBe(false);
    warnSpy.mockRestore();
  });

  it('drops an entry whose supply category holds a non-numeric level', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      districtEconomies: JSON.stringify({
        'district-bad': {
          ...validEconomy,
          supplies: { ...validSupplies, medicine: { category: 'medicine', level: '50', trend: 'stable' } },
        },
      }),
    });
    const result = loadEconomiesFromSession(session);
    expect(result.has('district-bad')).toBe(false);
    warnSpy.mockRestore();
  });

  it('keeps valid entries while dropping invalid ones in the same save (mixed batch)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      districtEconomies: JSON.stringify({
        'district-good': validEconomy,
        'district-bad': { ...validEconomy, supplies: null },
      }),
    });
    const result = loadEconomiesFromSession(session);
    expect(result.size).toBe(1);
    expect(result.has('district-good')).toBe(true);
    expect(result.has('district-bad')).toBe(false);
    warnSpy.mockRestore();
  });

  it('does NOT console.warn by default (no --debug/CLAUDE_RPG_DEBUG) when dropping a malformed entry', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      districtEconomies: JSON.stringify({ 'district-bad': { supplies: null } }),
    });
    const result = loadEconomiesFromSession(session);
    expect(result.has('district-bad')).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// F-afe91227 (sibling pass): the coordinator brief named
// loadOpportunitiesFromSession, loadResolvedOpportunitiesFromSession,
// loadEndgameTriggersFromSession and loadFinaleFromSession as sharing
// loadEconomiesFromSession's exact unguarded-cast shape
// (`JSON.parse(x) as T` with zero shape check) — probed and confirmed each
// has a real unguarded downstream consumer (see each isValidXxx's doc
// comment in session.ts). Compact coverage per loader below: absent/
// corrupt-JSON falls back to the empty value, a malformed element is
// dropped (or the whole value discarded, for the singular FinaleOutline
// loader), and a well-shaped value survives untouched.
describe('loadOpportunitiesFromSession (F-afe91227)', () => {
  const validOpportunity = {
    id: 'opp-1', kind: 'contract', status: 'available', title: 'Test contract',
    turnsRemaining: 5, createdAtTick: 1, visibility: 'known',
  };

  it('returns [] when activeOpportunities is absent or not valid JSON', () => {
    expect(loadOpportunitiesFromSession(makeSession())).toEqual([]);
    expect(loadOpportunitiesFromSession(makeSession({ activeOpportunities: 'NOT JSON' }))).toEqual([]);
  });

  it('keeps a well-shaped opportunity', () => {
    const session = makeSession({ activeOpportunities: JSON.stringify([validOpportunity]) });
    expect(loadOpportunitiesFromSession(session)).toEqual([validOpportunity]);
  });

  it("drops a malformed element (null) while keeping a well-shaped sibling — formatOpportunityForDirector's opp.kind.toUpperCase() would throw on the null entry unguarded", () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      activeOpportunities: JSON.stringify([validOpportunity, null]),
    });
    expect(loadOpportunitiesFromSession(session)).toEqual([validOpportunity]);
    warnSpy.mockRestore();
  });

  it('drops an element missing required fields (wrong shape, not null)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      activeOpportunities: JSON.stringify([{ id: 'opp-bad' }]),
    });
    expect(loadOpportunitiesFromSession(session)).toEqual([]);
    warnSpy.mockRestore();
  });
});

describe('loadResolvedOpportunitiesFromSession (F-afe91227)', () => {
  const validFallout = {
    resolution: {
      opportunityId: 'opp-1', opportunityKind: 'contract',
      resolutionType: 'completed', resolvedAtTick: 4,
    },
    effects: [],
    summary: 'Completed a contract.',
  };

  it('returns [] when resolvedOpportunities is absent or not valid JSON', () => {
    expect(loadResolvedOpportunitiesFromSession(makeSession())).toEqual([]);
    expect(loadResolvedOpportunitiesFromSession(makeSession({ resolvedOpportunities: 'NOT JSON' }))).toEqual([]);
  });

  it('keeps a well-shaped fallout entry', () => {
    const session = makeSession({ resolvedOpportunities: JSON.stringify([validFallout]) });
    expect(loadResolvedOpportunitiesFromSession(session)).toEqual([validFallout]);
  });

  it('drops an entry whose .resolution is missing — computeOpportunityRecapEntries reads fallout.resolution.resolutionType unguarded, two levels deep', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({
      resolvedOpportunities: JSON.stringify([{ effects: [], summary: 'no resolution field' }]),
    });
    expect(loadResolvedOpportunitiesFromSession(session)).toEqual([]);
    warnSpy.mockRestore();
  });
});

describe('loadEndgameTriggersFromSession (F-afe91227)', () => {
  const validTrigger = {
    id: 'trig-1', resolutionClass: 'victory', detectedAtTick: 10,
    reason: 'test', evidence: {}, dominantArc: null, acknowledged: false,
  };

  it('returns [] when endgameTriggers is absent or not valid JSON', () => {
    expect(loadEndgameTriggersFromSession(makeSession())).toEqual([]);
    expect(loadEndgameTriggersFromSession(makeSession({ endgameTriggers: 'NOT JSON' }))).toEqual([]);
  });

  it('keeps a well-shaped trigger', () => {
    const session = makeSession({ endgameTriggers: JSON.stringify([validTrigger]) });
    expect(loadEndgameTriggersFromSession(session)).toEqual([validTrigger]);
  });

  it("drops an entry with a missing resolutionClass — formatEndgameForNarrator does trigger.resolutionClass.replace(...) unguarded", () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { resolutionClass: _resolutionClass, ...triggerMissingResolutionClass } = validTrigger;
    const session = makeSession({
      endgameTriggers: JSON.stringify([triggerMissingResolutionClass]),
    });
    expect(loadEndgameTriggersFromSession(session)).toEqual([]);
    warnSpy.mockRestore();
  });
});

describe('loadFinaleFromSession (F-afe91227)', () => {
  const validOutline = {
    resolutionClass: 'victory', dominantArc: 'ambition', campaignDuration: 40,
    totalChronicleEvents: 12, keyMoments: [], npcFates: [], factionFates: [],
    districtFates: [], companionFates: [], legacy: [], epilogueSeeds: [],
  };

  it('returns null when finaleOutline is absent or not valid JSON', () => {
    expect(loadFinaleFromSession(makeSession())).toBeNull();
    expect(loadFinaleFromSession(makeSession({ finaleOutline: 'NOT JSON' }))).toBeNull();
  });

  it('returns the parsed outline when it matches the FinaleOutline shape', () => {
    const session = makeSession({ finaleOutline: JSON.stringify(validOutline) });
    expect(loadFinaleFromSession(session)).toEqual(validOutline);
  });

  it('falls back to null when a required array field (factionFates) is missing — finale-narrator.ts reads outline.factionFates.length unguarded', () => {
    const { factionFates: _factionFates, ...outlineMissingFactionFates } = validOutline;
    const session = makeSession({ finaleOutline: JSON.stringify(outlineMissingFactionFates) });
    expect(loadFinaleFromSession(session)).toBeNull();
  });
});
