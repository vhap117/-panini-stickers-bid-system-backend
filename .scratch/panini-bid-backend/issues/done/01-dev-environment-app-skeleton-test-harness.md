Status: ready-for-agent

# Dev environment, app skeleton, and test harness

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The tracer bullet for every later slice: run `docker compose up` and get the full dev stack — Node/TypeScript app with hot reload, Postgres+PostGIS with a persistent volume, and Adminer (ADR-0013). An Express HTTP server with Socket.IO attached to it (ADR-0008). Knex wired up as query builder and migration tool (ADR-0009), with migrations runnable from scratch against the Postgres instance. An `.nvmrc` pinning the Node version.

A test harness that boots the app against a real Postgres+PostGIS, applies Knex migrations from a clean state, and drives the app through its external seam only — real HTTP calls, real Socket.IO clients, and Knex queries for database assertions (per the PRD's Testing Decisions: one seam, the API boundary; no unit tests against internal modules).

The slice is proven end-to-end by a health endpoint whose test goes through the full stack: running server → real HTTP request → real database connectivity. No business logic beyond that.

## Acceptance criteria

- [ ] `docker compose up` starts the app (hot reload via ts-node-dev), postgis/postgis (persistent volume), and Adminer; the app reaches a healthy state with no manual steps
- [ ] `.nvmrc` present with the pinned Node version
- [ ] Express serves a health endpoint returning 200 with a locale-neutral JSON body (codes/data, no prose)
- [ ] Socket.IO is attached to the same HTTP server and accepts connections (JWT auth arrives with the auth slices)
- [ ] Knex migrations apply from scratch to an empty database via a single reproducible command
- [ ] Test harness boots app + real Postgres+PostGIS, applies migrations, resets state per test run/suite, and the health test passes through a real HTTP call
- [ ] No domain endpoints yet — skeleton and harness only

## Blocked by

None - can start immediately.
