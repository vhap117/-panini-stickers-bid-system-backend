import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import S3rver from 's3rver';
import { startTestApp, testDb, TEST_GOOGLE_CLIENT_ID } from './harness';
import { loginViaGoogle, type GoogleIdTokenPayload, type GoogleVerifyCall } from './oauth-stubs';
import type { RunningApp } from '../src/server';

// Replace `google-auth-library` with a controllable fake, exactly as
// listings.test.ts does — independent mock state per test file (ADR-0016).
const googleAuthMock = vi.hoisted(() => {
  const state: {
    payload: GoogleIdTokenPayload | null;
    error: Error | null;
    calls: GoogleVerifyCall[];
  } = { payload: null, error: null, calls: [] };
  return {
    state,
    reset(): void {
      state.payload = null;
      state.error = null;
      state.calls.length = 0;
    },
    setPayload(payload: GoogleIdTokenPayload): void {
      state.payload = payload;
      state.error = null;
    },
    setError(err: Error): void {
      state.payload = null;
      state.error = err;
    },
    calls(): GoogleVerifyCall[] {
      return state.calls;
    },
    factory: {
      OAuth2Client: class FakeOAuth2Client {
        verifyIdToken(opts: {
          idToken: string;
          audience?: string | string[];
        }): Promise<{ getPayload: () => GoogleIdTokenPayload | null }> {
          state.calls.push({ idToken: opts.idToken, audience: opts.audience });
          if (state.error) return Promise.reject(state.error);
          if (!state.payload) {
            return Promise.reject(new Error('no payload configured for test'));
          }
          return Promise.resolve({ getPayload: () => state.payload });
        }
      },
    },
  };
});

vi.mock('google-auth-library', () => googleAuthMock.factory);

// The S3 driver is exercised against a real S3 wire protocol: `s3rver` is an
// in-process S3-compatible server with real SigV4 signing (not a mock of our
// code). One server lives for the whole file; each spec boots the app against
// the same ephemeral port. Photos are fetched from the PUBLIC url directly, so
// the assertion proves the CDN contract rather than the API proxy.

/** The bucket pre-created by s3rver (`configureBuckets`), so no CreateBucket. */
const BUCKET = 'panini-photos';

/** s3rver's single hardcoded account; any other key is InvalidAccessKeyId. */
const S3_ACCESS_KEY_ID = 'S3RVER';
const S3_SECRET_ACCESS_KEY = 'S3RVER';

/** A tiny valid 1x1 PNG — the Photo bytes every upload fixture uses. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Matches the uuid.ext key the shared storage vocabulary mints for a PNG. */
const UUID_PNG_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/;

const GOOGLE_SUB = 'google-user-s3';
const GOOGLE_NAME = 'S3 Seller';
const GOOGLE_EMAIL = 's3@example.com';

/** A JWT payload Google would serve for one of OUR valid ID tokens. */
function googlePayload(): GoogleIdTokenPayload {
  return {
    aud: TEST_GOOGLE_CLIENT_ID,
    sub: GOOGLE_SUB,
    name: GOOGLE_NAME,
    email: GOOGLE_EMAIL,
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
}

/** The in-process S3-compatible server shared by every spec in this file. */
let s3Server: S3rver;
/** Ephemeral port `s3Server.run()` bound to — shared by endpoint and public url. */
let s3Port: number;
/** Where browsers/CDNs fetch objects: same host, bucket in the path. */
let publicBaseUrl: string;

beforeAll(async () => {
  s3Server = new S3rver({
    port: 0,
    address: '127.0.0.1',
    silent: true,
    resetOnClose: true,
    configureBuckets: [{ name: BUCKET, configs: [] }],
  });
  const addr = await s3Server.run();
  s3Port = addr.port;
  // forcePathStyle means the bucket is a path segment, not a vhost.
  publicBaseUrl = `http://127.0.0.1:${s3Port}/${BUCKET}`;
});

afterAll(async () => {
  await s3Server.close();
});

/** Boots the real app with the s3 driver pointed at the in-process server. */
async function startS3App(): Promise<RunningApp> {
  googleAuthMock.reset();
  googleAuthMock.setPayload(googlePayload());
  return startTestApp({
    storage: {
      driver: 's3',
      s3: {
        bucket: BUCKET,
        region: 'us-east-1',
        // API calls go to the server root; the SDK adds the bucket because
        // forcePathStyle is on.
        endpoint: `http://127.0.0.1:${s3Port}`,
        // Public objects carry the bucket path, unlike the API endpoint.
        publicBaseUrl,
        forcePathStyle: true,
        accessKeyId: S3_ACCESS_KEY_ID,
        secretAccessKey: S3_SECRET_ACCESS_KEY,
      },
    },
  });
}

/** Tests share the real test DB — auth specs clean their own rows. */
async function cleanUsers(): Promise<void> {
  const db = testDb();
  try {
    // Cascades to listings (seller_id) and listing_photos (listing_id).
    await db.raw('TRUNCATE TABLE users CASCADE');
  } finally {
    await db.destroy();
  }
}

/** Logs in and returns the access token plus the created User id. */
async function login(app: RunningApp): Promise<{ accessToken: string; userId: string }> {
  const res = await loginViaGoogle(app);
  return {
    accessToken: res.body.data.accessToken,
    userId: res.body.data.user.id,
  };
}

interface ListingBody {
  id: string;
  state: string;
  sellerId: string;
  stickerId: string | null;
  photos: { side: string; url: string }[];
  createdAt: string;
}

/** POST /listings as multipart with the PNG attached as the `photo`. */
function postListing(app: RunningApp, accessToken: string): request.Test {
  return request(app.server)
    .post('/listings')
    .set('Authorization', `Bearer ${accessToken}`)
    .attach('photo', PNG_BYTES, { filename: 'front.png', contentType: 'image/png' });
}

describe('S3-compatible storage driver (ADR-0006)', () => {
  beforeEach(async () => {
    await cleanUsers();
  });

  afterEach(async () => {
    await cleanUsers();
  });

  it("an S3-backed Listing's Photo is addressed by an absolute public url", async () => {
    const app = await startS3App();
    const db = testDb();
    try {
      const { accessToken } = await login(app);

      const res = await postListing(app, accessToken);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');

      const listing: ListingBody = res.body.data.listing;
      expect(listing.state).toBe('draft');
      expect(listing.photos).toHaveLength(1);

      const url = listing.photos[0].url;
      // Absolute, and rooted at the configured PUBLIC base url — not the API.
      expect(url.startsWith('http')).toBe(true);
      expect(url.startsWith(`${publicBaseUrl}/`)).toBe(true);
      expect(url).toMatch(UUID_PNG_PATTERN);

      // Database state: the Photo row stores exactly that public url.
      const photoRow = await db('listing_photos').where({ listing_id: listing.id }).first();
      expect(photoRow.side).toBe('front');
      expect(photoRow.url).toBe(url);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it("the Photo's bytes are served from the public url", async () => {
    const app = await startS3App();
    try {
      const { accessToken } = await login(app);
      const created = await postListing(app, accessToken);
      expect(created.status).toBe(200);
      const url: string = created.body.data.listing.photos[0].url;

      // No credentials, no Authorization header: this is a client fetching an
      // object from the CDN, with the API nowhere in the path.
      const served = await fetch(url);
      expect(served.status).toBe(200);
      expect(served.headers.get('content-type')).toMatch(/^image\/png/);
      const bytes = Buffer.from(await served.arrayBuffer());
      expect(bytes).toEqual(PNG_BYTES);
    } finally {
      await app.stop();
    }
  });

  it('the API serving route streams the same bytes for the S3 driver', async () => {
    const app = await startS3App();
    try {
      const { accessToken } = await login(app);
      const created = await postListing(app, accessToken);
      expect(created.status).toBe(200);
      const url: string = created.body.data.listing.photos[0].url;

      // The route is driver-agnostic: it turns the bare key back into a url
      // via storage.urlFor(key) and asks the driver to read it.
      const key = url.slice(url.lastIndexOf('/') + 1);
      const served = await request(app.server).get(`/uploads/${key}`);
      expect(served.status).toBe(200);
      expect(served.headers['content-type']).toMatch(/^image\/png/);
      expect(served.body).toEqual(PNG_BYTES);
    } finally {
      await app.stop();
    }
  });

  it('an unknown or malicious key is a locale-neutral 404 on the serving route', async () => {
    const app = await startS3App();
    try {
      // A well-formed key that was never uploaded: the driver's GetObject
      // fails and the route never leaks S3's error prose.
      const bogus = await request(app.server).get(`/uploads/${randomUUID()}`);
      expect(bogus.status).toBe(404);
      expect(bogus.body).toEqual({ code: 'PHOTO_NOT_FOUND', data: {} });
      expect(JSON.stringify(bogus.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose

      // Traversal never reaches a local file — and for the s3 driver it fails
      // the key validation before any GetObject.
      const traversal = await request(app.server).get('/uploads/..%2f..%2fpackage.json');
      expect(traversal.status).toBe(404);
      expect(traversal.body).toEqual({ code: 'PHOTO_NOT_FOUND', data: {} });
      expect(JSON.stringify(traversal.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose
      expect(JSON.stringify(traversal.body)).not.toContain('panini-bid-backend');
    } finally {
      await app.stop();
    }
  });

  it('the s3 driver is selected by config and refuses to boot without its configuration', async () => {
    // Same fail-fast contract as configFromEnv (ADR-0006): no bucket and no
    // public base url means no boot, rather than a failed upload later.
    await expect(startTestApp({ storage: { driver: 's3' } })).rejects.toThrow();
  });
});
