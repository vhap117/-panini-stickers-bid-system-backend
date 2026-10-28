import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { startTestApp, testDb, TEST_GOOGLE_CLIENT_ID } from './harness';
import { loginViaGoogle, type GoogleIdTokenPayload, type GoogleVerifyCall } from './oauth-stubs';
import type { RunningApp } from '../src/server';
import type { Knex } from 'knex';

// Replace `google-auth-library` with a controllable fake, exactly as
// me.test.ts does — independent mock state per test file.
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

// Spec of the catalog listing seam (issue 06): GET /albums returns the
// seeded Albums with display names resolved to the authenticated User's
// preferred locale (ADR-0014), falling back to the canonical name. Driven
// through real HTTP against the real app and real Postgres+PostGIS. Only
// Google's tokeninfo endpoint is stubbed (ADR-0016). Errors stay
// locale-neutral: codes + data, never prose.

const GOOGLE_SUB = 'google-user-albums';
const GOOGLE_NAME = 'Catalog Reader';
const GOOGLE_EMAIL = 'catalog@example.com';

/** The album the seed migration must ship (canonical name chosen there). */
const SEEDED_ALBUM_NAME = 'Qatar 2022 World Cup';

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

/** Albums created by a spec (never the migration seed) are removed after it. */
let createdAlbumIds: string[] = [];

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

/** Inserts an Album (plus any translations) for ordering/fallback specs. */
async function createAlbum(
  db: Knex,
  album: { name: string; year?: number | null; translations?: Record<string, string> },
): Promise<string> {
  const [row] = await db('albums')
    .insert({ name: album.name, year: album.year ?? null })
    .returning('id');
  const id: string = typeof row === 'string' ? row : row.id;
  createdAlbumIds.push(id);
  for (const [locale, name] of Object.entries(album.translations ?? {})) {
    await db('album_translations').insert({ album_id: id, locale, name });
  }
  return id;
}

/** Logs in and returns the access token plus the created User id. */
async function login(app: RunningApp): Promise<{ accessToken: string; userId: string }> {
  const res = await loginViaGoogle(app);
  return {
    accessToken: res.body.data.accessToken,
    userId: res.body.data.user.id,
  };
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

interface AlbumBody {
  id: string;
  name: string;
  displayName: string;
  year: number | null;
  createdAt: string;
}

/** GET /albums as the given User, returning the decoded Album list. */
async function getAlbums(app: RunningApp, accessToken: string): Promise<AlbumBody[]> {
  const res = await request(app.server)
    .get('/albums')
    .set('Authorization', `Bearer ${accessToken}`);
  expect(res.status).toBe(200);
  expect(res.body.code).toBe('OK');
  return res.body.data.albums as AlbumBody[];
}

describe('List Albums with locale-resolved names — GET /albums (issue 06)', () => {
  beforeEach(cleanUsers);
  afterEach(async () => {
    await cleanCreatedAlbums();
    await cleanUsers();
  });

  it('returns the seeded Album with its canonical id, name, year, and creation timestamp', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const { accessToken } = await login(app);

      const res = await request(app.server)
        .get('/albums')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');
      const albums: {
        id: string;
        name: string;
        displayName: string;
        year: number | null;
        createdAt: string;
      }[] = res.body.data.albums;
      const seeded = albums.find((a) => a.name === SEEDED_ALBUM_NAME);
      expect(seeded).toBeDefined();
      expect(typeof seeded!.id).toBe('string');
      expect(seeded!.year).toBe(2022);
      expect(typeof seeded!.createdAt).toBe('string');
      expect(Number.isNaN(Date.parse(seeded!.createdAt))).toBe(false);
    } finally {
      await app.stop();
    }
  });

  it('resolves the English translation for a User whose preferred locale is en', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      // A translation that differs from the canonical name proves the
      // locale join is actually used — not just the fallback.
      await createAlbum(db, {
        name: 'Copa America 2021',
        year: 2021,
        translations: { en: 'Copa América 2021' },
      });

      const albums = await getAlbums(app, accessToken);
      const seeded = albums.find((a) => a.name === SEEDED_ALBUM_NAME);
      expect(seeded!.displayName).toBe('Qatar 2022 World Cup');

      const translated = albums.find((a) => a.name === 'Copa America 2021');
      expect(translated!.displayName).toBe('Copa América 2021');
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('resolves the Spanish translation for a User whose preferred locale is es', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const { accessToken } = await login(app);
      await setPreferredLocale(app, accessToken, 'es');

      const albums = await getAlbums(app, accessToken);
      const seeded = albums.find((a) => a.name === SEEDED_ALBUM_NAME);
      expect(seeded!.displayName).toBe('Mundial Qatar 2022');
    } finally {
      await app.stop();
    }
  });

  it('falls back to the canonical name when the preferred locale has no translation', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      await createAlbum(db, {
        name: 'Copa America 2021',
        year: 2021,
        translations: { en: 'Copa América 2021' },
      });
      await setPreferredLocale(app, accessToken, 'es');

      const albums = await getAlbums(app, accessToken);
      const untranslated = albums.find((a) => a.name === 'Copa America 2021');
      expect(untranslated!.displayName).toBe('Copa America 2021');
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('ships the seeded Album with both English and Spanish translations in the database', async () => {
    const db = testDb();
    try {
      const album = await db('albums').where({ name: SEEDED_ALBUM_NAME }).first();
      expect(album).toBeDefined();
      expect(album.year).toBe(2022);
      expect(typeof album.id).toBe('string');

      const translations = await db('album_translations')
        .where({ album_id: album.id })
        .orderBy('locale', 'asc')
        .select('locale', 'name');
      expect(translations).toEqual([
        { locale: 'en', name: 'Qatar 2022 World Cup' },
        { locale: 'es', name: 'Mundial Qatar 2022' },
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('orders Albums by canonical name ASC, stably across repeated calls', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      await createAlbum(db, { name: 'Zeta Album', year: 2024 });
      await createAlbum(db, { name: 'Argentina 2022', year: 2022 });

      const first = await getAlbums(app, accessToken);
      expect(first.map((a) => a.name)).toEqual([
        'Argentina 2022',
        SEEDED_ALBUM_NAME,
        'Zeta Album',
      ]);

      // Stable across calls: identical response, identical order.
      const second = await getAlbums(app, accessToken);
      expect(second).toEqual(first);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('rejects an unauthenticated GET /albums with a locale-neutral 401', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const res = await request(app.server).get('/albums');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });
      expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose
    } finally {
      await app.stop();
    }
  });
});

/** Albums created through the real POST endpoint — cleaned after each spec. */
let postedAlbumIds: string[] = [];

/** Number of rows in a catalog table, for "writes nothing" assertions. */
async function countRows(db: Knex, table: 'albums' | 'album_translations'): Promise<number> {
  const [row] = (await db(table).count('* as count')) as Array<{ count: string }>;
  return Number(row.count);
}

async function cleanPostedAlbums(): Promise<void> {
  if (postedAlbumIds.length === 0) return;
  const db = testDb();
  try {
    await db('albums').whereIn('id', postedAlbumIds).delete();
  } finally {
    await db.destroy();
  }
  postedAlbumIds = [];
}

/** POST /albums as the given User, with the given JSON body (or none). */
function postAlbum(app: RunningApp, accessToken: string, body?: unknown) {
  const req = request(app.server).post('/albums').set('Authorization', `Bearer ${accessToken}`);
  return body === undefined ? req : req.send(body as object);
}

describe('Create a user-contributed Album — POST /albums (issue 07)', () => {
  beforeEach(cleanUsers);
  afterEach(async () => {
    await cleanPostedAlbums();
    await cleanUsers();
  });

  it('persists the canonical name plus the submitter-locale translation and lists it immediately', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      const name = 'Euro 2024 Germany';

      const res = await postAlbum(app, accessToken, { name });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');

      const album: AlbumBody = res.body.data.album;
      expect(typeof album.id).toBe('string');
      postedAlbumIds.push(album.id);
      expect(album.name).toBe(name);
      expect(album.displayName).toBe(name);
      expect(album.year).toBeNull();
      expect(typeof album.createdAt).toBe('string');
      expect(Number.isNaN(Date.parse(album.createdAt))).toBe(false);

      // Database state: canonical row + one translation in the submitter's
      // preferred locale (login defaults to 'en').
      const albumRow = await db('albums').where({ id: album.id }).first();
      expect(albumRow.name).toBe(name);
      expect(albumRow.year).toBeNull();
      const translations = await db('album_translations')
        .where({ album_id: album.id })
        .select('locale', 'name');
      expect(translations).toEqual([{ locale: 'en', name }]);

      // Cross-endpoint: the new Album is visible in GET /albums immediately.
      const albums = await getAlbums(app, accessToken);
      expect(albums.find((a) => a.id === album.id)).toEqual(album);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it("stores the translation in a Spanish-preferring User's locale, not a request-supplied one", async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      await setPreferredLocale(app, accessToken, 'es');
      const name = 'Mundial 2026';

      // The body carries no locale — only the User's stored preference.
      const res = await postAlbum(app, accessToken, { name });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');
      const album: AlbumBody = res.body.data.album;
      postedAlbumIds.push(album.id);
      expect(album.name).toBe(name);
      expect(album.displayName).toBe(name);

      const translations = await db('album_translations')
        .where({ album_id: album.id })
        .select('locale', 'name');
      expect(translations).toEqual([{ locale: 'es', name }]);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('allows a duplicate of an existing Album name — dedup is out of scope', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);

      const res = await postAlbum(app, accessToken, { name: SEEDED_ALBUM_NAME });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');
      const album: AlbumBody = res.body.data.album;
      postedAlbumIds.push(album.id);
      expect(album.name).toBe(SEEDED_ALBUM_NAME);
      expect(album.displayName).toBe(SEEDED_ALBUM_NAME);

      // Two distinct rows now carry the same canonical name.
      const rows = await db('albums').where({ name: SEEDED_ALBUM_NAME }).select('id');
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.id)).toContain(album.id);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('rejects missing, empty, and whitespace-only names with a locale-neutral 400 and writes nothing', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      const albumCountBefore = await countRows(db, 'albums');
      const translationCountBefore = await countRows(db, 'album_translations');

      const invalidBodies: unknown[] = [undefined, { name: '' }, { name: '   ' }];
      for (const body of invalidBodies) {
        const res = await postAlbum(app, accessToken, body);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ code: 'INVALID_ALBUM_NAME', data: {} });
        expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose
      }

      // Nothing persisted across every rejected request.
      const albumCountAfter = await countRows(db, 'albums');
      const translationCountAfter = await countRows(db, 'album_translations');
      expect(albumCountAfter).toBe(albumCountBefore);
      expect(translationCountAfter).toBe(translationCountBefore);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('rejects an unauthenticated POST /albums with a locale-neutral 401 and writes nothing', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const albumCountBefore = await countRows(db, 'albums');
      const res = await request(app.server)
        .post('/albums')
        .send({ name: 'Anonymous Album' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });
      expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose

      const albumCountAfter = await countRows(db, 'albums');
      expect(albumCountAfter).toBe(albumCountBefore);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });
});
