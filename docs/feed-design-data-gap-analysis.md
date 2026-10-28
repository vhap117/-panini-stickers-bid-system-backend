# Feed design vs. backend data structures — gap analysis

Compares `panini-stickers-bid-system-frontend/docs/feed_design_examples.html` (the Ionic
feed prototype) against what the backend actually has at HEAD (`52a8aca`).

**Verdict: no. The prototype's feed card cannot be rendered from any data the backend
can currently produce.** Roughly 4 of ~21 fields the card needs are backed by an existing
column; the rest need new tables, new columns, or a decision reversal. The backend today
is auth-only: three tables (`users`, `user_identities`, `refresh_tokens`) and six routes.

---

## 1. What the design requires

Extracted from the prototype's data model (`lucasStickers`, lines 262-311) and the card
markup (lines 409-723). Grouped by card region.

### Seller header bar

| Field | Example | Backing structure |
|---|---|---|
| `sellerHandle` | `lucas_ba` | Missing — `users.display_name` exists but is a free-text name, not a handle |
| `sellerAvatarInitials` | `LB` | Derivable from `display_name` at render time |
| `distanceMeters` | `450m`, `6.8 km` | Missing — no distance query exists |
| `sellerNeighborhood` | `Palermo Hollywood`, `Belgrano` | Missing — no reverse-geocode, no area field |
| `fulfillmentMode` | `Meetup` | Missing — no column, no enum |
| `listingCount` | `3` (segment pill `1/3`) | Missing — no listings table |

### Photo surface

| Field | Example | Backing structure |
|---|---|---|
| `frontPhotoUrl` | (image) | Missing — no storage layer, no photo column (ADR-0006 unimplemented) |
| `backPhotoUrl` | `Back (Original)` tab | Missing — implies ≥2 photos per listing, distinguished by **side** (front/back) |
| `imageDimensions` | `4032 × 3024 px` | Missing — no width/height columns |
| `photoKind` | `Raw Photo` | Static label, no backing data needed |

### Row 1 — sticker identity + wishlist

| Field | Example | Backing structure |
|---|---|---|
| `stickerCode` | `ARG 19`, `FWC 00` | Missing — no `stickers` table |
| `stickerTitle` | `Lionel Messi` | Missing — no `stickers` table |
| `stickerSubtitle` | `Argentina • Foil Portrait • Page 18` | Missing — no nationality/team/finish/page columns |
| `wishlisted` | `true`/`false` | Missing — no wishlist table |

### Row 2 — official album

| Field | Example | Backing structure |
|---|---|---|
| `albumName` | `FIFA World Cup Qatar 2022` | Missing — no `albums` table |
| `albumShort` | `WC22` | Missing — no edition-code column |
| `albumGrad` | `from-rose-700 to-amber-600` | **Presentation concern — should not be server data.** See §4. |
| `inAlbumCount` | `3 in album` | Missing — needs a count query over listings by album |

### Row 3 — current bid

| Field | Example | Backing structure |
|---|---|---|
| `price` | `14.50` | Missing — no `bids` table, no amount/currency columns |
| `bidsCount` | `9 bids` | Missing — no `bids` table, no denormalized count |
| `minStep` | `1.00` | Missing — no bid-increment config |
| `timeLeft` | `06m 12s` | **Contradicts ADR-0001.** See §3. |
| `urgent` | `true` | Derived from `timeLeft`; inherits the ADR-0001 conflict |

### Header / chrome / alternatives

| Field | Example | Backing structure |
|---|---|---|
| `viewerLocationLabel` | `Palermo • 5 km` | `users.location` exists; label is client-rendered |
| `radiusKm` + expand | `5 km → 15 km` | Missing — no radius config or filter |
| `sortMode` | `Closest First` | Missing — no sort/ranking endpoint |
| Swimlane `stickersInRadius` | `18 stickers within 5 km` | Missing — needs a grouped aggregate count |

---

## 2. Missing tables (the bulk of the gap)

None of these exist in any migration. Only three tables exist: `users`,
`user_identities`, `refresh_tokens`.

| Table | Why the design needs it | Planned in |
|---|---|---|
| `albums` | Row 2 album name/short code; swimlane grouping | issue 06, 07 |
| `album_translations` | ADR-0014 per-locale names | issue 21 |
| `stickers` | Row 1 code/title/subtitle | issue 08, 09 |
| `sticker_translations` | Per-locale sticker names | issue 21 |
| `listings` | **The feed entity itself.** Photo, status, seller, location, timestamps | issue 10-12, 19 |
| `listing_photos` | Front + back image URLs (design shows a two-tab toggle) | issue 10 |
| `bids` | Row 3 price + count; `minStep` derivation | issue 15, 16, 17 |
| `chat_rooms` / `chat_messages` | Bid-count context; ADR-0005 socket push | issue 14 |
| `direct_chats` | Post-sale 1:1 | issue 20 |
| `wishlists` | Row 1 heart, per-user per-sticker | **Not planned in any pending issue** |

The full plan exists as 16 unimplemented specs in
`.scratch/panini-bid-backend/issues/pending/` (06-21). They are planning documents only —
no migration or route exists for any of them.

---

## 3. Blocking contradiction: the countdown

**The design's most prominent element contradicts a recorded architectural decision.**

ADR-0001 (`0001-seller-accepts-offer-no-deadline.md`):

> "A published Listing stays open until the seller manually accepts one of the incoming
> Bids (or cancels). **There is no countdown timer** and no automatic 'highest bid wins'
> at a deadline. We chose seller-accepts-an-offer over a timed auction because Panini
> sticker trading is casual and social… A deadline would introduce sniping behavior and
> pressure that doesn't fit the vibe."

The design puts a countdown on every card and in the bid sheet:

- `timeLeft: "06m 12s"` in the data model (line 275)
- Red urgent badge with a pulsing `animate-ping` dot (lines 449-452)
- "Ends in 06m 12s" pill in the bid sheet (line 193)
- A bid stepper implying time pressure (lines 197-206)

This is not a data gap — it is a **product decision reversal**. ADR-0001's stated
alternative for handling stale listings is "feed deprioritization of stale listings"
(ordering, not visibility). Options:

1. Keep ADR-0001 and change the design — replace the countdown with a recency indicator
   ("Listed 2h ago"). Cheapest; preserves the no-sniping rationale.
2. Supersede ADR-0001 and add `listings.expires_at`. Requires a new ADR, a status
   transition on expiry, and a reaper job.
3. Fake the countdown as pure presentation — **not recommended.** A client-rendered
   timer with no server deadline would show different values per device and let a listing
   look live after the seller already accepted a bid.

Option 1 is closest to the recorded intent. Per `docs/agents/domain.md:47-50`, this needs
to be surfaced explicitly rather than silently overridden.

---

## 4. Fields that should NOT be server data

Two design fields are presentation, not domain data. Adding them to the API would leak UI
concerns into the wire format and violate ADR-0014's locale-neutral rule.

| Field | Why it's client-side |
|---|---|
| `albumGrad` (`from-rose-700 to-amber-600`) | A Tailwind class string. The server has no reason to know the palette. Client derives from `albumShort` or a stable key. |
| `urgent` | Derived from `timeLeft` / recency at render time. See §3 — the underlying value is itself contested. |

Also client-rendered by ADR-0014 and the pending feed issue (`13-geo-ranked-feed.md:13`):
`distanceMeters` formatting (`450m` vs `6.8 km`), `sellerNeighborhood` label text, and
`inAlbumCount` phrasing (`3 in album`). The server sends **distance in meters as a number**
and the client formats it.

---

## 5. Missing indexes and query primitives

Even once the tables exist, the geo-ranking query has no supporting index.

| Missing | Location | Consequence |
|---|---|---|
| GiST index on `users.location` | `migrations/20260901000002_...:15` | The only geography column in the schema is unindexed |
| GiST index on `listings.location` | table absent | Nearest-neighbor feed query would full-scan |
| Partial index on `listings(status, published_at)` | table absent | Feed filter + recency sort would full-scan |
| Index on `user_identities.email` | `...:25` | Auto-link query in `src/auth/identity.ts:72` scans |
| Index on `user_identities.user_id` | `...:22` | No FK index despite `ON DELETE CASCADE` |
| Index on `refresh_tokens.user_id` | `...:33` | Same |

There are **no explicit `CREATE INDEX` statements anywhere in any migration.** Only
PK and unique-constraint-backed indexes exist. There are also **no CHECK constraints and
no PostgreSQL enums in any migration** — so the `draft → published → sold → cancelled`
state machine documented in `CONTEXT.md:41` has no column, enum, or constraint enforcing it.

---

## 6. Missing query and route logic

Verified absent from `src/` by grep:

- No `ST_Distance`, `ST_DWithin`, or KNN `<->` — only `ST_MakePoint` / `ST_SetSRID` /
  `ST_AsText` for profile read/write (`src/users/update-me.ts:56-59`, `src/app.ts:31`).
- No `orderBy`, `limit`, `offset`, or cursor pagination — the word "rank" appears only in
  comments.
- No aggregate `count()` query anywhere.
- No Socket.IO `connection` handler, room join, or `emit`. `src/server.ts:40` constructs
  the server and `:46` installs auth middleware, but the socket is otherwise inert —
  zero matches for `io.on` / `.emit(` / `.join(`.
- No storage/upload implementation (ADR-0006's `upload(file) → url` interface is absent).

Current route surface is auth-only (`src/app.ts`): `GET /health`,
`POST /auth/login/google`, `POST /auth/refresh`, `POST /auth/logout`, `GET /me`,
`PATCH /me`. There is no `GET /feed`.

---

## 7. Summary

| Category | Status |
|---|---|
| Feed entity (`listings`) | **Absent** |
| Catalog (`albums`, `stickers`, translations) | **Absent** |
| Bids (`bids`, amounts, counts) | **Absent** |
| Photos / storage | **Absent** (interface agreed in ADR-0006, unimplemented) |
| Wishlist | **Absent and unplanned** |
| Geo-ranking query + indexes | **Absent**; only `users.location` exists, unindexed |
| Listing state machine | **Documented** (`CONTEXT.md:41`), **no column/enum/CHECK** |
| Recency ordering | **Absent** — no `published_at` on any listing |
| Radius filter / near-band | **Absent** (planned in issue 13, not built) |
| Countdown / expiry | **Contradicts ADR-0001** — needs a decision, not code |

**The domain model in `CONTEXT.md` and the 16 ADRs is thorough and coherent** — Album,
Sticker, Listing, Bid, Chat Room, and the proximity-ranking rationale are all well
specified at the conceptual level. The gap is entirely in implementation: zero of the
16 pending issue specs have been built, and the design adds two requirements on top of
them (wishlist, and the front/back photo pair).

**Two decisions are needed before implementation can start:**

1. **Countdown vs. ADR-0001** — pick an option from §3.
2. **Wishlist + dual-photo scope** — confirm these belong in the feed epic or get their
   own issue specs; they are currently unplanned.

Everything else in §2 and §5 is mechanical work that the existing ADRs already specify in
enough detail to implement without further architectural decisions.