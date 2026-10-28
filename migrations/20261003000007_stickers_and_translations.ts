import type { Knex } from 'knex';

/**
 * Sticker catalog schema (ADR-0004, ADR-0014): a Sticker belongs to exactly
 * one Album and carries a canonical subject plus its number within the
 * roster. Per-locale subjects live as rows in sticker_translations, so
 * adding French or Portuguese later is pure data — locales are rows, not
 * columns. The canonical subject is the display fallback when no
 * translation exists for the requester's preferred locale.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('stickers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('album_id').notNullable().references('id').inTable('albums').onDelete('CASCADE');
    // The Sticker's number within its Album roster.
    t.integer('number').notNullable();
    // Canonical, language-neutral catalog entry; the fallback display subject.
    t.string('subject').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('sticker_translations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('sticker_id').notNullable().references('id').inTable('stickers').onDelete('CASCADE');
    // 'en', 'es' at launch; 'fr', 'pt' later as data-only additions.
    t.string('locale', 10).notNullable();
    t.string('subject').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // One display subject per Sticker per locale.
    t.unique(['sticker_id', 'locale']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sticker_translations');
  await knex.schema.dropTableIfExists('stickers');
}
