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
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  bundleBinCli,
  startMockAnthropicServer,
  writeFantasySave,
  writeFantasySaveWithCharacterName,
  spawnCli,
  cleanupCliTestResources,
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
    // F-48984be7: cleanupCliTestResources() keeps the kill/close/rm steps
    // independent of each other, so a beforeEach failure that leaves
    // `server` unassigned can't skip the homeDir removal.
    await cleanupCliTestResources({ cli, server, homeDir });
    cli = undefined;
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

// F-2af28d17: attemptExitAutosave's 'rejected' branch (src/cli/exit-autosave.ts,
// the F-66ec19e3 fix) is unit-tested directly in src/cli/exit-autosave.test.ts,
// but nothing previously drove bin.ts's own SIGINT handler (bin.ts:544-566)
// or stdin-closed/EOF handler (bin.ts:573-593) — the actual call sites —
// into that branch. These reuse the same bundleBinCli()/spawnCli() harness
// as the describe block above, but load a save whose character name
// contains '..' path segments so the autosave filename bin.ts builds from
// session.profile.build.name escapes getDefaultSaveDir() once getSavePath()
// joins it back together (the same shape exit-autosave.test.ts's "escapes
// the save directory" case exercises directly against the extracted
// function, reached here through the real save -> load -> exit flow).
describe('bin.ts exit-autosave — rejected path reaches real SIGINT/EOF exits', () => {
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
    await writeFantasySaveWithCharacterName(join(homeDir, '.claude-rpg', 'saves'), '../../escaped-hero');
    server = await startMockAnthropicServer(1);
  });

  afterEach(async () => {
    await cleanupCliTestResources({ cli, server, homeDir });
    cli = undefined;
  });

  /** Spawns bin.ts, loads the one save, and waits for the game loop's first prompt. */
  async function loadToFirstPrompt(): Promise<CliHandle> {
    const handle = spawnCli(bundle.entryPath, ['load'], {
      ...process.env,
      ANTHROPIC_API_KEY: 'sk-ant-test-not-real',
      ANTHROPIC_BASE_URL: server.url,
      HOME: homeDir,
      USERPROFILE: homeDir,
    });
    await handle.waitForStdout('Choose a save');
    handle.sendLine('1');
    await handle.waitForStdout('  > ');
    return handle;
  }

  // Windows note (verified empirically on this harness): a piped-stdio
  // Node child process spawned via child_process.spawn() does not run its
  // process.on('SIGINT', ...) handler when the parent calls
  // child.kill('SIGINT') — libuv/Windows hard-terminates the process
  // instead of delivering a real signal, so bin.ts's SIGINT handler would
  // never fire and this would hang until timeout for a platform reason
  // unrelated to bin.ts's own logic. POSIX (this repo's ubuntu-latest CI)
  // delivers the signal for real, so this still guards the actual SIGINT
  // call site there; it's skipped only on win32 dev machines.
  it.skipIf(process.platform === 'win32')(
    'SIGINT autosave that escapes the save directory prints the rejection message and still exits cleanly',
    async () => {
      cli = await loadToFirstPrompt();

      // First Ctrl+C: bin.ts's SIGINT handler attempts the autosave before
      // exiting. isPathInside rejects the escaped path, so
      // attemptExitAutosave returns { status: 'rejected' } without ever
      // calling save() — bin.ts prints outcome.message verbatim.
      cli.child.kill('SIGINT');

      await cli.waitForStdout('progress was NOT auto-saved');
      expect(cli.stdout()).toContain('would escape the save directory');

      const exitCode = await cli.waitForExit();
      expect(exitCode).toBe(0);
      expect(cli.stdout()).toContain('Farewell.');
    },
    20000,
  );

  it('stdin EOF autosave that escapes the save directory prints the rejection message and still exits cleanly', async () => {
    cli = await loadToFirstPrompt();

    // Closing stdin (Ctrl+D / pipe EOF) drives the same attemptExitAutosave
    // call from bin.ts's other exit path (the readline 'close' handler).
    cli.child.stdin.end();

    await cli.waitForStdout('progress was NOT auto-saved');
    expect(cli.stdout()).toContain('would escape the save directory');

    const exitCode = await cli.waitForExit();
    expect(exitCode).toBe(0);
    expect(cli.stdout()).toContain('Farewell.');
  }, 20000);
});
