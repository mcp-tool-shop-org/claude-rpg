// F-256bb64a (SLATE-5c, wave 18 tests domain): per-site regression tests
// proving player-visible output resolves catalog archetype/discipline/
// background ids to their display names instead of the raw kebab-case id.
//
// Originally-confirmed live bug: src/character/recap.ts rendered
// `${profile.build.name}, level ${level} ${profile.build.archetypeId}`
// verbatim -- 'penitent-knight' instead of 'Penitent Knight'. The fix
// landed as a new 3rd optional param, `renderRecap(profile, history,
// catalog?)` (src/character/recap.ts:46-49 -- out of this domain's edit
// scope, see "Do NOT edit src/**" in the brief). The catalog-threading has
// landed, so these tests call the real 3-arg signature directly and let
// tsc check it as declared -- no cast needed.
//
// The unit-level fixture rebuild the routed finding also describes for
// src/character/recap.test.ts is a co-located src/**.test.ts file --
// cross-domain, owned by whichever domain owns src/character/** content,
// not this "tests" domain (test/** + vitest.config.ts only). This file is
// this domain's in-scope contribution: the shared expectNoRawCatalogIds()
// helper (test/helpers/catalog-assertions.ts) plus the per-site regression
// lock applied through the real integration surface.

import { describe, it, expect } from 'vitest';
import { createProfile } from '@ai-rpg-engine/character-profile';
import { getPackById } from '../../src/character/packs.js';
import { renderRecap } from '../../src/character/recap.js';
import { renderSessionDelta, computeSessionDelta, captureSnapshot, type SessionSnapshot } from '../../src/character/recap-delta.js';
import { TurnHistory } from '../../src/session/history.js';
import { createHarness } from '../helpers/game-harness.js';
import { expectNoRawCatalogIds } from '../helpers/catalog-assertions.js';

const pack = getPackById('chapel-threshold')!;
const catalog = pack.buildCatalog;

function makeProfile(archetypeId: string, backgroundId = 'oath-breaker') {
  return createProfile(
    { name: 'Kael Ashwood', archetypeId, backgroundId, traitIds: [] },
    { vigor: 5, instinct: 5, will: 5 },
    { hp: 20, stamina: 8 },
    [],
    'chapel-threshold',
  );
}

// ─── recap.ts: the confirmed live bug ─────────────────────────

describe('renderRecap resolves catalog display names (F-256bb64a)', () => {
  it('resolves archetypeId to its catalog display name instead of the raw id', () => {
    const profile = makeProfile('penitent-knight');
    const history = new TurnHistory();
    const output = renderRecap(profile, history, catalog);
    expect(output).toContain('Penitent Knight');
    expect(output).not.toContain('penitent-knight');
  });

  it('fallback contract (already correct today): no catalog supplied -> raw id passes through unchanged, matching catalog-names.ts', () => {
    const profile = makeProfile('penitent-knight');
    const history = new TurnHistory();
    const output = renderRecap(profile, history);
    expect(output).toContain('penitent-knight');
  });

  it('fallback contract: an archetypeId absent from the supplied catalog (stale save / hand-edited profile / pack swap) passes through unchanged rather than throwing or printing "undefined"', () => {
    const profile = makeProfile('a-stale-archetype-from-a-removed-pack');
    const history = new TurnHistory();
    expect(() => {
      const output = renderRecap(profile, history, catalog);
      expect(output).toContain('a-stale-archetype-from-a-removed-pack');
      expect(output).not.toContain('undefined');
    }).not.toThrow();
  });
});

// ─── bin.ts / game-state.ts / recap-delta.ts: regression locks ────
//
// None of these three currently render a catalog archetype/discipline/
// background id at all (verified: bin.ts only ever reads
// session.profile.build.name for autosave filenames, never archetypeId/
// disciplineId/backgroundId; game-state.ts is pure state-derivation with no
// catalog-id rendering; recap-delta.ts's renderSessionDelta renders faction
// ids and titles, never a build id). These are therefore not currently
// reproducible bugs -- they're the "run the same helper now as a regression
// lock" half of the routed finding, so a future site introduced by any
// domain's own audit is caught by the same assertion shape instead of
// needing a new one invented from scratch.

describe('recap-delta.ts renderSessionDelta never leaks a catalog id (regression lock, F-256bb64a)', () => {
  it('a session delta with reputation/milestone/title changes renders with no raw catalog ids present', () => {
    const before: SessionSnapshot = { xp: 0, level: 1, reputation: [{ factionId: 'guardians', value: 0 }], milestoneCount: 0, injuryCount: 0, totalTurns: 0 };
    const after: SessionSnapshot = { xp: 40, level: 2, reputation: [{ factionId: 'guardians', value: 15 }], milestoneCount: 1, injuryCount: 0, totalTurns: 5, title: 'the Penitent' };
    const delta = computeSessionDelta(before, after);
    const output = renderSessionDelta(delta);
    expectNoRawCatalogIds(output, catalog);
  });
});

describe('full-session regression sweep: no raw catalog id ever reaches player-facing output (F-256bb64a)', () => {
  it('a catalog-backed profile whose archetype/background id differ from their display names never leaks a raw id across several real turns (covers bin.ts/game-state.ts-derived rendering paths end-to-end)', async () => {
    const profile = makeProfile('penitent-knight', 'oath-breaker');
    const h = createHarness({
      // Coordinator stitch (wave 18): buildCatalog is the load-bearing input
      // here -- without it the session's raw-id output is the DESIGNED
      // no-catalog fallback, not a leak. bin.ts supplies it in production.
      gameOpts: { profile, itemCatalog: pack.itemCatalog, buildCatalog: pack.buildCatalog },
      clientOpts: { narration: 'Dust motes drift through broken glass.' },
    });

    const outputs: string[] = [];
    outputs.push(await h.play('look around'));
    outputs.push(await h.play('go to chapel-nave'));
    outputs.push(h.session.getWelcome());
    outputs.push(await h.play('/status'));

    expectNoRawCatalogIds(outputs.join('\n'), catalog);
  });
});
