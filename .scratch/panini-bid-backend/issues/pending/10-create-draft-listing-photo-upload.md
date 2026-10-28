Status: ready-for-agent

# Create a draft Listing (photo upload via storage abstraction)

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The seller's entry point into the Listing lifecycle: `POST /listings` uploads a photo of the physical Sticker and saves the Listing in `draft` state, referencing one Sticker (and through it, one Album) and owned by the authenticated User (the seller). Sticker/Album details may be supplied at creation or deferred — a draft can start photo-only and get its details filled in later via the edit slice; publishing will require completeness.

Photo storage goes through the abstract storage interface (ADR-0006: `upload(file) → url`, `read(url) → stream`) with the local-filesystem implementation selected via config (a mounted volume in the Docker dev environment). The returned URL must actually serve the photo's bytes back.

## Acceptance criteria

- [ ] Authenticated User creates a Listing via `POST /listings` with a photo (+ optionally Sticker/Album details); it is persisted in `draft` state with the requester as seller
- [ ] The photo is retrievable via its returned URL through the local storage implementation (bytes round-trip asserted)
- [ ] Storage sits behind the abstract interface; implementation selected by config (ADR-0006)
- [ ] Missing/invalid photo → locale-neutral validation error
- [ ] A draft-only Listing is not exposed as a live Listing anywhere (state asserted in DB; feed exclusion is tested in the feed slice)
- [ ] Unauthenticated request → auth error

## Blocked by

- `02-google-login-jwt-session.md`
- `08-list-stickers-in-album.md`
