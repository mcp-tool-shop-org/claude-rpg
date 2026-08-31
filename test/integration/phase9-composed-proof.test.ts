// Phase-9 composed proof (run swarm-1788171999-5dc0, coordinator-authored).
//
// The dogfood-swarm doctrine's Phase-9 lesson (earned on the engine cycle):
// unit pins cannot catch recipe drift — only a composed journey following
// the real construction path can. This is the living version of that proof
// for claude-rpg: EVERY registered pack must boot a full GameSession (the
// exact construction bin.ts performs — engine from pack.createGame, the
// verb-collision overrides, the per-turn hint computation, the whole
// composition) and survive a real turn. A pack that registers but cannot
// play is exactly the failure this file exists to catch — including for
// packs added later: this suite derives from allPacks, never a hand list.

import { describe, it, expect } from 'vitest';
import { allPacks } from '../../src/character/packs.js';
import { GameSession } from '../../src/game.js';
import { createFakeClient } from '../helpers/fake-claude-client.js';

describe('Phase 9 — every registered pack boots and plays one composed turn', () => {
  it.each(allPacks.map((p) => [p.meta.id, p] as const))(
    'pack %s: GameSession constructs over its engine and completes a real "look" turn',
    async (_id, pack) => {
      // Fixed seed: deterministic worlds, and construction itself is the
      // main subject — at 3.9 the starter registers its full module stack
      // (leverage/crafting verbs included), so this line alone proves the
      // override composition holds for THIS pack, not just starter-fantasy.
      const engine = pack.createGame(7);
      const client = createFakeClient({ narration: 'The world holds still a moment.' });

      const session = new GameSession({
        engine,
        client,
        title: pack.meta.name,
        tone: pack.meta.narratorTone ?? 'dark fantasy',
        genre: pack.meta.genres?.[0] ?? 'fantasy',
      });

      const output = await session.processInput('look');

      // A composed turn produced player-facing text and recorded history —
      // the per-turn pipeline (interpret → dispatch → hint computation →
      // narrate → record) ran end to end without a throw.
      expect(typeof output).toBe('string');
      expect((output as string).length).toBeGreaterThan(0);
      expect(session.history.getAll().length).toBe(1);
    },
  );

  it('the proof covers all 12 packs (drift-guarded: derives from allPacks)', () => {
    expect(allPacks.length).toBe(12);
  });
});
