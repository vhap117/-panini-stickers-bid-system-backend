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

## Comments

Implemented as `POST /listings` + `GET /uploads/:key`, with a `listings` /
`listing_photos` schema (migration `20261028000009_listings_and_photos.ts`),
a storage abstraction (`src/storage/`), and 10 integration specs in
`tests/listings.test.ts`.

### Decisions taken (and why)

- **Photos are rows in `listing_photos`, not a `listings.photo_url` column.**
  This deviates from the PRD's original schema line, which is superseded:
  `CONTEXT.md` defines a Photo as one *side* of a Listing's physical Sticker
  and states that "a Photo belongs to exactly one Listing", and the feed
  design needs a front/back pair. The schema is the hard-to-change part, so
  it is right for the two-sided model. The PRD's schema section has been
  amended to match; per `docs/agents/domain.md` the deviation is recorded
  here rather than applied silently.
- **`side` is `front` for the single Photo this slice uploads.** The `back`
  Photo is optional at creation and arrives with the edit slice (issue 11);
  the `(listing_id, side)` unique constraint makes "replace the Photo of one
  side" an upsert.
- **ADR-0006's interface gained `delete(url)`.** An addition, not a
  contradiction: the upload is deleted on a best-effort basis if the Listing
  fails to persist, so a rejected upload never leaves an orphan file. The
  edit slice (issue 11) needs the same operation to replace a Photo.
- **The Album is reached through the Sticker** — no `album_id` column, so the
  two references can never disagree.
- **Publishing requires a `front` Photo only.** `CONTEXT.md` says a Listing is
  photographed from both sides, while issue 12 says a Listing needs "at least
  a photo" to go live. Resolved as: publish requires a `front` Photo and the
  `back` Photo stays optional. Flagged on issue 12.
- **`GET /uploads/:key` is unauthenticated.** Image loads in a mobile WebView
  carry no Bearer token, and the server-generated UUID key is the capability.
  The consequence is worth knowing: a *draft* Photo is as fetchable as a
  published one for anyone holding its URL.
- **Storage is selected by config** (`STORAGE_DRIVER`, `STORAGE_LOCAL_ROOT`);
  an unsupported driver refuses to boot rather than failing an upload at
  runtime. The local driver writes into the `panini_uploads` Docker volume.
- **Only the local driver ships.** ADR-0006 describes a second,
  S3-compatible implementation for production; it is not part of any issue in
  the tracker and remains outstanding.

### Wire contract

`POST /listings` — `multipart/form-data`: a `photo` file part (required) and
an optional `stickerId` field.

```json
{ "code": "OK", "data": { "listing": {
  "id": "<uuid>", "state": "draft", "sellerId": "<uuid>", "stickerId": "<uuid>|null",
  "photos": [ { "side": "front", "url": "/uploads/<uuid>.png" } ],
  "createdAt": "<ISO 8601>"
} } }
```

Errors stay locale-neutral (`{ code, data }`): `PHOTO_REQUIRED` /
`INVALID_PHOTO` (400), `UNKNOWN_STICKER` (404 — for both an unknown and a
malformed id, which are indistinguishable), `UNAUTHENTICATED` (401), and
`PHOTO_NOT_FOUND` (404) on the serving route.

