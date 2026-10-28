import jwt from 'jsonwebtoken';
import type { AuthConfig } from '../config';

/**
 * Access-token issuing/verification (ADR-0011): short-lived HS256 JWTs whose
 * only claim is `{sub: <user id>}` — the token identifies the User, nothing
 * else. Refresh-token exchange arrives with issue 04.
 */
export function signAccessToken(auth: AuthConfig, userId: string): string {
  return jwt.sign({ sub: userId }, auth.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: auth.accessTokenTtlSeconds,
  });
}

/** Verifies signature + expiry; returns the user id, or null for any bad token. */
export function verifyAccessToken(auth: AuthConfig, token: string): string | null {
  try {
    const payload = jwt.verify(token, auth.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') return null;
    return payload.sub;
  } catch {
    return null;
  }
}
