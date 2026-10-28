Status: ready-for-agent

# Place a Bid — monetary, trade, or both

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The bidding entry point (ADR-0002: a Bid can be money, a trade, or both): `POST /listings/:id/bids` places a Bid on a published Listing. A monetary Bid carries an amount in minor units with a currency code; a trade Bid references one of the bidder's own Stickers as a claim — the system never verifies the bidder actually owns the offered Sticker; a combined Bid carries both. The polymorphic offer is stored with nullable columns (amount for money, offered sticker for trade).

Placing a Bid is a REST mutation that emits `bid:placed` to the Listing's Chat Room as a structured offer event — bids never appear as typed Messages. `GET /listings/:id/bids` lists the Listing's Bids with type and details so the seller can compare offers, and a bidder can see their current active Bid.

One active Bid per bidder per Listing: placing a new Bid while an active one exists is rejected with a locale-neutral conflict error — raising or changing the offer is the update slice's job.

## Acceptance criteria

- [ ] Monetary Bid on a published Listing → persisted as active; room clients receive a structured `bid:placed` event (amount in minor units + currency code, ISO 8601 timestamps — locale-neutral)
- [ ] Trade Bid referencing an offered Sticker → persisted as a claim with no ownership verification; the event carries the offered Sticker
- [ ] Combined Bid (amount + offered Sticker) → persisted with both parts
- [ ] Same bidder placing a second Bid on the same Listing while one is active → locale-neutral conflict error (one active Bid per bidder per Listing)
- [ ] Bidding on a non-published Listing → state error
- [ ] `GET /listings/:id/bids` shows the Listing's Bids with distinguishable types and details; a bidder can retrieve their current active Bid
- [ ] All events and error bodies are codes + data, never prose

## Blocked by

- `14-listing-chat-room-join-message-history.md` (bid events are emitted into the Chat Room)
