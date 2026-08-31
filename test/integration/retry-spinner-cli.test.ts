// F-99dc64ac (SLATE-5b, wave 18 tests domain): wire the existing but unused
// onRetry hook into the CLI spinner's label, escalating the displayed
// message per retry attempt, with no update on fatal errors.
//
// SCOPE NOTE (disclosed): src/cli/spinner.ts (Spinner.setLabel, the pinned
// seam this wave) and its co-located src/cli/spinner.test.ts are
// cli-display-owned -- the interface unit test (TTY interval-render +
// non-TTY static-write branches), the escalation-message shape, and the
// no-update-on-fatal-errors proof all belong there, and this domain cannot
// import a `setLabel` that doesn't exist without guessing an unpinned
// contract (formatRetryLabel's exact text is not in the Coordinator
// Brief's pinned-signature list beyond its existence). What IS in this
// domain's scope, and what the routed finding itself flags as
// "structurally impossible today" without it: a spawned-process mock server
// that can fail a request with a RETRYABLE status before succeeding, so
// claude-adapter.ts's real withRetry path (NOT the fake test client, which
// bypasses retry logic entirely) is exercised end-to-end through the real
// bin.ts process. That helper (startFlakyAnthropicServer,
// test/helpers/bin-cli-harness.ts) is this domain's owned infra for the
// wave; this file is its integration proof.
//
// This does NOT assert on the spinner's visible label text -- spawnCli's
// piped child stdio makes `stream.isTTY` false for the child process, so
// createSpinner()'s CURRENT non-TTY branch (spinner.ts:42-44) writes one
// static line on start() and never re-renders on an interval; whether a
// future setLabel() call re-writes a new static line in non-TTY mode is
// itself part of the unpinned cli-display contract, not something safe to
// assert against from here.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  bundleBinCli,
  startFlakyAnthropicServer,
  startFlakyAfterAnthropicServer,
  writeFantasySave,
  spawnCli,
  cleanupCliTestResources,
  type BinCliBundle,
  type CliHandle,
} from '../helpers/bin-cli-harness.js';

/** Counts non-overlapping occurrences of a literal substring (mirrors sfx-humanization-cli.test.ts's identical local helper). */
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
}, 30000);

afterAll(async () => {
  await bundle.cleanup();
});

describe('real-process retry path (F-99dc64ac infrastructure gap this domain closes)', () => {
  it('a retryable (429) failure on the opening narration call is retried for real through claude-adapter.ts and the game still reaches the first prompt', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'claude-rpg-retry-home-'));
    await writeFantasySave(join(homeDir, '.claude-rpg', 'saves'));
    // First request (opening narration) fails with 429 once, then succeeds.
    const server = await startFlakyAnthropicServer(1);
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

      // withRetry's real backoff (DEFAULT_RETRY.initialDelayMs = 1000ms) is
      // genuinely awaited here -- no injectable delayFn on this path
      // (createAdaptedClient never overrides it) -- so this needs real
      // wall-clock patience, not just the default waitFor timeout.
      await cli.waitForStdout('  > ', 15000);

      // The real HTTP-level proof this test exists for: two requests hit
      // the mock server (the failed attempt, then the retried success),
      // confirming claude-adapter.ts's own retry loop ran for real rather
      // than the failure being fatal or silently swallowed.
      expect(server.callCount()).toBe(2);
      expect(cli.stdout()).not.toContain('Unexpected error');

      cli.sendLine('quit');
      const exitCode = await cli.waitForExit();
      expect(exitCode).toBe(0);
    } finally {
      await cleanupCliTestResources({ cli, server, homeDir });
    }
  }, 20000);
});

// F-e44285c0 (wave 8 amend): ADDENDUM-COMMON.md's Stage-C lens item 2 names
// FOUR latency paths needing waiting-feedback probe coverage: narration,
// dialogue, world-gen, finale. The describe block above exercises exactly
// one (opening narration on `load`) -- grepping every sendLine() call
// across test/integration/*.ts at the time this finding was routed
// confirmed no real-process test ever sent a dialogue verb, spawned bin.ts
// with `new`, or drove a session to a finale/conclude screen, even though
// startFlakyAnthropicServer (this file's own infra) is content-agnostic and
// could already probe any of them. This block closes the dialogue gap.
describe('real-process retry path — dialogue turn (F-e44285c0)', () => {
  it('a retryable (429) failure on a dialogue turn is retried for real through claude-adapter.ts and the turn still completes', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'claude-rpg-retry-dialogue-home-'));
    await writeFantasySave(join(homeDir, '.claude-rpg', 'saves'));
    // Request 1 (opening narration on load) succeeds cleanly; the first
    // request the dialogue turn itself makes is forced to fail once before
    // succeeding, isolating the retry proof to the dialogue turn
    // specifically rather than incidentally reusing the narration retry.
    const server = await startFlakyAfterAnthropicServer(1, 1);
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
      // opening screen's TRY-hint lines contain their own "  > "-shaped
      // bullets (bin-cli-turn-loop.test.ts's own established convention for
      // this exact pollution).
      const promptsBeforeTurn = countOccurrences(cli.stdout(), '  > ');
      const callsBeforeTurn = server.callCount();

      cli.sendLine('talk to pilgrim');
      await cli.waitForStdoutCount('  > ', promptsBeforeTurn + 1, 20000);

      const callsForThisTurn = server.callCount() - callsBeforeTurn;
      // Measured at this wave's HEAD (2026-08-31, this exact scenario): a
      // dialogue turn burns 2 real requests unforced (dialogue-mind.ts's
      // own client.generate() call, then narrateScene's) -- matching
      // conversation-memory.test.ts's documented "each speak turn burns 2
      // generate() calls" baseline via the real process, not just the
      // in-process fake harness -- plus exactly 1 forced retry from this
      // turn's own flaky window above.
      expect(callsForThisTurn).toBe(3);
      expect(cli.stdout()).not.toContain('Unexpected error');

      cli.sendLine('quit');
      const exitCode = await cli.waitForExit();
      expect(exitCode).toBe(0);
    } finally {
      await cleanupCliTestResources({ cli, server, homeDir });
    }
  }, 20000);
});
