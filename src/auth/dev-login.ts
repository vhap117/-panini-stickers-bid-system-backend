import type { Knex } from 'knex';
import type { AuthConfig } from '../config';
import {
  issueSession,
  resolveUserForLogin,
  type LoginSession,
  type ProviderProfile,
} from './identity';

/**
 * Development-only login identities (ADR-0017). Each persona is a fixed,
 * local provider identity so the Web front-end can develop against the REAL
 * API without a social-login round trip. The `id` is stable, so the shared
 * identity resolver maps a persona to the same User on every login and across
 * restarts.
 */
export interface DevPersona {
  /** Stable provider id — the same User on every login/restart. */
  id: string;
  displayName: string;
}

export const DEV_PERSONAS = {
  dev: { id: 'dev', displayName: 'Dev User' },
  alice: { id: 'alice', displayName: 'Alice' },
  bob: { id: 'bob', displayName: 'Bob' },
} as const satisfies Record<string, DevPersona>;

export type DevPersonaName = keyof typeof DEV_PERSONAS;

/** Narrows an untrusted request-body value to a known persona name. */
export function isDevPersonaName(value: unknown): value is DevPersonaName {
  return typeof value === 'string' && Object.hasOwn(DEV_PERSONAS, value);
}

/**
 * Maps a persona name to the provider-agnostic profile the shared identity
 * resolver consumes. `email` is always null: a dev identity must never
 * auto-link to a real User via ADR-0003's email match (ADR-0017).
 */
export function devProviderProfile(persona: DevPersonaName): ProviderProfile {
  const entry = DEV_PERSONAS[persona];
  return {
    provider: 'dev',
    id: entry.id,
    displayName: entry.displayName,
    email: null,
  };
}

/** Resolves the persona to its User and issues the standard JWT session. */
export async function devLogin(
  db: Knex,
  auth: AuthConfig,
  persona: DevPersonaName,
): Promise<LoginSession> {
  const user = await resolveUserForLogin(db, devProviderProfile(persona));
  return issueSession(db, auth, user);
}
