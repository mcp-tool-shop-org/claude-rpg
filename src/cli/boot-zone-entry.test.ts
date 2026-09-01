import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { emitBootZoneEntry } from './boot-zone-entry.js';

// F-10cc3b71: a real starter pack's createGame() (the same call runPlay's
// `result.pack.createGame()` and runNew's generateWorld ultimately make)
// places the player without ever emitting `world.zone.entered` -- so every
// listener gated on that event type (immersion-runtime.ts, chronicle.ts's
// discovery detection, scene-context.ts, turn-loop.ts) was permanently dead
// for the starting zone of every campaign, on every boot path, before this
// fix. Uses a REAL engine (@ai-rpg-engine/starter-fantasy, already a
// dependency and already used the same way by src/display/play-renderer.test.ts),
// not a mock, so this proves the actual production event log, not a stand-in.
describe('emitBootZoneEntry (F-10cc3b71)', () => {
  it('observed red: pack.createGame() alone (mirroring runLoad\'s restore path, which never calls emitBootZoneEntry) emits zero world.zone.entered events', () => {
    const engine = createGame();
    const zoneEvents = engine.world.eventLog.filter((e) => e.type === 'world.zone.entered');
    expect(zoneEvents).toHaveLength(0);
  });

  it('emits exactly one world.zone.entered for the player\'s starting zone after a fresh boot calls emitBootZoneEntry', () => {
    const engine = createGame();
    const player = engine.world.entities[engine.world.playerId];
    const startingZoneId = player?.zoneId ?? engine.world.locationId;
    expect(startingZoneId).toBeTruthy();

    emitBootZoneEntry(engine);

    const zoneEvents = engine.world.eventLog.filter((e) => e.type === 'world.zone.entered');
    expect(zoneEvents).toHaveLength(1);
    expect((zoneEvents[0].payload as { zoneId?: string }).zoneId).toBe(startingZoneId);
  });

  // Documents why bin.ts's design lock 4 forbids wiring this into runLoad:
  // the underlying primitive fires every single time it's called, with no
  // internal "already entered this zone" guard -- so a resumed save calling
  // it on every load would re-fire district-entry mood/discovery listeners
  // repeatedly. The enforcement point is bin.ts's own call sites (runPlay/
  // runNew only, never runLoad), not this primitive -- this test exists so
  // that contract has a concrete, checkable shape instead of only living in
  // a code comment.
  it('fires every time it is called (no idempotence guard) -- exactly why runLoad must never call it', () => {
    const engine = createGame();
    emitBootZoneEntry(engine);
    emitBootZoneEntry(engine);
    const zoneEvents = engine.world.eventLog.filter((e) => e.type === 'world.zone.entered');
    expect(zoneEvents).toHaveLength(2);
  });
});
