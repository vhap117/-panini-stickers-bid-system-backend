import type { Knex } from 'knex';

/**
 * Drops the handoff_codes table (ADR-0016): browser-based OAuth login and
 * its callback→client handoff are gone — the Capacitor app now logs in
 * natively and POSTs Google's OIDC ID token to /auth/login/google, which
 * responds with the session JSON directly. No redirect carries a code, so
 * nothing mints or exchanges one. Recreated verbatim by down() so the
 * rollback restores ADR-0015's schema exactly.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('handoff_codes');
}

export async function down(knex: Knex): Promise<void> {
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
