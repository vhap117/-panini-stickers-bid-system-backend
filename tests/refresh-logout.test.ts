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

// Spec of the session-continuation seam (ADR-0011): refresh-token exchange
// and revocation, driven through real HTTP against the real app and real
// Postgres. Only Google's tokeninfo endpoint is stubbed (ADR-0016).

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

/** Tests share the real test DB — auth specs clean their own rows. */
async function cleanUsers(): Promise<void> {
  const db = testDb();
  try {
    await db.raw('TRUNCATE TABLE users CASCADE');
  } finally {
    await db.destroy();
  }
}

describe('Token refresh + logout (session continuation, ADR-0011)', () => {
  beforeEach(cleanUsers);
  afterEach(cleanUsers);

  it('exchanges the refresh token issued at login for a new access token that grants GET /me', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const login = await loginViaGoogle(app);
      const refreshToken: string = login.body.data.refreshToken;

      const res = await request(app.server)
        .post('/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('AUTHENTICATED');
      const data = res.body.data;
      expect(data.tokenType).toBe('Bearer');
      expect(data.expiresIn).toBe(900);
      expect(typeof data.accessToken).toBe('string');
      expect(data.accessToken.length).toBeGreaterThan(0);
      // Mirrors the login payload minus the user object (the client already
      // knows the user) and minus the refresh token (it is NOT rotated).
      expect(data.user).toBeUndefined();
      expect(data.refreshToken).toBeUndefined();

      // The new access token actually grants access to a protected endpoint.
      const me = await request(app.server)
        .get('/me')
        .set('Authorization', `Bearer ${data.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.code).toBe('OK');
      expect(me.body.data.id).toBe(login.body.data.user.id);

      // No rotation: the same refresh-token row is still the session state.
      const db = testDb();
      try {
        const rows = await db('refresh_tokens').where({ token: refreshToken }).select('*');
        expect(rows).toHaveLength(1);
      } finally {
        await db.destroy();
      }
    } finally {
      await app.stop();
    }
  });

  it('an expired access token is rejected with a locale-neutral 401, and refreshing restores access', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const login = await loginViaGoogle(app);
      const userId: string = login.body.data.user.id;
      const refreshToken: string = login.body.data.refreshToken;

      // Correctly signed but expired (short TTL per ADR-0011).
      const expired = jwt.sign({ sub: userId }, TEST_JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: -60,
      });
      const stale = await request(app.server)
        .get('/me')
        .set('Authorization', `Bearer ${expired}`);
      expect(stale.status).toBe(401);
      expect(stale.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });
      expect(JSON.stringify(stale.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose

      // Session continuation: exchange the refresh token for a fresh access
      // token and access is restored without re-authenticating.
      const res = await request(app.server)
        .post('/auth/refresh')
        .send({ refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('AUTHENTICATED');
      expect(res.body.data.accessToken).not.toBe(expired);

      const me = await request(app.server)
        .get('/me')
        .set('Authorization', `Bearer ${res.body.data.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.code).toBe('OK');
      expect(me.body.data.id).toBe(userId);
    } finally {
      await app.stop();
    }
  });

  it('rejects an unknown refresh token with a locale-neutral 401 and issues no access token', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      await loginViaGoogle(app);

      // Well-formed (64 hex chars) but never issued by this server.
      const unknown = 'f'.repeat(64);
      const res = await request(app.server)
        .post('/auth/refresh')
        .send({ refreshToken: unknown });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });
      expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose
    } finally {
      await app.stop();
    }
  });

  it('rejects an expired refresh token even though its row still exists', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const login = await loginViaGoogle(app);
      const refreshToken: string = login.body.data.refreshToken;

      // Seed the expiry: the row exists but its TTL has elapsed.
      const db = testDb();
      try {
        const updated = await db('refresh_tokens')
          .where({ token: refreshToken })
          .update({ expires_at: new Date(Date.now() - 60_000) });
        expect(updated).toBe(1);
      } finally {
        await db.destroy();
      }

      const res = await request(app.server)
        .post('/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });
      expect('accessToken' in res.body.data).toBe(false);
    } finally {
      await app.stop();
    }
  });

  it('logout revokes the refresh token: the row is deleted and can no longer mint access tokens', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const login = await loginViaGoogle(app);
      const refreshToken: string = login.body.data.refreshToken;

      const res = await request(app.server)
        .post('/auth/logout')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ code: 'OK', data: {} });

      // Server-side session state is gone: the refresh_tokens row is deleted.
      const db = testDb();
      try {
        const rows = await db('refresh_tokens').where({ token: refreshToken }).select('*');
        expect(rows).toHaveLength(0);
      } finally {
        await db.destroy();
      }

      // The revoked token no longer grants new access tokens.
      const again = await request(app.server)
        .post('/auth/refresh')
        .send({ refreshToken });
      expect(again.status).toBe(401);
      expect(again.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });
      expect('accessToken' in again.body.data).toBe(false);
    } finally {
      await app.stop();
    }
  });

  it('logout is idempotent: an unknown or already-revoked token still returns 200 OK', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      const login = await loginViaGoogle(app);
      const refreshToken: string = login.body.data.refreshToken;

      // Unknown token: nothing to revoke, still a success.
      const unknown = await request(app.server)
        .post('/auth/logout')
        .send({ refreshToken: 'e'.repeat(64) });
      expect(unknown.status).toBe(200);
      expect(unknown.body).toEqual({ code: 'OK', data: {} });

      // Revoking twice: the second logout is still OK.
      const first = await request(app.server)
        .post('/auth/logout')
        .send({ refreshToken });
      expect(first.status).toBe(200);
      const second = await request(app.server)
        .post('/auth/logout')
        .send({ refreshToken });
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ code: 'OK', data: {} });
    } finally {
      await app.stop();
    }
  });

  it('rejects a malformed refresh body (missing or non-string refreshToken) with a locale-neutral 401', async () => {
    const { app } = await startAppWithMockedVerifier();
    try {
      await loginViaGoogle(app);

      // Missing the refreshToken field entirely.
      const missing = await request(app.server).post('/auth/refresh').send({});
      expect(missing.status).toBe(401);
      expect(missing.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });
      expect('accessToken' in missing.body.data).toBe(false);

      // Non-string refreshToken.
      const nonString = await request(app.server)
        .post('/auth/refresh')
        .send({ refreshToken: 12345 });
      expect(nonString.status).toBe(401);
      expect(nonString.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });

      // Empty JSON body.
      const empty = await request(app.server).post('/auth/refresh').send();
      expect(empty.status).toBe(401);
      expect(empty.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });
    } finally {
      await app.stop();
    }
  });
});
