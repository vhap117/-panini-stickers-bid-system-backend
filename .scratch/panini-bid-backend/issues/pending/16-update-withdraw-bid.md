Status: ready-for-agent

# Update or withdraw a Bid

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The bidder's control over their standing offer: `PATCH /listings/:id/bids/:bidId` raises a monetary amount, changes the offer's type (monetary ↔ trade ↔ combined), or withdraws the Bid. Raising or changing updates the existing Bid in place — never creates a second Bid — and emits `bid:updated` to the Listing's Chat Room so everyone follows the escalation. Withdrawing moves the Bid to `withdrawn`, freeing the one-active-Bid slot so the bidder can place a fresh Bid afterward.

Only the bidder who owns the Bid can update or withdraw it, only while the Bid is active, and only while the Listing is `published`.

## Acceptance criteria

- [ ] Raising a monetary Bid updates the existing Bid in place (no new Bid row; one active Bid remains); room clients receive `bid:updated`
- [ ] Changing the offer's type (money → trade, or → combined) updates in place; the event reflects the new offer shape
- [ ] Withdraw → Bid state `withdrawn`; the same bidder can then place a new Bid on the Listing
- [ ] Update/withdraw by anyone other than the bidder → ownership error
- [ ] Updating a withdrawn (non-active) Bid → state error
- [ ] Updating or withdrawing while the Listing is not `published` → state error
- [ ] One-active-Bid-per-bidder invariant holds through every operation (asserted via Knex)

## Blocked by

- `15-place-bid-money-trade-both.md`
