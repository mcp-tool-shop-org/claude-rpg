// Regression tests for the bin.ts CLI test harness itself — the helpers in
// bin-cli-harness.ts run real filesystem/process/bundling operations on
// behalf of test/integration/bin-cli-turn-loop.test.ts, and a bug in their
// own cleanup logic would leak scratch directories on every affected test
// run rather than failing loudly.

import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const { buildMock } = vi.hoisted(() => ({ buildMock: vi.fn() }));

vi.mock('esbuild', async (importOriginal) => {
  const actual = await importOriginal<typeof import('esbuild')>();
  return {
    ...actual,
    build: buildMock,
  };
});

import { bundleBinCli, cleanupCliTestResources } from './bin-cli-harness.js';

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe('bundleBinCli scratch-directory cleanup on failure (F-3730e833)', () => {
  it('removes its scratch directory when esbuild.build() rejects, instead of leaking it', async () => {
    buildMock.mockReset();
    buildMock.mockImplementation(async () => {
      throw new Error('simulated esbuild failure');
    });

    await expect(bundleBinCli()).rejects.toThrow('simulated esbuild failure');

    expect(buildMock).toHaveBeenCalledTimes(1);
    // outfile = <scratchDir>/dist/bin.cjs — recover scratchDir from the
    // real build() options the (real) function passed in, rather than
    // guessing mkdtemp's random suffix.
    const { outfile } = buildMock.mock.calls[0]![0] as { outfile: string };
    const scratchDir = dirname(dirname(outfile));

    expect(await pathExists(scratchDir)).toBe(false);
  });
});

describe('cleanupCliTestResources step independence (F-48984be7)', () => {
  it('still removes homeDir when server was never assigned (mirrors a beforeEach that threw before acquiring it)', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'claude-rpg-bin-cli-home-'));

    await cleanupCliTestResources({ server: undefined, homeDir });

    expect(await pathExists(homeDir)).toBe(false);
  });
});
