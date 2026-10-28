import type { Knex } from 'knex';

/**
 * Listing + Photo schema (issue 10, CONTEXT.md): a Listing is the physical
 * Sticker a seller photographs and eventually publishes; a Photo is one side
 * (`front` / `back`) of that physical Sticker. The Album is reached THROUGH
 * the Sticker, so there is intentionally no album_id column here — one
 * reference, one source of truth.
 *
 * The Listing is created in `draft` state with a photo before the seller has
 * filled in the catalog details, so sticker_id stays nullable until issues
 * 11/12 complete and publish it. `state` is a plain string validated in the
 * application, matching the catalog tables' convention (no Postgres enum).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('listings', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('seller_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    // Nullable: a draft may be photo-only until issue 11/12 fill in the details.
    // NO ACTION on delete: a catalog Sticker must not be deleted out from under a Listing.
    t.uuid('sticker_id').nullable().references('id').inTable('stickers');
    t.string('state').notNullable().defaultTo('draft');
    t.timestamp('published_at', { useTz: true }).nullable();
    t.timestamp('ended_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('listing_photos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('listing_id').notNullable().references('id').inTable('listings').onDelete('CASCADE');
    // 'front' | 'back' — which face of the physical Sticker the Photo shows (CONTEXT.md).
    t.string('side').notNullable();
    t.string('url').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['listing_id', 'side']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('listing_photos');
  await knex.schema.dropTableIfExists('listings');
}
