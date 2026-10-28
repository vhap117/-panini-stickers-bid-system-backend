import { resolve } from 'node:path';
import { knex, type Knex } from 'knex';
import type { DatabaseConfig } from './config';

export function connectionFrom(d: DatabaseConfig) {
  return {
    host: d.host,
    port: d.port,
    user: d.user,
    password: d.password,
    database: d.database,
  };
}

/**
 * Knex instance used both as query builder (app) and migration tool (scripts).
 * The pool is lazy: the app boots and serves even if the database is not yet
 * reachable; /health reports DB_UNAVAILABLE until connectivity is real.
 */
export function createDb(d: DatabaseConfig): Knex {
  return knex({
    client: 'pg',
    connection: connectionFrom(d),
    pool: { min: 1, max: 5 },
    migrations: {
      directory: resolve(__dirname, '..', 'migrations'),
    },
  });
}
