Status: ready-for-agent

# PRD: Panini Stickers Bid System Backend

## Problem Statement

Panini sticker collectors want to complete their albums, but they're stuck with duplicates they don't need and gaps they can't fill. Today, trading happens informally — at school, at work, in WhatsApp groups — with no good way to find who has the sticker you need, who's near you, and who's willing to trade or sell. There's no central place to see what stickers are available, make an offer, and negotiate in real time. Collectors need a way to photograph a sticker they're willing to part with, publish it to a feed where others can find it, and receive bids — either money or a trade of another sticker — while chatting live with interested bidders.

## Solution

A Node.js backend (consumed by a separate mobile front-end) that lets users register via social login, publish photographed stickers to a geo-ranked feed, place monetary and/or trade bids on listings, and negotiate in real time through group chat rooms attached to each listing. The system connects buyers and sellers and facilitates negotiation; it stops at the point of agreement — payment and physical exchange happen outside the app. The product is bilingual at launch — English and Spanish — with French and Portuguese planned as later, data-only additions; the backend's share of that is a multilingual catalog and a locale-neutral wire format, with all user-facing wording rendered by the front-end.

## User Stories

### Authentication & Identity

1. As a new user, I want to register using my Instagram account, so that I don't have to create and remember a new password.
2. As a new user, I want to register using my Google (Gmail) account, so that I can sign up with an identity I already use.
3. As a returning user, I want to log in with the same social provider I registered with, so that I can access my account.
4. As a user who registered with Instagram, I want to link my Google account to the same profile, so that I can log in with either provider and keep one identity.
5. As a user who registered with Google, I want to link my Instagram account to the same profile, so that I can log in with either provider and keep one identity.
6. As a user, I want my session to persist via a token, so that I don't have to re-authenticate on every app open.
7. As a user, I want my access token to refresh automatically, so that I stay logged in without frequent re-authentication.
8. As a user, I want to log out, so that my session is ended on this device.
9. As a user, I want to set my location as part of my profile, so that the feed can show me stickers near me.
10. As a user, I want to update my location, so that the feed reflects where I now trade.
11. As a user, I want to view my own profile, so that I can confirm my details and linked providers.
12. As a user, I want to see which social providers are linked to my account, so that I know how I can log in.

### Catalog (Albums & Stickers)

13. As a user creating a listing, I want to pick from a pre-seeded album (e.g. "Qatar 2022 World Cup"), so that I can tag my sticker accurately without typing the album name.
14. As a user creating a listing, I want to pick a sticker by its number from the album's roster, so that my listing is correctly identified and searchable.
15. As a user creating a listing, I want to add a new album that isn't in the catalog yet, so that I can list stickers from albums the system doesn't know about.
16. As a user creating a listing, I want to add a new sticker (number + subject) to an existing album, so that I can list a sticker missing from the catalog.
17. As a user browsing the feed, I want to filter by album, so that I only see stickers from the collection I'm working on.
18. As a user browsing the feed, I want to search by sticker number or subject name, so that I can find a specific sticker I need.

### Listings (Upload, Draft, Publish)

19. As a seller, I want to upload a photo of my sticker, so that bidders can see its condition.
20. As a seller, I want to save a listing as a draft after uploading the photo, so that I can fill in the album and sticker details before it goes live.
21. As a seller, I want to edit my draft listing's album, sticker number, and photo, so that I can correct mistakes before publishing.
22. As a seller, I want to publish a draft listing, so that it appears in the feed and becomes open for bids.
23. As a seller, I want to view my own listings grouped by state (draft, published, sold, cancelled), so that I can manage my activity.
24. As a seller, I want to cancel a published listing, so that I can withdraw a sticker I no longer want to sell.
25. As a seller, I want to view a single listing's full detail (photo, sticker, album, state, bids, chat), so that I can monitor interest in my sticker.
26. As a user, I want to see only published listings in the feed, so that I'm not shown drafts or already-sold stickers.

### Feed & Geo-Ranking

27. As a user, I want the feed to show published listings nearest to my profile location first, so that I can find stickers I can realistically exchange in person.
28. As a user, I want listings within a close band of my location to be ordered by recency (newest first), so that the feed feels alive and I see fresh listings.
29. As a user, I want listings beyond the close band ordered by distance, so that farther stickers are still surfaced but deprioritized.
30. As a user, I want to paginate the feed, so that I can browse more listings than fit in one screen.
31. As a user, I want to filter the feed by album, so that I only see stickers from collections I care about.
32. As a user, I want to see the seller's location (at a city/area level) on each feed item, so that I can gauge proximity.

### Bidding

33. As a bidder, I want to place a monetary bid on a published listing, so that I can offer cash for a sticker I want.
34. As a bidder, I want to place a trade bid offering one of my own stickers in exchange, so that I can swap a duplicate for a sticker I need.
35. As a bidder, I want to place a combined bid (a trade sticker plus a cash amount), so that I can offer a trade with a cash adjustment if my sticker alone isn't an even swap.
36. As a bidder, I want to raise my monetary bid after placing it, so that I can stay competitive.
37. As a bidder, I want to change my bid from monetary to a trade offer, so that I can switch my approach.
38. As a bidder, I want to see my current active bid on a listing, so that I know what offer I have on the table.
39. As a bidder, I want to have only one active bid per listing, so that my offer is unambiguous to the seller.
40. As a bidder, I want to withdraw my bid from a published listing, so that I can back out if I change my mind.
41. As a seller, I want to see all active bids on my listing, so that I can decide which offer to accept.
42. As a seller, I want to see each bid's type (money, trade, or both) and details, so that I can compare offers.
43. As a seller, I want to accept a bid, so that the listing is sold to that bidder.
44. As a seller, when I accept a bid, I want all other bids to be automatically rejected, so that losing bidders know the sticker is no longer available.
45. As a bidder, when my bid is outbid by an accepted bid, I want to be notified in real time, so that I know the listing is no longer available.
46. As a bidder, when my bid is accepted, I want to be notified in real time, so that I know I won and can arrange the exchange.
47. As a seller, when a listing is cancelled, I want all bidders to be notified in real time, so that they know the sticker was withdrawn.

### Real-Time Chat (Listing Chat Room)

48. As a user, I want to join the chat room of any published listing, so that I can see the live bidding action and conversation.
49. As a user, I want to send free-form text messages in a listing's chat room, so that I can ask questions or discuss the sticker.
50. As a user, I want to see new bids appear in the chat room as structured offer events (not as typed text), so that offers are clearly distinguishable from conversation.
51. As a user, I want to see bid updates (raises or changes) appear in the chat room, so that I can follow the escalation in real time.
52. As a user joining a listing late, I want to load the past chat messages and bid history, so that I have context for what's already happened.
53. As a user, I want only new events (after my join) to arrive over the socket, so that I don't receive duplicates of history I already loaded.
54. As a user, when a listing ends (sold or cancelled), I want to receive a real-time "listing ended" event, so that I know the room is closing.
55. As a user, when a listing ends, I want the chat room to stop accepting new messages and bids, so that the conversation doesn't continue on a closed listing.
56. As a user, I want to read the persisted history of a closed listing's chat room and bids via REST, so that I can review what happened even after the room closed.

### Direct Chat (Post-Sale)

57. As a seller, after my listing is sold, I want to open a private 1:1 chat with the winning bidder, so that we can arrange the physical exchange.
58. As a winning bidder, after a listing is sold to me, I want to open a private 1:1 chat with the seller, so that we can arrange the physical exchange.
59. As a user in a direct chat, I want messages to be private between the two participants, so that no other user can see our conversation.
60. As a user, I want direct chats to only be openable after a completed sale, so that pre-sale negotiation stays in the public listing chat room.
61. As a user, I want to load the history of an ongoing direct chat, so that I can review what was agreed about the exchange.
62. As a user, I want new direct chat messages to arrive in real time, so that I can coordinate the meetup live.

### Images

63. As a seller, I want my uploaded photo to be stored and served back, so that bidders can view the sticker's condition.
64. As a seller, I want to replace the photo on a draft listing, so that I can upload a better picture before publishing.

### Infrastructure (Developer-Facing)

65. As a developer, I want to run `docker compose up` and have the entire stack (Node app with hot reload, Postgres+PostGIS, Adminer) start, so that I can develop without manual setup.
66. As a developer, I want the database schema applied via migrations, so that the schema is reproducible and versioned.
67. As a developer, I want seed data for one or two popular albums, so that I can test the catalog and listing flow immediately.
68. As a developer, I want an `.nvmrc` file, so that I use the intended Node version if running the app on the host.

### Internationalization

69. As a user, I want to set my preferred locale (English or Spanish), so that the app renders in my language.
70. As a Spanish-speaking user, I want album and sticker names shown in Spanish when a Spanish name exists, so that the catalog reads naturally to me.
71. As a user, I want to search the catalog in my own language and still find entries cataloged under another language (e.g. search "Mundial Qatar 2022" and find "Qatar 2022 World Cup"), so that language never blocks me from finding a sticker.

## Implementation Decisions

### Architecture

- **REST mutations + Socket.IO push only (ADR-0005).** All state changes (place/update/withdraw bid, send chat message, accept bid, cancel/publish listing) happen via REST endpoints that validate, persist, and then emit real-time events over Socket.IO to the relevant room. No business logic or bid/chat submission inside socket handlers. Socket.IO is purely the push channel.
- **System stops at "sold" (ADR-0007).** No payment, escrow, shipping, or delivery handling. Accepting a bid marks the listing `sold`; the seller and winning bidder use a Direct Chat to arrange the exchange offline.

### Domain Model

- **Album** — a named Panini collection/edition. A sticker has no meaning outside its album.
- **Sticker** — a catalog type within an album (number + subject). Shared reference data, not the physical item.
- **Listing** — a specific physical sticker a user photographed and published. References one Sticker (and thus one Album); owned by one User (the seller). Bids attach to Listings, not Stickers.
- **User** — a registered person who can publish Listings and place Bids. Carries a location for feed ranking and a preferred locale (English or Spanish at launch) used for rendering defaults and future notifications.
- **Bid** — an offer on a published Listing. Can be monetary, a trade (referencing a Sticker type by claim, not verified inventory), or both. One active Bid per bidder per Listing; raising/changing updates the existing Bid.
- **Chat Room** — a real-time group conversation attached to a published Listing. Open to any authenticated user. Bids appear as structured offer events; Messages are free-form text. Both persisted.
- **Message** — a free-form text entry in a Chat Room, persisted for late-joiner history.
- **Direct Chat** — a private 1:1 conversation, openable only after a Listing ends as `sold`, between the seller and winning bidder. Not tied to a Listing's Chat Room.

### Listing Lifecycle

- States: `draft` → `published` → `sold` | `cancelled`.
- Only `published` Listings appear in the feed and accept Bids.
- Accepting a Bid → listing becomes `sold`, all other Bids rejected, bidders notified in real time.
- Seller can cancel a `published` Listing → becomes `cancelled`, bidders notified.
- When a Listing ends, its Chat Room closes (no new Messages or Bid events); history remains readable via REST.

### Bidding Rules

- One active Bid per bidder per Listing. Raising or changing an offer updates the existing Bid (emits a real-time "bid updated" event).
- A trade Bid references a Sticker (catalog type) as a claim by the bidder — the system does not verify the bidder owns the offered sticker.
- A Bid can be monetary, a trade, or both (polymorphic offer). Handled via nullable columns or a JSONB payload on the Bid record.

### Catalog Strategy

- **Hybrid catalog (ADR-0004).** A small curated seed (one or two popular albums loaded by the operator) plus user-contributed entries for albums/stickers not yet present. Users pick from existing catalog data when creating a draft; if their album or sticker isn't present, they can add it. Dedup/merge tooling is a future concern.
- **Multilingual catalog (ADR-0014).** Canonical catalog entries carry per-locale display names — English and Spanish at launch; French and Portuguese later as data-only additions (locales are rows, not columns — no schema change). Catalog search matches across all language variants (unaccent + trigram), so a Spanish query finds an English-named album and vice versa. Seeded albums ship with EN + ES names from day one.

### Internationalization

- **English + Spanish at launch; French + Portuguese later (ADR-0014).** The backend's i18n surface is the catalog and the wire format — not UI strings, which belong to the mobile front-end.
- **Locale-neutral wire format.** REST errors and Socket.IO event payloads carry codes plus data — ids, minor-unit amounts with currency codes, ISO 8601 timestamps — never English prose. Clients render all user-facing wording from the user's preferred locale.
- **User content is never server-translated.** Chat Messages and Listing descriptions are stored exactly as authored; translation, if ever wanted, is a display-time front-end concern.

### Feed Ranking

- **Distance + recency blend.** Primary sort: distance from the viewer's profile location to the seller's location (PostGIS `ST_Distance` on `geography` types, indexed). Within a configurable "near band" radius, secondary sort: recency (newest first). Beyond the band: distance only.
- Viewer location = the User's profile location (ADR: location on User). No device GPS in v1.

### Authentication

- **One User, many linkable social providers (ADR-0003).** First login creates the account; subsequent logins via a different provider are linked by matching email. Manual linking flow when emails don't match.
- **Passport.js strategies (ADR-0010).** `passport-instagram`, `passport-google-oauth20`. Backend owns the User model. OAuth2 flows handled server-side.
- **JWT session management (ADR-0011).** After social login, backend issues a signed JWT. Client sends it in `Authorization` header on REST calls and presents it when connecting to Socket.IO. Short access-token expiry (e.g. 15 min) + refresh-token flow. No server-side session store.

### Socket.IO Design

- **Open rooms (ADR).** Any authenticated user can join any published Listing's Chat Room by listing ID (`socket.join('listing:<id>')` after JWT auth).
- **Room lifecycle.** Room is live while the Listing is `published`. On `sold`/`cancelled`, the server emits a "listing ended" event and stops accepting new Messages/Bid events for that room.
- **History via REST, live via socket.** A client joining a room loads past Messages and Bids via a REST endpoint; the socket carries only events from the point of connection onward.
- **Direct Chats** use separate socket rooms scoped to the two participants (`direct:<userA>:<userB>` or a generated conversation ID), openable only after a sale.

### Technology Stack

- **Express (ADR-0008)** as the HTTP framework. Socket.IO attaches to the Express HTTP server.
- **PostgreSQL + PostGIS (ADR-0007)** as the database. `postgis/postgis` Docker image. Geo types for User/Listing location; `ST_Distance`/`ST_DWithin` for feed ranking.
- **Knex (ADR-0009)** as the query builder + migration tool. PostGIS functions inline. No full ORM. Types managed separately.
- **Abstract storage interface (ADR-0006).** `upload(file) → url`, `read(url) → stream`, `delete(url)`, `urlFor(key) → url`. Two implementations behind it: a local-filesystem one in dev (volume-mounted in Docker) and an S3-compatible one for prod. Selected via config (`STORAGE_DRIVER`, `STORAGE_LOCAL_ROOT`; for S3 also `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_PUBLIC_BASE_URL`, `S3_FORCE_PATH_STYLE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`); an unsupported or unconfigured driver refuses to boot rather than failing an upload at runtime. The driver owns the URL shape: the local driver returns a root-relative url (`/uploads/<key>`), the S3 driver returns an **absolute public/CDN url**, so the client fetches Photos straight from the bucket instead of the API proxying image bytes. `S3_ENDPOINT` (where the SDK sends API calls) and `S3_PUBLIC_BASE_URL` (where browsers fetch objects) are separate settings.
- **Node.js + TypeScript.** `.nvmrc` for version pinning.

### Docker Dev Environment (ADR-0013)

- `docker-compose.yml` with: Node app service (source mounted, hot reload via `ts-node-dev`), `postgis/postgis` service (with persistent volume), Adminer (database admin UI). Extensible for future dev tooling (e.g. Mailhog).
- One `docker compose up` brings up the full environment.
- Uploaded images stored via the local storage impl to a mounted volume.

### Schema (Entities & Key Relationships)

- `albums` — id, name (canonical), (optional) year, created_at. Seeded + user-contributed. Per-locale display names in `album_translations` (id, album_id FK, locale, name).
- `stickers` — id, album_id (FK), number, subject (canonical), created_at. Seeded + user-contributed. Per-locale subjects in `sticker_translations` (id, sticker_id FK, locale, subject).
- `users` — id, display_name, location (PostGIS geography point), preferred_locale (en | es), created_at.
- `user_identities` — id, user_id (FK), provider (instagram/google), provider_user_id, email, linked_at. Supports multiple identities per user.
- `listings` — id, seller_id (FK users), sticker_id (FK, nullable while the Listing is still a draft), state (draft/published/sold/cancelled), created_at, published_at, ended_at. A Listing's Photos are rows in `listing_photos` (id, listing_id FK, side (front/back), url, created_at) — a Photo belongs to exactly one Listing and shows one side of the physical Sticker. `url` is the url the active storage driver handed back: root-relative for the local driver, an absolute public/CDN url for the S3 driver. The Album is reached THROUGH the Sticker, so there is no `album_id` column.
- `bids` — id, listing_id (FK), bidder_id (FK users), amount (nullable, for monetary), offered_sticker_id (nullable FK stickers, for trade), state (active/accepted/rejected/withdrawn), created_at, updated_at. One active bid per (listing_id, bidder_id).
- `messages` — id, listing_id (nullable FK, for Chat Room messages), direct_chat_id (nullable FK, for Direct Chat messages), sender_id (FK users), content, created_at.
- `direct_chats` — id, listing_id (FK, the sold listing), seller_id (FK users), buyer_id (FK users), created_at. One per sold listing.

### API Surface (REST Endpoints)

- `POST /auth/:provider` — initiate OAuth flow; `GET /auth/:provider/callback` — handle callback, issue JWT.
- `POST /auth/link/:provider` — link a new provider to the current user.
- `GET /me` — current user profile + linked providers.
- `PATCH /me` — update profile (e.g. location, preferred locale).
- `POST /auth/refresh` — exchange refresh token for new access token.
- `POST /auth/logout` — invalidate session (client-side token discard; refresh-token revocation).
- `GET /albums` — list albums (catalog; display names in the requester's preferred locale, falling back to the canonical name); `POST /albums` — user-contributed album (name accepted in any supported locale, canonicalized later).
- `GET /albums/:id/stickers` — list stickers in an album (locale-resolved subjects); `POST /albums/:id/stickers` — user-contributed sticker.
- `POST /listings` — create draft. `multipart/form-data`: a `photo` file part (required) and an optional `stickerId` field; the Sticker may be filled in later via `PATCH /listings/:id`, and publishing requires completeness. Errors: `PHOTO_REQUIRED` / `INVALID_PHOTO` (400), `UNKNOWN_STICKER` (404), `UNAUTHENTICATED` (401).
- `GET /uploads/:key` — serve a stored Photo's bytes. The key is a server-generated UUID plus an extension; the route is unauthenticated (the unguessable key is the capability). `PHOTO_NOT_FOUND` (404) for an unknown or invalid key.
- `PATCH /listings/:id` — edit draft (change photo, sticker, album).
- `POST /listings/:id/publish` — publish a draft.
- `POST /listings/:id/cancel` — cancel a published listing.
- `GET /listings/:id` — listing detail (photo, sticker, album, state, bids, recent messages).
- `GET /feed` — geo-ranked feed (query params: album filter, pagination cursor). Returns published listings sorted by distance+recency relative to the viewer's location.
- `POST /listings/:id/bids` — place a bid (monetary, trade, or both).
- `PATCH /listings/:id/bids/:bidId` — update/raise/withdraw a bid.
- `POST /listings/:id/bids/:bidId/accept` — seller accepts a bid (triggers rejection cascade + notifications).
- `GET /listings/:id/bids` — list bids on a listing.
- `GET /listings/:id/messages` — chat history for a listing's Chat Room.
- `POST /listings/:id/messages` — send a chat message (REST mutation → socket broadcast).
- `POST /listings/:id/direct-chat` — open a Direct Chat with the counterparty (only if listing is `sold` and requester is seller or winning bidder).
- `GET /direct-chats/:id/messages` — direct chat history.
- `POST /direct-chats/:id/messages` — send a direct chat message (REST mutation → socket broadcast to the two participants).

### Socket.IO Events (Server → Client)

- `bid:placed` — new bid on a listing in the room.
- `bid:updated` — existing bid raised or changed.
- `bid:accepted` — seller accepted a bid (listing sold).
- `bid:rejected` — bid rejected due to another bid being accepted.
- `listing:ended` — listing sold or cancelled; room closing.
- `message:new` — new chat message in the room.
- `direct:message:new` — new direct chat message.

All event payloads (and REST error bodies) are locale-neutral — codes plus data, never prose (ADR-0014).

## Testing Decisions

### Testing Philosophy

- **Test external behavior, not implementation details.** Tests assert on HTTP responses, Socket.IO events received by a real client, and database state — never on internal service/handler/module structure. If a refactor doesn't change the API contract or real-time events, no test should need updating.
- **One seam: the API boundary.** All tests go through the external surface (HTTP + Socket.IO + real Postgres). No unit tests against internal modules in the first pass. This is the highest seam and the fewest seams (one).

### Test Harness

- Boots the Express + Socket.IO app against a real Postgres+PostGIS instance (the Docker dev database or a dedicated test database).
- Runs Knex migrations to set up the schema from scratch (clean state per test run or per test suite).
- Seeds catalog data (one or two albums with stickers) for listing/feed tests.
- Drives REST mutations via real HTTP calls (supertest or an HTTP client against the running server).
- Connects a real Socket.IO client to observe pushed events, asserting on event names and payloads.
- Asserts on database state via Knex queries where the contract requires it (e.g. bid rejection cascade, listing state transitions).

### What Gets Tested Through the Seam

- Auth flows: social login callback → JWT issued; account linking; token refresh; protected endpoint access.
- Listing lifecycle: draft creation → publish → feed visibility → bid placement → accept → sold state + rejection cascade; cancel → cancelled state + notifications.
- Bidding: place monetary/trade/combined bid; update/raise (one active bid enforced); withdraw; accept triggers rejection of others.
- Feed ranking: create listings at known locations, query feed as a user at a known location, assert distance+recency ordering (tested against real PostGIS, not mocked).
- Chat Room: join room, send message, observe message broadcast; place bid, observe bid event; load history via REST; listing ended → room closes (no new messages accepted).
- Direct Chat: open after sale, send message, observe real-time delivery to the other participant; verify it cannot be opened before sale.
- Image upload: upload photo, retrieve it via the served URL (local storage impl in dev).
- Internationalization: set/return preferred locale; catalog search finds an English-named album via a Spanish query (cross-locale matching); error bodies carry codes, not prose.

### Prior Art

- Greenfield repo — no existing tests to match. The harness establishes the project's testing convention.

## Out of Scope

- **Payment processing, escrow, shipping, or delivery tracking.** The system stops at "sold" (ADR-0012). The physical exchange is arranged by the seller and winning bidder via Direct Chat, outside the app.
- **Device GPS for feed ranking.** v1 uses the User's profile location only. Device-GPS override is a future enhancement.
- **General-purpose DMs between any two users.** Direct Chats are post-sale only. Pre-sale negotiation stays in the public Listing Chat Room.
- **Bid history audit log.** One active bid per listing, updated in place. Append-only bid history is a future concern.
- **Catalog dedup/merge tooling.** User-contributed albums/stickers may produce duplicates; admin canonicalization is a future concern.
- **Moderation tooling.** Rate limiting, user blocking, and content moderation are not in v1 scope (open rooms accept the noise risk).
- **Push notifications (mobile).** Real-time delivery is via Socket.IO while the app is connected. Out-of-app push notifications are a future concern.
- **French and Portuguese.** English and Spanish ship at launch (ADR-0014); French and Portuguese display names arrive later as data-only additions — no schema change, but per-locale translation and canonicalization maintenance grows with each locale.
- **Server-side translation of user content.** Chat Messages and Listing descriptions are stored exactly as authored; translation is a display-time front-end concern.
- **Front-end UI translation.** All user-facing wording (labels, toasts, formatted dates/amounts) is rendered by the mobile client; the backend ships codes and data only.
- **Production deployment configuration.** The Docker dev environment is in scope; production hosting, CI/CD, and S3 storage wiring are future concerns.
- **The mobile front-end.** This PRD covers the backend only.

## Further Notes

- The domain glossary (`CONTEXT.md`) and the ADRs (`docs/adr/`) — 13 from a `/grill-with-docs` session prior to this PRD, plus ADR-0014 (multilingual catalog, locale-neutral wire format) added after — are the authoritative source for domain language and architectural decisions; this PRD synthesizes them.
- The hybrid catalog (ADR-0004) means the seed data for one or two popular albums is part of the initial implementation — the listing and feed flows depend on catalog entries existing. Seed albums must ship with English and Spanish names (ADR-0014) — seeding English-only names would immediately recreate the duplicate-album problem in Spanish.
- The polymorphic Bid (money/trade/both) is the primary schema complexity. The recommended approach is nullable columns (`amount` for monetary, `offered_sticker_id` for trade) on the `bids` table, allowing a bid to populate either or both — simpler than a JSONB payload and queryable with standard SQL.
- The "near band" radius for the feed's distance+recency blend is a single config value (e.g. 10km) and should be tunable without code changes.
- Socket.IO room naming convention: `listing:<id>` for Chat Rooms, `direct:<conversationId>` for Direct Chats. JWT is verified at socket connection time; room joins are authorized by listing state (published rooms are open; direct chat rooms require sale completion).
