import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { startTestApp, testDb, TEST_GOOGLE_CLIENT_ID } from './harness';
import { loginViaGoogle, type GoogleIdTokenPayload, type GoogleVerifyCall } from './oauth-stubs';
import type { RunningApp } from '../src/server';
import type { Knex } from 'knex';

// Replace `google-auth-library` with a controllable fake, exactly as
// albums.test.ts does — independent mock state per test file.
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

// Spec of the catalog Sticker read path (issue 08): GET
// /albums/:id/stickers returns an Album's Sticker roster with subjects
// resolved to the authenticated User's preferred locale (ADR-0014),
// falling back to the canonical subject, ordered by Sticker number. Driven
// through real HTTP against the real app and real Postgres+PostGIS. Only
// Google's tokeninfo endpoint is stubbed (ADR-0016). Errors stay
// locale-neutral: codes + data, never prose.

/** The Album the issue-06 seed migration ships (fixed UUID). */
const SEEDED_ALBUM_ID = '11111111-1111-4111-8111-111111111111';

/** The Sticker numbers the issue-08 seed migration ships, ascending. */
const SEEDED_STICKER_NUMBERS = [12, 47, 138, 234, 310];

/** A fixed seed Sticker used for translation assertions. */
const SEEDED_STICKER_ID = '33333333-3333-4333-8333-000000000012';

const GOOGLE_SUB = 'google-user-stickers';
const GOOGLE_NAME = 'Sticker Browser';
const GOOGLE_EMAIL = 'stickers@example.com';

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

/** Inserts a Sticker (plus any translations) for locale/fallback specs. */
async function createSticker(
  db: Knex,
  sticker: {
    albumId: string;
    number: number;
    subject: string;
    translations?: Record<string, string>;
  },
): Promise<string> {
  const [row] = await db('stickers')
    .insert({
      album_id: sticker.albumId,
      number: sticker.number,
      subject: sticker.subject,
    })
    .returning('id');
  const id: string = typeof row === 'string' ? row : row.id;
  createdStickerIds.push(id);
  for (const [locale, subject] of Object.entries(sticker.translations ?? {})) {
    await db('sticker_translations').insert({ sticker_id: id, locale, subject });
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

interface StickerBody {
  id: string;
  albumId: string;
  number: number;
  subject: string;
  displaySubject: string;
  createdAt: string;
}

/** GET /albums/:id/stickers as the given User, returning the decoded list. */
async function getStickers(
  app: RunningApp,
  accessToken: string,
  albumId: string,
): Promise<StickerBody[]> {
  const res = await request(app.server)
    .get(`/albums/${albumId}/stickers`)
    .set('Authorization', `Bearer ${accessToken}`);
  expect(res.status).toBe(200);
  expect(res.body.code).toBe('OK');
  return res.body.data.stickers as StickerBody[];
}

describe('List Stickers in an Album — GET /albums/:id/stickers (issue 08)', () => {
  beforeEach(cleanUsers);
  afterEach(async () => {
    await cleanCreatedStickers();
    await cleanUsers();
  });

  it('returns the seeded Stickers for the seeded Album, ordered by number ASC', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const { accessToken } = await login(app);

      const stickers = await getStickers(app, accessToken, SEEDED_ALBUM_ID);

      expect(stickers.map((s) => s.number)).toEqual(SEEDED_STICKER_NUMBERS);
      for (const sticker of stickers) {
        expect(sticker.albumId).toBe(SEEDED_ALBUM_ID);
        expect(typeof sticker.id).toBe('string');
        expect(typeof sticker.subject).toBe('string');
        expect(sticker.subject.length).toBeGreaterThan(0);
        expect(typeof sticker.displaySubject).toBe('string');
        expect(Number.isNaN(Date.parse(sticker.createdAt))).toBe(false);
      }
    } finally {
      await app.stop();
    }
  });

  it('resolves the English translation for a User whose preferred locale is en', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      // A translation that differs from the canonical subject proves the
      // locale join is actually used — not just the fallback.
      const stickerId = await createSticker(db, {
        albumId: SEEDED_ALBUM_ID,
        number: 900,
        subject: 'Argentina Team',
        translations: { en: 'Argentina National Team' },
      });

      const stickers = await getStickers(app, accessToken, SEEDED_ALBUM_ID);
      const sticker = stickers.find((s) => s.id === stickerId);
      expect(sticker!.subject).toBe('Argentina Team');
      expect(sticker!.displaySubject).toBe('Argentina National Team');
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('resolves Spanish subjects for a User whose preferred locale is es', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const { accessToken } = await login(app);
      await setPreferredLocale(app, accessToken, 'es');

      const stickers = await getStickers(app, accessToken, SEEDED_ALBUM_ID);
      const argentina = stickers.find((s) => s.number === 310);
      expect(argentina!.subject).toBe('Argentina Team');
      expect(argentina!.displaySubject).toBe('Selección de Argentina');
    } finally {
      await app.stop();
    }
  });

  it('falls back to the canonical subject when the preferred locale has no translation', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      const stickerId = await createSticker(db, {
        albumId: SEEDED_ALBUM_ID,
        number: 901,
        subject: 'Copa America 2021',
        translations: { en: 'Copa América 2021' },
      });
      await setPreferredLocale(app, accessToken, 'es');

      const stickers = await getStickers(app, accessToken, SEEDED_ALBUM_ID);
      const sticker = stickers.find((s) => s.id === stickerId);
      expect(sticker!.subject).toBe('Copa America 2021');
      expect(sticker!.displaySubject).toBe('Copa America 2021');
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('ships the seeded Sticker roster with both English and Spanish subjects in the database', async () => {
    const db = testDb();
    try {
      const stickerRows = await db('stickers')
        .where({ album_id: SEEDED_ALBUM_ID })
        .orderBy('number', 'asc')
        .select('id', 'number');
      expect(stickerRows.map((s) => s.number)).toEqual(SEEDED_STICKER_NUMBERS);

      const translations = await db('sticker_translations')
        .where({ sticker_id: SEEDED_STICKER_ID })
        .orderBy('locale', 'asc')
        .select('locale', 'subject');
      expect(translations).toEqual([
        { locale: 'en', subject: 'Lionel Messi' },
        { locale: 'es', subject: 'Lionel Messi' },
      ]);
    } finally {
      await db.destroy();
    }
  });

  it('rejects an unknown Album id with a locale-neutral 404', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const { accessToken } = await login(app);

      const res = await request(app.server)
        .get('/albums/00000000-0000-4000-8000-000000000000/stickers')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 'UNKNOWN_ALBUM', data: {} });
      expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose
    } finally {
      await app.stop();
    }
  });

  it('rejects an unauthenticated GET /albums/:id/stickers with a locale-neutral 401', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const res = await request(app.server).get(`/albums/${SEEDED_ALBUM_ID}/stickers`);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });
      expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose
    } finally {
      await app.stop();
    }
  });
});

/** Stickers created through the real POST endpoint — cleaned after each spec. */
let postedStickerIds: string[] = [];

async function cleanPostedStickers(): Promise<void> {
  if (postedStickerIds.length === 0) return;
  const db = testDb();
  try {
    await db('stickers').whereIn('id', postedStickerIds).delete();
  } finally {
    await db.destroy();
  }
  postedStickerIds = [];
}

/** Number of Stickers in the seeded Album, for "writes nothing" assertions. */
async function countAlbumStickers(db: Knex): Promise<number> {
  const [row] = (await db('stickers')
    .where({ album_id: SEEDED_ALBUM_ID })
    .count('* as count')) as Array<{ count: string }>;
  return Number(row.count);
}

/** Number of Sticker translations belonging to the seeded Album's Stickers. */
async function countAlbumStickerTranslations(db: Knex): Promise<number> {
  const [row] = (await db('sticker_translations as t')
    .join('stickers as s', 't.sticker_id', 's.id')
    .where('s.album_id', SEEDED_ALBUM_ID)
    .count('* as count')) as Array<{ count: string }>;
  return Number(row.count);
}

/** POST /albums/:id/stickers as the given User, with a body (or none). */
function postSticker(
  app: RunningApp,
  accessToken: string,
  albumId: string,
  body?: unknown,
) {
  const req = request(app.server)
    .post(`/albums/${albumId}/stickers`)
    .set('Authorization', `Bearer ${accessToken}`);
  return body === undefined ? req : req.send(body as object);
}

describe('Create a user-contributed Sticker — POST /albums/:id/stickers (issue 09)', () => {
  beforeEach(cleanUsers);
  afterEach(async () => {
    await cleanPostedStickers();
    await cleanUsers();
  });

  it('persists the canonical subject plus the submitter-locale translation and lists it immediately', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);

      const res = await postSticker(app, accessToken, SEEDED_ALBUM_ID, {
        number: 777,
        subject: 'Diego Maradona',
      });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');

      const sticker: StickerBody = res.body.data.sticker;
      expect(typeof sticker.id).toBe('string');
      postedStickerIds.push(sticker.id);
      expect(sticker.albumId).toBe(SEEDED_ALBUM_ID);
      expect(sticker.number).toBe(777);
      expect(sticker.subject).toBe('Diego Maradona');
      expect(sticker.displaySubject).toBe('Diego Maradona');
      expect(Number.isNaN(Date.parse(sticker.createdAt))).toBe(false);

      // Database state: canonical row + one translation in the submitter's
      // preferred locale (login defaults to 'en').
      const stickerRow = await db('stickers').where({ id: sticker.id }).first();
      expect(stickerRow.album_id).toBe(SEEDED_ALBUM_ID);
      expect(stickerRow.number).toBe(777);
      expect(stickerRow.subject).toBe('Diego Maradona');
      const translations = await db('sticker_translations')
        .where({ sticker_id: sticker.id })
        .select('locale', 'subject');
      expect(translations).toEqual([{ locale: 'en', subject: 'Diego Maradona' }]);

      // Cross-endpoint: the new Sticker is visible in the roster immediately.
      const stickers = await getStickers(app, accessToken, SEEDED_ALBUM_ID);
      expect(stickers.find((s) => s.id === sticker.id)).toEqual(sticker);
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

      // The body carries no locale — only the User's stored preference.
      const res = await postSticker(app, accessToken, SEEDED_ALBUM_ID, {
        number: 778,
        subject: 'Diego Maradona',
      });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');
      const sticker: StickerBody = res.body.data.sticker;
      postedStickerIds.push(sticker.id);
      expect(sticker.subject).toBe('Diego Maradona');
      expect(sticker.displaySubject).toBe('Diego Maradona');

      const translations = await db('sticker_translations')
        .where({ sticker_id: sticker.id })
        .select('locale', 'subject');
      expect(translations).toEqual([{ locale: 'es', subject: 'Diego Maradona' }]);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('allows a number that already exists in the Album — dedup is out of scope', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);

      const res = await postSticker(app, accessToken, SEEDED_ALBUM_ID, {
        number: 12,
        subject: 'Duplicate Messi',
      });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');
      const sticker: StickerBody = res.body.data.sticker;
      postedStickerIds.push(sticker.id);
      expect(sticker.number).toBe(12);
      expect(sticker.subject).toBe('Duplicate Messi');

      // Two distinct rows now carry number 12 in this Album.
      const rows = await db('stickers')
        .where({ album_id: SEEDED_ALBUM_ID, number: 12 })
        .select('id');
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.id)).toContain(sticker.id);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('rejects invalid numbers with a locale-neutral 400 and writes nothing', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      const stickerCountBefore = await countAlbumStickers(db);
      const translationCountBefore = await countAlbumStickerTranslations(db);

      const invalidBodies: unknown[] = [
        { subject: 'Valid Subject' }, // missing number
        { number: '12', subject: 'Valid Subject' }, // non-number
        { number: 0, subject: 'Valid Subject' }, // below the roster minimum
        { number: -1, subject: 'Valid Subject' }, // negative
        { number: 1.5, subject: 'Valid Subject' }, // non-integer
      ];
      for (const body of invalidBodies) {
        const res = await postSticker(app, accessToken, SEEDED_ALBUM_ID, body);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ code: 'INVALID_STICKER_NUMBER', data: {} });
        expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose
      }

      expect(await countAlbumStickers(db)).toBe(stickerCountBefore);
      expect(await countAlbumStickerTranslations(db)).toBe(translationCountBefore);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('rejects invalid subjects with a locale-neutral 400 and writes nothing', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      const stickerCountBefore = await countAlbumStickers(db);
      const translationCountBefore = await countAlbumStickerTranslations(db);

      const invalidBodies: unknown[] = [
        { number: 999 }, // missing subject
        { number: 999, subject: '' }, // empty
        { number: 999, subject: '   ' }, // whitespace-only
        { number: 999, subject: 42 }, // non-string
      ];
      for (const body of invalidBodies) {
        const res = await postSticker(app, accessToken, SEEDED_ALBUM_ID, body);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ code: 'INVALID_STICKER_SUBJECT', data: {} });
        expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose
      }

      expect(await countAlbumStickers(db)).toBe(stickerCountBefore);
      expect(await countAlbumStickerTranslations(db)).toBe(translationCountBefore);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('rejects an unknown parent Album with a locale-neutral 404 and writes nothing', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const { accessToken } = await login(app);
      const stickerCountBefore = await countAlbumStickers(db);
      const translationCountBefore = await countAlbumStickerTranslations(db);

      const res = await postSticker(
        app,
        accessToken,
        '00000000-0000-4000-8000-000000000000',
        { number: 999, subject: 'Orphan Sticker' },
      );
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 'UNKNOWN_ALBUM', data: {} });
      expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose

      expect(await countAlbumStickers(db)).toBe(stickerCountBefore);
      expect(await countAlbumStickerTranslations(db)).toBe(translationCountBefore);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });

  it('rejects an unauthenticated POST /albums/:id/stickers with a locale-neutral 401 and writes nothing', async () => {
    const { app } = await startAppWithMockedVerifier();
    const db = testDb();
    try {
      const stickerCountBefore = await countAlbumStickers(db);
      const translationCountBefore = await countAlbumStickerTranslations(db);

      const res = await request(app.server)
        .post(`/albums/${SEEDED_ALBUM_ID}/stickers`)
        .send({ number: 999, subject: 'Anonymous Sticker' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });
      expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose

      expect(await countAlbumStickers(db)).toBe(stickerCountBefore);
      expect(await countAlbumStickerTranslations(db)).toBe(translationCountBefore);
    } finally {
      await db.destroy();
      await app.stop();
    }
  });
});
