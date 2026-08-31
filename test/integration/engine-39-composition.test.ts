// Slice commit C3 (run swarm-1788171999-5dc0): 3.9 composition sentinels.
//
// Engine 3.9's buildWorldStack-based starters always include player-leverage
// (registers 'sabotage') and crafting (registers 'craft'), and 3.9's
// ActionDispatcher.registerVerb throws on duplicates. GameSession deliberately
// re-registers both with { override: true } (F-a658b0fb) — thin
// attempted-event handlers that game.ts processes itself. These sentinels pin
// the three facts that make that safe, including the negative proof that the
// collision is REAL at the installed engine (a vacuous override that guards
// nothing would pass every other test in this suite).

import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { createHarness } from '../helpers/game-harness.js';

describe('engine 3.9 composition (slice C3 sentinels)', () => {
  // Gate-goes-RED proof: the engine really claims these verbs at 3.9. If a
  // future engine version stops registering them, these sentinels fail and
  // the { override: true } in game.ts should be re-examined (it would then
  // be guarding nothing).
  it('starter-fantasy already registers "sabotage" — un-overridden re-registration throws', () => {
    const engine = createGame(7);
    expect(() => engine.dispatcher.registerVerb('sabotage', () => [])).toThrow(/already registered/i);
  });

  it('starter-fantasy already registers "craft" — un-overridden re-registration throws', () => {
    const engine = createGame(7);
    expect(() => engine.dispatcher.registerVerb('craft', () => [])).toThrow(/already registered/i);
  });

  // The collision regression: GameSession construction over a 3.9 starter
  // engine must succeed (it re-registers 'sabotage' and 'craft' with the
  // sanctioned override). Before C2 this threw synchronously in the
  // constructor at every construction site in the suite.
  it('GameSession constructs over a 3.9 starter engine without a verb collision', () => {
    expect(() => createHarness()).not.toThrow();
  });

  // Override DIRECTION: claude-rpg's thin handlers won, not the engine's
  // native leverage/crafting handlers — dispatching these verbs yields the
  // *.action.attempted events game.ts processes, preserving 2.9 behavior.
  it('dispatching "craft" routes to claude-rpg\'s thin handler (craft.action.attempted)', () => {
    const h = createHarness();
    const events = h.session.engine.submitAction('craft', { parameters: { subAction: 'craft' } });
    expect(events.some((e) => e.type === 'craft.action.attempted')).toBe(true);
  });

  it('dispatching "sabotage" routes to claude-rpg\'s thin handler (sabotage.action.attempted)', () => {
    const h = createHarness();
    const events = h.session.engine.submitAction('sabotage', { parameters: { subAction: 'unknown' } });
    expect(events.some((e) => e.type === 'sabotage.action.attempted')).toBe(true);
  });
});
