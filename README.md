# Panini Stickers Bid System Backend

Express + Socket.IO + Knex + PostgreSQL/PostGIS backend. See `CONTEXT.md` for
domain vocabulary and `docs/adr/` for architecture decisions.

## Requirements

- Docker + Docker Compose v2 (daemon running)
- Node 22 (`.nvmrc`) — only needed to run tests or the app on the host

## Dev stack (one command)

```sh
docker compose up          # app (hot reload), Postgres+PostGIS, Adminer
```

- App health endpoint: http://localhost:3000/health
- Adminer: http://localhost:8080 (server: `db`, user: `panini`, password: `panini`, db: `panini_bid`)
- Postgres exposed on host port `5433` (user/password `panini`/`panini`, db `panini_bid`)

The app service becomes `healthy` once the health endpoint answers 200, which
requires real database connectivity. No manual steps after `docker compose up`.

After changing dependencies, rebuild with fresh node_modules:

```sh
docker compose up -d --build --force-recreate --renew-anon-volumes app
```

## Migrations

Apply from scratch to an empty database (works from a totally clean state) with
a single reproducible command:

```sh
docker compose run --rm app npm run migrate:latest
```

Rollback the last batch:

```sh
docker compose run --rm app npm run migrate:rollback
```

## Tests

```sh
npm install
npm test        # or: npx vitest run
```

The harness (`tests/global-setup.ts`):

1. starts the dedicated test Postgres+PostGIS (`docker-compose.test.yml`,
   port `5434`, own ephemeral volume — never touches the dev DB),
2. resets state per run (drop + recreate the test database),
3. applies Knex migrations programmatically from a clean state,
4. boots the real app on an ephemeral port and drives it **only** through its
   external seam: real HTTP requests (supertest) and real socket.io-client
   connections against real PostGIS.

Tear down the test DB completely:

```sh
docker compose -f docker-compose.test.yml down -v
```

## Configuration

Environment variables (sane dev defaults in `docker-compose.yml`):

- `PORT` (default `3000`)
- `DATABASE_URL` (`postgres://user:password@host:port/database`) **or**
  `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
  (defaults `127.0.0.1:5432`, db `panini_bid`, user/password `panini`/`panini`)

Authentication (ADR-0011, ADR-0016):

- `JWT_SECRET` — signing secret for access tokens (default
  `dev-insecure-jwt-secret`; set a real secret outside local dev)
- `JWT_ACCESS_TOKEN_TTL_SECONDS` — access-token lifetime
  (default `900` = 15 minutes)
- `REFRESH_TOKEN_TTL_DAYS` — refresh-token lifetime (default `30`)
- `GOOGLE_CLIENT_ID` — **required**. The Google Web-application OAuth
  client ID that the OIDC ID token must be issued for (`aud` check).
  No Google client secret is used or stored: login happens natively in
  the Capacitor app (`@capgo/capacitor-social-login`) and the backend
  verifies the posted ID token server-side. The app fails to start
  without this variable.
- `GOOGLE_TOKENINFO_BASE` — base URL of Google's tokeninfo endpoint
  (default `https://www.googleapis.com`; used by the test suite to point
  the app at a stub of Google's boundary)

### Development-only login

The Web front-end can log in without any social provider against the real
API. This seam is **development only**; it is not social login on the Web and
is never exposed by a production build.

- **Enable:** `DEV_AUTH_ENABLED=true` (or `1`). It is already set to `"true"`
  for the local `panini-bid-dev` compose project in
  `docker-compose.override.yml`, so `docker compose up` provides it.
- **Disable:** leave `DEV_AUTH_ENABLED` unset (the fail-closed default) or set
  it to anything else.
- **Production:** the backend refuses to start if `DEV_AUTH_ENABLED` is on
  while `NODE_ENV=production`; with the flag unset a production build simply
  never registers the route.

Endpoint:

```
POST /auth/login/dev
Content-Type: application/json

{ "persona": "dev" | "alice" | "bob" }   // body optional; absent → "dev"
```

| Status | Body |
| --- | --- |
| `200` | `{ "code": "AUTHENTICATED", "data": { "user": { "id", "displayName" }, "accessToken", "tokenType": "Bearer", "expiresIn", "refreshToken" } }` — identical to the Google login response |
| `400` | `{ "code": "INVALID_DEV_PERSONA", "data": {} }` |
| `404` | When dev auth is disabled the route does not exist at all |

The returned `accessToken` is the normal Bearer JWT: use it on every protected
REST route (`Authorization: Bearer <accessToken>`) and on Socket.IO, exactly
as a Google session.

Personas (each has a stable id, so repeat logins and restarts resolve to the
same User):

| Persona | `displayName` |
| --- | --- |
| `dev` (default) | `Dev User` |
| `alice` | `Alice` |
| `bob` | `Bob` |

Dev identities are stored with `email = null`, so they can never be
auto-linked to a real User by the email rules in ADR-0003.

HTTP surface (issue 23):

- `CORS_ALLOWED_ORIGINS` — comma-separated browser origins allowed to call
  the API (CORS allow-list). Unset, it defaults to the Ionic front-end's dev
  origins: `http://localhost:8100` (`ionic serve`), `http://localhost` and
  `https://localhost` (Android WebView), `capacitor://localhost` (iOS
  WebView). Set it explicitly outside local dev.
