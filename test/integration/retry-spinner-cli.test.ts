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
  writeFantasySave,
  spawnCli,
  cleanupCliTestResources,
  type BinCliBundle,
  type CliHandle,
} from '../helpers/bin-cli-harness.js';

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
