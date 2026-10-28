Status: ready-for-agent

# Listing Chat Room — join, send Message, load history

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The real-time conversation layer (ADR-0005: all mutations via REST, Socket.IO is push-only): an authenticated User joins any published Listing's Chat Room by listing id (room `listing:<id>`) after JWT verification at socket connect. Sending a Message is a REST mutation — `POST /listings/:id/messages` validates and persists the free-form Message, then broadcasts `message:new` to the room. Late joiners load the persisted history via `GET /listings/:id/messages`; the socket carries only events from the point of connection onward — no history replay over the socket.

Rooms are open to any authenticated User while the Listing is `published`; joining or messaging the room of a non-published Listing (e.g. a draft) is rejected with a locale-neutral error. Room closing on sold/cancelled is exercised by the listing-end slices. Messages are stored exactly as authored — never translated server-side.

## Acceptance criteria

- [ ] Socket client with a valid JWT joins the room of a published Listing; unauthenticated connections are rejected
- [ ] `POST /listings/:id/messages` persists the Message; clients in the room receive `message:new` with the payload
- [ ] `GET /listings/:id/messages` returns persisted history, including Messages sent before the requesting client connected
- [ ] A client that connects late receives only post-connection events over the socket — no duplicates of loaded history
- [ ] Joining or messaging the room of a non-published Listing → locale-neutral state error
- [ ] Messages are stored exactly as authored (asserted via Knex)

## Blocked by

- `02-google-login-jwt-session.md`
- `12-publish-draft-listing.md`
