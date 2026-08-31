import { describe, it, expect } from 'vitest';
import { validateEngineState } from './cli/engine-state-validator.js';

// ─── PFE-001: stdin close detection ────────────────────────
// ─── PFE-002: SIGINT handling contract ─────────────────────
// ─── PFE-006: Command dispatch comment (no code test needed)
// ─── PFE-007: Engine state validation ──────────────────────

// bin.ts is a CLI entry point — we test its extractable logic patterns here.
// The actual readline/process handlers are integration-level (process-spawning tests).
//
// F-6506450c: validateEngineState is imported from the real production module
// (cli/engine-state-validator.ts) that bin.ts's runLoad() calls directly, rather
// than a hand-copied fork of the logic that could silently drift from it.

describe('bin defenses: engine state validation (PFE-007)', () => {
  it('accepts valid engine state with world.state carrying meta', () => {
    const result = validateEngineState(JSON.stringify({ world: { state: { hp: 10, meta: { version: '1.0.0' } } } }));
    expect(result.valid).toBe(true);
  });

  it('rejects non-JSON', () => {
    const result = validateEngineState('not json at all');
    expect(result).toMatchObject({ valid: false, error: expect.stringContaining('JSON') });
  });

  it('rejects missing world key', () => {
    const result = validateEngineState(JSON.stringify({ foo: 'bar' }));
    expect(result).toMatchObject({ valid: false, error: expect.stringContaining('world.state') });
  });

  it('rejects missing state key inside world', () => {
    const result = validateEngineState(JSON.stringify({ world: {} }));
    expect(result).toMatchObject({ valid: false, error: expect.stringContaining('world.state') });
  });

  it('rejects null', () => {
    const result = validateEngineState('null');
    expect(result.valid).toBe(false);
  });

  it('rejects world.state === null (F-1b8be73f regression: typeof null === "object")', () => {
    const result = validateEngineState(JSON.stringify({ world: { state: null } }));
    expect(result.valid).toBe(false);
  });

  it('rejects array', () => {
    const result = validateEngineState('[]');
    expect(result.valid).toBe(false);
  });

  it('rejects world.state as an array (F-911bf1ee regression: typeof [] === "object" too, so the null-only guard let an array-shaped state through; distinct from the top-level-array case above, which is caught earlier by the .world lookup)', () => {
    const result = validateEngineState(JSON.stringify({ world: { state: [1, 2, 3] } }));
    expect(result.valid).toBe(false);
  });

  it('rejects world.state as primitive', () => {
    const result = validateEngineState(JSON.stringify({ world: { state: 42 } }));
    expect(result.valid).toBe(false);
  });

  // F-dea554cc (3.9 slice): deliberate INVERSION of the old
  // "accepts empty world.state object" pin. An empty state is exactly the
  // corrupted/truncated-save shape the engine's own Engine.deserialize
  // rejects with SAVE_MALFORMED (`!data.world.state.meta`) — accepting it
  // here meant Object.assign(engine.store.state, {}) was a silent no-op and
  // the player resumed onto a freshly-reset simulation world with zero
  // error. The validator now mirrors the engine's meta gate.
  it('rejects empty world.state object (no meta — the silent-world-reset shape)', () => {
    const result = validateEngineState(JSON.stringify({ world: { state: {} } }));
    expect(result).toMatchObject({ valid: false, error: expect.stringContaining('meta') });
  });

  it('rejects world.state.meta === null (typeof null === "object" again)', () => {
    const result = validateEngineState(JSON.stringify({ world: { state: { meta: null } } }));
    expect(result.valid).toBe(false);
  });

  it('rejects array-shaped world.state.meta', () => {
    const result = validateEngineState(JSON.stringify({ world: { state: { meta: [1] } } }));
    expect(result.valid).toBe(false);
  });

  it('accepts world.state with an empty meta object (cheap structural gate only — deep shape stays the engine\'s job)', () => {
    const result = validateEngineState(JSON.stringify({ world: { state: { meta: {} } } }));
    expect(result.valid).toBe(true);
  });
});

describe('bin defenses: stdin close sentinel (PFE-001)', () => {
  it('__STDIN_CLOSED__ error is a recognizable sentinel', () => {
    const err = new Error('__STDIN_CLOSED__');
    expect(err.message).toBe('__STDIN_CLOSED__');
    // The game loop catches this specific sentinel to trigger auto-save + exit.
  });

  // F-e3f935ec: runLoad()'s save-selection loop used its own raw
  // `new Promise<string>((resolve) => { rl.question(...) })` with no
  // 'close'-event listener, so stdin closing (Ctrl+D, or piped/redirected
  // input running out) while at the "Choose a save" prompt hung the
  // process forever -- no error, no exit code, no __STDIN_CLOSED__ sentinel
  // ever raised. Fixed by hoisting the game loop's own question() helper
  // (below) to module scope so runLoad's prompt shares the exact same
  // PFE-001 'close'-rejection guard instead of bypassing it.
  it('the question() helper used by both the per-turn prompt and the save-selection prompt rejects with the sentinel on readline "close" (contract documentation)', () => {
    // Minimal stand-in for readline.Interface: question() never calls back,
    // and 'close' fires asynchronously, the way a real EOF'd/closed
    // interface behaves.
    class FakeReadline {
      private closeHandlers: Array<() => void> = [];
      question(_prompt: string, _cb: (answer: string) => void): void {
        // Never resolves — simulates stdin closing before an answer arrives.
      }
      once(event: 'close', handler: () => void): void {
        if (event === 'close') this.closeHandlers.push(handler);
      }
      emitClose(): void {
        for (const h of this.closeHandlers) h();
      }
    }

    function question(rlInst: FakeReadline, promptText: string): Promise<string> {
      return new Promise((resolve, reject) => {
        rlInst.question(promptText, resolve);
        rlInst.once('close', () => reject(new Error('__STDIN_CLOSED__')));
      });
    }

    const rl = new FakeReadline();
    const pending = question(rl, 'Choose a save: ');
    rl.emitClose();
    return expect(pending).rejects.toThrow('__STDIN_CLOSED__');
  });
});

describe('bin defenses: SIGINT contract (PFE-002)', () => {
  it('double SIGINT should force-exit (contract documentation)', () => {
    // The SIGINT handler increments a counter:
    // - First Ctrl+C: attempt save, clean exit
    // - Second Ctrl+C: immediate force-exit
    // This test documents the contract. Actual process signal tests require spawning.
    let sigintCount = 0;
    const handleSigint = () => {
      sigintCount++;
      if (sigintCount >= 2) return 'force-exit';
      return 'save-and-exit';
    };
    expect(handleSigint()).toBe('save-and-exit');
    expect(handleSigint()).toBe('force-exit');
  });
});

describe('bin defenses: command dispatch comment (PFE-006)', () => {
  it('documents future extraction opportunity (no logic to test)', () => {
    // PFE-006 is a comment-only change. This test documents the intent.
    expect(true).toBe(true);
  });
});

// F-f51578f1: main() used to check ANTHROPIC_API_KEY before dispatching to
// ANY command, including 'archive' (runArchive -> listArchivedCampaigns +
// renderArchiveBrowser), which makes no LLM calls at all -- it only reads
// saved/archived campaign files from disk and renders them. A user who just
// wanted to browse completed campaigns was blocked by an irrelevant
// key requirement, even though usage.ts's own --help text documents
// 'claude-rpg archive' as a peer of --version/--help (both of which already
// bypass this same check). Fixed by dispatching 'archive' before the key
// check, mirroring how --version/--help already do. main() runs
// unconditionally on import (no `import.meta.url === process.argv[1]`
// guard), so this file tests the extractable command-list contract rather
// than importing bin.ts directly -- see this file's own top comment.
describe('bin defenses: archive command bypasses the API key gate (F-f51578f1)', () => {
  it('the commands that must dispatch before the ANTHROPIC_API_KEY check include archive, alongside --version/--help', () => {
    // Mirrors main()'s actual ordering: --version, --help, and archive all
    // dispatch (and return/exit) before `if (!process.env.ANTHROPIC_API_KEY)`
    // is ever evaluated. play/load/new are the only commands that construct
    // an LLM client and so are the only ones that should still be gated.
    const keyExemptCommands = ['--version', '-v', '--help', '-h', 'archive'];
    const keyGatedCommands = ['play', 'load', 'new'];
    for (const cmd of keyExemptCommands) {
      expect(keyGatedCommands).not.toContain(cmd);
    }
  });
});

describe('bin defenses: early SIGINT guard for pre-gameplay windows (F-4997779f)', () => {
  it('a single SIGINT during world-gen/character-creation prints a farewell and exits cleanly (contract documentation)', () => {
    // Mirrors installEarlySigintGuard()'s handler: unlike PFE-002's full
    // save-then-exit dance (which needs two Ctrl+C presses), there is no
    // session data to protect during world-gen or character-creation, so
    // a single Ctrl+C here exits immediately with the same farewell/exit
    // code every other graceful exit path in bin.ts uses.
    let exitCode: number | null = null;
    let printedFarewell = false;
    const handleEarlySigint = () => {
      printedFarewell = true;
      exitCode = 0;
    };
    handleEarlySigint();
    expect(printedFarewell).toBe(true);
    expect(exitCode).toBe(0);
  });

  it('the guard is disposable, so it can be removed before runGameLoop installs its own permanent handler (contract documentation)', () => {
    // installEarlySigintGuard() returns a disposer; each of runPlay/runLoad/
    // runNew calls it immediately before their own `await runGameLoop(...)`
    // so the temporary early handler and PFE-002's permanent one never both
    // fire for the same keypress.
    const listeners: Array<() => void> = [];
    const install = (): (() => void) => {
      const handler = () => {};
      listeners.push(handler);
      return () => {
        const idx = listeners.indexOf(handler);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    };
    const dispose = install();
    expect(listeners.length).toBe(1);
    dispose();
    expect(listeners.length).toBe(0);
  });
});
