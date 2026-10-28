import type { Knex } from 'knex';

/**
 * Curated catalog seed (ADR-0004): one popular Album ships with both English
 * and Spanish names from day one. Seeding English-only would immediately
 * recreate the duplicate-album problem in Spanish (ADR-0014) — Spanish
 * speakers would re-contribute the same Album under a Spanish name.
 *
 * Ids are fixed so the seed is deterministic across runs and environments;
 * the canonical name is "Qatar 2022 World Cup", used as the display-name
 * fallback when a requester's locale has no translation.
 */
const ALBUM_ID = '11111111-1111-4111-8111-111111111111';
const EN_TRANSLATION_ID = '22222222-2222-4222-8222-222222222221';
const ES_TRANSLATION_ID = '22222222-2222-4222-8222-222222222222';

export async function up(knex: Knex): Promise<void> {
  await knex('albums').insert({
    id: ALBUM_ID,
    name: 'Qatar 2022 World Cup',
    year: 2022,
  });

  await knex('album_translations').insert([
    {
      id: EN_TRANSLATION_ID,
      album_id: ALBUM_ID,
      locale: 'en',
      name: 'Qatar 2022 World Cup',
    },
    {
      id: ES_TRANSLATION_ID,
      album_id: ALBUM_ID,
      locale: 'es',
      name: 'Mundial Qatar 2022',
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  // Translations cascade with the Album, but delete them explicitly so the
  // rollback is legible and independent of FK behaviour.
  await knex('album_translations').where({ album_id: ALBUM_ID }).delete();
  await knex('albums').where({ id: ALBUM_ID }).delete();
}
