import type { Knex } from 'knex';

/**
 * OAuth callback client handoff (ADR-0015, issue 22): single-use, short-lived
 * (~60s) codes minted by the login/link callbacks and exchanged once by the
 * client via POST /auth/handoff. A deliberate sibling of refresh_tokens —
 * accepted server-side session state, not a long-lived token in a
 * spoofable URL. consumed_at is the single-use marker: set exactly once, by
 * the atomic UPDATE that exchanges the code.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('handoff_codes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    // Opaque random string, mirroring refresh tokens (64 hex chars).
    t.string('code').notNullable().unique();
    // 'login' carries a LoginSession; 'link' carries { providers }.
    t.string('kind').notNullable();
    t.jsonb('payload').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('expires_at', { useTz: true }).notNullable();
    // NULL until the code is exchanged — the single-use marker.
    t.timestamp('consumed_at', { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('handoff_codes');
}
