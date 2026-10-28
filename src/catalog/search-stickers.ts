import type { Knex } from 'knex';

/**
 * Catalog-wide Sticker search (issue 20): an autocomplete needs to find a
 * Sticker by name across ALL Albums, not just within one roster. Matching is
 * case- and accent-insensitive through Postgres unaccent(), so "mbappe"
 * finds "Kylian Mbappé" and "modric" finds "Luka Modrić". The catalog is
 * small (ADR-0004), so a plain unaccent(...) ILIKE scan is the right tool —
 * no trigram index or full-text machinery.
 *
 * Display values are resolved to the requester's preferred locale with the
 * canonical value as fallback (ADR-0014); the fallback lives in TypeScript,
 * not SQL COALESCE, mirroring list-stickers.ts. A hit matches when the query
 * is contained in the canonical subject, the requester-locale sticker
 * translation, the canonical Album name, or the requester-locale Album
 * translation, or when it equals the Sticker number as text. Cross-locale
 * matching is deliberately out of scope (issue 21). The result is
 * locale-neutral data — ids, numbers, subjects, urls — never prose. Ordering
 * is by relevance then displaySubject then id, so clients and tests see a
 * stable list.
 */

/** One Sticker search hit as it travels on the wire. */
export interface StickerSearchResult {
  id: string;
  albumId: string;
  /** Album display name for the requester's preferred locale. */
  albumName: string;
  /** The Sticker's number within its Album roster. */
  number: number;
  /** Canonical subject — the fallback when no translation exists. */
  subject: string;
  /** Subject to display for the requester's preferred locale. */
  displaySubject: string;
  /** Catalog image for the Sticker, or null when none is curated. */
  imageUrl: string | null;
}

/** Folds case and accents so ranking uses the same equality as unaccent(). */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Orders two strings deterministically by code unit, independent of ICU data. */
function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Finds Stickers matching `query` across every Album, ranked prefix-first.
 * An empty or whitespace-only query is a normal autocomplete state, not a
 * failure: it yields `[]` (the route responds 200).
 */
export async function searchStickers(
  db: Knex,
  locale: string,
  query: string,
  limit: number,
): Promise<StickerSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const rows = await db('stickers as s')
    .join('albums as a', 'a.id', 's.album_id')
    .leftJoin('sticker_translations as t', function () {
      this.on('t.sticker_id', '=', 's.id').andOnVal('t.locale', '=', locale);
    })
    .leftJoin('album_translations as at', function () {
      this.on('at.album_id', '=', 'a.id').andOnVal('at.locale', '=', locale);
    })
    .where(function () {
      this.whereRaw('unaccent(s.subject) ILIKE unaccent(?)', [`%${trimmed}%`])
        .orWhereRaw('unaccent(t.subject) ILIKE unaccent(?)', [`%${trimmed}%`])
        .orWhereRaw('unaccent(a.name) ILIKE unaccent(?)', [`%${trimmed}%`])
        .orWhereRaw('unaccent(at.name) ILIKE unaccent(?)', [`%${trimmed}%`])
        .orWhereRaw('s.number::text = ?', [trimmed]);
    })
    .select(
      's.id',
      's.album_id',
      's.number',
      's.subject',
      's.image_url',
      'a.name as album_name',
      't.subject as translated_subject',
      'at.name as translated_album_name',
    );

  const foldedQuery = fold(trimmed);
  const ranked = rows.map((row) => {
    const result: StickerSearchResult = {
      id: row.id as string,
      albumId: row.album_id as string,
      albumName: (row.translated_album_name as string | null) ?? (row.album_name as string),
      number: row.number as number,
      subject: row.subject as string,
      displaySubject: (row.translated_subject as string | null) ?? (row.subject as string),
      imageUrl: (row.image_url as string | null) ?? null,
    };
    const foldedSubject = fold(result.displaySubject);
    const rank = foldedSubject.startsWith(foldedQuery)
      ? 0
      : foldedSubject.includes(foldedQuery)
        ? 1
        : 2;
    return { result, rank };
  });

  ranked.sort(
    (left, right) =>
      left.rank - right.rank ||
      compareText(left.result.displaySubject, right.result.displaySubject) ||
      compareText(left.result.id, right.result.id),
  );

  return ranked.slice(0, limit).map((entry) => entry.result);
}
