// F-6f33a480 (SLATE-1, wave 18 tests domain): wiring generateAmbientLine/
// generateZoneAmbience (src/npc/ambient-dialogue.ts) into the real turn flow
// and rendering the result, with cadence-suppression, placement, and
// no-NPC coverage.
//
// generateZoneAmbience() is pure template expansion, already fully
// unit-tested (src/npc/ambient-dialogue.test.ts, cross-domain). Nothing in
// turn-loop.ts calls it today (verified directly against this worktree's
// src/turn-loop.ts -- no import of ambient-dialogue.ts at all), so these
// tests exercise the real createHarness()->play() loop, which is the only
// way to prove the wiring itself (not just the isolated generator).
//
// Determinism note (scoped down from the routed finding's Fix text,
// disclosed): the finding recommends cross-checking the rendered line
// against an independent same-seed call to generateZoneAmbience(). Neither
// the seed source (engine.tick? a fixed value? something else) nor the
// EntityState -> AmbientNpcInfo mapping (where `personality`/`beliefs` come
// from) is pinned anywhere in the Coordinator Brief's seam-signature list --
// only "generateAmbientLine/generateZoneAmbience gain a third packId
// param" is pinned, which doesn't resolve either question. Rather than
// guess an unpinned mapping, these tests use a structural fact true of
// EVERY current template in PERSONALITY_TEMPLATES regardless of pool or
// seed: every base template substitutes `{name}` at the very start of the
// sentence ('{name} scans...', '{name} hums...', etc. -- verified by
// reading ambient-dialogue.ts's full template table), so "some output line
// starts with the exact NPC name followed by a space" is a seed- and
// personality-independent proof that a real ambient line for a real zone
// NPC rendered, without needing to predict which exact template or seed
// produced it.
//
// Fixture note: the fantasy starter's real starting zone (chapel-entrance)
// has exactly two 'npc'-tagged entities (Suspicious Pilgrim, Sister Maren --
// confirmed by inspecting a fresh createGame() world directly), so no fake
// world data is needed; chapel-alcove (also real, one hop away via
// `go to chapel-alcove`) has zero entities of any kind, giving a genuine
// no-NPCs zone for the edge case.

import { describe, it, expect } from 'vitest';
import { createHarness } from '../helpers/game-harness.js';

const PILGRIM_NAME = 'Suspicious Pilgrim';
const SISTER_NAME = 'Sister Maren';

/** Strip ANSI + the renderer's dim '· ' bullet so a line can be matched by its bare ambient sentence. */
function normalizeLine(l: string): string {
  return l
    .replace(/\x1b\[[0-9;]*m/g, '')
    .trim()
    .replace(/^·\s*/, '');
}

/** True if any line in `output` opens with an ambient-dialogue-shaped "{ExactName} <verb>..." sentence for one of the zone's real NPCs (the renderer prefixes '  · ' and dim styling — see play-renderer.ts). */
function hasAmbientLineFor(output: string, ...names: string[]): boolean {
  const lines = output.split('\n').map(normalizeLine);
  return lines.some((l) => names.some((name) => l.startsWith(`${name} `)));
}

describe('ambient zone dialogue wiring (F-6f33a480)', () => {
  it('red in-worktree, green expected at merge: an ordinary exploration turn in a zone with 2+ NPCs renders a real ambient line', async () => {
    const h = createHarness();
    // chapel-entrance (the starting zone) has both Suspicious Pilgrim and
    // Sister Maren -- generateZoneAmbience()'s own 2+ NPC gate is satisfied
    // with no fixture setup needed. Coordinator stitch (wave 18): the shipped
    // cadence fires on ZONE ENTRY or every 5th quiet turn -- a single
    // stationary turn is deliberately silent -- so drive a real zone entry:
    // step out to the empty alcove and back into the 2-NPC entrance.
    await h.play('go to chapel-alcove');
    const output = await h.play('go to chapel-entrance');

    expect(hasAmbientLineFor(output, PILGRIM_NAME, SISTER_NAME)).toBe(true);

    // Placement (when present): the ambient line renders as its own
    // section, distinct from the status/zone-exits lines rather than
    // interleaved inside them.
    const lines = output.split('\n');
    const ambientIdx = lines.findIndex((l) => normalizeLine(l).startsWith(`${PILGRIM_NAME} `) || normalizeLine(l).startsWith(`${SISTER_NAME} `));
    const zoneIdx = lines.findIndex((l) => l.includes('Location:'));
    if (ambientIdx !== -1 && zoneIdx !== -1) {
      expect(ambientIdx).not.toBe(zoneIdx);
    }
  });

  it('cadence/suppression: a combat turn does not render an ambient line (mirrors the existing hook-suppression precedent in src/runtime/hooks.ts)', async () => {
    const h = createHarness();
    const output = await h.play('attack pilgrim');
    expect(hasAmbientLineFor(output, PILGRIM_NAME, SISTER_NAME)).toBe(false);
  });

  it('no-NPCs edge: a zone with zero NPCs renders zero ambient lines and never throws (regression guard against the fixed F-20ec59de negative-modulo class)', async () => {
    const h = createHarness();
    await h.play('go to chapel-alcove');
    expect(h.session.engine.world.locationId).toBe('chapel-alcove');

    // A rejected promise here fails the test directly (uncaught), which is
    // the correct "must never throw" proof for an async call -- toThrow()
    // itself only observes synchronous throws.
    const output = await h.play('look around');

    expect(hasAmbientLineFor(output, PILGRIM_NAME, SISTER_NAME)).toBe(false);
  });
});
