Status: ready-for-agent

# Create a user-contributed Sticker

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The write half of the Sticker catalog (ADR-0004): an authenticated User adds a Sticker missing from an Album's roster via `POST /albums/:id/stickers` — number + subject. The submitted subject becomes the canonical subject and is also recorded as a translation in the submitter's preferred locale. As with Albums, no dedup enforcement: duplicate numbers are allowed and canonicalization is future admin tooling.

## Acceptance criteria

- [ ] Authenticated User adds a Sticker (number + subject) to an existing Album; it appears in `GET /albums/:id/stickers`
- [ ] Subject stored as canonical AND as a translation in the submitter's preferred locale
- [ ] Adding a Sticker with a number that already exists in the Album is allowed (no dedup in v1)
- [ ] Missing number or subject → locale-neutral validation error; unknown Album id → not-found error
- [ ] Unauthenticated request → auth error
- [ ] Database state asserted via Knex; response asserted via HTTP

## Blocked by

- `02-google-login-jwt-session.md`
- `08-list-stickers-in-album.md`
