import type { Knex } from 'knex';
import type { StickerSummary } from './list-stickers';

/**
 * User-contributed Sticker creation (issue 09, ADR-0004): the submitter's
 * subject becomes the canonical subject and is also recorded as a
 * translation in their preferred locale, so later cross-locale catalog
 * search finds it under the language it was authored in (ADR-0014).
 * Duplicate numbers are deliberately allowed — canonicalization/dedup is
 * future admin tooling.
 *
 * Validation happens entirely BEFORE persistence, mirroring `createAlbum`:
 * a bad number or subject returns a locale-neutral code and writes nothing
 * (ADR-0014). The parent Album is assumed to exist — the route owned that
 * 404 check, exactly as the GET route does.
 */

export type CreateStickerResult =
  | StickerSummary
  | 'INVALID_STICKER_NUMBER'
  | 'INVALID_STICKER_SUBJECT';

/** Validates + persists a user-contributed Sticker and returns its wire shape. */
export async function createSticker(
  db: Knex,
  albumId: string,
  number: unknown,
  subject: unknown,
  preferredLocale: string,
): Promise<CreateStickerResult> {
  // Panini roster numbers start at 1; finite integers only.
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) {
    return 'INVALID_STICKER_NUMBER';
  }
  if (typeof subject !== 'string') return 'INVALID_STICKER_SUBJECT';
  const canonicalSubject = subject.trim();
  if (canonicalSubject.length === 0) return 'INVALID_STICKER_SUBJECT';

  return db.transaction(async (trx) => {
    const [stickerRow] = await trx('stickers')
      .insert({ album_id: albumId, number, subject: canonicalSubject })
      .returning(['id', 'album_id', 'number', 'subject', 'created_at']);

    // Same subject in the submitter's locale, so cross-locale search (issue
    // 21) can resolve it immediately.
    await trx('sticker_translations').insert({
      sticker_id: stickerRow.id,
      locale: preferredLocale,
      subject: canonicalSubject,
    });

    return {
      id: stickerRow.id as string,
      albumId: stickerRow.album_id as string,
      number: stickerRow.number as number,
      subject: stickerRow.subject as string,
      // The submitter's locale translation IS the canonical subject.
      displaySubject: canonicalSubject,
      createdAt:
        stickerRow.created_at instanceof Date
          ? stickerRow.created_at.toISOString()
          : String(stickerRow.created_at),
    };
  });
}
