import type { Knex } from 'knex';
import type { Storage } from '../storage';

/**
 * Draft Listing creation (issue 10, CONTEXT.md): the authenticated seller
 * uploads a Photo of the physical Sticker and a Listing is persisted in
 * `draft` state, owned by that seller. A draft may start photo-only — the
 * Sticker (and therefore the Album) can be filled in later by issue 11, and
 * publishing (issue 12) owns completeness rules.
 *
 * Validation happens entirely BEFORE persistence, mirroring
 * `createSticker`: a bad or missing Photo or an unknown Sticker returns a
 * locale-neutral code and writes nothing (ADR-0014). The Photo is uploaded
 * only after every check passes, so a rejected request leaves no orphan
 * bytes; if the database write fails afterwards the upload is deleted on a
 * best-effort basis.
 */

export type CreateListingResult =
  | ListingView
  | 'PHOTO_REQUIRED'
  | 'INVALID_PHOTO'
  | 'UNKNOWN_STICKER';

export interface ListingView {
  id: string;
  state: string;
  sellerId: string;
  stickerId: string | null;
  photos: { side: string; url: string }[];
  createdAt: string;
}

/** The Photo content types the storage layer can name an extension for. */
const ALLOWED_PHOTO_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/** A malformed Sticker id is indistinguishable from an unknown one. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateListingInput {
  sellerId: string;
  photo: { bytes: Buffer; contentType: string } | null;
  stickerId?: string | null;
}

/** Validates + persists a draft Listing and returns its wire shape. */
export async function createDraftListing(
  db: Knex,
  storage: Storage,
  input: CreateListingInput,
): Promise<CreateListingResult> {
  const { sellerId, photo, stickerId } = input;

  if (!photo) return 'PHOTO_REQUIRED';
  if (photo.bytes.length === 0) return 'INVALID_PHOTO';
  if (!ALLOWED_PHOTO_CONTENT_TYPES.has(photo.contentType)) return 'INVALID_PHOTO';

  if (stickerId !== undefined && stickerId !== null) {
    if (!UUID_PATTERN.test(stickerId)) return 'UNKNOWN_STICKER';
    const sticker = await db('stickers').where({ id: stickerId }).first('id');
    if (!sticker) return 'UNKNOWN_STICKER';
  }

  // Only now spend bytes on disk: every rejection above is write-free.
  const url = await storage.upload({
    bytes: photo.bytes,
    contentType: photo.contentType,
  });

  try {
    return await db.transaction(async (trx) => {
      const [listingRow] = await trx('listings')
        .insert({
          seller_id: sellerId,
          sticker_id: stickerId ?? null,
          state: 'draft',
        })
        .returning([
          'id',
          'state',
          'seller_id',
          'sticker_id',
          'created_at',
        ]);

      const [photoRow] = await trx('listing_photos')
        .insert({
          listing_id: listingRow.id,
          side: 'front',
          url,
        })
        .returning(['side', 'url']);

      return {
        id: listingRow.id as string,
        state: listingRow.state as string,
        sellerId: listingRow.seller_id as string,
        stickerId: (listingRow.sticker_id as string | null) ?? null,
        photos: [
          {
            side: photoRow.side as string,
            url: photoRow.url as string,
          },
        ],
        createdAt:
          listingRow.created_at instanceof Date
            ? listingRow.created_at.toISOString()
            : String(listingRow.created_at),
      };
    });
  } catch (err) {
    // Never leave an orphan Photo behind when the Listing does not persist.
    await storage.delete(url).catch(() => {});
    throw err;
  }
}
