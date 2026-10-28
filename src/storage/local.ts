import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { Storage, StorageFile } from './index';
import { isStorageKey, storageKeyFor } from './keys';

/**
 * Local-filesystem Storage for the Docker dev environment (ADR-0006):
 * zero external dependencies, root directory volume-mounted. Keys are
 * random UUIDs and the extension comes from OUR content-type allow-list —
 * never from the client's filename, so a client cannot choose the stored
 * name or smuggle an executable extension.
 *
 * The key vocabulary itself lives in ./keys so the s3 driver and this one
 * cannot drift apart.
 */

const URL_PREFIX = '/uploads/';

export class LocalFilesystemStorage implements Storage {
  constructor(private readonly root: string) {}

  async upload(file: StorageFile): Promise<string> {
    const key = storageKeyFor(file.contentType);
    await mkdir(this.root, { recursive: true });
    await writeFile(this.pathForKey(key), file.bytes);
    return this.urlFor(key);
  }

  async read(url: string): Promise<Readable> {
    const key = this.keyFromUrl(url);
    const resolved = this.pathForKey(key);
    // stat first so an unknown key is a clean not-found, not a crash midway
    // through the response stream.
    const info = await stat(resolved);
    if (!info.isFile()) throw new Error('Not a file');
    return createReadStream(resolved);
  }

  async delete(url: string): Promise<void> {
    const key = this.keyFromUrl(url);
    try {
      await unlink(this.pathForKey(key));
    } catch (err) {
      // Already gone is not a failure: delete is best-effort.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  /**
   * Root-relative: absolute urls break across dev, emulator and prod origins
   * (the s3 driver, by contrast, returns an absolute CDN url).
   */
  urlFor(key: string): string {
    return `${URL_PREFIX}${key}`;
  }

  /** Validates a stored url and narrows it to its key (path-traversal proof). */
  private keyFromUrl(url: string): string {
    if (!url.startsWith(URL_PREFIX)) throw new Error('Invalid storage url');
    const key = url.slice(URL_PREFIX.length);
    if (!isStorageKey(key)) throw new Error('Invalid storage url');
    return key;
  }

  /** Resolves a key against the root and proves the result stays inside it. */
  private pathForKey(key: string): string {
    const root = path.resolve(this.root);
    const resolved = path.resolve(root, key);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error('Invalid storage url');
    }
    return resolved;
  }
}
