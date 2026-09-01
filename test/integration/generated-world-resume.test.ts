// WO-A4-10 (slice A4, run swarm-1788288802-f5a0, wave 7, "tests" domain):
// the generated-world resume proof (design doc §4, docs/
// living-world-slice-a4.md -- LAW for this wave). Closes the exact gap
// wave-5's world-truth-seed.test.ts and wave-6's save-schema-v3.test.ts
// both documented and hand-worked around: "generated-world saves have no
// resume path in this app at all" (packId is never set for one, runLoad's
// engine-restore was gated entirely on packId). This wave's design lock 5
// adds that path: `runLoad` rebuilds a packless world via
// `instantiateWorld(proposal, seed)`, then runs the SAME restore sequence a
// pack world gets (validate -> assign state -> initializeNamespaces -> rng
// -> seedWorldTruth).
//
// SEQUENCING (ADDENDUM-COMMON honesty floor + ADDENDUM-tests): this proof
// is RED on this worktree today, deliberately and by design, not by
// accident. Two independent cross-domain gaps have to land before it goes
// green:
//   1. runtime-foundry's isolated worktree for THIS wave adds
//      `instantiateWorld` to src/foundry/world-gen.ts (it does not exist on
//      this worktree's checked-out copy today -- `grep -n
//      "export.*instantiateWorld" src/foundry/world-gen.ts` returns
//      nothing). test/helpers/game-harness.ts's `rebuildGeneratedEngine`
//      (this domain's own extension of resumeHarness for WO-A4-10) detects
//      this via a DYNAMIC import specifically so that absence throws a
//      clear, contained error only for a test that actually exercises this
//      path, instead of a module-load-time SyntaxError that would take
//      down every other integration test file in this suite.
//   2. game-core's isolated worktree for THIS wave adds
//      `GameConfig.worldGenProposal`/`worldSeed` and the corresponding
//      `SaveSessionInput`/`SavedSession` fields (also absent from this
//      worktree's checked-out src/game.ts and src/session/session.ts
//      today). Without them, `createGeneratedHarness`'s session never
//      actually carries a `worldGenProposal`, `saveHarness` never writes
//      one, and `resumeHarness` never has one to rebuild from --
//      `rebuildGeneratedEngine` throws its OWN "no packId and no
//      worldGenProposal" error in that case, one level up the same failure
//      chain.
// Both are read from source (`grep` above), not from an observed test run
// -- this wave's serial-final-verify discipline forbids a per-agent scoped
// run from this worktree (ADDENDUM-tests's own verification-discipline
// note: "Do NOT run per-agent verification"). Goes green once the
// coordinator merges both isolated worktrees in.
//
// Uses this domain's own makeParityWorldGenProposal fixture (test/helpers/
// world-gen-fixtures.ts, already relied on by world-source-parity.test.ts
// and save-schema-v3.test.ts) rather than a bespoke proposal -- the minimal
// two-zone/one-faction/one-npc shape is enough to prove the resume
// mechanics; nothing about THIS proof depends on any richer world content.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { EngineSnapshot, Rumor } from '@ai-rpg-engine/rumor-system';
import { createGeneratedHarness, saveHarness, resumeHarness } from '../helpers/game-harness.js';
import { makeParityWorldGenProposal } from '../helpers/world-gen-fixtures.js';
import { STORES_SEEDED_KEY } from '../../src/game/world-truth-seed.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'claude-rpg-generated-resume-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function readRawSave(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, 'utf-8')) as Record<string, unknown>;
}

/**
 * Strips fields that legitimately vary between two sequential saves of the
 * otherwise-identical content -- mirrors save-schema-v3.test.ts's own
 * WO-A3-6 `normalize()` exactly, for the identical reasons documented
 * there: `savedAt` is a wall-clock timestamp; `rumorEngine`'s own
 * `lastSpreadTick`/`originTick`/`tick` fields are tick-relative bookkeeping
 * a played round can advance between two saves with byte-identical rumor
 * CONTENT otherwise; `engineState`'s `actionLog` is never restored by
 * resumeHarness()'s shallow `Object.assign` restore (it does not call the
 * engine's real `Engine.deserialize()` -- see game-harness.ts's own
 * F-966c84ab doc comment), the same documented, orthogonal gap
 * bin.ts's runLoad() carries for the identical reason.
 */
function normalize(raw: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(raw);
  delete clone.savedAt;
  if (typeof clone.rumorEngine === 'string') {
    const snap = JSON.parse(clone.rumorEngine) as EngineSnapshot;
    const stripTicks = (r: Rumor) => ({ ...r, lastSpreadTick: 0 });
    clone.rumorEngine = JSON.stringify({
      rumors: snap.rumors.map(stripTicks).sort((a, b) => a.id.localeCompare(b.id)),
      stances: snap.stances.map((s) => ({ ...s, tick: 0 })),
    });
  }
  if (typeof clone.engineState === 'string') {
    const engineState = JSON.parse(clone.engineState) as { actionLog?: unknown };
    engineState.actionLog = [];
    clone.engineState = JSON.stringify(engineState);
  }
  return clone;
}

describe('WO-A4-10: a generated (packless) world resumes through the runLoad generated branch (design doc §4)', () => {
  it('generate -> play two rounds -> save -> resume through the generated branch -> identical event log, views, and marker', async () => {
    const proposal = makeParityWorldGenProposal({ title: 'Generated Resume Fixture World' });
    const h1 = await createGeneratedHarness(proposal, {
      seed: 505,
      worldPrompt: 'a generated-world-resume proof world',
    });

    await h1.play('look');
    await h1.play('look');

    const eventLogBeforeSave = structuredClone(h1.session.engine.world.eventLog);
    const path1 = join(tmpDir, 'generated-1.json');
    await saveHarness(h1, path1);

    const h2 = await resumeHarness(path1);

    // Packless both before and after resume -- a generated world never gets
    // a packId (design doc's own wave-5 grounding: "packId is never set in
    // runNew").
    expect(h1.session.packId).toBeUndefined();
    expect(h2.session.packId).toBeUndefined();

    // Event log: instantiateWorld() + the same restore sequence a pack
    // world gets (Object.assign of the full serialized state onto the
    // freshly rebuilt engine) carries the world's eventLog byte-for-byte,
    // with zero turns played on h2 yet.
    expect(h2.session.engine.world.eventLog).toEqual(eventLogBeforeSave);

    // Views: the live getters (WO-A4-9) read identically off the resumed
    // world truth as they did off the pre-save world, whatever this minimal
    // fixture actually produces (this proof does not depend on any of them
    // being empty) -- a broken instantiateWorld/restore sequence could
    // throw, or silently diverge here, instead of matching.
    expect(h2.session.activePressures).toEqual(h1.session.activePressures);
    expect(h2.session.districtEconomies).toEqual(h1.session.districtEconomies);
    expect(h2.session.playerRumors).toEqual(h1.session.playerRumors);

    // Marker: a packless v3 save has never carried any of the ten legacy
    // top-level fields (a generated world's engine has always written
    // straight into world.modules namespaces, never into SavedSession's own
    // legacy fields) -- seedWorldTruthFromSession's "nothing to seed from"
    // branch runs (see src/game/world-truth-seed.ts:90-97), which reports
    // seeded:false but STILL stamps the marker. h1 itself never carries the
    // marker (createGeneratedHarness() never calls seedWorldTruth -- only
    // resumeHarness()/runLoad() do), so this is the marker's first stamp.
    expect(h2.seedReport?.seeded).toBe(false);
    expect(h2.session.engine.world.globals[STORES_SEEDED_KEY]).toBeTruthy();

    // A second resume/save round trip stays stable: idempotent re-seed
    // (mirrors world-truth-seed.test.ts's own "a second seed call against
    // the same world is a no-op" precedent) and byte-stable saves modulo
    // savedAt/rumorEngine's tick fields (mirrors save-schema-v3.test.ts's
    // WO-A3-6 byte-identical proof). Deliberately compares the SECOND and
    // THIRD saves (both already past the marker's first stamp), not the
    // first and second -- h1's save legitimately lacks the marker (it was
    // never seeded), so comparing path1 against a post-seed save would
    // fail on that expected, honest difference rather than prove anything
    // about stability.
    const path2 = join(tmpDir, 'generated-2.json');
    await saveHarness(h2, path2);

    const h3 = await resumeHarness(path2);
    expect(h3.seedReport?.seeded).toBe(false);
    expect(h3.session.engine.world.globals[STORES_SEEDED_KEY]).toBe(
      h2.session.engine.world.globals[STORES_SEEDED_KEY],
    );

    const path3 = join(tmpDir, 'generated-3.json');
    await saveHarness(h3, path3);

    const raw2 = await readRawSave(path2);
    const raw3 = await readRawSave(path3);
    expect(JSON.stringify(normalize(raw2))).toBe(JSON.stringify(normalize(raw3)));
  });
});
