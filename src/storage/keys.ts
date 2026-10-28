import { randomUUID } from 'node:crypto';

/**
 * Shared key vocabulary for every Storage driver (ADR-0006): a Photo becomes
 * `uuid.ext`, and the extension comes from OUR content-type allow-list —
 * never from the client's filename, so a client cannot choose the stored
 * name or smuggle an executable extension.
 *
 * This lives outside the drivers because both must agree on the mapping: a
 * url produced by one driver and a key parsed by the other (or by the
 * serving route) have to describe the same object.
 */

export const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
};

export const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

/**
 * The Content-Type to serve for a stored key. Unknown extensions fall back
 * to a binary stream rather than guessing — the serving route never trusts
 * the client for this either.
 */
export function contentTypeForKey(key: string): string {
  const extension = key.split('.').pop() ?? '';
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

/** A key is exactly `uuid.ext`; anything else is a traversal/unknown attempt. */
export const STORAGE_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/;

/** True only for a key the drivers are allowed to store or read. */
export function isStorageKey(key: string): boolean {
  return STORAGE_KEY_PATTERN.test(key);
}

/**
 * Mints a fresh key for a Photo. The domain module owns content-type
 * validation; this is the storage layer refusing to invent an extension it
 * does not know.
 */
export function storageKeyFor(contentType: string): string {
  const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
  if (!extension) throw new Error(`Unsupported content type: ${contentType}`);
  return `${randomUUID()}.${extension}`;
}
