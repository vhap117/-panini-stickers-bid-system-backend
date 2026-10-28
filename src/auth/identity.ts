import crypto from 'node:crypto';
import type { Knex } from 'knex';
import type { AuthConfig } from '../config';
import { signAccessToken } from './tokens';

/** Locale-neutral login payload (ADR-0014): codes + data, never prose. */
export interface LoginSession {
  user: { id: string; displayName: string };
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken: string;
}

/** What a link-strategy verify callback resolves to: the linked User's id. */
export interface LinkResult {
  userId: string;
}

export interface UserRow {
  id: string;
  display_name: string;
}

/**
 * The provider-agnostic shape of a verified OAuth profile: exactly what the
 * identity resolver needs, nothing provider-specific (ADR-0003 — a provider
 * identity is a credential attached to one User).
 */
export interface ProviderProfile {
  provider: string;
  /** The provider's own id for this person. */
  id: string;
  displayName: string;
  /** Instagram doesn't always expose email (ADR-0003) — null then. */
  email: string | null;
}

/** Emails are matched and stored normalized: trimmed and lowercased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resolves a verified provider profile to one User (ADR-0003). Shared by
 * every provider's login verify callback — the same identity rules for all
 * providers:
 *
 * 1. An identity row for (provider, provider_user_id) already exists → its
 *    User (repeat logins are idempotent; the unique constraint is the race
 *    arbiter).
 * 2. No identity row, but the profile's email matches an existing identity
 *    of ANY provider → the new identity row is attached to that identity's
 *    User (auto-link: switching login methods must not fragment a User's
 *    identity as a trader). NO silent merge when emails don't match.
 * 3. Otherwise a new User is created with its identity row (first login).
 */
export async function resolveUserForLogin(db: Knex, profile: ProviderProfile): Promise<UserRow> {
  const email = profile.email ? normalizeEmail(profile.email) : null;

  const existingIdentity = await db('user_identities')
    .where({ provider: profile.provider, provider_user_id: profile.id })
    .first();
  if (existingIdentity) {
    return userOf(db, existingIdentity.user_id);
  }

  // Auto-link by email (ADR-0003). The (provider, provider_user_id) unique
  // constraint is the race arbiter: a concurrent login that inserted the
  // same identity first wins, and the re-read below resolves to its User.
  if (email) {
    const matchedIdentity = await db('user_identities').where({ email }).first();
    if (matchedIdentity) {
      try {
        await db('user_identities').insert({
          user_id: matchedIdentity.user_id,
          provider: profile.provider,
          provider_user_id: profile.id,
          email,
        });
        return userOf(db, matchedIdentity.user_id);
      } catch (err) {
        const winner = await db('user_identities')
          .where({ provider: profile.provider, provider_user_id: profile.id })
          .first();
        if (winner) return userOf(db, winner.user_id);
        throw err;
      }
    }
  }

  try {
    return await db.transaction(async (trx) => {
      const [user] = await trx('users')
        .insert({ display_name: profile.displayName || 'Collector' })
        .returning('*');
      await trx('user_identities').insert({
        user_id: user.id,
        provider: profile.provider,
        provider_user_id: profile.id,
        email,
      });
      return user;
    });
  } catch (err) {
    // A concurrent first login won the unique race; its rows are authoritative.
    const identity = await db('user_identities')
      .where({ provider: profile.provider, provider_user_id: profile.id })
      .first();
    if (!identity) throw err;
    return userOf(db, identity.user_id);
  }
}

async function userOf(db: Knex, userId: string): Promise<UserRow> {
  const user = await db('users').where({ id: userId }).first();
  if (!user) throw new Error('identity references a missing user');
  return user;
}

/**
 * Issues the JWT session (ADR-0011): an opaque refresh token persisted for
 * exchange/revocation (issue 04) plus a short-lived HS256 access token whose
 * only claim is {sub: user id}.
 */
export async function issueSession(
  db: Knex,
  auth: AuthConfig,
  user: UserRow,
): Promise<LoginSession> {
  // Opaque refresh token (ADR-0011); exchange/revocation arrives with issue 04.
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
  await db('refresh_tokens').insert({ user_id: user.id, token: refreshToken, expires_at: expiresAt });

  // Short-lived signed access token (ADR-0011): HS256, {sub: user id}.
  const accessToken = signAccessToken(auth, user.id);

  return {
    user: { id: user.id, displayName: user.display_name },
    accessToken,
    tokenType: 'Bearer',
    expiresIn: auth.accessTokenTtlSeconds,
    refreshToken,
  };
}
