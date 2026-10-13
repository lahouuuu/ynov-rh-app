import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
    // Les tests d'intégration partagent les émulateurs : exécution séquentielle.
    fileParallelism: false,
  },
});
