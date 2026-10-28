Status: ready-for-agent

# Edit a draft Listing (photo, Sticker, Album)

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The seller corrects a draft before it goes live: `PATCH /listings/:id` changes the Sticker/Album details and/or replaces the photo. A photo replacement stores the new file through the storage abstraction and updates the Listing's photo URL; the old photo need not be served anymore. Only drafts are editable, and only by the seller who owns the Listing — published, sold, or cancelled Listings reject edits with a locale-neutral state error.

## Acceptance criteria

- [ ] Seller changes the draft's Sticker/Album details; the change is reflected on read
- [ ] Seller replaces the photo; the new URL serves the new bytes
- [ ] Editing a Listing that is not in `draft` state → locale-neutral state-conflict error
- [ ] Editing another User's Listing → ownership error
- [ ] Unauthenticated request → auth error
- [ ] Database state asserted via Knex; photo bytes asserted via HTTP

## Blocked by

- `10-create-draft-listing-photo-upload.md`
