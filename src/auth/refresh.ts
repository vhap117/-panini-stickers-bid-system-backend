import type { Knex } from 'knex';
import type { AuthConfig } from '../config';
import { signAccessToken } from './tokens';

/**
 * Session continuation (ADR-0011): exchanging an opaque refresh token for
 * a fresh short-lived access token, and revoking a refresh token. The
 * refresh_tokens table is the ONLY server-side session state.
 */

/** Locale-neutral refresh payload (ADR-0014): the login payload minus the
 * user object — the client already knows the user. */
export interface RefreshedSession {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

/**
 * Exchanges a refresh token for a new short-lived access token (ADR-0011).
 * The refresh token is NOT rotated — the same token keeps minting access
 * tokens until it expires or is revoked. A token is valid only while its
 * row exists (unknown/revoked → row gone) AND its TTL is still running;
 * anything else is indistinguishable from no session.
 */
export async function exchangeRefreshToken(
  db: Knex,
  auth: AuthConfig,
  refreshToken: string,
): Promise<RefreshedSession | null> {
  const row = await db('refresh_tokens')
    .where({ token: refreshToken })
    .andWhere('expires_at', '>', db.fn.now())
    .first();
  if (!row) return null;
  return {
    accessToken: signAccessToken(auth, row.user_id),
    tokenType: 'Bearer',
    expiresIn: auth.accessTokenTtlSeconds,
  };
}

/**
 * Revokes a refresh token (ADR-0011): deletes its row so it can no longer
 * mint access tokens — this deletion is the whole of logout on the server
 * side; the client discards its access token on its own. Idempotent by
 * nature: an unknown or already-revoked token is a no-op, not an error.
 */
export async function revokeRefreshToken(db: Knex, refreshToken: string): Promise<void> {
  await db('refresh_tokens').where({ token: refreshToken }).del();
}
