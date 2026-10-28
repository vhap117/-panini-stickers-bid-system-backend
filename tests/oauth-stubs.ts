import request from 'supertest';
import type { RunningApp } from '../src/server';

/**
 * Shared types + a tiny helper used by each test file's `google-auth-library`
 * mock (ADR-0016). The mock state itself — including the fake OAuth2Client
 * class — is hoisted in each test file (see the per-file `vi.hoisted(...)`
 * blocks) because vi.hoisted values cannot be exported across files AND
 * vi.mock factories may not reference top-level imports (vitest hoists
 * the factory's closure too).
 */

export interface GoogleIdTokenPayload {
  /** OAuth client the token was issued for — what `verifyIdToken` checks against `audience`. */
  aud: string;
  /** Stable Google account id — the identity's provider_user_id (ADR-0003). */
  sub: string;
  email?: string;
  /** True only when Google has verified the email; gates trust in `identity.ts`. */
  email_verified?: boolean | string;
  name?: string;
  /** Seconds since epoch — google-auth-library returns this as a number from the payload. */
  exp?: number;
  iss?: string;
}

/** What the production code passed to `verifyIdToken`. */
export interface GoogleVerifyCall {
  idToken: string;
  audience?: string | string[];
}

/**
 * One login step against the real app, exactly as the Capacitor client
 * performs it (ADR-0016): POST Google's OIDC ID token. The OAuth2Client
 * mock (configured separately via the per-file mock's setPayload / setError)
 * decides what the backend sees.
 */
export function loginViaGoogle(app: RunningApp, idToken = 'stub-google-id-token') {
  return request(app.server).post('/auth/login/google').send({ idToken });
}