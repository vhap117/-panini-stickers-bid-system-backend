Status: ready-for-agent

# List Albums with locale-resolved names + seed data

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The first catalog slice (ADR-0004 hybrid catalog, ADR-0014 multilingual catalog): `albums` and `album_translations` with their migration, and `GET /albums` returning the catalog's Albums with display names resolved to the requester's preferred locale, falling back to the canonical name.

Seed data ships with this slice: one or two popular Panini albums (e.g. "Qatar 2022 World Cup") carrying English AND Spanish names from day one — seeding English-only names would immediately recreate the duplicate-album problem in Spanish (per the PRD's Further Notes).

## Acceptance criteria

- [ ] `GET /albums` returns the seeded Albums with names resolved to the requester's preferred locale
- [ ] A requester with preferred locale `es` sees the Spanish name when a Spanish translation exists; canonical name as fallback otherwise
- [ ] A requester with preferred locale `en` sees English names
- [ ] Seed data carries EN + ES names for every seeded album
- [ ] Response structure is locale-neutral: ids and data, display names as data — no English prose anywhere
- [ ] Deterministic ordering so listing behavior is stable for tests and clients

## Blocked by

- `01-dev-environment-app-skeleton-test-harness.md`
- `02-google-login-jwt-session.md` (all REST endpoints require an authenticated User)
