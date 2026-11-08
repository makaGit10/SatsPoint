import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Les tests partagent des serveurs HTTP locaux éphémères : on les exécute en série.
    fileParallelism: false,
  },
});
