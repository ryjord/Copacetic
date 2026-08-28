import { defineConfig } from 'vitest/config';

/**
 * The smoke suite launches the built app, so it is slow, must not run in
 * parallel with itself, and needs `npm run build` to have happened first.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['smoke/**/*.smoke.ts'],
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
