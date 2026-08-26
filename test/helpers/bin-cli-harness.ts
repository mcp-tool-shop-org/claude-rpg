// bin-cli-harness.ts — spawns the real src/bin.ts CLI entry point as a
// child process for integration tests that need to observe bin.ts's own
// behavior (the turn-loop catch-and-continue at bin.ts:661-663, structured
// stderr output via presentError, prompt survival) rather than
// GameSession.processInput() in isolation via test/helpers/game-harness.ts.
//
// F-b1f64739: no test anywhere in test/** ever touched bin.ts
// (`grep -c '^export' src/bin.ts` => 0, so it cannot be imported the way
// engine-state-validator.ts/save-selection.ts were extracted from it).
// bin.ts is also written for compile-then-run — its relative imports use
// `.js` extensions matching tsc's emitted output — and this worktree has
// no dist/ build and no tsx/ts-node devDependency to run the .ts source
// directly as a child process. esbuild is already present in node_modules
// (a transitive dependency of vite/vitest, which this repo's own test
// runner is built on) and is used here purely as a bundler: it resolves
// bin.ts's `.js`-import-into-`.ts`-file graph (including the
// @ai-rpg-engine/* packages and @anthropic-ai/sdk) into one self-contained
// CommonJS file written under an OS scratch temp directory — nothing is
// written under the repo itself.

import * as esbuild from 'esbuild';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { TurnHistory } from '../../src/session/history.js';
import { saveSession } from '../../src/session/session.js';

const REPO_ROOT = join(__dirname, '..', '..');

/**
 * import.meta.url shim for esbuild's "cjs" output format. bin.ts does
 * `createRequire(import.meta.url)` (to load package.json for --version),
 * but esbuild warns "import.meta is not available with the cjs output
 * format" and leaves it undefined. Injected as a named export and swapped
 * in for every `import.meta.url` via esbuild's `define`; `require` and
 * `__filename` are real Node CJS globals in the final bundle.
 */
const IMPORT_META_URL_SHIM = `export const importMetaUrl = require('node:url').pathToFileURL(__filename).href;\n`;

export type BinCliBundle = {
  /** Path to the bundled, runnable bin.cjs (sits under a scratch dist/ dir). */
  entryPath: string;
  /** Removes the scratch directory the bundle and package.json copy live in. */
  cleanup: () => Promise<void>;
};

/**
 * Bundles src/bin.ts and its full import graph into a single CommonJS
 * file under a scratch OS temp directory, mirroring the real
 * `dist/bin.js` + `package.json` relative layout so bin.ts's own
 * `require('../package.json')` resolves correctly at runtime.
 */
export async function bundleBinCli(): Promise<BinCliBundle> {
  const scratchDir = await mkdtemp(join(tmpdir(), 'claude-rpg-bin-cli-'));
  const distDir = join(scratchDir, 'dist');
  await mkdir(distDir, { recursive: true });
  await cp(join(REPO_ROOT, 'package.json'), join(scratchDir, 'package.json'));

  const shimPath = join(scratchDir, 'import-meta-url-shim.js');
  await writeFile(shimPath, IMPORT_META_URL_SHIM);

  const entryPath = join(distDir, 'bin.cjs');
  await esbuild.build({
    entryPoints: [join(REPO_ROOT, 'src', 'bin.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    outfile: entryPath,
    inject: [shimPath],
    define: { 'import.meta.url': 'importMetaUrl' },
    logLevel: 'silent',
  });

  return {
    entryPath,
    cleanup: () => rm(scratchDir, { recursive: true, force: true }),
  };
}

export type MockAnthropicServer = {
  /** Value to set ANTHROPIC_BASE_URL to. */
  url: string;
  callCount: () => number;
  close: () => Promise<void>;
};

/**
 * Stands in for api.anthropic.com via ANTHROPIC_BASE_URL. The first
 * `succeedCount` requests return a normal 200 message response — so
 * bin.ts's opening narration (generateOpeningNarration() in
 * src/game/game-narration.ts delegates straight to the same narrateScene()
 * any in-game turn uses) completes and the interactive loop is reached.
 * Every request after that returns HTTP 401, which @anthropic-ai/sdk
 * classifies as AuthenticationError and claude-adapter.ts's
 * classifyError() maps to a fatal NarrationError(kind: 'auth').
 */
export function startMockAnthropicServer(succeedCount = 1): Promise<MockAnthropicServer> {
  let calls = 0;
  const server: Server = createServer((req, res) => {
    calls++;
    // Drain the request body so the socket doesn't hang the client.
    req.resume();
    req.on('end', () => {
      if (calls <= succeedCount) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          id: `msg_stub_${calls}`,
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-20250514',
          content: [{ type: 'text', text: 'The chapel holds its breath, waiting.' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 12, output_tokens: 8 },
        }));
        return;
      }
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        type: 'error',
        error: { type: 'authentication_error', message: 'invalid x-api-key (forced by test)' },
      }));
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('mock Anthropic server: could not read bound address'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        callCount: () => calls,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

/**
 * Writes a real, loadable save (via the app's own saveSession(), the same
 * path test/integration/session-persistence.test.ts exercises) so bin.ts's
 * `load` command has a save to select. packId must resolve via
 * getPackById() (src/character/packs.ts's fantasy pack id is
 * 'chapel-threshold', not the display name 'fantasy') or runLoad() prints
 * "Cannot restore engine" and exits before the game loop is reached.
 */
export async function writeFantasySave(saveDir: string, filename = 'test-save'): Promise<void> {
  await mkdir(saveDir, { recursive: true });
  const engine = createGame();
  const history = new TurnHistory();
  await saveSession({
    engine,
    history,
    tone: 'dark fantasy',
    savePath: join(saveDir, `${filename}.json`),
    packId: 'chapel-threshold',
    genre: 'fantasy',
  });
}

/** Counts non-overlapping occurrences of a literal substring. */
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

export type CliHandle = {
  child: ChildProcessWithoutNullStreams;
  stdout: () => string;
  stderr: () => string;
  sendLine: (line: string) => void;
  waitForStdout: (pattern: string | RegExp, timeoutMs?: number) => Promise<void>;
  waitForStderr: (pattern: string | RegExp, timeoutMs?: number) => Promise<void>;
  /**
   * Waits until `needle` has appeared at least `minCount` times in stdout.
   * Unlike waitForStdout, this notices a *new* occurrence of a substring
   * (e.g. a second prompt) rather than resolving instantly because an
   * earlier occurrence already satisfied a plain contains-check.
   */
  waitForStdoutCount: (needle: string, minCount: number, timeoutMs?: number) => Promise<void>;
  waitForExit: (timeoutMs?: number) => Promise<number | null>;
};

/** Spawns the bundled bin.cjs as a real child process with piped stdio. */
export function spawnCli(entryPath: string, args: string[], env: NodeJS.ProcessEnv): CliHandle {
  let stdoutBuf = '';
  let stderrBuf = '';
  const child = spawn(process.execPath, [entryPath, ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk: Buffer) => { stdoutBuf += chunk.toString('utf-8'); });
  child.stderr.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString('utf-8'); });

  function waitFor(getBuf: () => string, pattern: string | RegExp, timeoutMs: number, label: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const matches = () => (typeof pattern === 'string' ? getBuf().includes(pattern) : pattern.test(getBuf()));
      if (matches()) {
        resolve();
        return;
      }
      const interval = setInterval(() => {
        if (matches()) {
          clearInterval(interval);
          clearTimeout(timer);
          resolve();
        }
      }, 25);
      const timer = setTimeout(() => {
        clearInterval(interval);
        reject(new Error(
          `Timed out after ${timeoutMs}ms waiting for ${label} to match ${String(pattern)}.\n` +
          `--- stdout ---\n${stdoutBuf}\n--- stderr ---\n${stderrBuf}`,
        ));
      }, timeoutMs);
    });
  }

  return {
    child,
    stdout: () => stdoutBuf,
    stderr: () => stderrBuf,
    sendLine: (line: string) => {
      child.stdin.write(`${line}\n`);
    },
    waitForStdout: (pattern, timeoutMs = 15000) => waitFor(() => stdoutBuf, pattern, timeoutMs, 'stdout'),
    waitForStderr: (pattern, timeoutMs = 15000) => waitFor(() => stderrBuf, pattern, timeoutMs, 'stderr'),
    waitForStdoutCount: (needle, minCount, timeoutMs = 15000) =>
      new Promise((resolve, reject) => {
        const satisfied = () => countOccurrences(stdoutBuf, needle) >= minCount;
        if (satisfied()) {
          resolve();
          return;
        }
        const interval = setInterval(() => {
          if (satisfied()) {
            clearInterval(interval);
            clearTimeout(timer);
            resolve();
          }
        }, 25);
        const timer = setTimeout(() => {
          clearInterval(interval);
          reject(new Error(
            `Timed out after ${timeoutMs}ms waiting for stdout to contain ${minCount} occurrences of ${JSON.stringify(needle)} ` +
            `(saw ${countOccurrences(stdoutBuf, needle)}).\n--- stdout ---\n${stdoutBuf}\n--- stderr ---\n${stderrBuf}`,
          ));
        }, timeoutMs);
      }),
    waitForExit: (timeoutMs = 15000) =>
      new Promise((resolve, reject) => {
        if (child.exitCode !== null) {
          resolve(child.exitCode);
          return;
        }
        const timer = setTimeout(() => {
          reject(new Error(`Timed out after ${timeoutMs}ms waiting for exit.\n--- stdout ---\n${stdoutBuf}\n--- stderr ---\n${stderrBuf}`));
        }, timeoutMs);
        child.once('exit', (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      }),
  };
}
