/**
 * Connection details for the dedicated test Postgres+PostGIS instance
 * (docker-compose.test.yml, mapped to 127.0.0.1:5434 with its own ephemeral
 * volume). Tests NEVER touch the dev database.
 */
export const TEST_DB = {
  host: '127.0.0.1',
  port: 5434,
  user: 'panini',
  password: 'panini',
  database: 'panini_bid_test',
} as const;

/** Admin connection (maintenance DB) used to drop/recreate the test database. */
export const TEST_DB_ADMIN = { ...TEST_DB, database: 'postgres' } as const;

export const TEST_COMPOSE_FILE = 'docker-compose.test.yml';
