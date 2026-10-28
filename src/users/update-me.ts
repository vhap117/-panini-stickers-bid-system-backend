import type { Knex } from 'knex';

/**
 * User self-service details (issue 05): the authenticated User updates
 * their own location (persisted as a PostGIS geography point, ADR-0007)
 * and preferred locale. All validation errors are locale-neutral
 * (ADR-0014): codes plus data, never prose.
 */

/** The User's location in decimal degrees, as it travels on the wire. */
export interface UserLocation {
  latitude: number;
  longitude: number;
}

/**
 * Parses the WKT point PostGIS returns (`POINT(lng lat)`) back into the
 * wire shape `{latitude, longitude}`; null stays null.
 */
export function locationFromWkt(wkt: unknown): UserLocation | null {
  if (typeof wkt !== 'string') return null;
  const match = wkt.match(/^POINT\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)$/);
  if (!match) return null;
  return { longitude: Number(match[1]), latitude: Number(match[2]) };
}

/** A location is valid only as a plain object with finite in-range coords. */
function parseLocation(value: unknown): UserLocation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { latitude, longitude } = value as Record<string, unknown>;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude)) return null;
  if (typeof longitude !== 'number' || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

/**
 * Validates and persists the PATCH /me body. Returns a locale-neutral
 * error code (ADR-0014) when any provided field is malformed — validation
 * happens entirely BEFORE the update, so an invalid field persists
 * nothing. Absent fields are ignored (partial-update semantics).
 */
export async function updateUserDetails(
  db: Knex,
  userId: string,
  body: Record<string, unknown>,
): Promise<'INVALID_LOCATION' | 'UNSUPPORTED_LOCALE' | null> {
  const updates: Record<string, unknown> = {};

  if ('location' in body) {
    const location = parseLocation(body.location);
    if (!location) return 'INVALID_LOCATION';
    // ST_MakePoint takes (longitude, latitude) order; ::geography makes it
    // the geo-ranked feed's ranking point (ADR-0007).
    updates.location = db.raw(
      'ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography',
      [location.longitude, location.latitude],
    );
  }

  if ('preferredLocale' in body) {
    // Case-sensitive: exactly 'en' or 'es' — anything else is unsupported.
    const preferredLocale = body.preferredLocale;
    if (preferredLocale !== 'en' && preferredLocale !== 'es') {
      return 'UNSUPPORTED_LOCALE';
    }
    updates.preferred_locale = preferredLocale;
  }

  if (Object.keys(updates).length > 0) {
    await db('users').where({ id: userId }).update(updates);
  }
  return null;
}
