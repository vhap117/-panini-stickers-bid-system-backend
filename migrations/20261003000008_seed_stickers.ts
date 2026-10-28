import type { Knex } from 'knex';

/**
 * Seeded Sticker roster (ADR-0004) for the Album shipped by the issue-06
 * seed migration. Every Sticker carries English and Spanish subjects from
 * day one (ADR-0014): English-only seeding would let a Spanish-speaking
 * user re-contribute the same Sticker under a Spanish subject.
 *
 * Ids are fixed so the seed is deterministic across runs and environments;
 * the `3333…` / `4444…` / `5555…` prefixes keep Sticker rows distinct from
 * the Album seed's `1111…` / `2222…` ids.
 */
const ALBUM_ID = '11111111-1111-4111-8111-111111111111';

const STICKERS = [
  { number: 12, subject: 'Lionel Messi', en: 'Lionel Messi', es: 'Lionel Messi' },
  { number: 47, subject: 'Kylian Mbappé', en: 'Kylian Mbappé', es: 'Kylian Mbappé' },
  { number: 138, subject: 'Luka Modrić', en: 'Luka Modrić', es: 'Luka Modrić' },
  {
    number: 234,
    subject: 'Emiliano Martinez',
    en: 'Emiliano Martinez',
    es: 'Emiliano Martínez',
  },
  { number: 310, subject: 'Argentina Team', en: 'Argentina Team', es: 'Selección de Argentina' },
];

function suffix(number: number): string {
  return String(number).padStart(12, '0');
}

function stickerId(number: number): string {
  return `33333333-3333-4333-8333-${suffix(number)}`;
}

function translationId(locale: string, number: number): string {
  const prefix = locale === 'en' ? '44444444-4444-4444-8444' : '55555555-5555-4555-8555';
  return `${prefix}-${suffix(number)}`;
}

export async function up(knex: Knex): Promise<void> {
  await knex('stickers').insert(
    STICKERS.map((sticker) => ({
      id: stickerId(sticker.number),
      album_id: ALBUM_ID,
      number: sticker.number,
      subject: sticker.subject,
    })),
  );

  await knex('sticker_translations').insert(
    STICKERS.flatMap((sticker) => [
      {
        id: translationId('en', sticker.number),
        sticker_id: stickerId(sticker.number),
        locale: 'en',
        subject: sticker.en,
      },
      {
        id: translationId('es', sticker.number),
        sticker_id: stickerId(sticker.number),
        locale: 'es',
        subject: sticker.es,
      },
    ]),
  );
}

export async function down(knex: Knex): Promise<void> {
  const ids = STICKERS.map((sticker) => stickerId(sticker.number));
  await knex('sticker_translations').whereIn('sticker_id', ids).delete();
  await knex('stickers').whereIn('id', ids).delete();
}
