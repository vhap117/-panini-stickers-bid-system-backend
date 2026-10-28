Status: ready-for-agent

# List Stickers in an Album (locale-resolved)

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The Sticker half of the catalog read path: `stickers` and `sticker_translations` with their migration, seeded Stickers (number + subject) for the seeded Albums with EN + ES subjects, and `GET /albums/:id/stickers` returning an Album's Sticker roster with subjects resolved to the requester's preferred locale, falling back to the canonical subject. Ordered by Sticker number so browsing and tests are stable.

## Acceptance criteria

- [ ] `GET /albums/:id/stickers` returns the seeded Stickers (number + locale-resolved subject) for a seeded Album
- [ ] Requester with preferred locale `es` sees Spanish subjects where translations exist; canonical subject as fallback
- [ ] Results ordered by Sticker number
- [ ] Unknown Album id → locale-neutral not-found error
- [ ] Seed data carries EN + ES subjects
- [ ] Response structure locale-neutral — ids and data, no prose

## Blocked by

- `06-list-albums-seed-data.md`
