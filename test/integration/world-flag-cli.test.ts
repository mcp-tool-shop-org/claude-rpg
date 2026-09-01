// F-8d865d50 (SLATE-4, wave 18 tests domain): end-to-end coverage of a new
// --world CLI flag -- preselection skipping the menu, unknown-value
// rejection, alias handling, and its (non-)interaction with the load path.
//
// Coordinator Brief ruling (R5, binding): unknown --world = structured error
// + exit 1 -- pin that, not a menu fallback.
//
// Landed: F-7862c05d (commit 6f071f4) added src/cli/world-flag.ts
// (parseWorldFlag/formatValidWorlds) and wired it into src/bin.ts's
// construction sites (see bin.ts:307-319) so --world resolves fully
// pre-interactive, with an unknown value producing the structured error
// below rather than a silent fall-through to the menu. runLoad() is still
// called with NO args at all (`else if (command === 'load') { await
// runLoad(); }`), so --world remains inert for the load path by design,
// independent of this fix.
//
// Reuses test/integration/bin-cli-turn-loop.test.ts's established
// spawnCli()/bundleBinCli()/writeFantasySave() conventions wholesale -- no
// new harness infrastructure required for this finding itself (the flaky-
// mock-server helper this domain adds this wave is for F-99dc64ac, a
// different finding).
//
// Expected pack identity strings (meta.name, etc.) are derived from the
// real packs.ts registry at test time via getPackById()/resolveWorldFlag(),
// never hardcoded -- so these tests don't guess copy that could drift.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
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
  type MockAnthropicServer,
  type CliHandle,
  scaledWaitMs,
} from '../helpers/bin-cli-harness.js';
import { getPackById, resolveWorldFlag } from '../../src/character/packs.js';

let bundle: BinCliBundle;

beforeAll(async () => {
  bundle = await bundleBinCli();
}, scaledWaitMs(30000));

afterAll(async () => {
  await bundle.cleanup();
});

describe('bin.ts --world flag — preselection skips the menu (F-8d865d50)', () => {
  let cli: CliHandle | undefined;

  afterEach(async () => {
    await cleanupCliTestResources({ cli });
    cli = undefined;
  });

  it('--world gladiator skips "Choose your world" and shows the gladiator pack identity, proving the menu was genuinely skipped rather than just answered fast (landed in commit 6f071f4, F-7862c05d)', async () => {
    const gladiatorPackId = resolveWorldFlag('gladiator');
    expect(gladiatorPackId).toBeTruthy();
    const gladiatorPack = getPackById(gladiatorPackId!)!;

    cli = spawnCli(bundle.entryPath, ['play', '--world', 'gladiator'], {
      ...process.env,
      ANTHROPIC_API_KEY: 'sk-ant-test-not-real',
    });

    // buildCharacter() prints "  <pack.meta.name>: <pack.meta.description>"
    // immediately after pack selection (or preset skip), before prompting
    // for a character name -- reachable with no stdin sent at all if the
    // menu is genuinely skipped.
    await cli.waitForStdout(gladiatorPack.meta.name);
    expect(cli.stdout()).not.toContain('Choose your world');

    // Supply a character name over stdin (per the routed finding's own
    // script) to prove the readline interface is live and progressing
    // normally past the (skipped) world-selection step, not stuck.
    cli.sendLine('Test Hero');
  }, scaledWaitMs(15000));

  it("an unrecognized --world value is a structured error with exit 1, never a silent fall-through to the interactive menu (Coordinator Brief R5, landed in commit 6f071f4, F-7862c05d)", async () => {
    cli = spawnCli(bundle.entryPath, ['play', '--world', 'not-a-real-world-xyz'], {
      ...process.env,
      ANTHROPIC_API_KEY: 'sk-ant-test-not-real',
    });

    // Race exit-with-error against the (pre-fix) menu-fallback shape so a
    // regression back to it fails fast with a clear signal instead of
    // silently burning the full 15s timeout waiting for an exit that a
    // regressed, un-gated bin.ts would never produce (it would just sit at
    // the interactive menu prompt indefinitely).
    const outcome = await Promise.race([
      cli.waitForExit(15000).then((code) => ({ kind: 'exit' as const, code })),
      cli.waitForStdout('Choose your world').then(() => ({ kind: 'menu-fallback' as const })),
    ]);
    expect(outcome.kind, 'expected a structured-error exit, but got a silent fall-through to the interactive menu instead').toBe('exit');
    if (outcome.kind === 'exit') {
      expect(outcome.code).toBe(1);
    }
    expect(cli.stdout()).not.toContain('Choose your world');
    // "Structured error" (Shipcheck gate-B convention) is checked at the
    // level R5 actually specifies -- something informative on stderr, not
    // silence -- rather than guessing the exact wording, which R5 doesn't
    // pin.
    expect(cli.stderr().trim().length).toBeGreaterThan(0);
  }, scaledWaitMs(20000));

  // Table-driven across every alias resolveWorldFlag() recognizes
  // (src/character/packs.ts:118-136). Each spawn only needs to reach the
  // pack-description line -- no full character-creation flow required to
  // prove the alias resolved correctly.
  const ALL_ALIASES = [
    'fantasy', 'gladiator', 'ronin', 'vampire', 'cyberpunk',
    'detective', 'pirate', 'weird-west', 'zombie', 'colony',
  ];

  it.each(ALL_ALIASES)('alias handling: --world %s resolves to its documented pack id and skips the menu', async (alias) => {
    const packId = resolveWorldFlag(alias);
    expect(packId, `resolveWorldFlag("${alias}") should resolve to a real pack id`).toBeTruthy();
    const pack = getPackById(packId!)!;

    const handle = spawnCli(bundle.entryPath, ['play', '--world', alias], {
      ...process.env,
      ANTHROPIC_API_KEY: 'sk-ant-test-not-real',
    });
    try {
      await handle.waitForStdout(pack.meta.name);
      expect(handle.stdout()).not.toContain('Choose your world');
    } finally {
      await cleanupCliTestResources({ cli: handle });
    }
  }, scaledWaitMs(20000));
});

describe('bin.ts --world flag — interaction with the load path (F-8d865d50)', () => {
  let homeDir: string;
  let server: MockAnthropicServer;
  let cli: CliHandle | undefined;

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'claude-rpg-world-flag-home-'));
    // Fantasy pack save (packId 'chapel-threshold') -- see writeFantasySave().
    await writeFantasySave(join(homeDir, '.claude-rpg', 'saves'));
    server = await startMockAnthropicServer(1);
  });

  afterEach(async () => {
    await cleanupCliTestResources({ cli, server, homeDir });
    cli = undefined;
  });

  it('a --world flag on `load` does not override a save\'s own packId (policy lock -- already true today since runLoad() reads no args at all; guards against a future regression that wires --world into load without this check)', async () => {
    const gladiatorPackId = resolveWorldFlag('gladiator');
    const gladiatorPack = getPackById(gladiatorPackId!)!;

    cli = spawnCli(bundle.entryPath, ['load', '--world', 'gladiator'], {
      ...process.env,
      ANTHROPIC_API_KEY: 'sk-ant-test-not-real',
      ANTHROPIC_BASE_URL: server.url,
      HOME: homeDir,
      USERPROFILE: homeDir,
    });

    await cli.waitForStdout('Choose a save');
    cli.sendLine('1');
    await cli.waitForStdout('  > ');

    // The loaded session must reflect the SAVE's own pack (fantasy), never
    // the flag's pack (gladiator) -- checked as "gladiator's identity never
    // appears" since the loaded-save screen never re-announces "Choose your
    // world" either way (load skips character creation entirely).
    expect(cli.stdout()).not.toContain(gladiatorPack.meta.name);

    cli.sendLine('quit');
    const exitCode = await cli.waitForExit();
    expect(exitCode).toBe(0);
  }, scaledWaitMs(20000));
});
