import { describe, it, expect } from 'vitest';
import { renderConcludeHelp, renderArcHelp, ARC_KIND_HELP, ARC_MOMENTUM_HELP } from './help-system.js';
import { RESOLUTION_CLASS_LABELS } from './archive-browser.js';

/**
 * F-545cb684: renderConcludeHelp's '/help conclude' prose used to hand-list
 * 8 resolution classes (victory, exile, overthrow, martyrdom, corruption,
 * revelation, stalemate, exodus) that did not match the 8 classes
 * archive-browser.ts's getResolutionLabel actually renders for completed
 * campaigns (collapse, puppet-master, quiet-retirement, tragic-stabilization
 * replace 4 of the stale ones). Verified against the real engine enum
 * (@ai-rpg-engine/modules ResolutionClass, endgame-detection.d.ts) — the
 * archive-browser.ts set is the current one. This test checks
 * renderConcludeHelp's own output against RESOLUTION_CLASS_LABELS (the same
 * source, now exported from archive-browser.ts) so the two can't diverge
 * again without a compile error and a test failure.
 */
describe('renderConcludeHelp', () => {
  it('documents every resolution class the engine actually produces', () => {
    const text = renderConcludeHelp();
    for (const resolutionClass of Object.keys(RESOLUTION_CLASS_LABELS)) {
      expect(text).toContain(resolutionClass);
    }
  });

  it('does not document resolution classes the engine no longer produces', () => {
    const text = renderConcludeHelp();
    // Stale prose from before the resolution-class enum was redesigned.
    for (const stale of ['corruption', 'stalemate', 'exodus']) {
      expect(text).not.toContain(stale);
    }
    // 'revelation' is asserted absent here too. An earlier version of this
    // comment claimed it was "(coincidentally) a real ArcKind used by...
    // renderArcHelp()" — that was false (F-204465a3): 'revelation' has never
    // been a member of @ai-rpg-engine/modules' ArcKind, and renderArcHelp's
    // own reconciliation test below confirms it doesn't appear there either
    // now that that list is derived from the real enum too.
    expect(text).not.toContain('revelation');
  });

  it('still introduces the list as "8 resolution classes"', () => {
    const text = renderConcludeHelp();
    expect(text).toContain('8 resolution classes');
  });
});

/**
 * F-204465a3: renderArcHelp()'s '/help arcs' prose used to hand-list 10
 * "narrative arc kinds" (rising-power, hunted, kingmaker, resistance,
 * merchant-prince, shadow-broker, peacemaker, outcast, revelation, betrayer)
 * that did not match the real ArcKind union (@ai-rpg-engine/modules,
 * arc-detection.d.ts): 4 of those names have never existed
 * (peacemaker/outcast/revelation/betrayer), while 4 real kinds
 * (last-stand/community-builder/descent/reckoning) went undocumented. The
 * adjacent momentum line ("rising, steady, or fading") had the identical
 * problem against the real ArcMomentum type — only 'steady' matched; the
 * real values are building/steady/waning. Same fix as renderConcludeHelp's
 * F-545cb684 above: both lists are now derived from ARC_KIND_HELP /
 * ARC_MOMENTUM_HELP maps typed against the real engine enums (exported from
 * help-system.ts), so this test checks renderArcHelp's own output against
 * those maps — the two can't diverge again without a compile error and a
 * test failure.
 */
describe('renderArcHelp', () => {
  it('documents every arc kind the engine actually produces', () => {
    const text = renderArcHelp();
    for (const kind of Object.keys(ARC_KIND_HELP)) {
      expect(text).toContain(kind);
    }
  });

  it('does not document arc kinds the engine has never produced', () => {
    const text = renderArcHelp();
    // Stale prose from before this list was typed against the real enum.
    for (const stale of ['peacemaker', 'outcast', 'revelation', 'betrayer']) {
      expect(text).not.toContain(stale);
    }
  });

  it('documents every real momentum value', () => {
    const text = renderArcHelp();
    for (const momentum of Object.keys(ARC_MOMENTUM_HELP)) {
      expect(text).toContain(momentum);
    }
  });

  it('does not use the stale momentum wording ("rising, steady, or fading")', () => {
    const text = renderArcHelp();
    // Word-level 'rising'/'fading' checks would false-positive against the
    // real 'rising-power' kind, so this checks the whole stale phrase.
    expect(text).not.toContain('rising, steady, or fading');
  });

  it('still introduces the list as "10 narrative arc kinds"', () => {
    const text = renderArcHelp();
    expect(text).toContain('10 narrative arc kinds');
  });
});
