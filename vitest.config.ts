import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Brings up the dedicated test Postgres+PostGIS (docker-compose.test.yml),
    // resets it to a clean state, and applies Knex migrations before any test runs.
    globalSetup: ['./tests/global-setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Auth specs share the real test DB and clean their own rows; test files
    // must not run concurrently or they would truncate each other's users.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 90_000,
  },
});
