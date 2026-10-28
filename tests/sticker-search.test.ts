import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { startTestApp, testDb, TEST_GOOGLE_CLIENT_ID } from './harness';
import { loginViaGoogle, type GoogleIdTokenPayload, type GoogleVerifyCall } from './oauth-stubs';
import type { RunningApp } from '../src/server';
import type { Knex } from 'knex';

// Replace `google-auth-library` with a controllable fake, exactly as
// stickers.test.ts does — independent mock state per test file.
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

// Spec of catalog-wide Sticker search (issue 20): GET /stickers?q=&limit=
// finds a Sticker by name across ALL Albums, resolving album/subject display
// values to the authenticated User's preferred locale (ADR-0014) with
// accent- and case-insensitive matching. Driven through real HTTP against
// the real app and real Postgres+PostGIS. Only Google's tokeninfo endpoint
// is stubbed (ADR-0016). Errors stay locale-neutral: codes + data, never
// prose.

/** The Album the issue-06 seed migration ships (fixed UUID). */
const SEEDED_ALBUM_ID = '11111111-1111-4111-8111-111111111111';

const GOOGLE_SUB = 'google-user-sticker-search';
const GOOGLE_NAME = 'Sticker Searcher';
const GOOGLE_EMAIL = 'sticker-search@example.com';

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

/** Boots the real app with the OAuth2Client mock returning the given payload. */
async function startAppWithMockedVerifier(): Promise<{ app: RunningApp }> {
  googleAuthMock.reset();
  googleAuthMock.setPayload(googlePayload());
  const app = await startTestApp({});
  return { app };
}

/** Tests share the real test DB — auth specs clean their own rows. */
async function cleanUsers(): Promise<void> {
  const db = testDb();
  try {
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

/** Stickers created by a spec (never the migration seed) are removed after it. */
let createdStickerIds: string[] = [];

async function cleanCreatedStickers(): Promise<void> {
  if (createdStickerIds.length === 0) return;
  const db = testDb();
  try {
    await db('stickers').whereIn('id', createdStickerIds).delete();
  } finally {
    await db.destroy();
  }
  createdStickerIds = [];
}

/** Inserts Stickers directly for limit/ranking/album-fallback specs. */
async function createStickers(
  db: Knex,
  stickers: Array<{
    albumId: string;
    number: number;
    subject: string;
    imageUrl?: string | null;
  }>,
): Promise<string[]> {
  const rows = await db('stickers')
    .insert(
      stickers.map((sticker) => ({
        album_id: sticker.albumId,
        number: sticker.number,
        subject: sticker.subject,
        image_url: sticker.imageUrl ?? null,
      })),
    )
    .returning('id');
  const ids = rows.map((row) => (typeof row === 'string' ? row : row.id));
  createdStickerIds.push(...ids);
  return ids;
}

/** Albums created by a spec (never the migration seed) are removed after it. */
let createdAlbumIds: string[] = [];

async function createAlbum(db: Knex, name: string): Promise<string> {
  const [row] = await db('albums').insert({ name }).returning('id');
  const id: string = typeof row === 'string' ? row : row.id;
  createdAlbumIds.push(id);
  return id;
}

async function cleanCreatedAlbums(): Promise<void> {
  if (createdAlbumIds.length === 0) return;
  const db = testDb();
  try {
    await db('albums').whereIn('id', createdAlbumIds).delete();
  } finally {
    await db.destroy();
  }
  createdAlbumIds = [];
}

/** Sets the User's preferred locale through the real PATCH /me endpoint. */
async function setPreferredLocale(
  app: RunningApp,
  accessToken: string,
  preferredLocale: string,
): Promise<void> {
  const res = await request(app.server)
    .patch('/me')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ preferredLocale });
  expect(res.status).toBe(200);
  expect(res.body.data.preferredLocale).toBe(preferredLocale);
}

interface StickerSearchResultBody {
  id: string;
  albumId: string;
  albumName: string;
  number: number;
  subject: string;
  displaySubject: string;
  imageUrl: string | null;
}

/** GET /stickers?q=&limit= as the given User, returning the decoded list. */
async function searchStickers(
  app: RunningApp,
  accessToken: string,
  params: { q?: string; limit?: string },
): Promise<StickerSearchResultBody[]> {
  const res = await request(app.server)
    .get('/stickers')
    .query(params)
    .set('Authorization', `Bearer ${accessToken}`);
  expect(res.status).toBe(200);
  expect(res.body.code).toBe('OK');
  return res.body.data.stickers as StickerSearchResultBody[];
}

describe('Search Stickers across Albums — GET /stickers (issue 20)', () => {
  beforeEach(cleanUsers);
  afterEach(async () => {
    await cleanCreatedStickers();
    await cleanCreatedAlbums();
    await cleanUsers();
  });

  it('finds a sticker by its canonical subject', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const { accessToken } = await login(app);

      const stickers = await searchStickers(app, accessToken, { q: 'Messi' });

      expect(stickers).toHaveLength(1);
      expect(stickers[0]).toEqual({
        id: '33333333-3333-4333-8333-000000000012',
        albumId: SEEDED_ALBUM_ID,
        albumName: 'Qatar 2022 World Cup',
        number: 12,
        subject: 'Lionel Messi',
        displaySubject: 'Lionel Messi',
        imageUrl: null,
      });
    } finally {
      await app.stop();
    }
  });

  it("finds a sticker through the requester's own-locale translation", async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const { accessToken } = await login(app);
      await setPreferredLocale(app, accessToken, 'es');

      const stickers = await searchStickers(app, accessToken, { q: 'Selección' });

      expect(stickers).toHaveLength(1);
      expect(stickers[0]).toMatchObject({
        id: '33333333-3333-4333-8333-000000000310',
        albumId: SEEDED_ALBUM_ID,
        number: 310,
        subject: 'Argentina Team',
        displaySubject: 'Selección de Argentina',
      });
    } finally {
      await app.stop();
    }
  });

  it("resolves the album display name for the requester's locale", async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const { accessToken } = await login(app);
      await setPreferredLocale(app, accessToken, 'es');

      const stickers = await searchStickers(app, accessToken, { q: 'Messi' });

      expect(stickers).toHaveLength(1);
      expect(stickers[0]!.albumId).toBe(SEEDED_ALBUM_ID);
      expect(stickers[0]!.albumName).toBe('Mundial Qatar 2022');
    } finally {
      await app.stop();
    }
  });

  it('matches a sticker whose number equals the query text', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const { accessToken } = await login(app);

      const stickers = await searchStickers(app, accessToken, { q: '47' });

      expect(stickers).toHaveLength(1);
      expect(stickers[0]).toMatchObject({
        id: '33333333-3333-4333-8333-000000000047',
        number: 47,
        subject: 'Kylian Mbappé',
        displaySubject: 'Kylian Mbappé',
      });
    } finally {
      await app.stop();
    }
  });

  it('respects limit and clamps it to 50, defaulting for a non-numeric value', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      await createStickers(
        db,
        Array.from({ length: 60 }, (_, index) => ({
          albumId: SEEDED_ALBUM_ID,
          number: 1000 + index,
          subject: `Limit Player ${String(index).padStart(2, '0')}`,
        })),
      );

      expect(
        await searchStickers(app, accessToken, { q: 'Limit Player', limit: '3' }),
      ).toHaveLength(3);
      expect(
        await searchStickers(app, accessToken, { q: 'Limit Player', limit: '50' }),
      ).toHaveLength(50);
      expect(
        await searchStickers(app, accessToken, { q: 'Limit Player', limit: '999' }),
      ).toHaveLength(50);
      expect(
        await searchStickers(app, accessToken, { q: 'Limit Player', limit: 'not-a-number' }),
      ).toHaveLength(20);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('ranks prefix matches before contains matches and album-name-only matches last', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      const messiAlbumId = await createAlbum(db, 'Messi Album');
      await createStickers(db, [
        { albumId: SEEDED_ALBUM_ID, number: 2001, subject: 'Messi' },
        { albumId: SEEDED_ALBUM_ID, number: 2002, subject: 'Messi Tribute' },
        { albumId: messiAlbumId, number: 2003, subject: 'Album Only Player' },
      ]);

      const stickers = await searchStickers(app, accessToken, { q: 'Messi' });

      expect(stickers.map((sticker) => sticker.displaySubject)).toEqual([
        'Messi',
        'Messi Tribute',
        'Lionel Messi',
        'Album Only Player',
      ]);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('matches accents and case insensitively', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const { accessToken } = await login(app);

      const accented = await searchStickers(app, accessToken, { q: 'mbappe' });
      expect(accented.map((sticker) => sticker.displaySubject)).toEqual(['Kylian Mbappé']);

      const croatian = await searchStickers(app, accessToken, { q: 'MODRIC' });
      expect(croatian.map((sticker) => sticker.displaySubject)).toEqual(['Luka Modrić']);

      const lowerCase = await searchStickers(app, accessToken, { q: 'messi' });
      expect(lowerCase.map((sticker) => sticker.displaySubject)).toEqual(['Lionel Messi']);
    } finally {
      await app.stop();
    }
  });

  it('returns an empty list when nothing matches', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const { accessToken } = await login(app);

      const stickers = await searchStickers(app, accessToken, { q: 'no-such-sticker' });

      expect(stickers).toEqual([]);
    } finally {
      await app.stop();
    }
  });

  it('returns an empty list for a missing or blank q', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const { accessToken } = await login(app);

      expect(await searchStickers(app, accessToken, {})).toEqual([]);
      expect(await searchStickers(app, accessToken, { q: '' })).toEqual([]);
      expect(await searchStickers(app, accessToken, { q: '   ' })).toEqual([]);
    } finally {
      await app.stop();
    }
  });

  it("falls back to the canonical album name when the requester's locale has no translation", async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      await setPreferredLocale(app, accessToken, 'es');
      const albumId = await createAlbum(db, 'Untranslated Album');
      await createStickers(db, [
        { albumId, number: 3001, subject: 'Untranslated Player' },
      ]);

      const stickers = await searchStickers(app, accessToken, { q: 'Untranslated Player' });

      expect(stickers).toHaveLength(1);
      expect(stickers[0]!.albumId).toBe(albumId);
      expect(stickers[0]!.albumName).toBe('Untranslated Album');
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('rejects an unauthenticated request with a locale-neutral 401', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const res = await request(app.server).get('/stickers').query({ q: 'Messi' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });
      expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose
    } finally {
      await app.stop();
    }
  });

  it("finds stickers by the requester's locale album name", async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const { accessToken } = await login(app);
      await setPreferredLocale(app, accessToken, 'es');

      const stickers = await searchStickers(app, accessToken, { q: 'Mundial' });

      expect(stickers).toHaveLength(5);
      expect(stickers.every((sticker) => sticker.albumId === SEEDED_ALBUM_ID)).toBe(true);
      expect(stickers.every((sticker) => sticker.albumName === 'Mundial Qatar 2022')).toBe(true);
    } finally {
      await app.stop();
    }
  });

  it('matches sticker numbers exactly rather than by substring', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const { accessToken } = await login(app);

      expect(await searchStickers(app, accessToken, { q: '4' })).toEqual([]);
      expect(
        (await searchStickers(app, accessToken, { q: '47' })).map((sticker) => sticker.number),
      ).toEqual([47]);
    } finally {
      await app.stop();
    }
  });

  it('carries the catalog image url when the sticker has one', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      const [stickerId] = await createStickers(db, [
        {
          albumId: SEEDED_ALBUM_ID,
          number: 4001,
          subject: 'Image Player',
          imageUrl: 'https://cdn.example.test/sticker-4001.png',
        },
      ]);

      const stickers = await searchStickers(app, accessToken, { q: 'Image Player' });

      expect(stickers).toEqual([
        {
          id: stickerId,
          albumId: SEEDED_ALBUM_ID,
          albumName: 'Qatar 2022 World Cup',
          number: 4001,
          subject: 'Image Player',
          displaySubject: 'Image Player',
          imageUrl: 'https://cdn.example.test/sticker-4001.png',
        },
      ]);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('breaks ties in display subject by sticker id', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      const ids = await createStickers(db, [
        { albumId: SEEDED_ALBUM_ID, number: 5001, subject: 'Twin Player' },
        { albumId: SEEDED_ALBUM_ID, number: 5002, subject: 'Twin Player' },
      ]);

      const stickers = await searchStickers(app, accessToken, { q: 'Twin Player' });

      expect(stickers.map((sticker) => sticker.id)).toEqual([...ids].sort());
    } finally {
      await db.destroy();
      await app.stop();
    }
  });
});
