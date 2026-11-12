import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Tests stub fetch and fake the clock: always restore them between tests.
    unstubGlobals: true,
    restoreMocks: true,
    // Allows the first PR to pass before any test exists.
    passWithNoTests: true,
  },
});
