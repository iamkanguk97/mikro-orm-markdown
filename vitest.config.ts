import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    restoreMocks: true,
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      // Floors sit a few points under the measured baseline (recorded in #66)
      // so coverage noise passes but a meaningful regression fails the run.
      thresholds: {
        statements: 90,
        branches: 89,
        functions: 94,
        lines: 90,
        'src/cli.ts': {
          statements: 65,
          branches: 75,
          functions: 80,
          lines: 65,
        },
      },
    },
  },
});
