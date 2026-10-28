Status: ready-for-agent

# Accept a Bid → Listing sold, rejection cascade, room closes

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The moment of agreement (ADR-0001: the seller accepts an offer, no deadline; ADR-0012: the system stops at `sold` — no payment, escrow, or shipping): `POST /listings/:id/bids/:bidId/accept` lets the seller accept an active Bid. The Listing becomes `sold` (with `ended_at` recorded), the accepted Bid becomes `accepted`, and every other active Bid on that Listing is automatically `rejected` — the rejection cascade.

Real-time: the Listing's Chat Room receives `bid:accepted`, a `bid:rejected` event for the rejected Bids, and `listing:ended` — so the winning bidder learns they won and losing bidders learn the Listing is gone, live. The Chat Room closes: new Messages and Bid submissions on the ended Listing are rejected with locale-neutral state errors. The persisted history (Bids and Messages) remains readable via REST after the end.

This slice builds the "listing ended" machinery (state transition, cascade, room close, `listing:ended` emission, history retention) that the cancel-listing slice will reuse.

## Acceptance criteria

- [ ] Seller accepts an active Bid → Listing `sold` with `ended_at`; accepted Bid `accepted`; all other active Bids `rejected` (cascade asserted via Knex)
- [ ] Room clients receive `bid:accepted` and `listing:ended`; the rejection cascade emits `bid:rejected` for the losing Bids
- [ ] After the Listing is `sold`: sending Messages, placing Bids, or updating Bids → locale-neutral state errors (room closed)
- [ ] `GET /listings/:id/messages` and `GET /listings/:id/bids` still return the full history after the Listing ended
- [ ] Accept by anyone other than the seller → ownership error; accepting a non-active Bid or on a non-published Listing → state errors
- [ ] Sold Listings no longer appear in the feed (re-asserted against the feed slice's published-only rule)
- [ ] No payment, escrow, shipping, or delivery behavior exists anywhere (ADR-0012)

## Blocked by

- `15-place-bid-money-trade-both.md`
