import { describe, it, expect } from 'vitest';
import { loadPartyFromSession, type SavedSession } from './session.js';
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
