import type { Knex } from 'knex';

/**
 * Catalog-wide Sticker search support (issue 20): autocomplete must find a
 * Sticker by name across ALL Albums, ignoring case and accents — "mbappe"
 * has to find "Kylian Mbappé". unaccent() supplies the accent folding, so
 * the extension is installed here rather than assumed.
 *
 * `stickers.image_url` holds the catalog artwork used by the result cards;
 * it is nullable because most stickers have no catalog image (the physical
 * Listing photo is a separate concern). `stickers.album_id` is a foreign key
 * with no supporting index today, and the search joins Albums on every
 * query, so the index is added with it.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS unaccent');

  await knex.schema.alterTable('stickers', (t) => {
    // Catalog image for the Sticker itself — null when none has been curated.
    t.string('image_url').nullable();
    t.index(['album_id'], 'stickers_album_id_index');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('stickers', (t) => {
    t.dropIndex(['album_id'], 'stickers_album_id_index');
    t.dropColumn('image_url');
  });

  await knex.raw('DROP EXTENSION IF EXISTS unaccent');
}
