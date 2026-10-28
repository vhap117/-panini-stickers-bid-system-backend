import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { startTestApp, testDb, TEST_GOOGLE_CLIENT_ID } from './harness';
import { configFromEnv } from '../src/config';
import { type GoogleIdTokenPayload } from './oauth-stubs';

// Same controllable Google boundary stub as the auth spec: only the external
// `google-auth-library` is faked; the app runs for real. This lets the spec
// prove that no Google token can ever reach a dev identity.
const googleAuthMock = vi.hoisted(() => {
  const state: { payload: GoogleIdTokenPayload | null } = { payload: null };
  return {
    reset(): void {
      state.payload = null;
    },
    setPayload(payload: GoogleIdTokenPayload): void {
      state.payload = payload;
    },
    factory: {
      OAuth2Client: class FakeOAuth2Client {
        verifyIdToken(opts: {
          idToken: string;
          audience?: string | string[];
        }): Promise<{ getPayload: () => GoogleIdTokenPayload | null }> {
          if (!state.payload) {
            return Promise.reject(new Error('no payload configured for test'));
          }
          const accepted = Array.isArray(opts.audience)
            ? opts.audience
            : opts.audience
              ? [opts.audience]
              : [];
          if (!accepted.includes(state.payload.aud)) {
            return Promise.reject(new Error('audience mismatch'));
          }
          return Promise.resolve({ getPayload: () => state.payload });
        }
      },
    },
  };
});

vi.mock('google-auth-library', () => googleAuthMock.factory);

// Spec of the development-only login seam (DEV_AUTH_ENABLED): the Web
// front-end must be able to develop against the REAL API without a social
// login. The route is a fixed local identity and reuses the same identity
// resolver + session issuance as every other provider, so its session is
// indistinguishable from a Google session. Everything is driven through the
// HTTP seam against the real app and real Postgres.

async function cleanUsers(): Promise<void> {
  const db = testDb();
  try {
    await db.raw('TRUNCATE TABLE users CASCADE');
  } finally {
    await db.destroy();
  }
}

afterEach(cleanUsers);

beforeEach(() => {
  googleAuthMock.reset();
});

describe('Development-only login (POST /auth/login/dev)', () => {
  it('returns 200 AUTHENTICATED with the same session envelope as Google login', async () => {
    const app = await startTestApp({ devAuthEnabled: true });
    try {
      const res = await request(app.server).post('/auth/login/dev');

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('AUTHENTICATED');
      expect(Object.keys(res.body).sort()).toEqual(['code', 'data']);

      const data = res.body.data;
      expect(Object.keys(data).sort()).toEqual([
        'accessToken',
        'expiresIn',
        'refreshToken',
        'tokenType',
        'user',
      ]);
      expect(Object.keys(data.user).sort()).toEqual(['displayName', 'id']);
      expect(data.user.displayName).toBe('Dev User');
      expect(typeof data.user.id).toBe('string');
      expect(data.user.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      expect(typeof data.accessToken).toBe('string');
      expect(data.accessToken.length).toBeGreaterThan(0);
      expect(data.tokenType).toBe('Bearer');
      expect(data.expiresIn).toBe(900);

      expect(typeof data.refreshToken).toBe('string');
      expect(data.refreshToken).toMatch(/^[0-9a-f]{64}$/);
      expect(data.refreshToken).not.toBe(data.accessToken);
    } finally {
      await app.stop();
    }
  });

  it('issues a real session: the access token authenticates GET /me through the standard Bearer guard', async () => {
    const app = await startTestApp({ devAuthEnabled: true });
    try {
      const login = await request(app.server).post('/auth/login/dev');
      const me = await request(app.server)
        .get('/me')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`);

      expect(me.status).toBe(200);
      expect(me.body.code).toBe('OK');
      expect(me.body.data.id).toBe(login.body.data.user.id);
      expect(me.body.data.displayName).toBe('Dev User');
    } finally {
      await app.stop();
    }
  });

  it('maps each persona to its own distinct User, with the persona display name', async () => {
    const app = await startTestApp({ devAuthEnabled: true });
    try {
      const alice = await request(app.server).post('/auth/login/dev').send({ persona: 'alice' });
      const aliceId = alice.body.data.user.id;
      const bob = await request(app.server).post('/auth/login/dev').send({ persona: 'bob' });
      const aliceAgain = await request(app.server)
        .post('/auth/login/dev')
        .send({ persona: 'alice' });

      expect(alice.status).toBe(200);
      expect(alice.body.data.user.displayName).toBe('Alice');
      expect(bob.status).toBe(200);
      expect(bob.body.data.user.displayName).toBe('Bob');
      expect(aliceId).not.toBe(bob.body.data.user.id);
      expect(aliceAgain.body.data.user.id).toBe(aliceId);
    } finally {
      await app.stop();
    }
  });

  it('is idempotent: the same persona logs into the same User, across an app restart', async () => {
    const first = await startTestApp({ devAuthEnabled: true });
    let firstId: string;
    try {
      const login = await request(first.server).post('/auth/login/dev').send({ persona: 'alice' });
      firstId = login.body.data.user.id;
    } finally {
      await first.stop();
    }

    const second = await startTestApp({ devAuthEnabled: true });
    try {
      const again = await request(second.server).post('/auth/login/dev').send({ persona: 'alice' });
      expect(again.body.data.user.id).toBe(firstId);
    } finally {
      await second.stop();
    }
  });

  it('rejects an unknown persona with 400 INVALID_DEV_PERSONA (locale-neutral)', async () => {
    const app = await startTestApp({ devAuthEnabled: true });
    try {
      const res = await request(app.server).post('/auth/login/dev').send({ persona: 'mallory' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ code: 'INVALID_DEV_PERSONA', data: {} });
    } finally {
      await app.stop();
    }
  });

  it('keeps dev Users unreachable from the Google login path: no email to auto-link, no id collision', async () => {
    const app = await startTestApp({ devAuthEnabled: true });
    try {
      const devLoginRes = await request(app.server)
        .post('/auth/login/dev')
        .send({ persona: 'alice' });
      const devId = devLoginRes.body.data.user.id;

      // A Google account whose email matches the persona's would auto-link
      // if the dev identity had stored an email (ADR-0003).
      googleAuthMock.setPayload({
        aud: TEST_GOOGLE_CLIENT_ID,
        sub: 'google-alice',
        name: 'Alice Collector',
        email: 'alice@example.com',
        email_verified: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const googleByEmail = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub-google-id-token' });
      expect(googleByEmail.status).toBe(200);
      expect(googleByEmail.body.data.user.id).not.toBe(devId);

      // Even a Google subject that collides with the persona's provider id
      // resolves under the `google` provider, never the dev one.
      googleAuthMock.setPayload({
        aud: TEST_GOOGLE_CLIENT_ID,
        sub: 'alice',
        name: 'Somebody Else',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const googleBySub = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub-google-id-token' });
      expect(googleBySub.status).toBe(200);
      expect(googleBySub.body.data.user.id).not.toBe(devId);

      // The dev User is unchanged and still reachable only via its own token.
      const me = await request(app.server)
        .get('/me')
        .set('Authorization', `Bearer ${devLoginRes.body.data.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.data.id).toBe(devId);
      expect(me.body.data.displayName).toBe('Alice');
    } finally {
      await app.stop();
    }
  });

  it('does not expose the route at all when dev auth is disabled (fail-closed 404, not 401)', async () => {
    const app = await startTestApp({ devAuthEnabled: false });
    try {
      const res = await request(app.server).post('/auth/login/dev');

      expect(res.status).toBe(404);
      expect(res.body.code).toBeUndefined();
      expect(res.body.data).toBeUndefined();
    } finally {
      await app.stop();
    }
  });
});

describe('Development auth configuration (fail-closed)', () => {
  it('refuses to enable dev auth when NODE_ENV is production', () => {
    expect(() =>
      configFromEnv({ NODE_ENV: 'production', DEV_AUTH_ENABLED: 'true' }),
    ).toThrow('DEV_AUTH_ENABLED must never be enabled in production');
  });

  it('keeps dev auth off in production when the flag is unset (no throw)', () => {
    const config = configFromEnv({ NODE_ENV: 'production' });
    expect(config.devAuth.enabled).toBe(false);
  });
});
