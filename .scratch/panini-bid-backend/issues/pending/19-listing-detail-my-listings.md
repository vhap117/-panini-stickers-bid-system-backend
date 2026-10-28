Status: ready-for-agent

# Listing detail + my Listings grouped by state

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The views that let a seller manage their activity and anyone monitor a Listing: `GET /listings/:id` returns a Listing's full detail — photo, Sticker and Album with locale-resolved names, state, timestamps, its Bids (with types and details), and recent Messages — for any state, including ended Listings (sold/cancelled), whose history stays reviewable.

The seller's own management view: a my-Listings endpoint (e.g. `GET /me/listings` — implied by the PRD's user stories, not its endpoint list) returning only the requester's Listings, filterable/groupable by state (`draft`, `published`, `sold`, `cancelled`) so the seller can see what needs finishing, what's live, and what's done.

## Acceptance criteria

- [ ] `GET /listings/:id` returns photo, Sticker + Album (locale-resolved names), state, timestamps, Bids with types, and recent Messages
- [ ] Detail works for every Listing state, including sold and cancelled Listings (history viewable)
- [ ] A sold Listing's detail shows its accepted Bid and rejected Bids consistently with its state
- [ ] My-Listings endpoint returns only the requester's Listings, filterable/groupable by all four states
- [ ] Unknown Listing id → locale-neutral not-found error; unauthenticated → auth error

## Blocked by

- `17-accept-bid-listing-sold.md` (detail must render bids and the sold state meaningfully)
