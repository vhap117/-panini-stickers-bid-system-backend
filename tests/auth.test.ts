import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import {
  startTestApp,
  testDb,
  TEST_GOOGLE_CLIENT_ID,
  TEST_GOOGLE_IOS_CLIENT_ID,
  TEST_GOOGLE_ANDROID_CLIENT_ID,
  TEST_GOOGLE_OTHER_CLIENT_ID,
  TEST_JWT_SECRET,
} from './harness';
import {
  type GoogleIdTokenPayload,
  type GoogleVerifyCall,
} from './oauth-stubs';
import type { RunningApp } from '../src/server';
import type { AuthConfig } from '../src/config';

// Replace `google-auth-library` with a controllable fake. The state AND the
// fake OAuth2Client class are both inside vi.hoisted — vitest hoists the
// vi.mock factory's closure too, so the factory may not reference top-level
// imports; only vi.hoisted values are guaranteed to be ready when the
// mocked module is first imported.
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
          // Simulate google-auth-library's audience enforcement: a real
          // verifyIdToken throws if payload.aud is not in the audience list.
          const accepted = Array.isArray(opts.audience)
            ? opts.audience
            : opts.audience
              ? [opts.audience]
              : [];
          if (!accepted.includes(state.payload.aud)) {
            return Promise.reject(
              new Error(
                `audience mismatch: ${state.payload.aud} not in [${accepted.join(', ')}]`,
              ),
            );
          }
          return Promise.resolve({ getPayload: () => state.payload });
        }
      },
    },
  };
});

vi.mock('google-auth-library', () => googleAuthMock.factory);

// Spec of the auth seam (ADR-0016): a real Google login through the real app
// and real Postgres — the client POSTs Google's OIDC ID token and the backend
// verifies it server-side. Only `google-auth-library` is stubbed — a fake
// `OAuth2Client` whose `verifyIdToken` returns whatever payload the test set.

const GOOGLE_SUB = 'google-user-123';
const GOOGLE_NAME = 'Alice Collector';
const GOOGLE_EMAIL = 'alice@example.com';

/** A JWT payload Google would serve for one of OUR valid ID tokens. */
function googlePayload(overrides: Partial<GoogleIdTokenPayload> = {}): GoogleIdTokenPayload {
  return {
    aud: TEST_GOOGLE_CLIENT_ID,
    sub: GOOGLE_SUB,
    name: GOOGLE_NAME,
    email: GOOGLE_EMAIL,
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'accounts.google.com',
    ...overrides,
  };
}

/** Boots the real app with the OAuth2Client mock returning the given payload. */
async function startAppWithVerifier(
  payload: GoogleIdTokenPayload = googlePayload(),
  extraAuth: Partial<Pick<AuthConfig, 'googleIosClientId' | 'googleAndroidClientId'>> = {},
): Promise<{ app: RunningApp }> {
  googleAuthMock.setPayload(payload);
  const app = await startTestApp({ auth: extraAuth });
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

describe('Google ID-token login → JWT session (auth seam, ADR-0016)', () => {
  beforeEach(() => {
    googleAuthMock.reset();
  });
  afterEach(cleanUsers);
  afterEach(() => {
    googleAuthMock.reset();
  });

  it('verifies a valid ID token: 200 AUTHENTICATED with access + refresh tokens, exactly one User and one identity row', async () => {
    const { app } = await startAppWithVerifier();
    try {
      const res = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub-google-id-token' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('AUTHENTICATED');
      const data = res.body.data;
      expect(data.user.displayName).toBe(GOOGLE_NAME);
      expect(typeof data.user.id).toBe('string');
      expect(data.user.id.length).toBeGreaterThan(0);
      expect(data.tokenType).toBe('Bearer');
      expect(typeof data.accessToken).toBe('string');
      expect(data.accessToken.length).toBeGreaterThan(0);
      expect(typeof data.refreshToken).toBe('string');
      expect(data.refreshToken.length).toBeGreaterThan(0);
      expect(data.refreshToken).not.toBe(data.accessToken);

      // Database state: one User, one google identity (ADR-0003).
      const db = testDb();
      try {
        const users = await db('users').select('*');
        const identities = await db('user_identities').select('*');
        expect(users).toHaveLength(1);
        expect(users[0].display_name).toBe(GOOGLE_NAME);
        expect(identities).toHaveLength(1);
        expect(identities[0].user_id).toBe(users[0].id);
        expect(identities[0].provider).toBe('google');
        expect(identities[0].provider_user_id).toBe(GOOGLE_SUB);
        expect(identities[0].email).toBe(GOOGLE_EMAIL);
        expect(data.user.id).toBe(users[0].id);
      } finally {
        await db.destroy();
      }
    } finally {
      await app.stop();
    }
  });

  it('a repeat login with the same Google identity resolves to the same User — no duplicates', async () => {
    const { app } = await startAppWithVerifier();
    try {
      const first = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });
      const second = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.data.user.id).toBe(first.body.data.user.id);

      const db = testDb();
      try {
        const users = await db('users').select('*');
        const identities = await db('user_identities').select('*');
        expect(users).toHaveLength(1);
        expect(identities).toHaveLength(1);
        // Each login issues its own refresh token.
        const refreshTokens = await db('refresh_tokens').select('*');
        expect(refreshTokens).toHaveLength(2);
        expect(refreshTokens.every((t) => t.user_id === users[0].id)).toBe(true);
      } finally {
        await db.destroy();
      }
    } finally {
      await app.stop();
    }
  });

  it('rejects when verifyIdToken throws (bad signature / expired / network) with a locale-neutral 401 AUTH_FAILED', async () => {
    const { app } = await startAppWithVerifier();
    try {
      googleAuthMock.setError(new Error('invalid signature'));
      const res = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'AUTH_FAILED', data: {} });
      expect(JSON.stringify(res.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose
    } finally {
      await app.stop();
    }
  });

  it('rejects an ID token minted for a DIFFERENT OAuth client (aud mismatch) with the same 401 AUTH_FAILED', async () => {
    const { app } = await startAppWithVerifier(
      googlePayload({ aud: TEST_GOOGLE_OTHER_CLIENT_ID }),
    );
    try {
      const res = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'AUTH_FAILED', data: {} });
    } finally {
      await app.stop();
    }
  });

  it('rejects a missing or non-string idToken with the same locale-neutral 401 AUTH_FAILED', async () => {
    const { app } = await startAppWithVerifier();
    try {
      const missing = await request(app.server).post('/auth/login/google').send({});
      expect(missing.status).toBe(401);
      expect(missing.body).toEqual({ code: 'AUTH_FAILED', data: {} });

      const nonString = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 12345 });
      expect(nonString.status).toBe(401);
      expect(nonString.body).toEqual({ code: 'AUTH_FAILED', data: {} });

      const empty = await request(app.server).post('/auth/login/google').send();
      expect(empty.status).toBe(401);
      expect(empty.body).toEqual({ code: 'AUTH_FAILED', data: {} });
    } finally {
      await app.stop();
    }
  });

  it('auto-links by email (ADR-0003): a new Google identity whose verified email matches an existing identity email resolves to the same User', async () => {
    const sharedEmail = 'shared@example.com';
    const { app } = await startAppWithVerifier(
      googlePayload({ sub: 'g-first', name: 'First Collector', email: sharedEmail }),
    );
    try {
      const first = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });
      googleAuthMock.setPayload(
        googlePayload({ sub: 'g-second', name: 'Second Collector', email: sharedEmail }),
      );
      const second = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.data.user.id).toBe(first.body.data.user.id);

      const db = testDb();
      try {
        const users = await db('users').select('*');
        const identities = await db('user_identities').select('*');
        expect(users).toHaveLength(1);
        expect(identities).toHaveLength(2);
        expect(identities.every((i) => i.user_id === users[0].id)).toBe(true);
        expect(identities.map((i) => i.provider_user_id).sort()).toEqual(['g-first', 'g-second']);
        expect(identities.every((i) => i.email === sharedEmail)).toBe(true);
      } finally {
        await db.destroy();
      }
    } finally {
      await app.stop();
    }
  });

  it('auto-link matches emails case-insensitively: the email is normalized (trimmed, lowercased) when stored and when matched', async () => {
    const { app } = await startAppWithVerifier(
      googlePayload({ sub: 'g-mixed-case', name: 'Mixed Case', email: '  Alice@Example.COM ' }),
    );
    try {
      const first = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });
      googleAuthMock.setPayload(
        googlePayload({ sub: 'g-lower', name: 'Lower Case', email: 'alice@example.com' }),
      );
      const second = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.data.user.id).toBe(first.body.data.user.id);

      const db = testDb();
      try {
        const identities = await db('user_identities').select('*');
        expect(identities).toHaveLength(2);
        // Stored normalized, never as the provider sent it.
        expect(identities.every((i) => i.email === 'alice@example.com')).toBe(true);
      } finally {
        await db.destroy();
      }
    } finally {
      await app.stop();
    }
  });

  it('does NOT silently merge when emails do not match: two different emails leave two separate Users, one identity each (ADR-0003)', async () => {
    const { app } = await startAppWithVerifier(
      googlePayload({ sub: 'g-alice', name: 'Alice G', email: 'alice@example.com' }),
    );
    try {
      const first = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });
      googleAuthMock.setPayload(
        googlePayload({ sub: 'g-bob', name: 'Bob G', email: 'bob@example.com' }),
      );
      const second = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.data.user.id).not.toBe(first.body.data.user.id);

      const db = testDb();
      try {
        const users = await db('users').select('*');
        const identities = await db('user_identities').select('*');
        expect(users).toHaveLength(2);
        expect(identities).toHaveLength(2);
        // Each identity belongs to exactly one of the two Users.
        const userIds = new Set(users.map((u) => u.id));
        expect(identities.every((i) => userIds.has(i.user_id))).toBe(true);
        expect(new Set(identities.map((i) => i.user_id)).size).toBe(2);
      } finally {
        await db.destroy();
      }
    } finally {
      await app.stop();
    }
  });

  it('an UNVERIFIED email never auto-links: the login still succeeds but as a separate User, and the identity row stores a null email', async () => {
    const { app } = await startAppWithVerifier(
      googlePayload({ sub: 'g-verified', name: 'Verified Holder', email: 'holder@example.com' }),
    );
    try {
      const first = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });
      // Same address, but Google has NOT verified it for this account.
      googleAuthMock.setPayload(
        googlePayload({
          sub: 'g-unverified',
          name: 'Unverified User',
          email: 'holder@example.com',
          email_verified: false,
        }),
      );
      const second = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      // No auto-link: the unverified email is not trusted as a match.
      expect(second.body.data.user.id).not.toBe(first.body.data.user.id);

      const db = testDb();
      try {
        const users = await db('users').select('*');
        const identities = await db('user_identities').select('*');
        expect(users).toHaveLength(2);
        expect(identities).toHaveLength(2);
        const unverified = identities.find((i) => i.provider_user_id === 'g-unverified');
        expect(unverified).toBeTruthy();
        expect(unverified.email).toBeNull();
      } finally {
        await db.destroy();
      }
    } finally {
      await app.stop();
    }
  });

  it('a payload with no email at all registers a separate User whose identity row stores a null email', async () => {
    const { app } = await startAppWithVerifier(
      googlePayload({ sub: 'g-email-holder', name: 'Email Holder', email: 'holder@example.com' }),
    );
    try {
      const first = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });
      googleAuthMock.setPayload(
        googlePayload({ sub: 'g-no-email', name: 'No Email', email: undefined }),
      );
      const second = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.data.user.id).not.toBe(first.body.data.user.id);

      const db = testDb();
      try {
        const users = await db('users').select('*');
        const identities = await db('user_identities').select('*');
        expect(users).toHaveLength(2);
        expect(identities).toHaveLength(2);
        const noEmail = identities.find((i) => i.provider_user_id === 'g-no-email');
        expect(noEmail).toBeTruthy();
        expect(noEmail.email).toBeNull();
      } finally {
        await db.destroy();
      }
    } finally {
      await app.stop();
    }
  });

  it('issues a short-lived HS256 access token ({sub: user id}) and a distinct persisted refresh token (ADR-0011)', async () => {
    const { app } = await startAppWithVerifier();
    try {
      const login = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });
      const data = login.body.data;

      // The harness knows the secret it handed to the app, so it can verify
      // the signature exactly like any party that holds the secret could.
      const decoded = jwt.verify(data.accessToken, TEST_JWT_SECRET, {
        algorithms: ['HS256'],
      });
      expect(typeof decoded).toBe('object');
      const payload = decoded as { sub: string; iat: number; exp: number };
      expect(payload.sub).toBe(data.user.id);
      expect(payload.exp - payload.iat).toBe(900); // configured 15-minute TTL
      expect(data.expiresIn).toBe(900);
      expect(data.tokenType).toBe('Bearer');

      // Refresh token: opaque, distinct from the access token, persisted.
      expect(data.refreshToken).not.toBe(data.accessToken);
      expect(data.refreshToken).toMatch(/^[0-9a-f]{64}$/);
      const db = testDb();
      try {
        const row = await db('refresh_tokens').where({ token: data.refreshToken }).first();
        expect(row).toBeTruthy();
        expect(row.user_id).toBe(data.user.id);
        expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now());
      } finally {
        await db.destroy();
      }
    } finally {
      await app.stop();
    }
  });

  it('GET /me with a valid access token returns the User profile', async () => {
    const { app } = await startAppWithVerifier();
    try {
      const login = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });
      const accessToken: string = login.body.data.accessToken;

      const res = await request(app.server)
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('OK');
      expect(res.body.data.id).toBe(login.body.data.user.id);
      expect(res.body.data.displayName).toBe(GOOGLE_NAME);
      // Location is null until the user sets it (issue 05).
      expect(res.body.data.location).toBeNull();
      expect(res.body.data.preferredLocale).toBe('en');
    } finally {
      await app.stop();
    }
  });

  it('rejects protected requests with a missing, invalid, or expired token using a locale-neutral 401 body', async () => {
    const { app } = await startAppWithVerifier();
    try {
      const login = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });
      const userId: string = login.body.data.user.id;

      // Missing Authorization header entirely.
      const missing = await request(app.server).get('/me');
      expect(missing.status).toBe(401);
      expect(missing.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });
      expect(JSON.stringify(missing.body)).not.toMatch(/[a-z] [a-z]+ [a-z]+/); // no prose

      // Wrong scheme.
      const wrongScheme = await request(app.server)
        .get('/me')
        .set('Authorization', `Basic ${login.body.data.accessToken}`);
      expect(wrongScheme.status).toBe(401);
      expect(wrongScheme.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });

      // Token signed with the wrong secret — a client cannot forge this.
      const forged = jwt.sign({ sub: userId }, 'not-the-test-secret', {
        algorithm: 'HS256',
        expiresIn: 900,
      });
      const invalid = await request(app.server)
        .get('/me')
        .set('Authorization', `Bearer ${forged}`);
      expect(invalid.status).toBe(401);
      expect(invalid.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });

      // Expired but correctly signed token (short TTL per ADR-0011).
      const expired = jwt.sign({ sub: userId }, TEST_JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: -60,
      });
      const stale = await request(app.server)
        .get('/me')
        .set('Authorization', `Bearer ${expired}`);
      expect(stale.status).toBe(401);
      expect(stale.body).toEqual({ code: 'UNAUTHENTICATED', data: {} });
    } finally {
      await app.stop();
    }
  });
});

describe('Multi-platform audience (Capacitor native login on iOS / Android / Web)', () => {
  beforeEach(() => {
    googleAuthMock.reset();
  });
  afterEach(cleanUsers);
  afterEach(() => {
    googleAuthMock.reset();
  });

  it('accepts a token whose aud is the configured iOS OAuth client id (Capacitor iOS native sign-in)', async () => {
    const { app } = await startAppWithVerifier(
      googlePayload({ aud: TEST_GOOGLE_IOS_CLIENT_ID }),
      { googleIosClientId: TEST_GOOGLE_IOS_CLIENT_ID },
    );
    try {
      const res = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub-ios' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('AUTHENTICATED');

      // The verifier was called with an array that includes the iOS client id,
      // alongside the Web client id (and any Android id if configured).
      const calls = googleAuthMock.calls();
      expect(calls).toHaveLength(1);
      const audience = calls[0].audience;
      expect(Array.isArray(audience)).toBe(true);
      expect(audience).toContain(TEST_GOOGLE_CLIENT_ID);
      expect(audience).toContain(TEST_GOOGLE_IOS_CLIENT_ID);
    } finally {
      await app.stop();
    }
  });

  it('accepts a token whose aud is the configured Android OAuth client id (Capacitor Android native sign-in)', async () => {
    const { app } = await startAppWithVerifier(
      googlePayload({ aud: TEST_GOOGLE_ANDROID_CLIENT_ID }),
      { googleAndroidClientId: TEST_GOOGLE_ANDROID_CLIENT_ID },
    );
    try {
      const res = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub-android' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('AUTHENTICATED');

      const calls = googleAuthMock.calls();
      expect(calls).toHaveLength(1);
      const audience = calls[0].audience;
      expect(Array.isArray(audience)).toBe(true);
      expect(audience).toContain(TEST_GOOGLE_CLIENT_ID);
      expect(audience).toContain(TEST_GOOGLE_ANDROID_CLIENT_ID);
    } finally {
      await app.stop();
    }
  });

  it('rejects a token whose aud is none of the configured client ids — audience list does not silently widen', async () => {
    // A token minted for some other OAuth client entirely: must be rejected
    // even when iOS + Android audiences are configured.
    const { app } = await startAppWithVerifier(
      googlePayload({ aud: TEST_GOOGLE_OTHER_CLIENT_ID }),
      {
        googleIosClientId: TEST_GOOGLE_IOS_CLIENT_ID,
        googleAndroidClientId: TEST_GOOGLE_ANDROID_CLIENT_ID,
      },
    );
    try {
      const res = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub-unknown-aud' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'AUTH_FAILED', data: {} });
    } finally {
      await app.stop();
    }
  });

  it('email_verified still gates trust: an unverified email does not auto-link after the verifier change', async () => {
    // First login: verified email seeds a User + identity.
    const { app } = await startAppWithVerifier(
      googlePayload({ sub: 'g-verified', name: 'Verified', email: 'shared@example.com' }),
    );
    try {
      const first = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });
      expect(first.status).toBe(200);

      // Second login: same address but Google has not verified it. Despite
      // the verifier change (tokeninfo strings → google-auth-library payload
      // with a real boolean email_verified), the identity row stores null and
      // no auto-link fires.
      googleAuthMock.setPayload(
        googlePayload({
          sub: 'g-unverified',
          name: 'Unverified',
          email: 'shared@example.com',
          email_verified: false,
        }),
      );
      const second = await request(app.server)
        .post('/auth/login/google')
        .send({ idToken: 'stub' });

      expect(second.status).toBe(200);
      expect(second.body.data.user.id).not.toBe(first.body.data.user.id);

      const db = testDb();
      try {
        const unverified = await db('user_identities')
          .where({ provider_user_id: 'g-unverified' })
          .first();
        expect(unverified).toBeTruthy();
        expect(unverified.email).toBeNull();
      } finally {
        await db.destroy();
      }
    } finally {
      await app.stop();
    }
  });
});