import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { startTestApp, testDb, TEST_GOOGLE_CLIENT_ID } from './harness';
import { loginViaGoogle, type GoogleIdTokenPayload, type GoogleVerifyCall } from './oauth-stubs';
import type { RunningApp } from '../src/server';

// Replace `google-auth-library` with a controllable fake, exactly as
// stickers.test.ts does — independent mock state per test file (ADR-0016).
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

// Spec of the draft Listing creation path (issue 10): an authenticated seller
// photographs the physical Sticker and POSTs the Photo as multipart, and a
// Listing is persisted in `draft` state owned by that seller (CONTEXT.md).
// The Photo's bytes live behind the storage abstraction (ADR-0006) and are
// served back through the URL it returned. Driven through real HTTP against
// the real app and real Postgres+PostGIS; only Google's tokeninfo endpoint is
// stubbed. Errors stay locale-neutral: codes + data, never prose (ADR-0014).

/** A fixed seeded Sticker (issue 08 seed migration) for reference cases. */
const SEEDED_STICKER_ID = '33333333-3333-4333-8333-000000000012';

/** A tiny valid 1x1 PNG — the Photo bytes every upload fixture uses. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const GOOGLE_SUB = 'google-user-listings';
const GOOGLE_NAME = 'Listing Seller';
const GOOGLE_EMAIL = 'listings@example.com';

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

/** Each spec gets its own storage root, removed afterwards. */
let storageRoot: string;

/** Boots the real app with the OAuth2Client mock returning the given payload. */
async function startAppWithMockedVerifier(): Promise<{ app: RunningApp }> {
  googleAuthMock.reset();
  googleAuthMock.setPayload(googlePayload());
  const app = await startTestApp({ storage: { localRoot: storageRoot } });
  return { app };
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

/** Number of rows currently stored in a table. */
async function countRows(db: ReturnType<typeof testDb>, table: string): Promise<number> {
  const [row] = (await db(table).count('* as count')) as Array<{ count: string }>;
  return Number(row.count);
}

interface ListingBody {
  id: string;
  state: string;
  sellerId: string;
  stickerId: string | null;
  photos: { side: string; url: string }[];
  createdAt: string;
}

interface PostListingOptions {
  accessToken?: string;
  attachPhoto?: boolean;
  photoBytes?: Buffer;
  contentType?: string;
  filename?: string;
  stickerId?: string;
}

/** POST /listings as multipart, with the photo attached unless suppressed. */
function postListing(app: RunningApp, opts: PostListingOptions = {}): request.Test {
  let req = request(app.server).post('/listings');
  if (opts.accessToken) {
    req = req.set('Authorization', `Bearer ${opts.accessToken}`);
  }
  if (opts.stickerId !== undefined) {
    req = req.field('stickerId', opts.stickerId);
  }
  if (opts.attachPhoto !== false) {
    req = req.attach('photo', opts.photoBytes ?? PNG_BYTES, {
      filename: opts.filename ?? 'front.png',
      contentType: opts.contentType ?? 'image/png',
    });
  }
  return req;
}

/** Number of files currently under the test storage root (recursive). */
function countStoredFiles(root: string): number {
  if (!fs.existsSync(root)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    count += entry.isDirectory() ? countStoredFiles(entryPath) : 1;
  }
  return count;
}

describe('Create a draft Listing — POST /listings (issue 10)', () => {
  beforeEach(async () => {
    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'panini-uploads-'));
    await cleanUsers();
  });

  afterEach(async () => {
    await cleanUsers();
    fs.rmSync(storageRoot, { recursive: true, force: true });
  });

  it('POST /listings with a photo creates a draft Listing owned by the seller', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken, userId } = await login(app);

      const res = await request(app.server)
        .post('/listings')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('photo', PNG_BYTES, { filename: 'front.png', contentType: 'image/png' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');

      const listing: ListingBody = res.body.data.listing;
      expect(listing.state).toBe('draft');
      expect(listing.sellerId).toBe(userId);
      expect(listing.stickerId).toBeNull();
      expect(listing.photos).toHaveLength(1);
      expect(listing.photos[0].side).toBe('front');
      expect(listing.photos[0].url).toMatch(/^\/uploads\//);

      // Database state: the draft Listing + its front Photo.
      const listingRow = await db('listings').where({ id: listing.id }).first();
      expect(listingRow.state).toBe('draft');
      expect(listingRow.seller_id).toBe(userId);
      expect(listingRow.sticker_id).toBeNull();

      const photoRow = await db('listing_photos').where({ listing_id: listing.id }).first();
      expect(photoRow.side).toBe('front');
      expect(photoRow.url).toBe(listing.photos[0].url);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it("the photo's bytes round-trip through the URL the storage returned", async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const { accessToken } = await login(app);

      const created = await request(app.server)
        .post('/listings')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('photo', PNG_BYTES, { filename: 'front.png', contentType: 'image/png' });
      expect(created.status).toBe(200);
      const url: string = created.body.data.listing.photos[0].url;

      // The stored bytes are exactly the uploaded bytes, served from the url.
      const served = await request(app.server).get(url);
      expect(served.status).toBe(200);
      expect(served.headers['content-type']).toMatch(/^image\/png/);
      expect(served.body).toEqual(PNG_BYTES);

      // An unknown uuid key is a locale-neutral 404.
      const bogus = await request(app.server).get(`/uploads/${randomUUID()}`);
      expect(bogus.status).toBe(404);
      expect(bogus.body).toEqual({ code: 'PHOTO_NOT_FOUND', data: {} });
      expect(JSON.stringify(bogus.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose

      // A traversal attempt never reaches the file it names.
      const traversal = await request(app.server).get('/uploads/..%2f..%2fpackage.json');
      expect(traversal.status).toBe(404);
      expect(traversal.body).toEqual({ code: 'PHOTO_NOT_FOUND', data: {} });
      expect(JSON.stringify(traversal.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose
    } finally {
      await app.stop();
    }
  });

  it('a draft Listing can start photo-only, without a Sticker', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken, userId } = await login(app);

      // No `stickerId` field at all: the seller photographed the sticker but
      // has not picked the catalog entry yet.
      const res = await postListing(app, { accessToken });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');

      const listing: ListingBody = res.body.data.listing;
      expect(listing.sellerId).toBe(userId);
      expect(listing.stickerId).toBeNull();
      expect(listing.photos).toHaveLength(1);

      const listingRow = await db('listings').where({ id: listing.id }).first();
      expect(listingRow.sticker_id).toBeNull();
      // The Album is reached THROUGH the Sticker: there is no album column to
      // be unknown.
      expect(listingRow.album_id).toBeUndefined();
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('a Listing referencing an existing Sticker persists that reference', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken, userId } = await login(app);

      const res = await postListing(app, {
        accessToken,
        stickerId: SEEDED_STICKER_ID,
      });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');

      const listing: ListingBody = res.body.data.listing;
      expect(listing.sellerId).toBe(userId);
      expect(listing.stickerId).toBe(SEEDED_STICKER_ID);
      expect(listing.state).toBe('draft');

      const listingRow = await db('listings').where({ id: listing.id }).first();
      expect(listingRow.sticker_id).toBe(SEEDED_STICKER_ID);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('a missing photo is rejected with a locale-neutral 400 and writes nothing', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      const listingsBefore = await countRows(db, 'listings');
      const photosBefore = await countRows(db, 'listing_photos');

      const res = await postListing(app, { accessToken, attachPhoto: false });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: 'PHOTO_REQUIRED', data: {} });
      expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose

      expect(await countRows(db, 'listings')).toBe(listingsBefore);
      expect(await countRows(db, 'listing_photos')).toBe(photosBefore);
      expect(countStoredFiles(storageRoot)).toBe(0);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('an invalid photo is rejected with a locale-neutral 400 and writes nothing', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      const listingsBefore = await countRows(db, 'listings');
      const photosBefore = await countRows(db, 'listing_photos');

      const invalidPhotos = [
        // Present but empty: a 0-byte part is not a Photo.
        { photoBytes: Buffer.alloc(0), contentType: 'image/png', filename: 'empty.png' },
        // Outside the content-type allow-list, regardless of filename.
        { photoBytes: PNG_BYTES, contentType: 'text/plain', filename: 'notes.txt' },
      ];
      for (const invalid of invalidPhotos) {
        const res = await postListing(app, { accessToken, ...invalid });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ code: 'INVALID_PHOTO', data: {} });
        expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose
      }

      expect(await countRows(db, 'listings')).toBe(listingsBefore);
      expect(await countRows(db, 'listing_photos')).toBe(photosBefore);
      // Validation precedes the upload, so not even an orphan file exists.
      expect(countStoredFiles(storageRoot)).toBe(0);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('an unknown or malformed Sticker id is rejected with a locale-neutral 404 and writes nothing', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      const listingsBefore = await countRows(db, 'listings');
      const photosBefore = await countRows(db, 'listing_photos');

      // Well-formed but nonexistent, then not a uuid at all — one code.
      for (const stickerId of [randomUUID(), 'not-a-uuid']) {
        const res = await postListing(app, { accessToken, stickerId });
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ code: 'UNKNOWN_STICKER', data: {} });
        expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose
      }

      expect(await countRows(db, 'listings')).toBe(listingsBefore);
      expect(await countRows(db, 'listing_photos')).toBe(photosBefore);
      expect(countStoredFiles(storageRoot)).toBe(0);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('an unauthenticated request is rejected with a locale-neutral 401 and writes nothing', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const listingsBefore = await countRows(db, 'listings');
      const photosBefore = await countRows(db, 'listing_photos');

      // Photo attached on purpose: auth runs before multer, so its bytes are
      // never even buffered.
      const res = await postListing(app);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });
      expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose

      expect(await countRows(db, 'listings')).toBe(listingsBefore);
      expect(await countRows(db, 'listing_photos')).toBe(photosBefore);
      expect(countStoredFiles(storageRoot)).toBe(0);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('a created Listing is a draft and is not exposed as a live Listing', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken, userId } = await login(app);

      const res = await postListing(app, { accessToken });
      expect(res.status).toBe(200);
      const listing: ListingBody = res.body.data.listing;
      expect(listing.state).toBe('draft');

      // The seller owns exactly this draft — no other state exists yet, so
      // the feed slice (issue 13) has nothing live to exclude.
      const states = await db('listings').where({ seller_id: userId }).pluck('state');
      expect(states).toEqual(['draft']);

      const liveListings = await db('listings')
        .where({ seller_id: userId })
        .whereNot({ state: 'draft' })
        .select('id');
      expect(liveListings).toHaveLength(0);

      const listingRow = await db('listings').where({ id: listing.id }).first();
      expect(listingRow.published_at).toBeNull();
      expect(listingRow.ended_at).toBeNull();
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('the storage implementation is selected by config', async () => {
    // An unsupported driver fails the boot instead of serving requests and
    // surfacing the problem later as a failed Photo upload (ADR-0006). The
    // local driver selected through config is proven end-to-end above.
    await expect(startTestApp({ storage: { driver: 's3' } })).rejects.toThrow();
  });
});
