import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import type { Knex } from 'knex';
import type { AuthConfig, DevAuthConfig, HttpConfig } from './config';
import { issueSession, resolveUserForLogin, type LoginSession } from './auth/identity';
import { verifyGoogleIdToken } from './auth/google-token';
import { devLogin, isDevPersonaName } from './auth/dev-login';
import { requireAccessToken, type AuthedRequest } from './auth/http-middleware';
import { exchangeRefreshToken, revokeRefreshToken } from './auth/refresh';
import { updateUserDetails, locationFromWkt } from './users/update-me';
import { listAlbums } from './catalog/list-albums';
import { createAlbum } from './catalog/create-album';
import { listStickers } from './catalog/list-stickers';
import { createSticker } from './catalog/create-sticker';
import { requestLog } from './request-log';

/**
 * HTTP surface. Wire format is locale-neutral: codes plus data, never prose
 * (ADR-0014) — all user-facing wording is rendered by the client.
 */

/**
 * The authenticated User's profile payload, shared by GET /me and
 * PATCH /me so both respond with the identical shape. The location is
 * fetched as WKT and serialized back to decimal degrees (ADR-0007); it is
 * null until the User sets it (issue 05).
 */
async function profileOf(db: Knex, userId: string): Promise<{
  id: string;
  displayName: string;
  location: { latitude: number; longitude: number } | null;
  preferredLocale: string;
} | null> {
  const user = await db('users')
    .where({ id: userId })
    .first('id', 'display_name', 'preferred_locale', db.raw('ST_AsText(location) as location_wkt'));
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.display_name,
    location: locationFromWkt(user.location_wkt),
    preferredLocale: user.preferred_locale,
  };
}

export function createApp(
  db: Knex,
  auth: AuthConfig,
  http: HttpConfig,
  devAuth: DevAuthConfig,
): Express {
  const app = express();

  // Request log first, before everything else, so ANY incoming request is
  // visible — preflights and 404s included. Silence in this log means the
  // client never reached the process (for the Android emulator that usually
  // means VITE_API_BASE_URL is not http://10.0.2.2:3000, the emulator's
  // name for the host loopback).
  app.use(requestLog);

  // CORS for browser clients (issue 23): an allowed Origin is echoed back so
  // the Ionic Vue front-end can call the API from its runtime origins; any
  // other Origin gets no CORS headers (browser-blocked). Requests without an
  // Origin header (non-browser clients) are untouched by the middleware.
  // Installed before the routes so every response can carry the headers.
  app.use(
    cors({
      origin: http.allowedOrigins,
      // Exactly what the front-end uses: JSON bodies + Bearer tokens over
      // the API's methods (issue 23). Keep this set tight — preflight
      // advertises it verbatim.
      methods: ['GET', 'POST', 'PATCH'],
      allowedHeaders: ['content-type', 'authorization'],
    }),
  );

  // JSON bodies for the token endpoints (login/refresh/logout); no other
  // route reads a body.
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    try {
      // Proves real database connectivity, not just process liveness.
      await db.raw('select 1');
      res.status(200).json({ code: 'OK', data: { database: 'UP' } });
    } catch {
      // The app tolerates the database being unavailable; it reports it
      // as a machine-readable code instead of crashing.
      res.status(503).json({ code: 'DB_UNAVAILABLE', data: { database: 'DOWN' } });
    }
  });

  // Google login (ADR-0016): the Capacitor app logs in natively
  // (@capgo/capacitor-social-login) and POSTs Google's OIDC ID token. The
  // backend verifies it server-side against Google's tokeninfo endpoint
  // (aud = our client, expiry, email_verified gate) and resolves the User
  // via the shared identity resolver (ADR-0003). Failure is uniform and
  // locale-neutral (ADR-0014): an unverifiable token is
  // indistinguishable from no token at all.
  app.post('/auth/login/google', async (req: Request, res: Response) => {
    const idToken = req.body?.idToken;
    // A missing/malformed body is indistinguishable from an invalid token —
    // reject before touching Google (ADR-0014 locale-neutral).
    const profile =
      typeof idToken === 'string' ? await verifyGoogleIdToken(idToken, auth) : null;
    if (!profile) {
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
      console.log('Profile Not Found');
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
      res.status(401).json({ code: 'AUTH_FAILED', data: {} });
      return;
    }
    try {
      const user = await resolveUserForLogin(db, profile);
      const session: LoginSession = await issueSession(db, auth, user);
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
      console.log('Auth Success');
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
      res.status(200).json({ code: 'AUTHENTICATED', data: session });
    } catch {
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
      console.log('Profile Found but Auth Failed');
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
      res.status(401).json({ code: 'AUTH_FAILED', data: {} });
    }
  });

  // Development-only login (ADR-0017): a fixed local identity issued through
  // the SAME identity resolver and session machinery as Google, so its
  // session is indistinguishable from a real one. The route only exists when
  // dev auth is enabled; the default is fail-closed (and production refuses
  // to boot with it on).
  if (devAuth.enabled) {
    app.post('/auth/login/dev', async (req: Request, res: Response) => {
      const requested = req.body?.persona;
      // Absent means the default persona; anything present but unknown is a
      // locale-neutral client error (ADR-0014), never a silent fallback.
      const persona =
        requested === undefined ? 'dev' : isDevPersonaName(requested) ? requested : null;
      if (!persona) {
        res.status(400).json({ code: 'INVALID_DEV_PERSONA', data: {} });
        return;
      }
      const session = await devLogin(db, auth, persona);
      res.status(200).json({ code: 'AUTHENTICATED', data: session });
    });
  }

  // Exchanges a valid refresh token for a new short-lived access token
  // (ADR-0011): the session-continuation path, so a User stays logged in
  // without re-authenticating. Unknown/revoked/expired tokens are
  // indistinguishable and rejected with a locale-neutral auth error.
  app.post('/auth/refresh', async (req: Request, res: Response) => {
    const refreshToken = req.body?.refreshToken;
    // A missing/malformed body is indistinguishable from no valid token —
    // reject before touching the session state (ADR-0014 locale-neutral).
    const session =
      typeof refreshToken === 'string' ? await exchangeRefreshToken(db, auth, refreshToken) : null;
    if (!session) {
      res.status(401).json({ code: 'UNAUTHENTICATED', data: {} });
      return;
    }
    res.status(200).json({ code: 'AUTHENTICATED', data: session });
  });

  // Revokes the refresh token (ADR-0011) so it can no longer mint access
  // tokens; the client discards its access token on its own. Idempotent by
  // nature: an unknown or already-revoked token is still a success. No
  // access token is required — a User must be able to log out even with an
  // expired access token.
  app.post('/auth/logout', async (req: Request, res: Response) => {
    const refreshToken = req.body?.refreshToken;
    if (typeof refreshToken === 'string') {
      await revokeRefreshToken(db, refreshToken);
    }
    res.status(200).json({ code: 'OK', data: {} });
  });

  // The authenticated User's own profile.
  app.get('/me', requireAccessToken(auth), async (req: AuthedRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHENTICATED', data: {} });
      return;
    }
    const profile = await profileOf(db, userId);
    if (!profile) {
      res.status(401).json({ code: 'UNAUTHENTICATED', data: {} });
      return;
    }
    res.status(200).json({ code: 'OK', data: profile });
  });

  // The catalog's Albums (issue 06), with display names resolved to the
  // authenticated User's preferred locale and canonical-name fallback
  // (ADR-0014). No query parameters yet — the whole catalog is small
  // (ADR-0004's curated seed plus user contributions). The response is
  // locale-neutral data; `displayName` is data, not prose.
  app.get('/albums', requireAccessToken(auth), async (req: AuthedRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHENTICATED', data: {} });
      return;
    }
    const user = await db('users').where({ id: userId }).first('preferred_locale');
    if (!user) {
      res.status(401).json({ code: 'UNAUTHENTICATED', data: {} });
      return;
    }
    const albums = await listAlbums(db, user.preferred_locale);
    res.status(200).json({ code: 'OK', data: { albums } });
  });

  // The user-contributed half of the hybrid catalog (issue 07, ADR-0004):
  // the authenticated User adds an Album the seed does not know yet. The
  // submitted name becomes both the canonical name and a translation in the
  // submitter's preferred locale. Duplicates are allowed; dedup/merge is
  // future tooling. Validation is locale-neutral (ADR-0014).
  app.post('/albums', requireAccessToken(auth), async (req: AuthedRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHENTICATED', data: {} });
      return;
    }
    const user = await db('users').where({ id: userId }).first('preferred_locale');
    if (!user) {
      res.status(401).json({ code: 'UNAUTHENTICATED', data: {} });
      return;
    }
    const album = await createAlbum(db, req.body?.name, user.preferred_locale);
    if (album === 'INVALID_ALBUM_NAME') {
      res.status(400).json({ code: album, data: {} });
      return;
    }
    res.status(200).json({ code: 'OK', data: { album } });
  });

  // An Album's Sticker roster (issue 08), with display subjects resolved to
  // the authenticated User's preferred locale and canonical-subject fallback
  // (ADR-0014). The module returns [] for an unknown Album; the route owns
  // the locale-neutral 404.
  app.get('/albums/:id/stickers', requireAccessToken(auth), async (req: AuthedRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHENTICATED', data: {} });
      return;
    }
    const user = await db('users').where({ id: userId }).first('preferred_locale');
    if (!user) {
      res.status(401).json({ code: 'UNAUTHENTICATED', data: {} });
      return;
    }
    const album = await db('albums').where({ id: req.params.id }).first('id');
    if (!album) {
      res.status(404).json({ code: 'UNKNOWN_ALBUM', data: {} });
      return;
    }
    const stickers = await listStickers(db, album.id, user.preferred_locale);
    res.status(200).json({ code: 'OK', data: { stickers } });
  });

  // The user-contributed half of the Sticker catalog (issue 09, ADR-0004):
  // the authenticated User adds a Sticker the roster does not know yet. The
  // submitted subject becomes both the canonical subject and a translation
  // in the submitter's preferred locale. Duplicates are allowed; validation
  // is locale-neutral (ADR-0014). The route owns the parent-Album 404.
  app.post('/albums/:id/stickers', requireAccessToken(auth), async (req: AuthedRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHENTICATED', data: {} });
      return;
    }
    const user = await db('users').where({ id: userId }).first('preferred_locale');
    if (!user) {
      res.status(401).json({ code: 'UNAUTHENTICATED', data: {} });
      return;
    }
    const album = await db('albums').where({ id: req.params.id }).first('id');
    if (!album) {
      res.status(404).json({ code: 'UNKNOWN_ALBUM', data: {} });
      return;
    }
    const sticker = await createSticker(
      db,
      album.id,
      req.body?.number,
      req.body?.subject,
      user.preferred_locale,
    );
    if (sticker === 'INVALID_STICKER_NUMBER' || sticker === 'INVALID_STICKER_SUBJECT') {
      res.status(400).json({ code: sticker, data: {} });
      return;
    }
    res.status(200).json({ code: 'OK', data: { sticker } });
  });

  // The authenticated User updates their own details (issue 05): location
  // (persisted as a PostGIS geography point, ADR-0007) and preferred
  // locale. Absent fields are ignored (partial update); validation errors
  // are locale-neutral — codes plus data, never prose (ADR-0014).
  app.patch('/me', requireAccessToken(auth), async (req: AuthedRequest, res) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHENTICATED', data: {} });
      return;
    }
    const errorCode = await updateUserDetails(db, userId, req.body ?? {});
    if (errorCode) {
      res.status(400).json({ code: errorCode, data: {} });
      return;
    }
    const profile = await profileOf(db, userId);
    if (!profile) {
      res.status(401).json({ code: 'UNAUTHENTICATED', data: {} });
      return;
    }
    res.status(200).json({ code: 'OK', data: profile });
  });

  return app;
}
