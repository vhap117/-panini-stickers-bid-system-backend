import type { Knex } from 'knex';

/**
 * Sticker listing (issue 08): an Album's roster with display subjects
 * resolved to the requester's preferred locale (ADR-0014). A translation
 * row wins when it exists; otherwise the canonical stickers.subject is the
 * fallback. The result is locale-neutral data — ids, numbers, subjects,
 * ISO timestamps — never prose. Ordering is number ASC with id as tiebreak
 * so browsing and tests are stable.
 */

/** One Sticker as it travels on the wire. */
export interface StickerSummary {
  id: string;
  albumId: string;
  /** The Sticker's number within its Album roster. */
  number: number;
  /** Canonical subject — the fallback when no translation exists. */
  subject: string;
  /** Subject to display for the requester's preferred locale. */
  displaySubject: string;
  createdAt: string;
}

/**
 * Resolves every Sticker's display subject for `locale`, in deterministic
 * order. Returns `[]` for an unknown or empty Album — the route owns the
 * 404 decision.
 */
export async function listStickers(
  db: Knex,
  albumId: string,
  locale: string,
): Promise<StickerSummary[]> {
  const rows = await db('stickers as s')
    .leftJoin('sticker_translations as t', function () {
      this.on('t.sticker_id', '=', 's.id').andOnVal('t.locale', '=', locale);
    })
    .where('s.album_id', albumId)
    .select(
      's.id',
      's.album_id',
      's.number',
      's.subject',
      's.created_at',
      't.subject as translated_subject',
    )
    .orderBy([
      { column: 's.number', order: 'asc' },
      { column: 's.id', order: 'asc' },
    ]);

  return rows.map((row) => ({
    id: row.id as string,
    albumId: row.album_id as string,
    number: row.number as number,
    subject: row.subject as string,
    displaySubject: (row.translated_subject as string | null) ?? (row.subject as string),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  }));
}
