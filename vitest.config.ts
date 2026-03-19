import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
      // Layer 1 — global hygiene floor (stops total collapse)
      thresholds: {
        statements: 20,
        branches: 45,
        functions: 30,
        // Layer 2 — runtime-critical floors (defends proven seams)
        'src/llm/**': {
          statements: 70,
        },
        'src/session/**': {
          statements: 40,
        },
        'src/game/**': {
          statements: 25,
        },
      },
    },
  },
});
