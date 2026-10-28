Status: ready-for-agent

# Cross-locale search — catalog + feed

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

Search that never lets language block finding a Sticker (ADR-0014): catalog search matches across all locale variants of Album and Sticker names using unaccent + trigram matching against real Postgres — a Spanish query like "Mundial Qatar 2022" finds the Album cataloged in English as "Qatar 2022 World Cup", and vice versa. Search covers seeded AND user-contributed catalog entries.

Search applies to the catalog read paths (Albums and an Album's Sticker roster — matching by Sticker number or by subject in any locale) and to the feed (`GET /feed` with a search query), where it returns only published Listings whose Sticker matches by number or subject. Feed search composes with the existing Album filter and cursor pagination.

## Acceptance criteria

- [ ] A Spanish query finds an Album cataloged under an English name, and an English query finds a Spanish-named entry (tested against real Postgres with unaccent + trigram, no mocks)
- [ ] Sticker search matches by number and by subject across locales (an English-subject Sticker found via a Spanish subject query)
- [ ] Search covers user-contributed Albums and Stickers, not just seed data
- [ ] Feed search returns only published Listings whose Sticker matches by number or subject
- [ ] Feed search composes with the Album filter and cursor pagination
- [ ] All responses remain locale-neutral (codes + data)

## Blocked by

- `09-create-user-contributed-sticker.md` (user-contributed entries must exist to be searched)
- `13-geo-ranked-feed.md` (the feed is the search surface for Listings)
