Status: ready-for-agent

# Cancel a Listing → cancelled, bidders notified, room closes

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The seller's exit without a sale: `POST /listings/:id/cancel` moves a published Listing to `cancelled` (with `ended_at` recorded) and rejects all its active Bids. Bidders are notified in real time — the Chat Room receives `bid:rejected` for the active Bids and `listing:ended` — and the room closes exactly as in the sold path: no new Messages or Bids are accepted, while the persisted history stays readable via REST.

This slice reuses the "listing ended" machinery built by the accept-bid slice (end transition, bid rejection, room close, `listing:ended` emission) rather than duplicating it.

## Acceptance criteria

- [ ] Seller cancels a published Listing → `cancelled` with `ended_at`; all active Bids `rejected` (asserted via Knex)
- [ ] Room clients receive `listing:ended`, and `bid:rejected` for the previously active Bids
- [ ] After cancellation: new Messages and Bid submissions → locale-neutral state errors (room closed)
- [ ] `GET /listings/:id/messages` and `GET /listings/:id/bids` still return history after cancellation
- [ ] Cancel by anyone other than the seller → ownership error; cancelling a non-published Listing (e.g. a draft) → state error
- [ ] Cancelled Listings no longer appear in the feed

## Blocked by

- `17-accept-bid-listing-sold.md` (reuses the listing-end machinery)
