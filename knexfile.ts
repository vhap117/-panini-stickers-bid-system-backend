import { resolve } from 'node:path';
import { configFromEnv } from './src/config';
import { connectionFrom } from './src/db';

const cfg = configFromEnv();

// Knex configuration reading env vars (DATABASE_URL or PG*).
// Used by `knex` CLI if invoked directly; the npm scripts use src/db.ts.
export default {
  client: 'pg',
  connection: connectionFrom(cfg.database),
  migrations: {
    directory: resolve(__dirname, 'migrations'),
  },
};
