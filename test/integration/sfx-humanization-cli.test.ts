// F-9998efb0 (SLATE-5d, wave 18 tests domain): humanize raw sfx/ambient cue
// tokens in presentation-renderer.ts, plus a structural vocabulary-drift
// tripwire so a new cue id can never silently print raw to the player.
//
// SCOPE NOTE (disclosed): src/cli/presentation-renderer.ts and its
// co-located src/cli/presentation-renderer.test.ts are cli-display-owned,
// out of this "tests" domain's edit scope -- the table-driven mapping
// tests, the SOUND_EFFECT_IDS/HUMANIZED_LABELS set-parity tripwire, and the
// unknown-token fallback case all belong there. This domain's contribution
// is the one thing only a REAL process can prove: renderPresentationCues()
// is wired into actual player-visible stdout ONLY via bin.ts's own
// withPresentationHook/insertCuesBeforePrompt plumbing (verified directly --
// GameSession.processInput() itself never calls it; createHarness()'s
// h.play() return value therefore never contains a cue line at all), so an
// end-to-end regression lock has to go through the real spawned CLI
// process, not the in-process harness.
//
// Pipeline shape (verified directly against this worktree's
// src/cli/presentation-renderer.ts, AND empirically against a real spawned
// process -- see below): combatStartHook (src/runtime/hooks.ts) queues
// effectId 'alert_warning' on every combat-entry turn, deterministically (no
// RNG dependency -- the cue fires purely because presentationState becomes
// 'combat', independent of hit/miss). audio-bridge.ts's playSfx()
// (src/runtime/audio-bridge.ts:72-73) first resolves cue.effectId through
// the installed @ai-rpg-engine/soundpack-core SoundRegistry
// (`entry?.voiceSoundboardEffect ?? cue.effectId`), which maps
// 'alert_warning' to the shorter registry label 'warning' before it ever
// reaches renderSfxLine -- so the value actually reachable end-to-end is
// 'warning', not the routed finding's own unit-level example's raw
// 'alert_warning'.
//
// Landed: renderSfxLine() (commit 6f071f4, F-7eb33249) now maps that
// registry label through SFX_LABELS ('warning' -> 'a warning tone') before
// building the line, so real stdout renders "  · a warning tone sounds",
// never the bare "  · warning sounds" this test guards against.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  bundleBinCli,
  startMockAnthropicServer,
  writeFantasySave,
  spawnCli,
  cleanupCliTestResources,
  type BinCliBundle,
  type CliHandle,
  scaledWaitMs,
} from '../helpers/bin-cli-harness.js';

/**
 * Counts non-overlapping occurrences of a literal substring -- mirrors
 * bin-cli-harness.ts's own private countOccurrences() (not exported).
 */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = 0;
  for (;;) {
    const found = haystack.indexOf(needle, idx);
    if (found === -1) break;
    count++;
    idx = found + needle.length;
  }
  return count;
}

let bundle: BinCliBundle;

beforeAll(async () => {
  bundle = await bundleBinCli();
}, scaledWaitMs(30000));

afterAll(async () => {
  await bundle.cleanup();
});

describe('sfx cue humanization reaches real player-visible stdout (F-9998efb0)', () => {
  it('a real combat-entry turn never prints the raw registry-resolved "warning sounds" token line to the player (landed in commit 6f071f4)', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'claude-rpg-sfx-humanize-home-'));
    await writeFantasySave(join(homeDir, '.claude-rpg', 'saves'));
    // Two successful narration calls needed: the opening narration on load,
    // then the combat turn's own narration.
    const server = await startMockAnthropicServer(2);
    let cli: CliHandle | undefined;

    try {
      cli = spawnCli(bundle.entryPath, ['load'], {
        ...process.env,
        ANTHROPIC_API_KEY: 'sk-ant-test-not-real',
        ANTHROPIC_BASE_URL: server.url,
        HOME: homeDir,
        USERPROFILE: homeDir,
      });

      await cli.waitForStdout('Choose a save');
      cli.sendLine('1');
      await cli.waitForStdout('  > ');
      // Baseline AFTER the opening narration's own "  > " prompt -- the
      // opening screen's TRY-hint lines (bin-cli-harness.ts's own doc
      // comment: "TRY: > talk to the pilgrim") are indented with 4 spaces
      // before '>', which contains the 2-space "  > " needle as a
      // substring, inflating a naive absolute count well past 1 before any
      // real turn even runs. Comparing against this baseline (mirrors
      // bin-cli-turn-loop.test.ts's own countStdoutPrompts()
      // promptsBeforeTurn/promptsAfterTurn convention) cancels that
      // pollution out since it's already fully present in the baseline too.
      const promptCountBeforeTurn = countOccurrences(cli.stdout(), '  > ');

      cli.sendLine('attack pilgrim');
      await cli.waitForStdoutCount('  > ', promptCountBeforeTurn + 1);

      // "warning sounds" was the pre-fix raw-template-plus-registry-label
      // output (renderSfxLine's `  · ${effect} sounds`, effect resolved to
      // 'warning' by the soundpack registry, with no SFX_LABELS lookup).
      // Now that F-7eb33249 (commit 6f071f4) humanizes the label first, real
      // stdout renders "  · a warning tone sounds" -- this guards against a
      // regression back to the bare unhumanized shape.
      expect(cli.stdout()).not.toContain('warning sounds');
    } finally {
      await cleanupCliTestResources({ cli, server, homeDir });
    }
  }, scaledWaitMs(20000));
});
