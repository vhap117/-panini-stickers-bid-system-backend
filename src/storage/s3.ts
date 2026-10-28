import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { S3Config } from '../config';
import type { Storage, StorageFile } from './index';
import { isStorageKey, storageKeyFor } from './keys';

/**
 * S3-compatible Storage for production (ADR-0006): AWS S3, MinIO, R2 or any
 * other S3-compatible endpoint. Photos are served from a PUBLIC/CDN url, so
 * the client fetches them directly instead of the API proxying image bytes.
 *
 * The driver never touches the database — it only knows buckets and keys.
 */
export class S3Storage implements Storage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    // Normalize once so urlFor and keyFromUrl can never disagree about the
    // prefix (a trailing slash would otherwise produce `//<key>`).
    this.publicBaseUrl = config.publicBaseUrl.replace(/\/+$/, '');
    this.client = new S3Client({
      region: config.region,
      // Only when set: unset means real AWS S3, not an emulator endpoint.
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
      // Only when BOTH are set: otherwise the SDK's default credential chain
      // runs, which is how IAM roles authenticate in production.
      ...(config.accessKeyId && config.secretAccessKey
        ? {
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
          }
        : {}),
    });
  }

  async upload(file: StorageFile): Promise<string> {
    const key = storageKeyFor(file.contentType);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.bytes,
        ContentType: file.contentType,
      }),
    );
    return this.urlFor(key);
  }

  async read(url: string): Promise<Readable> {
    const key = this.keyFromUrl(url);
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    // In Node the SDK's Body IS a Readable, so it can be piped straight out.
    return response.Body as Readable;
  }

  async delete(url: string): Promise<void> {
    const key = this.keyFromUrl(url);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /** Absolute PUBLIC url — what browsers/CDNs fetch, not the API endpoint. */
  urlFor(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  /**
   * Validates a public url and narrows it to its key. Like the local driver's
   * check, this is the path-traversal proof: a url such as
   * `https://cdn.example.com/../../etc/passwd` is rejected, never fetched.
   */
  private keyFromUrl(url: string): string {
    const prefix = `${this.publicBaseUrl}/`;
    if (!url.startsWith(prefix)) throw new Error('Invalid storage url');
    const key = url.slice(prefix.length);
    if (!isStorageKey(key)) throw new Error('Invalid storage url');
    return key;
  }
}
