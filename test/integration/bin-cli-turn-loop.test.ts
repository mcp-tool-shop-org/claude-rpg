// F-b1f64739: the wave-4 coordinator stitch made narrator.ts rethrow fatal
// (auth/bad-request) NarrationErrors and let game.ts's processInput()
// propagate them uncaught (see fixed findings F-c4332895/F-6480985e), but
// that contract was previously verified only down to the GameSession
// boundary (test/integration/game-turn-loop.test.ts's createHarness()
// calls session.processInput() directly). bin.ts's real `while (true)`
// turn loop (bin.ts:569-664) wraps `session.processInput(input.trim())`
// in a try/catch that calls presentError(err, 'turn', debugMode) and
// continues looping — that catch-and-continue is the actual player-visible
// experience after a fatal error (clean message vs. crash, can the player
// keep playing), and it had zero coverage anywhere in test/**.
//
// This spawns the real src/bin.ts entry point as a child process (via the
// esbuild-bundled copy test/helpers/bin-cli-harness.ts produces), scripts
// its stdin through `load` -> select the one save -> `look`, and forces
// the "look" turn's narration call to fail with a fatal auth error via a
// local HTTP stand-in for api.anthropic.com. See bin-cli-harness.ts for
// why a bundled child process is necessary (bin.ts has no exports and is
// written for compile-then-run).

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  bundleBinCli,
  startMockAnthropicServer,
  writeFantasySave,
  spawnCli,
  type BinCliBundle,
  type MockAnthropicServer,
  type CliHandle,
} from '../helpers/bin-cli-harness.js';

/** Counts how many "  > " prompts bin.ts has printed to stdout so far. */
function countStdoutPrompts(stdout: string): number {
  return stdout.split('  > ').length - 1;
}

describe('bin.ts turn loop — fatal narration error survives to next prompt', () => {
  let bundle: BinCliBundle;
  let homeDir: string;
  let server: MockAnthropicServer;
  let cli: CliHandle | undefined;

  beforeAll(async () => {
    bundle = await bundleBinCli();
  }, 30000);

  afterAll(async () => {
    await bundle.cleanup();
  });

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'claude-rpg-bin-cli-home-'));
    // bin.ts resolves save files via os.homedir() (session.ts's
    // getDefaultSaveDir()) with no env override in the source itself —
    // Node's os.homedir() does read USERPROFILE/HOME from the process
    // env, though, so pointing those at a scratch dir isolates this test
    // from the real user profile without touching src/**.
    await writeFantasySave(join(homeDir, '.claude-rpg', 'saves'));
    server = await startMockAnthropicServer(1);
  });

  afterEach(async () => {
    if (cli && cli.child.exitCode === null) {
      cli.child.kill();
    }
    cli = undefined;
    await server.close();
    await rm(homeDir, { recursive: true, force: true });
  });

  it('a fatal auth error on a turn prints a structured message and the loop keeps prompting', async () => {
    cli = spawnCli(bundle.entryPath, ['load'], {
      ...process.env,
      ANTHROPIC_API_KEY: 'sk-ant-test-not-real',
      ANTHROPIC_BASE_URL: server.url,
      HOME: homeDir,
      USERPROFILE: homeDir,
    });

    // Save-selection prompt, then the opening narration (mock call #1,
    // succeeds) renders and the game loop's first "  > " prompt appears.
    await cli.waitForStdout('Choose a save');
    cli.sendLine('1');
    await cli.waitForStdout('  > ');
    const promptsBeforeTurn = countStdoutPrompts(cli.stdout());

    // "look" fast-paths past interpretation straight to narrateScene()
    // (see test/integration/game-turn-loop.test.ts's "fast-path commands
    // bypass Claude entirely"), which is mock call #2 — the server now
    // answers 401.
    cli.sendLine('look');

    // bin.ts's turn-loop catch (bin.ts:661-663) routes the uncaught fatal
    // NarrationError through presentError(err, 'turn', debugMode), which
    // writes error-presenter.ts's structured 'auth' presentation to
    // stderr rather than letting a raw exception reach the player.
    await cli.waitForStderr('API key error');
    expect(cli.stderr()).toContain('Your API key is invalid, expired, or missing.');

    // The loop survived: a *second* "  > " prompt was printed rather than
    // the process exiting. This waits for a new occurrence rather than
    // reusing waitForStdout('  > ') — that pattern is already present in
    // the buffer from the first prompt, so a plain contains-check would
    // resolve instantly and prove nothing. (If the turn-loop try/catch
    // regressed, the fatal error would instead propagate to bin.ts's
    // top-level `main().catch()`, which unconditionally calls
    // process.exit(1) — no second prompt would ever print, and this
    // would time out.)
    await cli.waitForStdoutCount('  > ', promptsBeforeTurn + 1, 5000);
    const promptsAfterTurn = countStdoutPrompts(cli.stdout());
    expect(promptsAfterTurn).toBeGreaterThan(promptsBeforeTurn);

    // A subsequent command still works on a live process — not a hung one
    // whose stdin is simply buffering. `quit` never calls the LLM (see
    // game.ts's processInput(), which returns '__QUIT__' before any
    // client call), so this exits cleanly even though every further mock
    // response would be another 401.
    cli.sendLine('quit');
    const exitCode = await cli.waitForExit();
    expect(exitCode).toBe(0);
    expect(cli.stdout()).toContain('Farewell.');

    // Exactly two narration calls happened: the successful opening, then
    // the failed "look" — confirms the server's success-then-401
    // sequencing (not e.g. every call silently succeeding, which would
    // make the stderr assertions above vacuous) is what actually ran.
    expect(server.callCount()).toBe(2);
  }, 20000);
});
