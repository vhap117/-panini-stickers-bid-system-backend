import type { Knex } from 'knex';

/**
 * PostGIS provides the geography types and ST_Distance/ST_DWithin functions the
 * geo-ranked feed depends on (ADR-0007). No domain tables yet.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS postgis');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP EXTENSION IF EXISTS postgis');
}
