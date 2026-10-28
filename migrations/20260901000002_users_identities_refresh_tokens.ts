import type { Knex } from 'knex';

/**
 * Auth schema (ADR-0003, ADR-0011): one User with many linkable provider
 * identities, plus opaque refresh tokens. The unique constraint on
 * (provider, provider_user_id) is what makes repeat logins idempotent —
 * the same Google identity always resolves to the same identity row.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('display_name').notNullable();
    // Geo-ranked feed (ADR-0007): a User carries a location; nullable until
    // the user sets it (issue 05).
    t.specificType('location', 'geography(Point, 4326)').nullable();
    t.string('preferred_locale', 10).notNullable().defaultTo('en');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('user_identities', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('provider').notNullable();
    t.string('provider_user_id').notNullable();
    t.string('email').nullable();
    t.timestamp('linked_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // Repeat logins with the same provider identity are idempotent.
    t.unique(['provider', 'provider_user_id']);
  });

  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    // Opaque random string; exchange/revocation arrives with issue 04.
    t.string('token').notNullable().unique();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('expires_at', { useTz: true }).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('refresh_tokens');
  await knex.schema.dropTableIfExists('user_identities');
  await knex.schema.dropTableIfExists('users');
}
