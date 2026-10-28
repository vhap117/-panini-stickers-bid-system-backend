import type { Knex } from 'knex';
import type { AlbumSummary } from './list-albums';

/**
 * User-contributed Album creation (issue 07, ADR-0004): the submitter's name
 * becomes the canonical name and is also recorded as a translation in their
 * preferred locale, so later cross-locale catalog search finds it under the
 * language it was authored in (ADR-0014). Duplicates and similar names are
 * deliberately allowed — canonicalization/dedup is future admin tooling.
 *
 * Validation happens entirely BEFORE persistence, mirroring
 * `updateUserDetails`: a missing, empty, or whitespace-only name returns the
 * locale-neutral code `INVALID_ALBUM_NAME` and writes nothing (ADR-0014).
 */

export type CreateAlbumResult = AlbumSummary | 'INVALID_ALBUM_NAME';

/** Validates + persists a user-contributed Album and returns its wire shape. */
export async function createAlbum(
  db: Knex,
  submittedName: unknown,
  preferredLocale: string,
): Promise<CreateAlbumResult> {
  if (typeof submittedName !== 'string') return 'INVALID_ALBUM_NAME';
  const name = submittedName.trim();
  if (name.length === 0) return 'INVALID_ALBUM_NAME';

  return db.transaction(async (trx) => {
    // The submitted name is the canonical catalog entry; a user-contributed
    // Album has no year yet.
    const [albumRow] = await trx('albums')
      .insert({ name, year: null })
      .returning(['id', 'name', 'year', 'created_at']);

    // Same name in the submitter's locale, so cross-locale search (issue 21)
    // can resolve it immediately.
    await trx('album_translations').insert({
      album_id: albumRow.id,
      locale: preferredLocale,
      name,
    });

    return {
      id: albumRow.id as string,
      name: albumRow.name as string,
      // The submitter's locale translation IS the canonical name.
      displayName: name,
      year: (albumRow.year as number | null) ?? null,
      createdAt:
        albumRow.created_at instanceof Date
          ? albumRow.created_at.toISOString()
          : String(albumRow.created_at),
    };
  });
}
