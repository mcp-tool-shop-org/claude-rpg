import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
      // Layer 1 — global hygiene floor (stops total collapse)
      // F-ce3b86de: ratcheted with headroom below actuals measured via a
      // full `vitest run --coverage` at this wave's HEAD (statements
      // 61.92%, branches 73.98%, functions 80.51%) -- the previous floors
      // (20/45/30, set 2026-03-19 per docs/test-floor-baseline.md) had
      // drifted far enough below reality to stop defending against any
      // real regression.
      thresholds: {
        statements: 45,
        branches: 60,
        functions: 65,
        // Layer 2 — runtime-critical floors (defends proven seams)
        // F-ce3b86de: also ratcheted with headroom below the same
        // coverage run's actuals (src/llm/** 91.58%, src/session/**
        // 70.23%, src/game/** 71.91%).
        'src/llm/**': {
          statements: 82,
        },
        'src/session/**': {
          statements: 58,
        },
        'src/game/**': {
          statements: 55,
        },
        // F-ce3b86de: 'src/game/**' only ever matched the src/game/
        // subdirectory (game-narration.ts, game-presenter.ts,
        // game-state.ts, debug-logger.ts, token-tracker.ts) -- confirmed
        // via Node's path.matchesGlob('src/game.ts', 'src/game/**') =>
        // false. The top-level src/game.ts is the single largest file in
        // the repo (2273 statements, ~41.1% covered at this wave's HEAD)
        // and had no per-path floor of its own, only the generic global
        // one -- a large regression there could pass `npm run verify`
        // undetected. This dedicated key closes that gap; the floor sits
        // with headroom below the measured ~41.1%.
        'src/game.ts': {
          statements: 30,
        },
      },
    },
  },
});
