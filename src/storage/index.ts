import type { Readable } from 'node:stream';
import type { StorageConfig } from '../config';
import { LocalFilesystemStorage } from './local';
import { S3Storage } from './s3';

/**
 * Photo storage seam (ADR-0006): the Listing code only knows "put these
 * bytes somewhere and give me a url" / "stream the bytes behind this url".
 * Local filesystem in dev, cloud object storage in prod — swapping the
 * implementation must not touch the domain or the routes.
 */

export interface StorageFile {
  bytes: Buffer;
  contentType: string;
}

export interface Storage {
  /** Stores the bytes and returns the driver's PUBLIC url. */
  upload(file: StorageFile): Promise<string>;
  /** Opens the byte stream for a url previously returned by `upload`. */
  read(url: string): Promise<Readable>;
  /** Best-effort removal (ADR-0006 extension), used to avoid orphan files. */
  delete(url: string): Promise<void>;
  /** The driver's PUBLIC url for a bare storage key. */
  urlFor(key: string): string;
}

/**
 * Fails at boot for any driver we do not ship — mirrors the
 * GOOGLE_CLIENT_ID fail-fast in src/server.ts. An unsupported driver must
 * never become a runtime wire error.
 *
 * The s3 branch validates its own config here too, so the factory stays
 * total for programmatic callers that bypass configFromEnv.
 */
export function createStorage(config: StorageConfig): Storage {
  if (config.driver === 'local') {
    return new LocalFilesystemStorage(config.localRoot);
  }
  if (config.driver === 's3') {
    const s3 = config.s3;
    if (!s3 || !s3.bucket || !s3.publicBaseUrl) {
      throw new Error(
        'S3_BUCKET and S3_PUBLIC_BASE_URL are required for the s3 storage driver',
      );
    }
    return new S3Storage(s3);
  }
  throw new Error(`Unsupported STORAGE_DRIVER: ${config.driver}`);
}
