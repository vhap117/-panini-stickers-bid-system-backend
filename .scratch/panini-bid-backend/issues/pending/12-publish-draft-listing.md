Status: ready-for-agent

# Publish a draft Listing

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The draft → published transition: `POST /listings/:id/publish` moves the seller's draft Listing to `published` (with `published_at` recorded), making it eligible for the feed, its Chat Room, and bidding — those surfaces arrive in their own slices and assert this transition from their side. A Listing needs at minimum a photo and a Sticker reference to go live; an incomplete draft is rejected with a locale-neutral validation error and stays a draft. Only the seller can publish; only drafts can be published.

## Acceptance criteria

- [ ] Draft with photo + Sticker reference → `published`, with `published_at` set (asserted via Knex)
- [ ] Draft missing photo or Sticker reference → locale-neutral validation error, Listing remains `draft`
- [ ] Publishing a Listing in any non-draft state → locale-neutral state-conflict error
- [ ] Publishing another User's Listing → ownership error
- [ ] Unauthenticated request → auth error

## Blocked by

- `10-create-draft-listing-photo-upload.md`
