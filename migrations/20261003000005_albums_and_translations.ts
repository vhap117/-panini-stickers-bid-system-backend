import type { Knex } from 'knex';

/**
 * Catalog schema (ADR-0004, ADR-0014): Albums carry a canonical name and a
 * nullable year; per-locale display names live as rows in
 * album_translations, so adding French or Portuguese later is pure data —
 * locales are rows, not columns, and no schema change is needed. The
 * canonical name is the fallback when no translation exists for the
 * requester's preferred locale.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('albums', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    // Canonical, language-neutral catalog entry; the fallback display name.
    t.string('name').notNullable();
    // e.g. 2022 — not every Album is tied to a year.
    t.integer('year').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('album_translations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('album_id').notNullable().references('id').inTable('albums').onDelete('CASCADE');
    // 'en', 'es' at launch; 'fr', 'pt' later as data-only additions.
    t.string('locale', 10).notNullable();
    t.string('name').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // One display name per Album per locale.
    t.unique(['album_id', 'locale']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('album_translations');
  await knex.schema.dropTableIfExists('albums');
}
