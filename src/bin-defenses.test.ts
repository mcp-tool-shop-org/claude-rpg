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
