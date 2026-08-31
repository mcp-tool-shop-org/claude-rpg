// F-95569ed3 (wave 8 amend): every real-process (spawnCli) test that drives
// bin.ts's `load` command seeds exactly one valid save first
// (writeFantasySave()/writeFantasySaveWithCharacterName(), confirmed across
// bin-cli-turn-loop.test.ts, retry-spinner-cli.test.ts,
// sfx-humanization-cli.test.ts, world-flag-cli.test.ts) -- no test anywhere
// in test/** spawns the real bin.ts process against an EMPTY save
// directory, or a corrupted/future-version save file, both real,
// already-handled production branches (runLoad()'s empty-state message +
// exit 0 at bin.ts:358-367; the SaveValidationError branches
// migration.test.ts already proves loadSession()/migrateSave() throw for a
// future-schema or version-less save). The `archive` command has the
// identical gap one level worse: before this file, zero test/**
// references to the real `archive` subcommand existed at all (real-process
// or otherwise) -- only its renderArchiveBrowser([]) empty state was
// unit-tested directly (archive-export.test.ts).
//
// F-95569ed3 finding note (disclosed): the routed finding's Fix text
// expected the corrupted/future-version scenarios to surface through
// presentLoadError (src/cli/error-presenter.ts)'s dedicated 'newer version'/
// 'no recognizable version' branches. Tracing the real, unguarded call
// site instead: runLoad() (src/bin.ts) awaits loadSession(savePath) with
// NO try/catch of its own -- unlike the validateEngineState step slightly
// below it, which IS wrapped and does route through
// presentError(err, 'load', debugMode). A SaveValidationError thrown by
// loadSession() itself (exactly what detectSchemaVersion/validateVersion
// throw for these two fixtures) therefore propagates all the way up to
// this file's bottom-level `main().catch((err) => presentError(err,
// 'startup', debugMode))` instead -- context 'startup', not 'load'.
// classifyForPresentation's context switch has no 'startup' case, so it
// falls to the generic presentUnknownError() branch ('Unexpected error' /
// 'Your session may still be active.' / 'Try again, or type "save"...'),
// not presentLoadError()'s tailored 'Save file too new' /
// 'Unrecognized save format' copy -- those two branches are exercised
// directly by unit tests (error-presenter's own suite) but appear
// unreachable from the real `load` command as currently wired. This file
// asserts the ACTUAL real-process behavior (a structured, non-raw-stack-
// trace message that still contains the real validation text, on stderr,
// with a clean exit 1) rather than the assumed one, and calls out the
// routing gap in prose for a follow-up outside this domain's file-ownership
// (bin.ts is not in test/**/vitest.config.ts).

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  bundleBinCli,
  writeFutureVersionSave,
  writeCorruptSave,
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

describe('bin.ts `load` against an empty save directory (F-95569ed3)', () => {
  let cli: CliHandle | undefined;
  let homeDir: string | undefined;

  afterEach(async () => {
    await cleanupCliTestResources({ cli, homeDir });
    cli = undefined;
    homeDir = undefined;
  });

  it('prints the documented empty-state message and exits 0 -- no save has ever been written under this HOME', async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'claude-rpg-load-empty-home-'));

    cli = spawnCli(bundle.entryPath, ['load'], {
      ...process.env,
      ANTHROPIC_API_KEY: 'sk-ant-test-not-real',
      HOME: homeDir,
      USERPROFILE: homeDir,
    });

    // bin.ts:364-365 (F-46026cfc)
    await cli.waitForStdout('No saved games found.');
    expect(cli.stdout()).toContain('claude-rpg play');
    expect(cli.stdout()).toContain('claude-rpg new');
    // The empty-state message is the whole story -- runLoad() never reaches
    // the readline-driven save picker, so nothing should prompt for input.
    expect(cli.stdout()).not.toContain('Choose a save');

    const exitCode = await cli.waitForExit();
    expect(exitCode).toBe(0);
  }, 15000);
});

describe('bin.ts `archive` against an empty save directory (F-95569ed3: no test/** coverage of the real archive subcommand existed before this file)', () => {
  let cli: CliHandle | undefined;
  let homeDir: string | undefined;

  afterEach(async () => {
    await cleanupCliTestResources({ cli, homeDir });
    cli = undefined;
    homeDir = undefined;
  });

  it('prints the documented empty-state message and exits 0, with no ANTHROPIC_API_KEY at all (F-f51578f1: archive dispatches before the key gate and makes no LLM calls)', async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'claude-rpg-archive-empty-home-'));
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: homeDir, USERPROFILE: homeDir };
    delete env.ANTHROPIC_API_KEY;

    cli = spawnCli(bundle.entryPath, ['archive'], env);

    // display/archive-browser.ts's renderArchiveBrowser([]) empty state,
    // already unit-tested directly in archive-export.test.ts -- this proves
    // the real `archive` dispatch (bin.ts:225-228, F-f51578f1) actually
    // reaches it.
    await cli.waitForStdout('No archived campaigns');
    expect(cli.stdout()).toContain('Complete a campaign with /conclude');
    // Not a strict-empty check: Node itself can write its own deprecation
    // warnings (e.g. punycode) to stderr independent of this app's error
    // pipeline. What actually matters here -- archive genuinely needs no
    // key -- is that renderError()'s presenter never fired.
    expect(cli.stderr()).not.toContain('Unexpected error');
    expect(cli.stderr()).not.toContain('ANTHROPIC_API_KEY');

    const exitCode = await cli.waitForExit();
    expect(exitCode).toBe(0);
  }, 15000);
});

describe('bin.ts `load` against a corrupted or future-version save (F-95569ed3)', () => {
  let cli: CliHandle | undefined;
  let homeDir: string | undefined;

  afterEach(async () => {
    await cleanupCliTestResources({ cli, homeDir });
    cli = undefined;
    homeDir = undefined;
  });

  it('a future-schema save (fixture: future-v99.json) is selectable from the real save picker, then rejected with a structured message on stderr and a clean exit 1 -- not a raw stack trace', async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'claude-rpg-load-future-home-'));
    await writeFutureVersionSave(join(homeDir, '.claude-rpg', 'saves'));

    cli = spawnCli(bundle.entryPath, ['load'], {
      ...process.env,
      ANTHROPIC_API_KEY: 'sk-ant-test-not-real',
      HOME: homeDir,
      USERPROFILE: homeDir,
    });

    // listSaves() never inspects schemaVersion (session.ts) -- the
    // future-version save is listed and selectable like any other slot.
    await cli.waitForStdout('Choose a save');
    cli.sendLine('1');

    const exitCode = await cli.waitForExit();
    expect(exitCode).toBe(1);
    // The real validation text (migrate.ts's validateVersion, already
    // proven thrown by migration.test.ts's 'future-v99 is rejected' case)
    // reaches real stderr verbatim...
    expect(cli.stderr()).toContain('newer version');
    // ...via the structured renderError() pipeline (a headline + explanation
    // + next-action, terminated by "Exiting."), never as an unhandled
    // Node exception dump.
    expect(cli.stderr()).toContain('Exiting.');
    expect(cli.stderr()).not.toMatch(/at Object\.|at async |node:internal/);
  }, 15000);

  it('a save with no recognizable version metadata (fixture: no-version.json) is selectable from the real save picker, then rejected with a structured message on stderr and a clean exit 1 -- not a raw stack trace', async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'claude-rpg-load-noversion-home-'));
    await writeCorruptSave(join(homeDir, '.claude-rpg', 'saves'));

    cli = spawnCli(bundle.entryPath, ['load'], {
      ...process.env,
      ANTHROPIC_API_KEY: 'sk-ant-test-not-real',
      HOME: homeDir,
      USERPROFILE: homeDir,
    });

    await cli.waitForStdout('Choose a save');
    cli.sendLine('1');

    const exitCode = await cli.waitForExit();
    expect(exitCode).toBe(1);
    // migrate.ts's detectSchemaVersion (already proven thrown by
    // migration.test.ts's 'no-version is rejected' case) reaches real
    // stderr verbatim, structured rather than a raw stack trace.
    // Coordinator stitch (wave 8), pin INVERTED with the routing fix this
    // file's own header traced: runLoad now wraps loadSession, so the
    // rejection reaches presentLoadError's dedicated presentation
    // ("Unrecognized save format" + what-survived + next step) instead of
    // the generic startup catch echoing the raw error message.
    expect(cli.stderr()).toContain('Unrecognized save format');
    expect(cli.stderr()).toContain('no version metadata');
    expect(cli.stderr()).toContain('Exiting.');
    expect(cli.stderr()).not.toMatch(/at Object\.|at async |node:internal/);
  }, 15000);
});
