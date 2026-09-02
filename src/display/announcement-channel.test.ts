// announcement-channel.test.ts — WO-B1F-12 (slice B1 follow-ups §5, design
// lock 5): "pressure lines". design lock 5 (ADDENDUM-COMMON): the
// world-moved kinds `pressure-spawned`, `pressure-resolved`,
// `pressure-expired` already exist; each now ALSO pushes its headline
// through the announcement channel the ask lines use, once, the round it
// happens. game-core's own WO-B1F-5 (src/game.ts, out of this domain's
// globs) is the half that wires `pendingAnnouncements.push(headline)`
// alongside the existing `pushWorldMoved` calls for the three pressure
// kinds -- not yet on this worktree (grep -n "pendingAnnouncements.push"
// src/game.ts shows level-up/title-evolved/ask lines and the ambush
// gratitude-repaid warning, but no pressure-spawned/resolved/expired call
// site).
//
// This domain's half (WO-B1F-12) is the render side: "the announcement
// channel already renders; confirm a pressure headline renders unchanged
// through it (proof with a fixture); no new copy." The channel itself --
// GameSession.pendingAnnouncements (a public field) drained through the
// private formatTrailerNotice bracket format (`\n  [<text>]`) inside
// processInput -- lives entirely in src/game.ts, outside every glob this
// domain owns; there is no cli-display render function to add a branch to
// here. The honest proof available from this domain's own test file is
// exercising the REAL engine (via createHarness/GameSession's public
// surface, not by re-implementing or guessing at the private formatter):
// push a fixture headline shaped exactly like the three pressure call
// sites' own template literals (`${kind}: ${description}` /
// `${kind}: ${summary}`) onto the public `pendingAnnouncements` field --
// standing in for what WO-B1F-5 will do -- and confirm a played turn
// surfaces it, verbatim, in the channel's existing bracket idiom. No new
// string is drafted anywhere in this file.
import { describe, it, expect } from 'vitest';
import { createHarness } from '../../test/helpers/game-harness.js';

describe('the announcement channel renders a pressure headline unchanged (WO-B1F-12)', () => {
  it('surfaces a pressure-spawned-shaped headline through the existing bracket notice, verbatim', async () => {
    const h = createHarness();
    // Exact shape of game.ts's own `pushWorldMoved('pressure-spawned', ...)`
    // call site: `${p.kind}: ${p.description}`. No new copy -- this is the
    // pressure's own existing fields, not a coordinator-drafted string.
    const headline = 'bounty-issued: a bounty has been placed on your head';
    h.session.pendingAnnouncements.push(headline);

    const output = await h.play('look');

    expect(output).toContain(`[${headline}]`);
  });

  it('surfaces a pressure-resolved-shaped headline through the same channel', async () => {
    const h = createHarness();
    // Exact shape of game.ts's own `pushWorldMoved('pressure-resolved', ...)`
    // call site: `${pressure.kind}: ${fallout.summary}`.
    const headline = 'supply-shortage: the faction resolved the shortage through trade';
    h.session.pendingAnnouncements.push(headline);

    const output = await h.play('look');

    expect(output).toContain(`[${headline}]`);
  });

  it('surfaces a pressure-expired-shaped headline through the same channel', async () => {
    const h = createHarness();
    // Exact shape of game.ts's own `pushWorldMoved('pressure-expired', ...)`
    // call site: `${fallout.resolution.pressureKind}: ${fallout.summary}`.
    const headline = 'unrest: the unrest died down on its own';
    h.session.pendingAnnouncements.push(headline);

    const output = await h.play('look');

    expect(output).toContain(`[${headline}]`);
  });

  it('fires only once (the channel drains pendingAnnouncements after each turn)', async () => {
    const h = createHarness();
    const headline = 'bounty-issued: a bounty has been placed on your head';
    h.session.pendingAnnouncements.push(headline);

    const first = await h.play('look');
    const second = await h.play('look');

    expect(first).toContain(`[${headline}]`);
    expect(second).not.toContain(`[${headline}]`);
  });
});
