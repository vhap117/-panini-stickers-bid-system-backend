import { configFromEnv } from '../src/config';
import { createDb } from '../src/db';

/**
 * Single entry point for migrations (used by `npm run migrate:latest`,
 * `npm run migrate:rollback`, and `npm run migrate:status`, plus the
 * corresponding `docker compose run --rm app npm run ...` forms). Runs Knex
 * migrations programmatically against the database configured via env vars.
 */
const command = process.argv[2] ?? 'latest';

async function main(): Promise<void> {
  const db = createDb(configFromEnv().database);
  try {
    if (command === 'rollback') {
      await db.migrate.rollback();
    } else if (command === 'down') {
      await db.migrate.down();
    } else if (command === 'status') {
      // Knex 3.1.0: migrate.status() only returns a count (`db.length -
      // code.length`), not the migration filenames; migrate.list() returns
      // [completed, newMigrations] as migration objects with a `file`
      // field — that's what we need to print a useful listing.
      const [completed, newMigrations] = await db.migrate.list();
      console.log(`Applied: ${completed.length}`);
      console.log(`Pending: ${newMigrations.length}`);
      for (const migration of newMigrations) {
        console.log(`  - ${(migration as { file: string }).file}`);
      }
    } else {
      await db.migrate.latest();
    }
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error('[migrate] failed', err);
  process.exit(1);
});
