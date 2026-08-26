import { describe, it, expect } from 'vitest';
import { renderConcludeHelp } from './help-system.js';
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
    // 'revelation' is scoped separately: it is also (coincidentally) a real
    // ArcKind used by the unrelated renderArcHelp() text, so this asserts it
    // specifically absent from the CONCLUDE block, not the whole module.
    expect(text).not.toContain('revelation');
  });

  it('still introduces the list as "8 resolution classes"', () => {
    const text = renderConcludeHelp();
    expect(text).toContain('8 resolution classes');
  });
});
