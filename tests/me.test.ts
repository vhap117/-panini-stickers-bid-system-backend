import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { startTestApp, testDb, TEST_GOOGLE_CLIENT_ID, TEST_JWT_SECRET } from './harness';
import {
  loginViaGoogle,
  type GoogleIdTokenPayload,
  type GoogleVerifyCall,
} from './oauth-stubs';
import type { RunningApp } from '../src/server';

// Replace `google-auth-library` with a controllable fake. See auth.test.ts
// for the rationale — same pattern, independent state per test file.
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

// `oauth-stubs.ts` installs the vi.mock for `google-auth-library` in its
// own hoist context — importing it (above) is enough to register the mock
// globally before this file's own imports resolve.

// Spec of the User self-service seam (issue 05): the authenticated User
// updates their own details — location (persisted as a PostGIS geography
// point, ADR-0007) and preferred locale — via PATCH /me. Driven through
// real HTTP against the real app and real Postgres+PostGIS. Only Google's
// tokeninfo endpoint is stubbed (ADR-0016). Errors are locale-neutral
// (ADR-0014): codes + data, never prose.

const GOOGLE_SUB = 'google-user-123';
const GOOGLE_NAME = 'Alice Collector';
const GOOGLE_EMAIL = 'alice@example.com';

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

/** Tests share the real test DB — user-detail specs clean their own rows. */
async function cleanUsers(): Promise<void> {
  const db = testDb();
  try {
    await db.raw('TRUNCATE TABLE users CASCADE');
  } finally {
    await db.destroy();
  }
}

describe('Update own User details — location + preferred locale (PATCH /me, issue 05)', () => {
  beforeEach(cleanUsers);
  afterEach(cleanUsers);

  it('persists the User location as a geography point and round-trips it via GET /me and via Knex', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const login = await loginViaGoogle(app);
      const accessToken: string = login.body.data.accessToken;
      const userId: string = login.body.data.user.id;
      const location = { latitude: 40.4168, longitude: -3.7038 }; // Madrid

      const res = await request(app.server)
        .patch('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ location });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');
      expect(res.body.data.id).toBe(userId);
      expect(res.body.data.location).toEqual({ latitude: 40.4168, longitude: -3.7038 });

      // GET /me reflects the stored location.
      const me = await request(app.server)
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.code).toBe('OK');
      expect(me.body.data.location).toEqual({ latitude: 40.4168, longitude: -3.7038 });

      // The database holds a geography point, asserted via Knex.
      const db = testDb();
      try {
        const row = await db('users')
          .where({ id: userId })
          .first(db.raw('ST_AsText(location) as location_wkt'));
        expect(row.location_wkt).toBe('POINT(-3.7038 40.4168)');
      } finally {
        await db.destroy();
      }
    } finally {
      await app.stop();
    }
  });

  it("persists the User's preferred locale 'es' and returns it via GET /me and via Knex", async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const login = await loginViaGoogle(app);
      const accessToken: string = login.body.data.accessToken;
      const userId: string = login.body.data.user.id;

      const res = await request(app.server)
        .patch('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ preferredLocale: 'es' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');
      expect(res.body.data.preferredLocale).toBe('es');

      // GET /me reflects the stored preferred locale.
      const me = await request(app.server)
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.data.preferredLocale).toBe('es');

      // The database holds the preferred locale column.
      const db = testDb();
      try {
        const row = await db('users').where({ id: userId }).first('preferred_locale');
        expect(row.preferred_locale).toBe('es');
      } finally {
        await db.destroy();
      }
    } finally {
      await app.stop();
    }
  });

  it('rejects an unsupported preferred locale with a locale-neutral 400 and persists nothing', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const login = await loginViaGoogle(app);
      const accessToken: string = login.body.data.accessToken;
      const userId: string = login.body.data.user.id;

      const res = await request(app.server)
        .patch('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ preferredLocale: 'fr' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: 'UNSUPPORTED_LOCALE', data: {} });
      expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose

      // Nothing persisted: the defaults from login survive untouched.
      const db = testDb();
      try {
        const row = await db('users')
          .where({ id: userId })
          .first('preferred_locale', db.raw('ST_AsText(location) as location_wkt'));
        expect(row.preferred_locale).toBe('en');
        expect(row.location_wkt).toBeNull();
      } finally {
        await db.destroy();
      }
    } finally {
      await app.stop();
    }
  });

  it('rejects a malformed User location with a locale-neutral 400 and persists nothing', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const login = await loginViaGoogle(app);
      const accessToken: string = login.body.data.accessToken;
      const userId: string = login.body.data.user.id;

      const malformedBodies: Record<string, unknown>[] = [
        { location: { latitude: 999, longitude: -3.7038 } }, // latitude out of range
        { location: { latitude: '40.4168', longitude: -3.7038 } }, // non-number latitude
        { location: { latitude: 40.4168 } }, // missing longitude
      ];
      for (const body of malformedBodies) {
        const res = await request(app.server)
          .patch('/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(body);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ code: 'INVALID_LOCATION', data: {} });
        expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose
      }

      // Nothing persisted across every rejected request.
      const db = testDb();
      try {
        const row = await db('users')
          .where({ id: userId })
          .first('preferred_locale', db.raw('ST_AsText(location) as location_wkt'));
        expect(row.preferred_locale).toBe('en');
        expect(row.location_wkt).toBeNull();
      } finally {
        await db.destroy();
      }
    } finally {
      await app.stop();
    }
  });

  it('rejects an unauthenticated PATCH /me with a locale-neutral 401 (no header, forged token)', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      // No Authorization header at all.
      const noHeader = await request(app.server).patch('/me').send({ preferredLocale: 'es' });
      expect(noHeader.status).toBe(401);
      expect(noHeader.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });
      expect(JSON.stringify(noHeader.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose

      // Forged token: correctly shaped but signed with the wrong secret.
      const login = await loginViaGoogle(app);
      const userId: string = login.body.data.user.id;
      const forged = jwt.sign({ sub: userId }, 'not-the-test-jwt-secret', {
        algorithm: 'HS256',
        expiresIn: 900,
      });
      const forgedRes = await request(app.server)
        .patch('/me')
        .set('Authorization', `Bearer ${forged}`)
        .send({ preferredLocale: 'es' });
      expect(forgedRes.status).toBe(401);
      expect(forgedRes.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });

      // Nothing persisted: only the login row exists, details untouched.
      const db = testDb();
      try {
        const row = await db('users')
          .where({ id: userId })
          .first('preferred_locale', db.raw('ST_AsText(location) as location_wkt'));
        expect(row.preferred_locale).toBe('en');
        expect(row.location_wkt).toBeNull();
      } finally {
        await db.destroy();
      }
    } finally {
      await app.stop();
    }
  });

  it('updates location and preferred locale together; a later partial update leaves the other field untouched', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const login = await loginViaGoogle(app);
      const accessToken: string = login.body.data.accessToken;
      const userId: string = login.body.data.user.id;

      // One request updates both the User's location and preferred locale.
      const both = await request(app.server)
        .patch('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ location: { latitude: -34.6037, longitude: -58.3816 }, preferredLocale: 'es' }); // Buenos Aires
      expect(both.status).toBe(200);
      expect(both.body.code).toBe('OK');
      expect(both.body.data.location).toEqual({ latitude: -34.6037, longitude: -58.3816 });
      expect(both.body.data.preferredLocale).toBe('es');

      // A subsequent PATCH of only the locale leaves the stored location
      // untouched.
      const localeOnly = await request(app.server)
        .patch('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ preferredLocale: 'en' });
      expect(localeOnly.status).toBe(200);
      expect(localeOnly.body.data.preferredLocale).toBe('en');
      expect(localeOnly.body.data.location).toEqual({ latitude: -34.6037, longitude: -58.3816 });

      // And vice versa: a PATCH of only the location leaves the stored
      // preferred locale untouched.
      const locationOnly = await request(app.server)
        .patch('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ location: { latitude: 41.3874, longitude: 2.1686 } }); // Barcelona
      expect(locationOnly.status).toBe(200);
      expect(locationOnly.body.data.location).toEqual({ latitude: 41.3874, longitude: 2.1686 });
      expect(locationOnly.body.data.preferredLocale).toBe('en');

      // The database reflects the final state of both fields.
      const db = testDb();
      try {
        const row = await db('users')
          .where({ id: userId })
          .first('preferred_locale', db.raw('ST_AsText(location) as location_wkt'));
        expect(row.preferred_locale).toBe('en');
        expect(row.location_wkt).toBe('POINT(2.1686 41.3874)');
      } finally {
        await db.destroy();
      }
    } finally {
      await app.stop();
    }
  });

  it('treats an empty PATCH /me body as a valid no-op', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const login = await loginViaGoogle(app);
      const accessToken: string = login.body.data.accessToken;
      const userId: string = login.body.data.user.id;

      const res = await request(app.server)
        .patch('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');
      expect(res.body.data.id).toBe(userId);
      expect(res.body.data.location).toBeNull();
      expect(res.body.data.preferredLocale).toBe('en');
    } finally {
      await app.stop();
    }
  });
});
