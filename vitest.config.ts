import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // F-5ba54290: coverage.exclude is spread AFTER coverageConfigDefaults
      // by @vitest/coverage-v8's BaseCoverageProvider._initialize
      // ({...coverageConfigDefaults, ...config}), so an exclude array here
      // wholesale-REPLACES Vitest's own defaults rather than extending them.
      // Vitest's defaults also cover *.spec.ts, hyphenated *-test.ts,
      // *.bench.ts/*.benchmark.ts, and **/__tests__/** -- none of which the
      // previous two-entry list covered. Spreading coverageConfigDefaults.exclude
      // alongside the two project-specific entries means a *.spec.ts or
      // *.bench.ts file colocated under src/ (an ordinary alternate test
      // convention this repo doesn't use today) can never be silently
      // miscounted as production code against the ratcheted floors below,
      // and future Vitest default additions are inherited automatically.
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', ...coverageConfigDefaults.exclude],
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
        // F-26ec045e: src/display/** had no dedicated floor -- only the
        // generic global one -- despite being the Stage-D lens's own
        // subject and, per this wave's `vitest run --coverage` at HEAD, the
        // weakest-tested directory that already has a sibling floor
        // (director-renderer.ts alone: 36.19% statements / 42.15%
        // branches; the src/display aggregate: 65.85% statements / 68.07%
        // branches / 75% functions). Same headroom-below-actuals pattern as
        // the three floors above. Set with headroom below the measured
        // 65.85%.
        'src/display/**': {
          statements: 55,
        },
      },
    },
  },
});
