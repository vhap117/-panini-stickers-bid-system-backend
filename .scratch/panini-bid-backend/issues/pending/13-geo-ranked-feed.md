Status: ready-for-agent

# Geo-ranked feed (distance + near-band recency)

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The browse surface: `GET /feed` returns only `published` Listings, ranked against the requesting User's stored location using PostGIS (`ST_Distance` on geography points, indexed — ADR-0007). Within a configurable near-band radius, Listings are ordered newest-first so the feed feels alive; beyond the band, farther Listings still appear but ordered by distance only. The near-band radius is a single config value (e.g. 10km), tunable without code changes.

The feed supports an Album filter and cursor pagination. Each feed item carries the Listing's photo, its Sticker and Album (names resolved to the requester's preferred locale), and the seller's location as data — city/area-level presentation is the client's rendering job, never server-side prose. If the requesting User has no location set, results fall back to recency-only ordering.

## Acceptance criteria

- [ ] Only `published` Listings appear; draft, sold, and cancelled Listings are excluded
- [ ] With Users at known locations: Listings within the near band are ordered newest-first; Listings beyond the band are ordered by distance — tested against real PostGIS, not mocks
- [ ] The near-band radius is a config value; changing it changes ranking without code edits
- [ ] Album filter returns only that Album's published Listings
- [ ] Cursor pagination returns subsequent pages without overlaps
- [ ] Feed items carry photo, Sticker + Album with locale-resolved names, and seller location as data (locale-neutral)
- [ ] Requesting User without a stored location gets recency-ordered results

## Blocked by

- `05-update-user-details-location-locale.md` (viewer location)
- `12-publish-draft-listing.md` (published Listings to rank)
