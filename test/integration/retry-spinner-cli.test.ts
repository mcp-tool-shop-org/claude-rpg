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
  scaledWaitMs,
} from '../helpers/bin-cli-harness.js';
import type { WorldGenProposal } from '../../src/foundry/world-gen.js';

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
}, scaledWaitMs(30000));

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
      await cli.waitForStdout('  > ');

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
  }, scaledWaitMs(20000));
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
      await cli.waitForStdoutCount('  > ', promptsBeforeTurn + 1, scaledWaitMs(20000));
      // Coordinator stitch (run swarm-1788288802-f5a0, wave 2): the prompt
      // marker reappearing is NOT a settled point for the request ledger --
      // CI run 33550215403 (Node 20 job) read 1 of the 3 requests here while
      // the forced retry was still in flight and failed on `expected 1 to be
      // 3`; the re-run and three local CI-scaled runs passed. Wait for the
      // ledger itself to settle (bounded) before reading it, so the
      // assertion below measures the turn, not the race. Call-counts are
      // read only at settled points (the spawned-CLI harness law).
      {
        const deadline = Date.now() + scaledWaitMs(10000);
        while (server.callCount() - callsBeforeTurn < 3 && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 50));
        }
      }

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
  }, scaledWaitMs(20000));
});

// F-d102b95a: F-e44285c0 named FOUR latency paths needing real-process retry
// coverage -- narration and dialogue are closed by the two blocks above;
// this block and the one below close the remaining two (world-gen, finale),
// the exact "later-path targets" startFlakyAfterAnthropicServer's own doc
// comment (bin-cli-harness.ts:236-253) already names. Neither path is
// reachable from the two describe blocks above: `new` (this block) is a
// distinct bin.ts entry point from `load`, never spawned by any existing
// real-process test, and `/conclude` (the block below) is a slash command
// no existing real-process test ever sends.
describe('real-process retry path — world-gen (F-d102b95a)', () => {
  it('a retryable (429) failure on the world-gen call triggered by `new` is retried for real through claude-adapter.ts and the world is still created', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'claude-rpg-retry-worldgen-home-'));
    // No writeFantasySave here -- `new` (bin.ts:266-296) builds a fresh
    // world from a prompt; there is no save to select or load.

    // Mirrors src/foundry/world-gen.test.ts's own makeValidProposal()
    // fixture (already proven there to make generateWorld() succeed
    // end-to-end, including engine construction). generateStructured()
    // (world-gen's generateWorld()) needs the response to BE a bare JSON
    // object matching WorldGenProposal, not plain prose -- the default
    // canned text would fail claude-adapter.ts's bare-{...} JSON match and
    // silently route generateWorld's own shape-retry loop (MAX_ATTEMPTS=3)
    // into a second/third attempt instead of proving one clean HTTP-level
    // retry.
    const validProposal: WorldGenProposal = {
      title: 'Test World',
      theme: 'fantasy',
      toneGuide: 'dark and brooding',
      ruleset: {
        id: 'test-rules',
        name: 'Test Rules',
        stats: [{ id: 'str', name: 'Strength', default: 10 }],
        resources: [{ id: 'hp', name: 'HP', default: 100, max: 100 }],
      },
      zones: [
        { id: 'town-square', roomId: 'town-square', name: 'Town Square', tags: [], neighbors: ['market'], light: 7 },
        { id: 'market', roomId: 'market', name: 'Market', tags: [], neighbors: ['town-square'], light: 5 },
      ],
      factions: [
        { id: 'guard', name: 'Town Guard', disposition: 'neutral', description: 'Protectors', memberIds: ['guard-1'] },
      ],
      npcs: [
        {
          id: 'guard-1',
          name: 'Guard Captain',
          type: 'npc',
          tags: ['guard'],
          zoneId: 'town-square',
          personality: 'stern',
          goals: ['protect the town'],
          stats: { str: 12 },
          resources: { hp: 80 },
          beliefs: [{ subject: 'town', key: 'safety', value: 'high', confidence: 0.8 }],
        },
      ],
      player: {
        name: 'Hero',
        stats: { str: 10 },
        resources: { hp: 100 },
        startZoneId: 'town-square',
      },
      quests: [
        { id: 'q1', name: 'First Quest', description: 'Do something', stages: [{ id: 's1', description: 'Step 1' }] },
      ],
    };

    // No unconditional-success calls before the flaky window -- world-gen's
    // own generateStructured() call is the very first request `new` makes.
    // Request 1 fails 429; request 2 (retried) succeeds with the JSON body.
    const server = await startFlakyAfterAnthropicServer(0, 1, JSON.stringify(validProposal));
    let cli: CliHandle | undefined;

    try {
      cli = spawnCli(bundle.entryPath, ['new', 'A pirate-infested trade port'], {
        ...process.env,
        ANTHROPIC_API_KEY: 'sk-ant-test-not-real',
        ANTHROPIC_BASE_URL: server.url,
        HOME: homeDir,
        USERPROFILE: homeDir,
      });

      // withRetry's real backoff (DEFAULT_RETRY.initialDelayMs = 1000ms) is
      // genuinely awaited here, same as the narration block above. Waiting
      // for this exact line (bin.ts:768) BEFORE reading server.callCount()
      // isolates the count to world-gen's own single generateStructured()
      // call, before the subsequent opening-narration call (runNew ->
      // runGameLoop, bin.ts:796) adds a third request.
      await cli.waitForStdout('World "Test World" created!');
      expect(cli.stdout()).not.toContain('Unexpected error');

      // Coordinator stitch (wave 13): reading callCount() at the created!
      // line RACED the opening-narration request runNew fires immediately
      // after (observed 2 on one run, 3 on the next). Wait for the gameplay
      // prompt instead — every request has landed by then — and assert the
      // deterministic TOTAL: the forced 429 + the retried world-gen 200 +
      // the single unforced opening-narration call.
      await cli.waitForStdout('  > ');
      expect(server.callCount()).toBe(3);
      cli.sendLine('quit');
      const exitCode = await cli.waitForExit();
      expect(exitCode).toBe(0);
    } finally {
      await cleanupCliTestResources({ cli, server, homeDir });
    }
  }, scaledWaitMs(20000));
});

// F-d102b95a: the finale half of F-e44285c0's remaining pair (see the
// world-gen block above for the other). /conclude is reachable directly
// from a freshly-loaded session with NO mode switch first -- GameSession.mode
// defaults to 'play' (game.ts:410), and /conclude is dispatched from the
// 'play'-mode inline slash-command chain (game.ts:906-973), a sibling of --
// not gated behind -- the mode==='director' branch (game.ts:870-903).
describe('real-process retry path — finale (F-d102b95a)', () => {
  it('a retryable (429) failure on the /conclude epilogue call is retried for real through claude-adapter.ts and the conclusion screen still renders', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'claude-rpg-retry-finale-home-'));
    await writeFantasySave(join(homeDir, '.claude-rpg', 'saves'));
    // Request 1 (opening narration on load) succeeds unconditionally; the
    // epilogue call /conclude triggers is forced to fail once before
    // succeeding -- same server config this file's dialogue block above
    // already uses. finale-narrator.ts's attemptEpilogue (src/narrator/
    // finale-narrator.ts:43-62) calls the plain client.generate() (prose),
    // never generateStructured, so no JSON text override is needed here,
    // unlike world-gen above.
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

      // Baseline AFTER the opening narration's own request (call 1).
      const callsBeforeTurn = server.callCount();

      cli.sendLine('/conclude');
      // withRetry's real backoff (DEFAULT_RETRY.initialDelayMs = 1000ms) is
      // genuinely awaited here, same as the blocks above. 'CAMPAIGN
      // CONCLUSION' is the exact heading renderConcludeOutput prints
      // (game-presenter.ts:173).
      await cli.waitForStdout('CAMPAIGN CONCLUSION', scaledWaitMs(20000));

      // The real HTTP-level proof: exactly 2 requests hit the mock server
      // for this turn (the forced 429, then the retried 200).
      // narrateFinale's own same-turn fallback retry (finale-narrator.ts:
      // 119-141) never fires -- claude-adapter.ts's withRetry already
      // absorbed the failure one layer down, so attemptEpilogue's first
      // attempt itself comes back ok.
      expect(server.callCount() - callsBeforeTurn).toBe(2);
      expect(cli.stdout()).not.toContain('Unexpected error');

      cli.sendLine('quit');
      const exitCode = await cli.waitForExit();
      expect(exitCode).toBe(0);
    } finally {
      await cleanupCliTestResources({ cli, server, homeDir });
    }
  }, scaledWaitMs(20000));
});
