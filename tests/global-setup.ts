import { execSync } from 'node:child_process';
import { Client } from 'pg';
import { register } from 'ts-node';
import { createDb } from '../src/db';
import { TEST_COMPOSE_FILE, TEST_DB, TEST_DB_ADMIN } from './test-env';

// Vitest global setup: guarantee a REAL Postgres+PostGIS for every test run.
// 1. start the dedicated test DB (never the dev DB),
// 2. wait until it accepts connections,
// 3. reset state: drop + recreate the test database,
// 4. apply Knex migrations from scratch, programmatically.

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTestDb(): Promise<void> {
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      const client = new Client({ ...TEST_DB_ADMIN });
      await client.connect();
      await client.end();
      return;
    } catch {
      if (Date.now() > deadline) {
        throw new Error(
          `test-db did not become ready within 120s (docker compose -f ${TEST_COMPOSE_FILE} up -d test-db)`,
        );
      }
      await delay(500);
    }
  }
}

async function resetTestDatabase(): Promise<void> {
  const admin = new Client({ ...TEST_DB_ADMIN });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB.database} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DB.database}`);
  } finally {
    await admin.end();
  }
}

async function runMigrations(): Promise<void> {
  // Register ts-node so Knex can require() the TypeScript migration files.
  register({ transpileOnly: true, project: 'tsconfig.json' });
  const db = createDb({ ...TEST_DB });
  try {
    await db.migrate.latest();
  } finally {
    await db.destroy();
  }
}

export async function setup(): Promise<void> {
  execSync(`docker compose -f ${TEST_COMPOSE_FILE} up -d test-db`, { stdio: 'inherit' });
  await waitForTestDb();
  await resetTestDatabase();
  await runMigrations();
}

export function teardown(): void {
  // The test DB container is intentionally left running between runs;
  // each run resets it (drop/recreate + migrate). Tear it down fully with:
  //   docker compose -f docker-compose.test.yml down -v
}
