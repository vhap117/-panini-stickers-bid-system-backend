Status: ready-for-agent

# Create a user-contributed Album

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The user-contributed half of the hybrid catalog (ADR-0004): an authenticated User adds an Album the catalog doesn't know yet via `POST /albums`, so they can list Stickers from collections the operator never seeded. The submitted name is accepted in any supported locale and becomes the canonical name; it is also recorded as a translation in the submitting User's preferred locale so cross-locale search can find it later. Canonicalization/dedup of user-contributed entries is explicitly future admin tooling — creation is not blocked by similar or duplicate names.

## Acceptance criteria

- [ ] Authenticated User creates an Album via `POST /albums`; it appears in `GET /albums` immediately
- [ ] Submitted name stored as the canonical name AND as a translation in the submitter's preferred locale
- [ ] Creating an Album with a name similar/equal to an existing one is allowed (dedup/merge is out of scope, future tooling)
- [ ] Missing or empty name → locale-neutral validation error
- [ ] Unauthenticated request → auth error
- [ ] Database state asserted via Knex; response asserted via HTTP

## Blocked by

- `02-google-login-jwt-session.md`
- `06-list-albums-seed-data.md`
