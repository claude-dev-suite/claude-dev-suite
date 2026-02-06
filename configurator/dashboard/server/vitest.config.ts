import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/services/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/types.ts'],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
