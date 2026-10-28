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

## Comments

Carried over from issue 10, which shipped the schema this slice publishes:

- **"At minimum a photo" means a `front` Photo.** Photos are rows in
  `listing_photos` with a `side` (`front` / `back`); issue 10 uploads one
  `front` Photo. `CONTEXT.md` says a Listing is photographed from both sides,
  which reads as if publishing required both — it does not. Publish requires
  a `front` Photo; the `back` Photo stays optional. Rationale is recorded in
  issue 10's comments.
- **"A Sticker reference" means `listings.sticker_id IS NOT NULL`.** The
  column is nullable so a draft can start photo-only; issue 11 fills it in.
- `published_at` is set on the transition; `ended_at` stays null until the
  Listing is `sold` or `cancelled` (issues 17 / 18).
- The Album is reached through the Sticker — there is no `album_id` column
  to check.

