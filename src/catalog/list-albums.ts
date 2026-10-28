import type { Knex } from 'knex';

/**
 * Catalog listing (issue 06): Albums with display names resolved to the
 * requester's preferred locale (ADR-0014). A translation row wins when it
 * exists; otherwise the canonical albums.name is the fallback. The result
 * is locale-neutral data — ids, names, year, ISO timestamps — never prose.
 * Ordering is canonical name ASC with id as tiebreak so listings are stable
 * for tests and clients.
 */

/** One Album as it travels on the wire. */
export interface AlbumSummary {
  id: string;
  /** Canonical catalog name — the fallback when no translation exists. */
  name: string;
  /** Name to display for the requester's preferred locale. */
  displayName: string;
  year: number | null;
  createdAt: string;
}

/** Resolves every Album's display name for `locale`, in deterministic order. */
export async function listAlbums(db: Knex, locale: string): Promise<AlbumSummary[]> {
  const rows = await db('albums as a')
    .leftJoin('album_translations as t', function () {
      this.on('t.album_id', '=', 'a.id').andOnVal('t.locale', '=', locale);
    })
    .select(
      'a.id',
      'a.name',
      'a.year',
      'a.created_at',
      't.name as translated_name',
    )
    .orderBy([
      { column: 'a.name', order: 'asc' },
      { column: 'a.id', order: 'asc' },
    ]);

  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    displayName: (row.translated_name as string | null) ?? (row.name as string),
    year: (row.year as number | null) ?? null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  }));
}
