Status: ready-for-agent

# Direct Chat — post-sale private 1:1 conversation

## Parent

- `.scratch/panini-bid-backend/PRD.md` (PRD: Panini Stickers Bid System Backend)

## What to build

The fulfillment channel (ADR-0012: the exchange is arranged outside the app, this is where): after a Listing ends as `sold`, the seller and the winning bidder open a private 1:1 Direct Chat via `POST /listings/:id/direct-chat` — one conversation per sold Listing; repeated opens return the same one. It can only be opened when the Listing is `sold` AND the requester is the seller or the winning bidder; pre-sale negotiation stays in the Listing's public Chat Room, and there are no general-purpose DMs between arbitrary Users.

The Direct Chat uses its own socket room scoped to the two participants (`direct:<conversationId>`); only the two participants can join, observe, or read. `POST /direct-chats/:id/messages` persists a Message and broadcasts `direct:message:new` to both participants in real time; `GET /direct-chats/:id/messages` loads the ongoing history.

## Acceptance criteria

- [ ] Seller and winning bidder of a sold Listing each open the Direct Chat; both receive the same conversation (one per sold Listing)
- [ ] Opening a Direct Chat on a Listing in any non-sold state → locale-neutral state error
- [ ] A User who is neither the seller nor the winning bidder cannot open, join, read history of, or receive events for the Direct Chat
- [ ] `POST /direct-chats/:id/messages` → both participants receive `direct:message:new` in real time; Message persisted
- [ ] `GET /direct-chats/:id/messages` returns history to participants only
- [ ] Direct Chat Messages are stored exactly as authored and are invisible to all other Users (privacy asserted)

## Blocked by

- `17-accept-bid-listing-sold.md` (a sold Listing with a winning bidder must exist)
