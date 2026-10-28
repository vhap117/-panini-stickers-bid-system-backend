import { OAuth2Client } from 'google-auth-library';
import type { AuthConfig } from '../config';
import type { ProviderProfile } from './identity';

/**
 * Server-side Google OIDC ID-token verification (ADR-0016): the client
 * (Capacitor app) logs in natively via @capgo/capacitor-social-login and
 * POSTs Google's ID token; the backend verifies it server-side using
 * `google-auth-library`'s `OAuth2Client.verifyIdToken`, which fetches
 * Google's signing keys and validates the JWT signature, issuer, expiry,
 * and audience locally — no authorization-code round-trip, no client
 * secret, no browser redirect anywhere in the flow.
 *
 * Audience accepts every OAuth client the app can be signed in with: the
 * Web client (always) and optionally the iOS and Android clients (when set
 * via `GOOGLE_IOS_CLIENT_ID` / `GOOGLE_ANDROID_CLIENT_ID`). Each platform
 * mints tokens whose `aud` is the OAuth client id Google issued for THAT
 * platform — they are distinct values in one Cloud project — so the
 * audience list is the union of those.
 */

export async function verifyGoogleIdToken(
  idToken: string,
  auth: AuthConfig,
): Promise<ProviderProfile | null> {
  const audience = [
    auth.googleClientId,
    auth.googleIosClientId,
    auth.googleAndroidClientId,
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (audience.length === 0) return null;

  const client = new OAuth2Client();

  let ticket;
  try {
    ticket = await client.verifyIdToken({ idToken, audience });
  } catch {
    // Any verification failure — bad signature, wrong audience, expired,
    // network error fetching Google's certs — is indistinguishable from
    // "no valid token" at the API boundary (ADR-0014 locale-neutral).
    return null;
  }

  const payload = ticket.getPayload();
  if (!payload) return null;

  // The Google account id is the identity's provider_user_id (ADR-0003).
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

  // Trust the email only when Google has verified it; otherwise null —
  // never an auto-linkable address. `email_verified` is a real boolean
  // from the JWT payload (verified locally; no tokeninfo string-vs-number
  // pitfall).
  const email =
    payload.email_verified === true && typeof payload.email === 'string'
      ? payload.email
      : null;

  return {
    provider: 'google',
    id: payload.sub,
    displayName: typeof payload.name === 'string' ? payload.name : '',
    email,
  };
}